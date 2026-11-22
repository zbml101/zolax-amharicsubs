import {Fragment, memo, useCallback, useEffect, useRef, useState} from "react";
import {Check, Download, Eye, EyeOff, Film, LayoutDashboard, Loader2, LogOut, Maximize2, Merge, Mic, Palette, Play, Plus, Scissors, Search, Server, Sparkles, Trash2, UploadCloud, Wrench, ArrowLeft} from "lucide-react";
import {supabase} from "./supabase";
import {toChunks} from "./audio";
import {toSrt, toVtt, toAss, toTxt, download, downloadBlob, wordsOf, split, DEF_STYLE, RATIOS} from "./subs";
import {burnVideo} from "./burn";

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

function Logo() { return <div className="logo"><span className="mark am">ን</span><span className="am">ንዑስ ጽሑፍ</span></div>; }

function Login() {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [mode, setMode] = useState("in"), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [show, setShow] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setMsg(""); setBusy(true);
    const {error} = mode === "in" ? await supabase.auth.signInWithPassword({email, password}) : await supabase.auth.signUp({email, password});
    setBusy(false);
    if (error) setMsg(error.message); else if (mode === "up") setMsg("Check your email to confirm your account.");
  };
  return (
    <div className="auth">
      <div className="glyphs" aria-hidden>{["ሀ", "ለ", "መ", "ሠ", "ረ", "ቀ"].map((g, i) => <span key={g} className="am" style={{"--x": [8, 70, 40, 88, 15, 55][i] + "%", "--y": [12, 8, 70, 62, 80, 30][i] + "%", "--s": [9, 6, 12, 7, 8, 5][i] + "rem", "--d": -i * 1.5 + "s"}}>{g}</span>)}</div>
      <section className="hero">
        <Logo/>
        <h1 className="up" style={{"--i": 1}}>Subtitles that speak <em>Amharic</em>, word by word.</h1>
        <p className="lead up" style={{"--i": 2}}>Upload a video or audio file, get timed Amharic subtitles, polish them, and export for YouTube, TikTok and Reels.</p>
        <div className="demo am up" style={{"--i": 3}}>{["እንኳን", "ደህና", "መጡ"].map((w, i) => <span key={w} style={{"--i": i}}>{w} </span>)}</div>
        <ul className="feats up" style={{"--i": 4}}><li><Mic size={16}/>Amharic speech recognition</li><li><Palette size={16}/>Karaoke word colours</li><li><Film size={16}/>9:16 and 16:9 export</li></ul>
      </section>
      <form className="auth-card glass up" style={{"--i": 2}} onSubmit={go}>
        <div className="seg"><button type="button" aria-pressed={mode === "in"} onClick={() => setMode("in")}>Sign in</button><button type="button" aria-pressed={mode === "up"} onClick={() => setMode("up")}>Create account</button></div>
        <h2>{mode === "in" ? "Welcome back" : "Start for free"}</h2>
        <label>Email<input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required/></label>
        <label>Password<span className="pw"><input type={show ? "text" : "password"} autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={6} placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required/>
          <button type="button" className="eye" onClick={() => setShow(!show)} aria-label="Show password">{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
        <button className="btn big" disabled={busy}>{busy ? <Loader2 className="spin" size={18}/> : <Sparkles size={18}/>}{mode === "in" ? "Sign in" : "Create account"}</button>
        {msg && <p className="msg">{msg}</p>}
      </form>
    </div>
  );
}

