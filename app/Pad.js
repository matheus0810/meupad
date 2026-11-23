"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeName } from "./lib";

// fetch com limite de tempo, para não ficar "pendente" para sempre.
async function api(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { cache: "no-store", ...opts, signal: ctrl.signal });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Erro " + r.status);
    return d;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("O servidor não respondeu");
    throw e;
  } finally { clearTimeout(t); }
}

function fmt(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function Pad({ name }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState({ s: "idle", t: "Abrindo…" });
  const [addr, setAddr] = useState(name);
  const [pads, setPads] = useState([]);

  const st = useRef({ dirty: false, saving: false, lastSaved: "", timer: null, text: "" });

  const loadList = useCallback(async () => {
    try {
      setPads((await api("/api/pad")).pads);
    } catch {}
  }, []);

  const save = useCallback(async () => {
    const s = st.current;
    if (s.saving || !s.dirty) return;
    s.saving = true; s.dirty = false;
    const sent = s.text;
    setStatus({ s: "saving", t: "Salvando…" });
    try {
      await api("/api/pad", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, text: sent }),
        keepalive: sent.length < 60000,
      });
      s.lastSaved = sent;
      if (!s.dirty) setStatus({ s: "saved", t: "Salvo" });
      loadList();
    } catch (e) {
      s.dirty = true;
      setStatus({ s: "error", t: e.message + ", tentando de novo" });
      clearTimeout(s.timer); s.timer = setTimeout(save, 3000);
    } finally {
      s.saving = false;
      if (s.dirty) { clearTimeout(s.timer); s.timer = setTimeout(save, 700); }
    }
  }, [name, loadList]);

  // Carrega o pad.
  useEffect(() => {
    let alive = true;
    const s = st.current;
    s.dirty = false; s.lastSaved = ""; s.text = "";
    setLoaded(false); setText(""); setAddr(name);
    setStatus({ s: "idle", t: "Abrindo /" + name + "…" });
    api("/api/pad?name=" + encodeURIComponent(name))
      .then((d) => {
        if (!alive) return;
        s.text = s.lastSaved = d.text; setText(d.text); setLoaded(true);
        setStatus({ s: "saved", t: d.updatedAt ? "Salvo" : "Pad novo" });
      })
      .catch((e) => alive && setStatus({ s: "error", t: e.message }));
    return () => { alive = false; if (s.dirty) { clearTimeout(s.timer); save(); } };
  }, [name, save]);

  useEffect(() => { loadList(); }, [loadList]);

  // Busca mudanças feitas em outro aparelho a cada 5 s, quando não há edição pendente.
  useEffect(() => {
    if (!loaded) return;
    const id = setInterval(async () => {
      const s = st.current;
      if (document.hidden || s.dirty || s.saving) return;
      try {
        const d = await api("/api/pad?name=" + encodeURIComponent(name));
        if (!s.dirty && !s.saving && d.text !== s.text) { s.text = s.lastSaved = d.text; setText(d.text); }
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [loaded, name]);

  useEffect(() => {
    const onUnload = () => { if (st.current.dirty) save(); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [save]);

  function onChange(v) {
    const s = st.current;
    s.text = v; setText(v);
    s.dirty = v !== s.lastSaved;
    if (!s.dirty) { setStatus({ s: "saved", t: "Salvo" }); return; }
    setStatus({ s: "pending", t: "Editando…" });
    clearTimeout(s.timer); s.timer = setTimeout(save, 700);
  }

  function onKeyDown(e) {
    if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const el = e.currentTarget;
      el.setRangeText("\t", el.selectionStart, el.selectionEnd, "end");
      onChange(el.value);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); clearTimeout(st.current.timer); save(); }
  }

  function go(raw) {
    const n = normalizeName(raw) || "inicio";
    if (n === name) return;
    router.push("/" + n.split("/").map(encodeURIComponent).join("/"));
  }

  // Subpáginas do pad atual (no "inicio", os pads de primeiro nível).
  const base = name === "inicio" ? "" : name + "/";
  const children = [...new Set(
    pads.map((p) => p.name)
      .filter((n) => n.startsWith(base) && n !== name && n !== "inicio")
      .map((n) => n.slice(base.length).split("/")[0])
  )].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const parts = name === "inicio" ? [] : name.split("/");

  return (
    <div className="page">
      <header className="top">
        <a className="logo" href="/">meupad</a>
        <nav className="crumbs" aria-label="Caminho">
          {parts.map((seg, i) => (
            <span key={i}>
              <span className="sep">/</span>
              <a href={"/" + parts.slice(0, i + 1).map(encodeURIComponent).join("/")}>{seg}</a>
            </span>
          ))}
        </nav>
        <form className="go" onSubmit={(e) => { e.preventDefault(); go(addr); }}>
          <input value={addr === "inicio" ? "" : addr} onChange={(e) => setAddr(e.target.value)}
            aria-label="Ir para o pad" placeholder="ir para…" autoComplete="off" spellCheck={false} />
        </form>
        <span className="status" data-s={status.s} title={status.t}>{status.t}</span>
      </header>
      <div className="body">
        <aside className="subs">
          <div className="subs-box">
            {children.length === 0
              ? <p className="none">Sem subpáginas</p>
              : children.map((c) => (
                  <a key={c} href={"/" + (base + c).split("/").map(encodeURIComponent).join("/")}>{c}</a>
                ))}
          </div>
        </aside>
        <textarea className="text" value={text} disabled={!loaded} spellCheck={false} autoFocus
          aria-label={"Texto de /" + name}
          onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} />
      </div>
    </div>
  );
}
