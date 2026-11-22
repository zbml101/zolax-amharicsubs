import {wordsOf} from "./subs";

function drawSub(ctx, c, now, st, W, H) {
  const ws = wordsOf(c); if (!ws.length) return;
  const fs = Math.round(H * 0.055 * st.size / 100);
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
export async function burnVideo(file, cues, st, onProgress, signal) {
  const v = document.createElement("video");
  v.src = URL.createObjectURL(file); v.playsInline = true; v.preload = "auto";
  const ac = new AudioContext(); const dest = ac.createMediaStreamDestination();
  await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error("This video cannot be read by the browser.")); });
  await document.fonts.load(`700 40px "${st.font}"`, "ሰላም");
  const k = Math.min(1, 1280 / v.videoWidth), W = Math.round(v.videoWidth * k) & ~1, H = Math.round(v.videoHeight * k) & ~1;
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
    ctx.drawImage(v, 0, 0, W, H);
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
