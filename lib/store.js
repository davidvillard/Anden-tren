// Almacén de los sucesos en Upstash Redis (API REST, sin dependencias).
// Vercel crea estas variables al conectar Upstash desde su Marketplace:
// KV_REST_API_URL y KV_REST_API_TOKEN (o UPSTASH_REDIS_REST_URL / _TOKEN).

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const storeEnabled = () => Boolean(URL_ && TOKEN);

async function cmd(...args) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(`Redis: ${j.error}`);
  return j.result;
}

export async function getJSON(key) {
  if (!storeEnabled()) return null;
  const v = await cmd("GET", key);
  return v ? JSON.parse(v) : null;
}

export async function setJSON(key, value) {
  if (!storeEnabled()) throw new Error("Falta configurar Upstash Redis (KV_REST_API_URL y KV_REST_API_TOKEN).");
  await cmd("SET", key, JSON.stringify(value));
}

// Varias claves de una vez (MGET): null en las que no existen
export async function getMany(keys) {
  if (!storeEnabled() || !keys.length) return keys.map(() => null);
  const v = await cmd("MGET", ...keys);
  return (v || []).map((x) => (x ? JSON.parse(x) : null));
}
