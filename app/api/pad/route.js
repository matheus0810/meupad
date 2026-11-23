import { Redis } from "@upstash/redis";
import { normalizeName } from "../../lib";

export const dynamic = "force-dynamic";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const MAX_CHARS = 500_000;

// GET /api/pad?name=x  -> { name, text, updatedAt }
// GET /api/pad         -> { pads: [{ name, updatedAt }] }
export async function GET(req) {
  const raw = new URL(req.url).searchParams.get("name");
  if (raw === null) {
    const items = await redis.zrange("pads", 0, 199, { rev: true, withScores: true });
    const pads = [];
    for (let i = 0; i < items.length; i += 2) pads.push({ name: items[i], updatedAt: Number(items[i + 1]) });
    return Response.json({ pads });
  }
  const name = normalizeName(raw);
  if (!name) return Response.json({ error: "Nome inválido" }, { status: 400 });
  const data = (await redis.hgetall(`pad:${name}`)) || {};
  return Response.json({ name, text: data.text ?? "", updatedAt: Number(data.updatedAt || 0) });
}

// PUT /api/pad  body { name, text }
export async function PUT(req) {
  const body = await req.json().catch(() => null);
  const name = normalizeName(body?.name);
  const text = typeof body?.text === "string" ? body.text : null;
  if (!name || text === null) return Response.json({ error: "Dados inválidos" }, { status: 400 });
  if (text.length > MAX_CHARS) return Response.json({ error: "Texto grande demais" }, { status: 413 });
  const updatedAt = Date.now();
  if (text === "") {
    await Promise.all([redis.del(`pad:${name}`), redis.zrem("pads", name)]);
  } else {
    await Promise.all([
      redis.hset(`pad:${name}`, { text, updatedAt }),
      redis.zadd("pads", { score: updatedAt, member: name }),
    ]);
  }
  return Response.json({ name, updatedAt });
}

// DELETE /api/pad?name=x
export async function DELETE(req) {
  const name = normalizeName(new URL(req.url).searchParams.get("name"));
  if (!name) return Response.json({ error: "Nome inválido" }, { status: 400 });
  await Promise.all([redis.del(`pad:${name}`), redis.zrem("pads", name)]);
  return Response.json({ ok: true });
}
