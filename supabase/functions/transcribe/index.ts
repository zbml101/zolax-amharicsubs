// Google Cloud Speech-to-Text v2, model chirp_2, language am-ET, word timestamps.
// Secrets: GOOGLE_SA_JSON (service account key JSON), GOOGLE_REGION (default asia-southeast1)
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const u = (s: string) => s.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const b64 = (o: unknown) => u(btoa(JSON.stringify(o)));

async function accessToken(sa: any) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({alg: "RS256", typ: "JWT"});
  const c = b64({iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600});
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), (ch) => ch.charCodeAt(0)), {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${c}`)));
  const r = await fetch("https://oauth2.googleapis.com/token", {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${h}.${c}.${u(btoa(String.fromCharCode(...sig)))}`});
  return (await r.json()).access_token as string;
}

// Group timed words into readable subtitle lines.
function group(words: {start: number; end: number; text: string}[]) {
  const cues: any[] = []; let cur: any = null;
  for (const w of words) {
    if (cur && (w.start - cur.end > 0.8 || cur.text.length + w.text.length > 42 || w.end - cur.start > 6)) { cues.push(cur); cur = null; }
    if (!cur) cur = {...w}; else { cur.text += " " + w.text; cur.end = w.end; }
    if (/[።፧?!]$/.test(w.text)) { cues.push(cur); cur = null; }
  }
  if (cur) cues.push(cur);
  return cues;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers: cors});
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), {status, headers: {...cors, "Content-Type": "application/json"}});
  try {
    const form = await req.formData();
    const file = form.get("file") as File;
    const hints = String(form.get("hints") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
    const sa = JSON.parse(Deno.env.get("GOOGLE_SA_JSON")!), region = Deno.env.get("GOOGLE_REGION") || "asia-southeast1";
    const audio = btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));
    const config: any = {autoDecodingConfig: {}, languageCodes: ["am-ET"], model: "chirp_2", features: {enableWordTimeOffsets: true, enableAutomaticPunctuation: true}};
    if (hints.length) config.adaptation = {phraseSets: [{inlinePhraseSet: {phrases: hints.map((value) => ({value, boost: 10}))}}]};
    const r = await fetch(`https://${region}-speech.googleapis.com/v2/projects/${sa.project_id}/locations/${region}/recognizers/_:recognize`, {
      method: "POST", headers: {Authorization: `Bearer ${await accessToken(sa)}`, "Content-Type": "application/json"}, body: JSON.stringify({config, content: audio})});
    const j = await r.json();
    if (!r.ok) return json({error: j.error ?? j}, r.status);
    const words: any[] = [], fallback: any[] = []; let prev = 0;
    for (const res of j.results ?? []) {
      const alt = res.alternatives?.[0]; if (!alt) continue;
      const end = parseFloat(res.resultEndOffset ?? "0");
      if (alt.words?.length) alt.words.forEach((w: any) => words.push({start: parseFloat(w.startOffset), end: parseFloat(w.endOffset), text: w.word}));
      else if (alt.transcript) fallback.push({start: prev, end, text: alt.transcript.trim()});
      prev = end;
    }
    return json({segments: words.length ? group(words) : fallback});
  } catch (e) { return json({error: {message: String(e)}}, 500); }
});