const hue = (t) => [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

function Workspace() {
  const [projects, setProjects] = useState(null), [open, setOpen] = useState(null), [media, setMedia] = useState(null);
  const [status, setStatus] = useState(""), [pct, setPct] = useState(0), [busy, setBusy] = useState(false), [over, setOver] = useState(false), [q, setQ] = useState("");
  const [url, setUrl] = useState(ls("asr_url") || import.meta.env.VITE_ASR_URL || ""), [token, setToken] = useState(ls("asr_token") || import.meta.env.VITE_ASR_TOKEN || ""), [ping, setPing] = useState("");
  const [srv, setSrv] = useState(!url), fileRef = useRef(null);
  const keep = (k, v, set) => { set(v); setPing(""); try { localStorage.setItem(k, v); } catch {} };
  const test = async () => { setPing("Checking…"); try { const r = await fetch(url.replace(/\/$/, "") + "/health"); const j = await r.json(); setPing(j.ok ? "Ready (" + j.device + ")" : "Not ready"); } catch { setPing("Not reachable"); } };
  const load = async () => { const {data} = await supabase.from("projects").select("id,title,updated_at").order("updated_at", {ascending: false}); setProjects(data || []); };
  useEffect(() => { load(); if (url) test(); }, []);

  const create = async (file) => {
    if (!file) return; if (!url) { setStatus("Enter the transcription server address first."); return; } setBusy(true); setStatus("Preparing audio…"); setPct(4);
    try {
      const chunks = await toChunks(file), cues = [];
      for (let i = 0; i < chunks.length; i++) {
        setStatus(`Transcribing part ${i + 1} of ${chunks.length}…`); setPct(10 + Math.round(85 * i / chunks.length));
        const fd = new FormData(); fd.append("file", chunks[i].blob, "a.wav");
        const r = await fetch(url.replace(/\/$/, "") + "/transcribe", {method: "POST", headers: token ? {Authorization: "Bearer " + token} : {}, body: fd});
        if (!r.ok) throw new Error("Server answered " + r.status);
        const data = await r.json();
        const off = chunks[i].offset, t = (x) => +(x + off).toFixed(2);
        data.segments.forEach((s) => cues.push({start: t(s.start), end: t(s.end), text: s.text, words: (s.words || []).map((w) => ({start: t(w.start), end: t(w.end), text: w.text}))}));
      }
      setPct(97); setStatus("Saving project…");
      const {data: row, error} = await supabase.from("projects").insert({title: file.name.replace(/\.[^.]+$/, ""), cues}).select().single();
      if (error) throw error;
      setMedia(file); setOpen(row); load(); setStatus("");
    } catch (e) { setStatus("Failed: " + e.message); }
    setBusy(false);
  };

  if (open) return <Editor project={open} media={media} setMedia={setMedia} onBack={() => { setOpen(null); setMedia(null); load(); }}/>;
  const list = (projects || []).filter((p) => p.title.toLowerCase().includes(q.toLowerCase())), ready = ping.startsWith("Ready");
  const openProject = async (id) => { const {data} = await supabase.from("projects").select("*").eq("id", id).single(); setOpen(data); };
  return (
    <div className="shell">
      <aside className="side">
        <Logo/>
        <nav>
          <button className="nav on"><LayoutDashboard size={18}/><span>Dashboard</span></button>
          <button className="nav" onClick={() => fileRef.current.click()}><Plus size={18}/><span>New project</span></button>
          <button className="nav" onClick={() => setSrv(!srv)}><Server size={18}/><span>Server</span></button>
        </nav>
        <div className="side-foot"><span className={"pill " + (ready ? "ok" : "warn")}><i className="dot"/>{ready ? "Server ready" : "Server offline"}</span>
          <button className="nav" onClick={() => supabase.auth.signOut()}><LogOut size={18}/><span>Sign out</span></button></div>
      </aside>
      <main className="dash">
        <div className="up"><p className="eyebrow">Dashboard</p><h1>Welcome back <em className="am">ሰላም</em></h1></div>
        <div className="stats">
          <div className="glass stat up" style={{"--i": 1}}><span>Projects</span><b>{projects ? projects.length : "–"}</b></div>
          <div className="glass stat up" style={{"--i": 2}}><span>Last edited</span><b>{projects?.[0] ? new Date(projects[0].updated_at).toLocaleDateString() : "–"}</b></div>
          <div className="glass stat up" style={{"--i": 3}}><span>Speech server</span><b className={ready ? "g" : "r"}>{ready ? "Online" : "Offline"}</b></div>
        </div>
        {srv && <div className="glass srv up"><h3>Transcription server</h3><p className="hint">Paste the address your Colab notebook prints. It changes each session.</p>
          <input value={url} onChange={(e) => keep("asr_url", e.target.value, setUrl)} placeholder="https://xxxx.trycloudflare.com" disabled={busy}/>
          <input type="password" value={token} onChange={(e) => keep("asr_token", e.target.value, setToken)} placeholder="Access token (only if you set one)" disabled={busy}/>
          <div className="row"><button className="btn" onClick={test} disabled={busy || !url}>Test connection</button>{ping && <span className={"pill " + (ready ? "ok" : "warn")}>{ping}</span>}</div></div>}
        <input ref={fileRef} hidden type="file" accept="video/*,audio/*" onChange={(e) => { create(e.target.files[0]); e.target.value = ""; }}/>
        <div className={"drop up" + (over ? " over" : "") + (busy ? " busy" : "")} style={{"--i": 4}} onClick={() => !busy && fileRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) create(e.dataTransfer.files[0]); }}>
          {busy ? <div className="prog"><Loader2 className="spin" size={28}/><h3>{status}</h3><div className="bar-p"><i style={{width: pct + "%"}}/></div><p className="hint">Keep this tab open. Long files take a few minutes.</p></div>
            : <><UploadCloud size={40}/><h3>Drop a video or audio file</h3><p className="hint">or click to browse. MP4, MOV, MP3, WAV and more.</p></>}
        </div>
        {!busy && status && <p className="msg">{status}</p>}
        <div className="list-head"><h2>Your projects</h2><label className="search"><Search size={16}/><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"/></label></div>
        {projects && list.length === 0 && <div className="empty glass"><span className="am">ሀ</span><p>{q ? "No projects match your search." : "No projects yet. Drop your first file above."}</p></div>}
        <div className="grid-p">{list.map((p, i) => (
          <article key={p.id} className="proj glass up" style={{"--i": i % 8, "--h": hue(p.title)}} onClick={() => openProject(p.id)}>
            <div className="cover am">{[...p.title][0]}</div>
            <div className="meta"><h3 className="am">{p.title}</h3><small>{new Date(p.updated_at).toLocaleDateString()}</small></div>
            <button className="ib danger" aria-label={"Delete " + p.title} onClick={async (e) => { e.stopPropagation(); if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return; await supabase.from("projects").delete().eq("id", p.id); load(); }}><Trash2 size={16}/></button>
          </article>))}</div>
      </main>
    </div>
  );
}

