import {wordsOf, RATIOS} from "./subs";

// Output frame size for the chosen ratio (long side 1280, square 1080).
export function outSize(st, vw, vh) {
  const e = (n) => Math.round(n) & ~1;
  if (!RATIOS[st.ratio]) { const k = Math.min(1, 1280 / Math.max(vw, vh)); return [e(vw * k), e(vh * k)]; }
  const r = RATIOS[st.ratio];
  if (r === 1) return [1080, 1080];
  return r > 1 ? [1280, e(1280 / r)] : [e(1280 * r), 1280];
}

// Crop-to-fill, or fit inside the frame over a blurred copy of the video.
// src = {w, h, draw(ctx, sx, sy, sw, sh, dx, dy, dw, dh)}: a <video> element or a decoded video sample.
function drawFrame(ctx, src, W, H, st, small) {
  const vw = src.w, vh = src.h, r = W / H, sr = vw / vh;
  const cover = (c, dw, dh, f) => { let sw = vw, sh = vh; if (sr > r) sw = vh * r; else sh = vw / r; src.draw(c, (vw - sw) * f, (vh - sh) * f, sw, sh, 0, 0, dw, dh); };
  if (Math.abs(sr - r) < 0.01 || st.fit !== "blur") { cover(ctx, W, H, (st.focus ?? 50) / 100); return; }
  const sc = small.getContext("2d"); cover(sc, small.width, small.height, 0.5);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(small, 0, 0, W, H);   // tiny image stretched up = cheap blur
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(0, 0, W, H);
  const k = Math.min(W / vw, H / vh), dw = vw * k, dh = vh * k;
  src.draw(ctx, 0, 0, vw, vh, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function drawSub(ctx, c, now, st, W, H) {
  const ws = wordsOf(c); if (!ws.length) return;
  const fs = Math.round((W >= H ? H * 0.056 : W * 0.068) * st.size / 100);
  ctx.font = `700 ${fs}px "${st.font}", serif`; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.lineJoin = "round";
  const space = ctx.measureText(" ").width, maxW = W * 0.9, lines = []; let line = [], lw = 0;
  for (const w of ws) {
    const m = ctx.measureText(w.text).width;
    if (line.length && lw + space + m > maxW) { lines.push({line, lw}); line = []; lw = 0; }
    lw += (line.length ? space : 0) + m; line.push({...w, m});
  }
  lines.push({line, lw});
  const lh = fs * 1.5, pad = fs * 0.3, bw = Math.max(...lines.map((l) => l.lw)), bh = lines.length * lh;
  const top = Math.min(Math.max((c.y ?? st.y) / 100 * H - bh / 2, pad), H - bh - pad);
  if (st.bg) {
    ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect((W - bw) / 2 - pad * 1.5, top - pad, bw + pad * 3, bh + pad * 2, pad); else ctx.rect((W - bw) / 2 - pad * 1.5, top - pad, bw + pad * 3, bh + pad * 2);
    ctx.fill();
  }
  lines.forEach(({line, lw}, li) => {
    let x = (W - lw) / 2; const y = top + li * lh + lh / 2;
    for (const w of line) {
      ctx.lineWidth = fs * 0.14; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(w.text, x, y);
      ctx.fillStyle = now >= w.start ? st.hl : st.base; ctx.fillText(w.text, x, y); x += w.m + space;
    }
  });
}

// Plays the video in the browser and records it with the subtitles drawn on top (real time).
async function burnRealtime(file, cues, st, onProgress, signal) {
  const v = document.createElement("video");
  v.src = URL.createObjectURL(file); v.playsInline = true; v.preload = "auto";
  const ac = new AudioContext(); const dest = ac.createMediaStreamDestination();
  await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error("This video cannot be read by the browser.")); });
  await document.fonts.load(`700 40px "${st.font}"`, "ሰላም");
  const [W, H] = outSize(st, v.videoWidth, v.videoHeight);
  const small = document.createElement("canvas"); small.width = Math.max(8, Math.round(W / 24)); small.height = Math.max(8, Math.round(H / 24));
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ac.createMediaElementSource(v).connect(dest);   // audio goes to the recording only, not the speakers
  const stream = canvas.captureStream(30); dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mime = ["video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error("This browser cannot record video. Try Chrome or Edge.");
  const rec = new MediaRecorder(stream, {mimeType: mime, videoBitsPerSecond: 5_000_000}), parts = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const stopped = new Promise((r) => { rec.onstop = r; });
  let raf, lastPct = -1;
  const draw = () => {
    drawFrame(ctx, {w: v.videoWidth, h: v.videoHeight, draw: (c, ...a) => c.drawImage(v, ...a)}, W, H, st, small);
    const t = v.currentTime, c = cues.find((x) => t >= x.start && t < x.end);
    if (c) drawSub(ctx, c, t, st, W, H);
    const pct = Math.floor(t / v.duration * 100); if (pct !== lastPct) { lastPct = pct; onProgress(pct / 100); }
    raf = requestAnimationFrame(draw);
  };
  try {
    v.currentTime = 0; await ac.resume(); rec.start(1000); await v.play(); draw();
    await new Promise((res) => { v.onended = res; signal.addEventListener("abort", res); });
  } finally {
    cancelAnimationFrame(raf); if (rec.state !== "inactive") rec.stop(); await stopped; v.pause(); URL.revokeObjectURL(v.src); ac.close();
  }
  return signal.aborted ? null : {blob: new Blob(parts, {type: mime.split(";")[0]}), ext: mime.startsWith("video/mp4") ? "mp4" : "webm"};
}

