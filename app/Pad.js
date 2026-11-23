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
  const [showList, setShowList] = useState(true);
  const [confirmDel, setConfirmDel] = useState(false);

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
    setLoaded(false); setText(""); setAddr(name); setConfirmDel(false);
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
    try { setShowList(localStorage.getItem("hideList") !== "1"); } catch {}
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

  function toggleList() {
    const v = !showList; setShowList(v);
    try { localStorage.setItem("hideList", v ? "0" : "1"); } catch {}
  }

  async function del() {
    const s = st.current;
    clearTimeout(s.timer); s.dirty = false;
    try {
      await api("/api/pad?name=" + encodeURIComponent(name), { method: "DELETE" });
      s.text = s.lastSaved = ""; setText(""); setConfirmDel(false);
      setStatus({ s: "saved", t: "Apagado" }); loadList();
    } catch (e) { setStatus({ s: "error", t: e.message }); }
  }

  const exists = pads.some((p) => p.name === name);

  return (
    <div className="app">
      <header>
        <div className="brand">Meu Pad</div>
        <form className="addr" onSubmit={(e) => { e.preventDefault(); go(addr); }}>
          <span>/</span>
          <input value={addr} onChange={(e) => setAddr(e.target.value)} aria-label="Nome do pad"
            placeholder="nome-do-pad" autoComplete="off" spellCheck={false} />
          <button type="submit">Abrir</button>
        </form>
        <div className="status" data-s={status.s}><i className="dot" /><span>{status.t}</span></div>
        <button type="button" onClick={toggleList} aria-expanded={showList}>Pads</button>
      </header>
      <main>
        {showList && (
          <aside>
            <h2>Seus pads</h2>
            <div className="pad-list">
              {pads.length === 0 && <div className="empty">Nenhum pad ainda. Digite um nome lá em cima e comece a escrever.</div>}
              {pads.map((p) => (
                <button key={p.name} type="button" className="pad-item" aria-current={p.name === name}
                  onClick={() => go(p.name)}>
                  <span>/{p.name}</span><small>{fmt(p.updatedAt)}</small>
                </button>
              ))}
            </div>
            {exists && (confirmDel ? (
              <div className="confirm">
                <span>Apagar de vez?</span>
                <button type="button" className="danger" onClick={del}>Apagar</button>
                <button type="button" onClick={() => setConfirmDel(false)}>Cancelar</button>
              </div>
            ) : (
              <div><button type="button" className="danger" onClick={() => setConfirmDel(true)}>Apagar /{name}</button></div>
            ))}
          </aside>
        )}
        <div className="sheet">
          <textarea value={text} disabled={!loaded} spellCheck={false} autoFocus
            onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Comece a digitar. Tudo é salvo sozinho." />
        </div>
      </main>
    </div>
  );
}