const FONTS = ["Noto Sans Ethiopic", "Noto Serif Ethiopic", "Abyssinica SIL"];
const HL = ["#ffd23f", "#4ade80", "#38bdf8", "#ff6b9a", "#ff8a3d"], BASE = ["#ffffff", "#fde68a", "#e2e8f0"];

function Swatches({label, list, value, onPick}) {
  return <div className="sws"><span>{label}</span>
    {list.map((c) => <button key={c} type="button" className="sw" style={{background: c}} aria-label={c} aria-pressed={value === c} onClick={() => onPick(c)}/>)}
    <input type="color" value={value} onChange={(e) => onPick(e.target.value)} aria-label={label + " custom"}/></div>;
}

const CueRow = memo(function CueRow({c, i, on, hasMedia, font, defY, edit, seek, remove, splitAt, merge}) {
  return (
    <li id={"cue-" + i} className={on ? "on" : ""}>
      <div className="times"><span className="num">{i + 1}</span>
        <input type="number" step="0.1" value={c.start} onChange={(e) => edit(i, "start", +e.target.value)} aria-label="Start seconds" title="Start (s)"/>
        <input type="number" step="0.1" value={c.end} onChange={(e) => edit(i, "end", +e.target.value)} aria-label="End seconds" title="End (s)"/>
        <input type="number" step="1" min="0" max="100" value={c.y ?? defY} onChange={(e) => edit(i, "y", +e.target.value)} aria-label="Position percent from top" title="Position %"/>
        {c.y != null && <button className="ib" onClick={() => edit(i, "y", undefined)} title="Reset position">↺</button>}
        <span className="grow"/>
        <button className="ib" onClick={() => seek(c.start)} disabled={!hasMedia} title="Play from here"><Play size={15}/></button>
        <button className="ib" onClick={() => splitAt(i)} title="Split at playback time"><Scissors size={15}/></button>
        <button className="ib" onClick={() => merge(i)} title="Merge with next line"><Merge size={15}/></button>
        <button className="ib danger" onClick={() => remove(i)} title="Delete line"><Trash2 size={15}/></button>
      </div>
      <textarea style={{fontFamily: `"${font}", serif`}} rows={2} value={c.text} onChange={(e) => edit(i, "text", e.target.value)}/>
    </li>
  );
});

