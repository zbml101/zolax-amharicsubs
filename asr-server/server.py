"""Free, self-hosted Amharic speech-to-text server.
Model: BuzzASR/amharic (Whisper large-v3 fine-tuned for Amharic). Silero VAD finds the speech
segments (this gives reliable subtitle timing), then each segment is transcribed.
Run on any machine with a GPU (free Google Colab / Kaggle GPU works)."""
import io, os
import numpy as np, soundfile as sf, torch
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from silero_vad import get_speech_timestamps, load_silero_vad
from transformers import WhisperForConditionalGeneration, WhisperProcessor

MODEL = os.getenv("MODEL_ID", "BuzzASR/amharic")
TOKEN = os.getenv("ASR_TOKEN", "")
dev = "cuda" if torch.cuda.is_available() else "cpu"
dt = torch.float16 if dev == "cuda" else torch.float32
proc = WhisperProcessor.from_pretrained(MODEL)
model = WhisperForConditionalGeneration.from_pretrained(MODEL, torch_dtype=dt).to(dev).eval()
vad = load_silero_vad()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health():
    return {"ok": True, "device": dev, "model": MODEL}

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
                                 max_speech_duration_s=8, min_silence_duration_ms=350,
                                 speech_pad_ms=120, min_speech_duration_ms=250)
    out = []
    for i in range(0, len(segs), 8):
        batch = segs[i:i + 8]
        clips = [wav[int(s["start"] * 16000):int(s["end"] * 16000)] for s in batch]
        feats = proc(clips, sampling_rate=16000, return_tensors="pt").input_features.to(dev, dt)
        with torch.no_grad():
            ids = model.generate(feats, num_beams=1, no_repeat_ngram_size=3, repetition_penalty=1.2, max_new_tokens=128)
        for s, t in zip(batch, proc.batch_decode(ids, skip_special_tokens=True)):
            if t.strip():
                out.append({"start": round(s["start"], 2), "end": round(s["end"], 2), "text": t.strip()})
    return {"segments": out}
