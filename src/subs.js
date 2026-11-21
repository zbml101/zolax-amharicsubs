const p = (n, l = 2) => String(n).padStart(l, "0");
const hms = (s, sep) => { const ms = Math.max(0, Math.round(s * 1000));
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`; };
const ass = (s) => { const cs = Math.max(0, Math.round(s * 100));
  return `${Math.floor(cs / 360000)}:${p(Math.floor(cs / 6000) % 60)}:${p(Math.floor(cs / 100) % 60)}.${p(cs % 100)}`; };
const Y = (c, st) => c.y ?? st.y;
// SRT has no exact positioning: top / middle / bottom tags only.
export const toSrt = (c, st) => c.map((x, i) => { const y = Y(x, st), tag = y < 33 ? "{\\an8}" : y < 66 ? "{\\an5}" : "";
  return `${i + 1}\n${hms(x.start, ",")} --> ${hms(x.end, ",")}\n${tag}${x.text}\n`; }).join("\n");
// VTT: exact vertical position as a percentage from the top.
export const toVtt = (c, st) => "WEBVTT\n\n" + c.map((x) => `${hms(x.start, ".")} --> ${hms(x.end, ".")} line:${Y(x, st)}% position:50% align:center\n${x.text}\n`).join("\n");
// ASS: exact position and Amharic font name (for VLC, Aegisub, ffmpeg).
export const toAss = (c, st) => `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans Ethiopic,${Math.round(60 * st.size / 100)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,5,60,60,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
` + c.map((x) => `Dialogue: 0,${ass(x.start)},${ass(x.end)},Default,,0,0,0,,{\\an5\\pos(960,${Math.round(Y(x, st) * 10.8)})}${x.text.replace(/\n/g, "\\N")}`).join("\n") + "\n";
export const toTxt = (c) => c.map((x) => x.text).join("\n");
export function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + text], {type: type + ";charset=utf-8"}));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