function Editor({project, media, setMedia, onBack}) {
  const [title, setTitle] = useState(project.title), [cues, setCues] = useState(project.cues);
  const [style, setStyle] = useState({...DEF_STYLE, ...(project.style || {})}), [now, setNow] = useState(0), [saved, setSaved] = useState(true);
  const [fr, setFr] = useState({a: "", b: "", msg: ""}), [burn, setBurn] = useState(null), [vr, setVr] = useState(null), [tab, setTab] = useState("style");
  const el = useRef(null), url = useRef(null), stage = useRef(null), dragging = useRef(false), nowRef = useRef(0), abort = useRef(null), saveRef = useRef(null);
  nowRef.current = now;
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
  const splitAt = useCallback((i) => {
    setCues((prev) => {
      const c = prev[i], ws = wordsOf(c); if (ws.length < 2) return prev;
      const t = nowRef.current; let k = ws.findIndex((w) => w.start >= t);
      if (!(t > c.start && t < c.end && k > 0)) k = Math.ceil(ws.length / 2);
      const A = {...c, end: +ws[k - 1].end.toFixed(2), text: ws.slice(0, k).map((w) => w.text).join(" "), words: ws.slice(0, k)};
      const B = {...c, start: +ws[k].start.toFixed(2), text: ws.slice(k).map((w) => w.text).join(" "), words: ws.slice(k)};
      return [...prev.slice(0, i), A, B, ...prev.slice(i + 1)];
    });
    setSaved(false);
  }, []);
  const merge = useCallback((i) => {
    setCues((prev) => {
      if (i >= prev.length - 1) return prev;
      const a = prev[i], b = prev[i + 1];
      return [...prev.slice(0, i), {...a, end: b.end, text: (a.text + " " + b.text).trim(), words: [...wordsOf(a), ...wordsOf(b)]}, ...prev.slice(i + 2)];
    });
    setSaved(false);
  }, []);
  const setSt = (k, v) => { setStyle((s) => ({...s, [k]: v})); setSaved(false); };
  const addCue = () => { const s = +now.toFixed(2); setCues([...cues, {start: s, end: s + 2, text: ""}].sort((a, b) => a.start - b.start)); setSaved(false); };
  const save = async () => { await supabase.from("projects").update({title, cues, style, updated_at: new Date().toISOString()}).eq("id", project.id); setSaved(true); };
  saveRef.current = save;
  const replaceAll = () => {
    if (!fr.a) return; let count = 0;
    setCues((prev) => prev.map((c) => {
      if (!c.text.includes(fr.a)) return c;
      count += c.text.split(fr.a).length - 1; const text = c.text.split(fr.a).join(fr.b);
      return {...c, text, words: c.words && split(text).length === c.words.length ? c.words : undefined};
    }));
    setSaved(false); setTimeout(() => setFr((f) => ({...f, msg: count ? `Replaced ${count}` : "Not found"})), 0);
  };
  const runBurn = async () => {
    abort.current = new AbortController(); setBurn({p: 0, mode: "fast"});
    try { const r = await burnVideo(media, cues, style, (p) => setBurn((b) => b && {...b, p}), abort.current.signal, (mode) => setBurn({p: 0, mode})); if (r) downloadBlob(`${title}-subtitled.${r.ext}`, r.blob); }
    catch (e) { alert(e.message); }
    setBurn(null);
  };
  const drag = (e) => { if (!dragging.current || active < 0) return; const r = stage.current.getBoundingClientRect();
    edit(active, "y", Math.round(Math.min(95, Math.max(5, (e.clientY - r.top) / r.height * 100)))); };
  useEffect(() => { const h = (e) => { if (!saved) e.preventDefault(); }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [saved]);
  // autosave 3 s after the last change
  useEffect(() => { if (saved) return; const t = setTimeout(() => saveRef.current(), 3000); return () => clearTimeout(t); }, [cues, style, title, saved]);
  // Ctrl/Cmd+S saves, Ctrl/Cmd+Enter plays or pauses
  useEffect(() => { const h = (e) => { if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "s") { e.preventDefault(); saveRef.current(); }
    if (e.key === "Enter" && el.current) { e.preventDefault(); el.current.paused ? el.current.play() : el.current.pause(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
  // keep the current line in view while playing
  useEffect(() => { if (active < 0 || !el.current || el.current.paused || ["TEXTAREA", "INPUT"].includes(document.activeElement?.tagName)) return;
    document.getElementById("cue-" + active)?.scrollIntoView({block: "nearest", behavior: "smooth"}); }, [active]);
  // smooth clock so words change colour exactly when spoken
  useEffect(() => { let id, last = 0;
    const tick = () => { const m = el.current; if (m && !m.paused && Math.abs(m.currentTime - last) > 0.04) { last = m.currentTime; setNow(last); } id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id); }, [media]);
  const dl = (ext, fn, type) => () => download(title + "." + ext, fn(cues, style), type);
  const cur = active >= 0 ? cues[active] : null;
  const ratio = RATIOS[style.ratio] ?? (vr || 16 / 9);
  const srcLabel = !vr ? "" : Math.abs(vr - 16 / 9) < 0.02 ? "16:9 landscape" : Math.abs(vr - 9 / 16) < 0.02 ? "9:16 vertical" : vr >= 1 ? "landscape" : "vertical";
  const setRatio = (r) => { setStyle((s) => { const tall = (RATIOS[r] ?? (vr || 16 / 9)) < 1; let y = s.y;
    if (tall && y === 85) y = 72; else if (!tall && y === 72) y = 85;   // keep text clear of phone app buttons
    return {...s, ratio: r, y}; }); setSaved(false); };

  const TABS = [["style", "Style", Palette], ["size", "Shape", Maximize2], ["export", "Export", Download], ["tools", "Tools", Wrench]];
  const exportBtns = [["srt", toSrt, "application/x-subrip", "SRT"], ["vtt", toVtt, "text/vtt", "VTT"], ["txt", toTxt, "text/plain", "Text"]];
  return (
    <div className="ed">
      <header className="topbar glass">
        <button className="ghost" onClick={onBack}><ArrowLeft size={18}/><span className="lbl">Projects</span></button>
        <input className="title am" value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} aria-label="Project title"/>
        <span className={"pill " + (saved ? "ok" : "warn")}>{saved ? <><Check size={14}/>Saved</> : "Autosaving…"}</span>
        <button className="btn" onClick={save}>Save</button>
      </header>
      <div className="grid">
        <section className="left">
          {media ? <div className={"stage" + (isVideo ? " vstage" : "")} ref={stage} style={isVideo ? {aspectRatio: String(ratio), width: `min(100%, calc(46vh * ${ratio}))`, "--fit": style.fit === "crop" ? "cover" : "contain", "--pos": `${style.focus}% ${style.focus}%`} : undefined}>
            {isVideo ? <video ref={el} src={url.current} controls onLoadedMetadata={(e) => setVr(e.target.videoWidth / e.target.videoHeight)} onTimeUpdate={(e) => setNow(e.target.currentTime)} onSeeked={(e) => setNow(e.target.currentTime)}/> : <audio ref={el} src={url.current} controls onTimeUpdate={(e) => setNow(e.target.currentTime)}/>}
            {isVideo && cur && <p className="overlay" title="Drag to move this subtitle"
              style={{top: (cur.y ?? style.y) + "%", fontSize: `${(style.size / 100) * (ratio >= 1 ? 5.6 : 6.8)}${ratio >= 1 ? "cqh" : "cqw"}`, fontFamily: `"${style.font}", serif`, color: style.base, background: style.bg ? "rgba(0,0,0,.6)" : "none"}}
              onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
              onPointerMove={drag} onPointerUp={() => { dragging.current = false; }}>
              {wordsOf(cur).map((w, i) => <Fragment key={i}><span className="w" style={{color: now >= w.start ? style.hl : style.base}}>{w.text}</span>{" "}</Fragment>)}</p>}
          </div> : <label className="drop small"><input hidden type="file" accept="video/*,audio/*" onChange={(e) => setMedia(e.target.files[0])}/><UploadCloud size={28}/><h3>Attach the media file to preview</h3><p className="hint">Files stay on your device. Only subtitles are saved.</p></label>}
          <div className="panel glass">
            <div className="tabs" role="tablist">{TABS.map(([k, l, Icon]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}><Icon size={16}/>{l}</button>)}
              <i style={{transform: `translateX(${TABS.findIndex((t) => t[0] === tab) * 100}%)`}}/></div>
            {tab === "style" && <div className="pane" key="style">
              <label className="range">Font <select value={style.font} onChange={(e) => setSt("font", e.target.value)}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></label>
              <Swatches label="Spoken word" list={HL} value={style.hl} onPick={(v) => setSt("hl", v)}/>
              <Swatches label="Text" list={BASE} value={style.base} onPick={(v) => setSt("base", v)}/>
              <label className="range"><input type="checkbox" checked={style.bg} onChange={(e) => setSt("bg", e.target.checked)}/> Dark box behind text</label>
              <label className="range">Position <input type="range" min="5" max="95" value={style.y} onChange={(e) => setSt("y", +e.target.value)}/><output>{style.y}%</output></label>
              <label className="range">Size <input type="range" min="60" max="200" step="5" value={style.size} onChange={(e) => setSt("size", +e.target.value)}/><output>{style.size}%</output></label>
              <p className="hint">Drag a subtitle on the video to place just that line.</p></div>}
            {tab === "size" && <div className="pane" key="size">{!isVideo ? <p className="hint">Attach a video to change its shape.</p> : <>
              <div className="row">{[["original", "Original"], ["9:16", "9:16 Vertical"], ["16:9", "16:9 Landscape"], ["1:1", "1:1"], ["4:5", "4:5"]].map(([k, l]) => <button key={k} className="chip" aria-pressed={style.ratio === k} onClick={() => setRatio(k)}>{l}</button>)}</div>
              {style.ratio !== "original" && <>
                <label className="range">Fit <select value={style.fit} onChange={(e) => setSt("fit", e.target.value)}><option value="crop">Crop to fill</option><option value="blur">Fit with blurred background</option></select></label>
                {style.fit === "crop" && <label className="range">Crop position <input type="range" min="0" max="100" value={style.focus} onChange={(e) => setSt("focus", +e.target.value)}/><output>{style.focus}%</output></label>}</>}
              <p className="hint">{srcLabel && `Your video is ${srcLabel}. `}Subtitles resize to the chosen shape.{style.fit === "blur" && style.ratio !== "original" ? " The blur appears in the exported video." : ""}</p></>}</div>}
            {tab === "export" && <div className="pane" key="export">
              <h4>Subtitle files</h4>
              <div className="row"><button className="btn" onClick={dl("ass", (c, s) => toAss(c, s, vr), "text/x-ass")} title="Word colours, position and font"><Download size={16}/>ASS · word colours</button>
                {exportBtns.map(([e, f, t, l]) => <button key={e} className="ghost" onClick={dl(e, f, t)}>{l}</button>)}</div>
              {isVideo && <><h4>Video with subtitles</h4>
                {burn ? <div className="row"><div className="bar-p grow"><i style={{width: burn.p * 100 + "%"}}/></div><span>{Math.round(burn.p * 100)}%</span><button className="ghost" onClick={() => abort.current.abort()}>Stop</button></div>
                  : <div className="row"><button className="btn" onClick={runBurn}><Film size={16}/>Create video</button></div>}
                <p className="hint">{burn?.mode === "slow" ? "Compatibility mode: this browser records in real time, so a 10-minute video takes 10 minutes. Keep this tab open and visible." : "Fast mode uses your device\u2019s video hardware and usually finishes far quicker than the video\u2019s length. Keep this tab open. Chrome or Edge works best. Your original video is not changed."}</p></>}</div>}
            {tab === "tools" && <div className="pane" key="tools">
              <h4>Find and replace</h4>
              <div className="row"><input value={fr.a} placeholder="Find" onChange={(e) => setFr({...fr, a: e.target.value, msg: ""})}/><input value={fr.b} placeholder="Replace with" onChange={(e) => setFr({...fr, b: e.target.value, msg: ""})}/>
                <button className="btn" onClick={replaceAll}>Replace all</button>{fr.msg && <span className="pill ok">{fr.msg}</span>}</div>
              <p className="hint">Shortcuts: Ctrl+S saves, Ctrl+Enter plays or pauses. Changes also save automatically.</p></div>}
          </div>
        </section>
        <section className="right">
          <div className="list-head"><h3>{cues.length} lines</h3><button className="ghost" onClick={addCue}><Plus size={16}/>Add line</button></div>
          <ol className="cues">{cues.map((c, i) => <CueRow key={i} c={c} i={i} on={i === active} hasMedia={!!media} font={style.font} defY={style.y} edit={edit} seek={seek} remove={remove} splitAt={splitAt} merge={merge}/>)}</ol>
        </section>
      </div>
    </div>
  );
}
