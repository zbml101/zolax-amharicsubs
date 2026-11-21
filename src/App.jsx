import {Fragment, memo, useCallback, useEffect, useRef, useState} from "react";
import {supabase} from "./supabase";
import {toChunks} from "./audio";
import {toSrt, toVtt, toAss, toTxt, download, wordsOf, split, DEF_STYLE} from "./subs";

const ls = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export default function App() {
  const [session, setSession] = useState(null), [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({data}) => { setSession(data.session); setReady(true); });
    const {data} = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!ready) return null;
  return session ? <Workspace/> : <Login/>;
}

function Login() {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [mode, setMode] = useState("in"), [msg, setMsg] = useState("");
  const go = async (e) => {
    e.preventDefault(); setMsg("");
    const {error} = mode === "in" ? await supabase.auth.signInWithPassword({email, password}) : await supabase.auth.signUp({email, password});
    if (error) setMsg(error.message); else if (mode === "up") setMsg("Check your email to confirm your account.");
  };
  return (
    <main className="login">
      <h1 className="am">ንዑስ ጽሑፍ</h1>
      <p>Amharic subtitles for your videos and audio.</p>
      <form onSubmit={go}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required/>
        <input type="password" placeholder="Password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required/>
        <button className="primary">{mode === "in" ? "Sign in" : "Create account"}</button>
      </form>
      {msg && <p className="note">{msg}</p>}
      <button className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>{mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}</button>
    </main>
  );
}

function Workspace() {
  const [projects, setProjects] = useState([]), [open, setOpen] = useState(null), [media, setMedia] = useState(null);
  const [status, setStatus] = useState(""), [busy, setBusy] = useState(false), [url, setUrl] = useState(ls("asr_url") || import.meta.env.VITE_ASR_URL || ""), [token, setToken] = useState(ls("asr_token") || import.meta.env.VITE_ASR_TOKEN || ""), [ping, setPing] = useState("");
  const keep = (k, v, set) => { set(v); setPing(""); try { localStorage.setItem(k, v); } catch {} };
  const test = async () => { setPing("Checking…"); try { const r = await fetch(url.replace(/\/$/, "") + "/health"); const j = await r.json(); setPing(j.ok ? "Ready (" + j.device + ")" : "Not ready"); } catch { setPing("Not reachable yet. If the server just started, wait a minute and try again."); } };
  const load = async () => { const {data} = await supabase.from("projects").select("id,title,updated_at").order("updated_at", {ascending: false}); setProjects(data || []); };
  useEffect(() => { load(); }, []);

  const create = async (file) => {
    if (!file) return; if (!url) { setStatus("Enter the transcription server address first."); return; } setBusy(true); setStatus("Preparing audio…");
    try {
      const chunks = await toChunks(file), cues = [];
      for (let i = 0; i < chunks.length; i++) {
        setStatus(`Transcribing part ${i + 1} of ${chunks.length}…`);
        const fd = new FormData(); fd.append("file", chunks[i].blob, "a.wav");
        const r = await fetch(url.replace(/\/$/, "") + "/transcribe", {method: "POST", headers: token ? {Authorization: "Bearer " + token} : {}, body: fd});
        if (!r.ok) throw new Error("Server answered " + r.status);
        const data = await r.json();
        const off = chunks[i].offset, t = (x) => +(x + off).toFixed(2);
        data.segments.forEach((s) => cues.push({start: t(s.start), end: t(s.end), text: s.text, words: (s.words || []).map((w) => ({start: t(w.start), end: t(w.end), text: w.text}))}));
      }
      const {data: row, error} = await supabase.from("projects").insert({title: file.name.replace(/\.[^.]+$/, ""), cues}).select().single();
      if (error) throw error;
      setMedia(file); setOpen(row); load(); setStatus("");
    } catch (e) { setStatus("Failed: " + e.message); }
    setBusy(false);
  };

  if (open) return <Editor project={open} media={media} setMedia={setMedia} onBack={() => { setOpen(null); setMedia(null); load(); }}/>;
  return (
    <main className="home">
      <header><h1 className="am">ንዑስ ጽሑፍ</h1><button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button></header>
      <fieldset className="field"><legend>Transcription server</legend>
        <input value={url} onChange={(e) => keep("asr_url", e.target.value, setUrl)} placeholder="https://xxxx.trycloudflare.com" disabled={busy}/>
        <input type="password" value={token} onChange={(e) => keep("asr_token", e.target.value, setToken)} placeholder="Access token (only if you set one)" disabled={busy}/>
        <div><button type="button" onClick={test} disabled={busy || !url}>Test connection</button> {ping && <span className="note">{ping}</span>}</div></fieldset>
      <label className={"drop" + (busy ? " busy" : "")}>
        <input type="file" accept="video/*,audio/*" disabled={busy} onChange={(e) => create(e.target.files[0])}/>
        <strong>{busy ? status : "Choose a video or audio file"}</strong>
        <span>We transcribe it to Amharic. You edit every line afterwards.</span>
      </label>
      {!busy && status && <p className="note">{status}</p>}
      <h2>Your projects</h2>
      {projects.length === 0 && <p className="muted">No projects yet. Upload a file above to make your first one.</p>}
      <ul className="plist">{projects.map((p) => (
        <li key={p.id}><button onClick={async () => { const {data} = await supabase.from("projects").select("*").eq("id", p.id).single(); setOpen(data); }}>
          <span className="am">{p.title}</span><small>{new Date(p.updated_at).toLocaleDateString()}</small></button></li>))}</ul>
    </main>
  );
}

