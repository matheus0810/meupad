// Acesso ao banco. Aceita dois tipos de Redis da Vercel:
//  - Upstash (REST): UPSTASH_REDIS_REST_URL/TOKEN ou KV_REST_API_URL/TOKEN
//  - Redis comum (TCP): REDIS_URL
import { Redis } from "@upstash/redis";
import { createClient } from "redis";

const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const tcpUrl = process.env.REDIS_URL || process.env.KV_URL;

export class ConfigError extends Error {}

let upstash = null;
let tcpPromise = null;

function withTimeout(p, ms = 8000) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("O banco demorou demais para responder")), ms)),
  ]);
}

async function tcp() {
  if (!tcpPromise) {
    const client = createClient({ url: tcpUrl, socket: { connectTimeout: 5000, reconnectStrategy: false } });
    client.on("error", () => {});
    tcpPromise = client.connect().then(() => client).catch((e) => { tcpPromise = null; throw e; });
  }
  return withTimeout(tcpPromise);
}

function getUpstash() {
  if (!upstash) upstash = new Redis({ url: restUrl, token: restToken, retry: { retries: 1 } });
  return upstash;
}

function mode() {
  if (restUrl && restToken) return "rest";
  if (tcpUrl) return "tcp";
  throw new ConfigError(
    "Banco não configurado: conecte um Redis em Storage na Vercel e faça Redeploy"
  );
}

export async function getPad(name) {
  if (mode() === "rest") {
    const d = (await withTimeout(getUpstash().hgetall(`pad:${name}`))) || {};
    return { text: d.text ?? "", html: d.html ?? "", updatedAt: Number(d.updatedAt || 0) };
  }
  const c = await tcp();
  const d = await withTimeout(c.hGetAll(`pad:${name}`));
  return { text: d.text ?? "", html: d.html ?? "", updatedAt: Number(d.updatedAt || 0) };
}

export async function savePad(name, { text, html }, updatedAt) {
  if (mode() === "rest") {
    const r = getUpstash();
    await withTimeout(Promise.all([
      r.hset(`pad:${name}`, { text, html, updatedAt }),
      r.zadd("pads", { score: updatedAt, member: name }),
    ]));
    return;
  }
  const c = await tcp();
  await withTimeout(Promise.all([
    c.hSet(`pad:${name}`, { text, html, updatedAt: String(updatedAt) }),
    c.zAdd("pads", { score: updatedAt, value: name }),
  ]));
}

export async function deletePad(name) {
  if (mode() === "rest") {
    const r = getUpstash();
    await withTimeout(Promise.all([r.del(`pad:${name}`), r.zrem("pads", name)]));
    return;
  }
  const c = await tcp();
  await withTimeout(Promise.all([c.del(`pad:${name}`), c.zRem("pads", name)]));
}

export async function listPads() {
  if (mode() === "rest") {
    const items = await withTimeout(getUpstash().zrange("pads", 0, 199, { rev: true, withScores: true }));
    const pads = [];
    for (let i = 0; i < items.length; i += 2) pads.push({ name: String(items[i]), updatedAt: Number(items[i + 1]) });
    return pads;
  }
  const c = await tcp();
  const items = await withTimeout(c.zRangeWithScores("pads", 0, 199, { REV: true }));
  return items.map((x) => ({ name: x.value, updatedAt: Number(x.score) }));
}
