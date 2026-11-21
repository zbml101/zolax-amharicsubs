// Decode any audio/video file in the browser -> 16 kHz mono WAV chunks (~2 min each),
// cut at the quietest moment so words are not split in half.
export async function toChunks(file) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  const data = (await off.startRendering()).getChannelData(0);
  const cuts = [0], target = 120 * rate, win = 6 * rate, fr = Math.floor(rate * 0.05);
  while (data.length - cuts[cuts.length - 1] > target + 3 * rate) {
    const end = cuts[cuts.length - 1] + target; let best = end, min = Infinity;
    for (let i = end - win; i < end; i += fr) {
      let e = 0; for (let j = i; j < i + fr; j++) e += data[j] * data[j];
      if (e < min) { min = e; best = Math.floor(i + fr / 2); }
    }
    cuts.push(best);
  }
  cuts.push(data.length);
  return cuts.slice(0, -1).map((a, k) => ({offset: a / rate, blob: wav(data.subarray(a, cuts[k + 1]), rate)}));
}
function wav(f, rate) {
  const b = new ArrayBuffer(44 + f.length * 2), v = new DataView(b);
  const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); v.setUint32(4, 36 + f.length * 2, true); s(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, "data"); v.setUint32(40, f.length * 2, true);
  for (let i = 0; i < f.length; i++) { const x = Math.max(-1, Math.min(1, f[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([b], {type: "audio/wav"});
}
