import { normalizeName } from "../../lib";
import { getPad, savePad, deletePad, listPads, ConfigError } from "../../store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_CHARS = 500_000;

function fail(e) {
  console.error(e);
  const msg = e instanceof ConfigError ? e.message : "Erro no banco: " + (e?.message || "desconhecido");
  return Response.json({ error: msg }, { status: 500 });
}

// GET /api/pad?name=x  -> { name, text, html, updatedAt }
// GET /api/pad         -> { pads: [{ name, updatedAt }] }
export async function GET(req) {
  try {
    const raw = new URL(req.url).searchParams.get("name");
    if (raw === null) return Response.json({ pads: await listPads() });
    const name = normalizeName(raw);
    if (!name) return Response.json({ error: "Nome inválido" }, { status: 400 });
    return Response.json({ name, ...(await getPad(name)) });
  } catch (e) { return fail(e); }
}

// PUT /api/pad  body { name, text, html }
export async function PUT(req) {
  try {
    const body = await req.json().catch(() => null);
    const name = normalizeName(body?.name);
    const text = typeof body?.text === "string" ? body.text : null;
    const html = typeof body?.html === "string" ? body.html : "";
    if (!name || text === null) return Response.json({ error: "Dados inválidos" }, { status: 400 });
    if (text.length + html.length > MAX_CHARS) return Response.json({ error: "Texto grande demais" }, { status: 413 });
    const updatedAt = Date.now();
    if (text.trim() === "") await deletePad(name);
    else await savePad(name, { text, html }, updatedAt);
    return Response.json({ name, updatedAt });
  } catch (e) { return fail(e); }
}

// DELETE /api/pad?name=x
export async function DELETE(req) {
  try {
    const name = normalizeName(new URL(req.url).searchParams.get("name"));
    if (!name) return Response.json({ error: "Nome inválido" }, { status: 400 });
    await deletePad(name);
    return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
