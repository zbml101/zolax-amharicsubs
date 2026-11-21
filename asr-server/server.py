"""Free, self-hosted Amharic speech-to-text server.
Model: snapwre/hohe-asr-amharic (w2v-BERT CTC, trained on 880 h of Amharic, CC BY 4.0) with its
5-gram language model. Silero VAD finds speech segments (reliable subtitle timing), then each
segment is transcribed in a single pass. CTC does not invent sentences during silence."""
import io, json, os, re
import soundfile as sf, torch
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from huggingface_hub import hf_hub_download
from silero_vad import get_speech_timestamps, load_silero_vad
from transformers import AutoModelForCTC, AutoProcessor

MODEL = os.getenv("MODEL_ID", "snapwre/hohe-asr-amharic")
TOKEN = os.getenv("ASR_TOKEN", "")
dev = "cuda" if torch.cuda.is_available() else "cpu"
proc = AutoProcessor.from_pretrained(MODEL)
model = AutoModelForCTC.from_pretrained(MODEL).to(dev).eval()
vad = load_silero_vad()

decoder = None  # the 5-gram language model removes about 14% of word errors
if os.getenv("USE_LM", "1") == "1":
    try:
        from pyctcdecode import build_ctcdecoder
        cfg = json.load(open(hf_hub_download(MODEL, "lm/decoder.json")))
        lm_path = hf_hub_download(MODEL, "lm/am-5gram.bin")
        vocab = proc.tokenizer.get_vocab()
        labels = [""] * (max(vocab.values()) + 1)
        for tok, i in vocab.items():
            labels[i] = " " if tok == "|" else ("" if i == proc.tokenizer.pad_token_id else tok)
        decoder = build_ctcdecoder(labels, lm_path, alpha=cfg["alpha"], beta=cfg["beta"])
        print("Language model: ON")
    except Exception as e:
        print("Language model OFF (greedy decoding):", e)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health():
    return {"ok": True, "device": dev + (" + language model" if decoder else ""), "model": MODEL}

def clean(t: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\[[A-Za-z]{2,4}\]", "", t)).strip()

def greedy_words(logits, tok):
    """Words with frame positions from plain CTC argmax (used when the language model is off)."""
    vocab = {v: k for k, v in tok.get_vocab().items()}
    words, cur, start, last, prev = [], "", None, 0, None
    for f, i in enumerate(logits.argmax(-1).tolist()):
        if i == prev:
            continue
        prev = i
        if i == tok.pad_token_id:
            continue
        t = vocab[i]
        if t == "|":
            if cur:
                words.append((cur, (start, last + 1)))
            cur, start = "", None
        else:
            if start is None:
                start = f
            cur += t
            last = f
    if cur:
        words.append((cur, (start, last + 1)))
    return words

def timed_words(logits, clip_s, t0):
    dur = clip_s / logits.shape[0]  # seconds per model frame
    frames = None
    if decoder:
        try:
            frames = decoder.decode_beams(logits.numpy())[0][2]  # [(word, (start_frame, end_frame))]
        except Exception:
            frames = None
    if frames is None:
        frames = greedy_words(logits, proc.tokenizer)
    out = []
    for w, (a, b) in frames:
        w = clean(w)
        if w:
            out.append({"start": round(t0 + a * dur, 2), "end": round(t0 + max(b, a + 1) * dur, 2), "text": w})
    return out

@app.post("/transcribe")
def transcribe(file: UploadFile = File(...), authorization: str = Header("")):
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(401, "Bad token")
    wav, sr = sf.read(io.BytesIO(file.file.read()), dtype="float32")
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    if sr != 16000:
        raise HTTPException(400, "Audio must be 16 kHz")
    segs = get_speech_timestamps(torch.from_numpy(wav), vad, sampling_rate=16000, return_seconds=True,
                                 max_speech_duration_s=7, min_silence_duration_ms=350,
                                 speech_pad_ms=120, min_speech_duration_ms=250)
    out = []
    for s in segs:
        clip = wav[int(s["start"] * 16000):int(s["end"] * 16000)]
        x = proc(clip, sampling_rate=16000, return_tensors="pt").to(dev)
        with torch.inference_mode():
            logits = model(**x).logits[0].float().cpu()
        words = timed_words(logits, len(clip) / 16000, s["start"])
        if words:
            out.append({"start": round(s["start"], 2), "end": round(s["end"], 2),
                        "text": " ".join(w["text"] for w in words), "words": words})
    return {"segments": out}