const FONTS = ["Noto Sans Ethiopic", "Noto Serif Ethiopic", "Abyssinica SIL"];
const HL = ["#ffd23f", "#4ade80", "#38bdf8", "#ff6b9a", "#ff8a3d"], BASE = ["#ffffff", "#fde68a", "#e2e8f0"];

function Swatches({label, list, value, onPick}) {
  return <div className="sws"><span>{label}</span>
    {list.map((c) => <button key={c} type="button" className="sw" style={{background: c}} aria-label={c} aria-pressed={value === c} onClick={() => onPick(c)}/>)}
    <input type="color" value={value} onChange={(e) => onPick(e.target.value)} aria-label={label + " custom"}/></div>;
}

const CueRow = memo(function CueRow({c, i, on, hasMedia, font, defY, edit, seek, remove}) {
  return (
    <li className={on ? "on" : ""}>
      <div className="times">
        <input type="number" step="0.1" value={c.start} onChange={(e) => edit(i, "start", +e.target.value)} aria-label="Start seconds"/>
        <input type="number" step="0.1" min="0" max="100" value={c.y ?? defY} onChange={(e) => edit(i, "y", +e.target.value)} aria-label="Position percent from top" title="Position %"/>
        <input type="number" step="0.1" value={c.end} onChange={(e) => edit(i, "end", +e.target.value)} aria-label="End seconds"/>
        <button onClick={() => seek(c.start)} disabled={!hasMedia}>Play</button>
        {c.y != null && <button onClick={() => edit(i, "y", undefined)}>Reset position</button>}
        <button onClick={() => remove(i)}>Delete</button>
      </div>
      <textarea style={{fontFamily: `"${font}", serif`}} rows={2} value={c.text} onChange={(e) => edit(i, "text", e.target.value)}/>
    </li>
  );
});

