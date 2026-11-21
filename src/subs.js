const p = (n, l = 2) => String(n).padStart(l, "0");
export const DEF_STYLE = {y: 85, size: 100, font: "Noto Sans Ethiopic", hl: "#ffd23f", base: "#ffffff", bg: true};
export const split = (t) => t.trim().split(/\s+/).filter(Boolean);
// Word timings of a line. Uses the recognised timings when the words still match the text,
// otherwise spreads the words over the line by length.
export function wordsOf(c) {
  const toks = split(c.text);
  if (c.words && c.words.length === toks.length) return c.words.map((w, i) => ({...w, text: toks[i]}));
  const total = toks.reduce((a, t) => a + t.length + 1, 0) || 1; let t0 = c.start;
  return toks.map((t) => { const s = t0; t0 += (c.end - c.start) * (t.length + 1) / total; return {start: s, end: t0, text: t}; });
}
const hms = (s, sep) => { const ms = Math.max(0, Math.round(s * 1000));
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`; };
const ass = (s) => { const cs = Math.max(0, Math.round(s * 100));
  return `${Math.floor(cs / 360000)}:${p(Math.floor(cs / 6000) % 60)}:${p(Math.floor(cs / 100) % 60)}.${p(cs % 100)}`; };
const assColor = (h) => { const m = h.replace("#", ""); return `&H00${m.slice(4, 6)}${m.slice(2, 4)}${m.slice(0, 2)}`.toUpperCase(); };
const Y = (c, st) => c.y ?? st.y;
// SRT has no exact positioning or colours: top / middle / bottom tags only.
export const toSrt = (c, st) => c.map((x, i) => { const y = Y(x, st), tag = y < 33 ? "{\\an8}" : y < 66 ? "{\\an5}" : "";
  return `${i + 1}\n${hms(x.start, ",")} --> ${hms(x.end, ",")}\n${tag}${x.text}\n`; }).join("\n");
export const toVtt = (c, st) => "WEBVTT\n\n" + c.map((x) => `${hms(x.start, ".")} --> ${hms(x.end, ".")} line:${Y(x, st)}% position:50% align:center\n${x.text}\n`).join("\n");
// ASS: karaoke word colours ({\k}), exact position, font, optional dark box.
const karaoke = (x) => { const ws = wordsOf(x); if (!ws.length) return x.text;
  let t = `{\\k${Math.round((ws[0].start - x.start) * 100)}}`;
  ws.forEach((w, i) => { const d = Math.max(0, Math.round(((ws[i + 1] ? ws[i + 1].start : w.end) - w.start) * 100)); t += `{\\k${d}}${w.text}${i < ws.length - 1 ? " " : ""}`; });
  return t; };
export const toAss = (c, st) => `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${st.font},${Math.round(60 * st.size / 100)},${assColor(st.hl)},${assColor(st.base)},${st.bg ? "&H80000000" : "&H00000000"},&H80000000,1,0,0,0,100,100,0,0,${st.bg ? 3 : 1},${st.bg ? 10 : 3},1,5,60,60,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
` + c.map((x) => `Dialogue: 0,${ass(x.start)},${ass(x.end)},Default,,0,0,0,,{\\an5\\pos(960,${Math.round(Y(x, st) * 10.8)})}${karaoke(x)}`).join("\n") + "\n";
export const toTxt = (c) => c.map((x) => x.text).join("\n");
export function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + text], {type: type + ";charset=utf-8"}));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
