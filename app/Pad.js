"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DOMPurify from "dompurify";
import { marked } from "marked";
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
    if (e instanceof TypeError) throw new Error("Sem conexão com o servidor");
    throw e;
  } finally { clearTimeout(t); }
}

// Só a formatação de texto passa; cores, fontes e scripts colados são descartados.
const ALLOWED = {
  ALLOWED_TAGS: ["p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "strike", "del",
    "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "code", "pre", "a", "hr"],
  ALLOWED_ATTR: ["href"],
  ALLOWED_URI_REGEXP: /^(https?:|mailto:)/i,
};
// Tira as quebras de linha entre tags (o editor mostra quebras como linhas em branco).
const clean = (html) => DOMPurify.sanitize(html, ALLOWED).replace(/>\s*\n\s*</g, "><").trim();

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Texto colado parece Markdown? (títulos, listas, **negrito**, `código`)
const looksLikeMarkdown = (s) =>
  /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s)|\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`/.test(s);

const TOOLS = [
  { cmd: "bold", label: "B", title: "Negrito (Ctrl+B)", style: { fontWeight: "bold" } },
  { cmd: "italic", label: "I", title: "Itálico (Ctrl+I)", style: { fontStyle: "italic" } },
  { cmd: "underline", label: "U", title: "Sublinhado (Ctrl+U)", style: { textDecoration: "underline" } },
  { cmd: "strikeThrough", label: "S", title: "Riscado", style: { textDecoration: "line-through" } },
  { sep: true },
  { cmd: "formatBlock", arg: "h1", label: "T1", title: "Título grande" },
  { cmd: "formatBlock", arg: "h2", label: "T2", title: "Título médio" },
  { cmd: "formatBlock", arg: "div", label: "¶", title: "Texto normal" },
  { sep: true },
  { cmd: "insertUnorderedList", label: "• Lista", title: "Lista com marcadores" },
  { cmd: "insertOrderedList", label: "1. Lista", title: "Lista numerada" },
  { cmd: "formatBlock", arg: "blockquote", label: "❝", title: "Citação" },
  { sep: true },
  { cmd: "removeFormat", label: "Limpar", title: "Tirar formatação do trecho selecionado" },
];

export default function Pad({ name }) {
  const router = useRouter();
  const editor = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState({ s: "idle", t: "Abrindo…" });
  const [addr, setAddr] = useState(name);
  const [pads, setPads] = useState([]);

  const st = useRef({ dirty: false, saving: false, lastSaved: "", timer: null, html: "" });

  const loadList = useCallback(async () => {
    try { setPads((await api("/api/pad")).pads); } catch {}
  }, []);

  // leaving = true só quando a aba está fechando: aí usa keepalive (limite de 64 KB em bytes).
  const save = useCallback(async (leaving = false) => {
    const s = st.current;
    if (s.saving || !s.dirty) return;
    s.saving = true; s.dirty = false;
    const html = s.html;
    const text = editor.current ? editor.current.innerText : "";
    setStatus({ s: "saving", t: "Salvando…" });
    try {
      const body = JSON.stringify({ name, html: text.trim() ? html : "", text: text.trim() ? text : "" });
      await api("/api/pad", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body,
        keepalive: leaving === true && new Blob([body]).size < 60000,
      });
      s.lastSaved = html;
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

  // Coloca no editor o conteúdo vindo do servidor (pads antigos têm só texto puro).
  function show(d) {
    const html = d.html ? clean(d.html) : escapeHtml(d.text || "");
    if (editor.current) editor.current.innerHTML = html;
    const s = st.current;
    s.html = s.lastSaved = editor.current ? editor.current.innerHTML : html;
  }

  // Carrega o pad.
  useEffect(() => {
    let alive = true;
    const s = st.current;
    s.dirty = false; s.lastSaved = ""; s.html = "";
    if (editor.current) editor.current.innerHTML = "";
    setLoaded(false); setAddr(name);
    setStatus({ s: "idle", t: "Abrindo /" + name + "…" });
    api("/api/pad?name=" + encodeURIComponent(name))
      .then((d) => {
        if (!alive) return;
        show(d); setLoaded(true);
        setStatus({ s: "saved", t: d.updatedAt ? "Salvo" : "Pad novo" });
        requestAnimationFrame(() => editor.current && editor.current.focus());
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
      if (editor.current && document.activeElement === editor.current) return;
      try {
        const d = await api("/api/pad?name=" + encodeURIComponent(name));
        const incoming = d.html ? clean(d.html) : escapeHtml(d.text || "");
        if (!s.dirty && !s.saving && incoming !== s.lastSaved) show(d);
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [loaded, name]);

  useEffect(() => {
    const onUnload = () => { if (st.current.dirty) save(true); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [save]);

  function onInput() {
    const s = st.current;
    s.html = editor.current.innerHTML;
    s.dirty = s.html !== s.lastSaved;
    if (!s.dirty) { setStatus({ s: "saved", t: "Salvo" }); return; }
    setStatus({ s: "pending", t: "Editando…" });
    clearTimeout(s.timer); s.timer = setTimeout(save, 700);
  }

  function run(cmd, arg) {
    editor.current.focus();
    document.execCommand(cmd, false, arg ? "<" + arg + ">" : undefined);
    onInput();
  }

  function onPaste(e) {
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    e.preventDefault();
    if (html) document.execCommand("insertHTML", false, clean(html));
    else if (looksLikeMarkdown(text)) document.execCommand("insertHTML", false, clean(marked.parse(text, { breaks: true })));
    else document.execCommand("insertText", false, text);
    onInput();
  }

  function onKeyDown(e) {
    if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      document.execCommand("insertText", false, "\t");
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault(); clearTimeout(st.current.timer); save();
    }
  }

  // Ctrl+clique abre links.
  function onClick(e) {
    const a = e.target.closest && e.target.closest("a[href]");
    if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(a.href, "_blank", "noopener"); }
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
        <div className="sheet">
          <div className="tools" role="toolbar" aria-label="Formatação">
            {TOOLS.map((t, i) => t.sep
              ? <span key={i} className="tsep" />
              : (
                <button key={i} type="button" title={t.title} aria-label={t.title} style={t.style}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => run(t.cmd, t.arg)}>
                  {t.label}
                </button>
              ))}
          </div>
          <div ref={editor} className="text" contentEditable={loaded} suppressContentEditableWarning
            role="textbox" aria-multiline="true" aria-label={"Texto de /" + name} spellCheck={false}
            data-empty-hint="Comece a digitar…"
            onInput={onInput} onPaste={onPaste} onKeyDown={onKeyDown} onClick={onClick} />
        </div>
      </div>
    </div>
  );
}