// Fast path: decode, draw the subtitles on every frame and re-encode with the browser's
// hardware video codecs (WebCodecs). Runs faster than the video's length. Audio is copied when possible.
async function burnFast(file, cues, st, onProgress, signal) {
  const {ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, QUALITY_HIGH} = await import("mediabunny");   // loaded only when exporting
  await document.fonts.load(`700 40px "${st.font}"`, "ሰላም");
  const input = new Input({source: new BlobSource(file), formats: ALL_FORMATS});
  const vt = await input.getPrimaryVideoTrack();
  if (!vt) throw new Error("No video track found.");
  const [W, H] = outSize(st, await vt.getDisplayWidth(), await vt.getDisplayHeight());
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const small = document.createElement("canvas"); small.width = Math.max(8, Math.round(W / 24)); small.height = Math.max(8, Math.round(H / 24));
  const output = new Output({format: new Mp4OutputFormat(), target: new BufferTarget()});
  const conv = await Conversion.init({input, output, video: {
    forceTranscode: true, quality: QUALITY_HIGH, processedWidth: W, processedHeight: H,
    process: (s) => {
      drawFrame(ctx, {w: s.displayWidth, h: s.displayHeight, draw: (c, ...a) => s.draw(c, ...a)}, W, H, st, small);
      const t = s.timestamp, c = cues.find((x) => t >= x.start && t < x.end);
      if (c) drawSub(ctx, c, t, st, W, H);
      return canvas;
    }}});
  if (!conv.isValid) throw new Error("fast mode not supported for this video");
  conv.onProgress = (p) => onProgress(p);
  const stop = () => conv.cancel(); signal.addEventListener("abort", stop);
  try { await conv.execute(); } catch (e) { if (signal.aborted) return null; throw e; } finally { signal.removeEventListener("abort", stop); }
  return {blob: new Blob([output.target.buffer], {type: "video/mp4"}), ext: "mp4"};
}

export async function burnVideo(file, cues, st, onProgress, signal, onMode = () => {}) {
  if (typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined") {
    try { onMode("fast"); return await burnFast(file, cues, st, onProgress, signal); }
    catch (e) { if (signal.aborted) return null; console.warn("Fast export failed, using real-time mode:", e); }
  }
  onMode("slow");
  return burnRealtime(file, cues, st, onProgress, signal);
}