function Editor({project, media, setMedia, onBack}) {
  const [title, setTitle] = useState(project.title), [cues, setCues] = useState(project.cues);
  const [style, setStyle] = useState({...DEF_STYLE, ...(project.style || {})}), [now, setNow] = useState(0), [saved, setSaved] = useState(true);
  const el = useRef(null), url = useRef(null), stage = useRef(null), dragging = useRef(false);
  if (media && !url.current) url.current = URL.createObjectURL(media);
  const isVideo = media?.type.startsWith("video");
  const active = cues.findIndex((c) => now >= c.start && now < c.end);
  const edit = useCallback((i, k, v) => {
    setCues((prev) => prev.map((c, j) => {
      if (j !== i) return c;
      const n = {...c, [k]: v};
      if ((k === "start" || k === "end") && c.words) {   // keep word timings inside the line
        const f = (t) => c.end > c.start ? n.start + (t - c.start) * (n.end - n.start) / (c.end - c.start) : t;
        n.words = c.words.map((w) => ({...w, start: +f(w.start).toFixed(2), end: +f(w.end).toFixed(2)}));
      }
      if (k === "text" && c.words && split(v).length !== c.words.length) n.words = undefined;
      return n;
    }));
    setSaved(false);
  }, []);
  const remove = useCallback((i) => { setCues((p) => p.filter((_, j) => j !== i)); setSaved(false); }, []);
  const seek = useCallback((s) => { if (el.current) { el.current.currentTime = s; el.current.play(); } }, []);
  const setSt = (k, v) => { setStyle((s) => ({...s, [k]: v})); setSaved(false); };
  const addCue = () => { const s = +now.toFixed(2); setCues([...cues, {start: s, end: s + 2, text: ""}].sort((a, b) => a.start - b.start)); setSaved(false); };
  const save = async () => { await supabase.from("projects").update({title, cues, style, updated_at: new Date().toISOString()}).eq("id", project.id); setSaved(true); };
  const drag = (e) => { if (!dragging.current || active < 0) return; const r = stage.current.getBoundingClientRect();
    edit(active, "y", Math.round(Math.min(95, Math.max(5, (e.clientY - r.top) / r.height * 100)))); };
  useEffect(() => { const h = (e) => { if (!saved) e.preventDefault(); }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [saved]);
  // smooth clock so words change colour exactly when spoken
  useEffect(() => { let id, last = 0;
    const tick = () => { const m = el.current; if (m && !m.paused && Math.abs(m.currentTime - last) > 0.04) { last = m.currentTime; setNow(last); } id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id); }, [media]);
  const dl = (ext, fn, type) => () => download(title + "." + ext, fn(cues, style), type);
  const cur = active >= 0 ? cues[active] : null;

  return (
    <main className="editor">
      <header>
        <button className="link" onClick={onBack}>← Projects</button>
        <input className="title am" value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }}/>
        <button className="primary" onClick={save}>{saved ? "Saved" : "Save"}</button>
      </header>
      <section className="player">
        {media ? <div className="stage" ref={stage}>
          {isVideo ? <video ref={el} src={url.current} controls onTimeUpdate={(e) => setNow(e.target.currentTime)} onSeeked={(e) => setNow(e.target.currentTime)}/> : <audio ref={el} src={url.current} controls onTimeUpdate={(e) => setNow(e.target.currentTime)}/>}
          {isVideo && cur && <p className="overlay" title="Drag to move this subtitle"
            style={{top: (cur.y ?? style.y) + "%", fontSize: `calc(${style.size / 100} * clamp(1rem,3.5vw,1.6rem))`, fontFamily: `"${style.font}", serif`, color: style.base, background: style.bg ? "rgba(0,0,0,.6)" : "none"}}
            onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={drag} onPointerUp={() => { dragging.current = false; }}>
            {wordsOf(cur).map((w, i) => <Fragment key={i}><span className="w" style={{color: now >= w.start ? style.hl : style.base}}>{w.text}</span>{" "}</Fragment>)}</p>}
        </div> : <label className="drop small"><input type="file" accept="video/*,audio/*" onChange={(e) => setMedia(e.target.files[0])}/><strong>Attach the media file to preview</strong><span>Files stay on your device. Only subtitles are saved.</span></label>}
        <div className="bar style">
          <label className="range">Font <select value={style.font} onChange={(e) => setSt("font", e.target.value)}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></label>
          <Swatches label="Spoken word" list={HL} value={style.hl} onPick={(v) => setSt("hl", v)}/>
          <Swatches label="Text" list={BASE} value={style.base} onPick={(v) => setSt("base", v)}/>
          <label className="range"><input type="checkbox" checked={style.bg} onChange={(e) => setSt("bg", e.target.checked)}/> Dark box behind text</label>
        </div>
        <div className="bar">
          <label className="range">Default position <input type="range" min="5" max="95" value={style.y} onChange={(e) => setSt("y", +e.target.value)}/><output>{style.y}%</output></label>
          <label className="range">Text size <input type="range" min="60" max="200" step="5" value={style.size} onChange={(e) => setSt("size", +e.target.value)}/><output>{style.size}%</output></label>
        </div>
        <p className="muted small">Drag a subtitle on the video to place just that line. Or type its position below (0% is the top, 100% is the bottom).</p>
        <div className="bar dl"><strong>Download subtitles only</strong>
          <button onClick={dl("ass", toAss, "text/x-ass")} title="Word colours, position and font">ASS (word colours)</button>
          <button onClick={dl("srt", toSrt, "application/x-subrip")}>SRT</button>
          <button onClick={dl("vtt", toVtt, "text/vtt")}>VTT</button>
          <button onClick={dl("txt", toTxt, "text/plain")}>Text</button>
          <button onClick={addCue}>Add line at current time</button>
        </div>
      </section>
      <ol className="cues">{cues.map((c, i) => <CueRow key={i} c={c} i={i} on={i === active} hasMedia={!!media} font={style.font} defY={style.y} edit={edit} seek={seek} remove={remove}/>)}</ol>
    </main>
  );
}
