// Publica avisos en redes sociales. Cada red se activa sola cuando tiene sus variables:
//   Telegram: TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID (p. ej. @andentren, con el bot como administrador del canal)
//   Bluesky:  BLUESKY_HANDLE (p. ej. andentren.bsky.social) y BLUESKY_APP_PASSWORD (Ajustes → Contraseñas de app)
// Nunca lanza error: devuelve qué se publicó y qué falló.

const env = process.env;
const LIMITE_BLUESKY = 300; // caracteres por publicación

export const socialEnabled = () => Boolean((env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) || (env.BLUESKY_HANDLE && env.BLUESKY_APP_PASSWORD));

async function post(url, body, headers = {}) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HTTP ${r.status} ${j.description || j.message || ""}`.trim());
  return j;
}

async function telegram(texto, url) {
  await post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: env.TELEGRAM_CHAT_ID, text: `${texto}\n\n${url}` });
}

async function bluesky(texto, url) {
  const s = await post("https://bsky.social/xrpc/com.atproto.server.createSession", { identifier: env.BLUESKY_HANDLE, password: env.BLUESKY_APP_PASSWORD });
  const espacio = LIMITE_BLUESKY - url.length - 2;
  const corto = [...texto].length > espacio ? [...texto].slice(0, espacio - 1).join("") + "…" : texto;
  const text = `${corto}\n\n${url}`;
  // Bluesky solo convierte en enlace lo que se marca con su posición en bytes
  const start = Buffer.byteLength(`${corto}\n\n`);
  await post("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
    repo: s.did, collection: "app.bsky.feed.post",
    record: {
      $type: "app.bsky.feed.post", text, langs: ["es"], createdAt: new Date().toISOString(),
      facets: [{ index: { byteStart: start, byteEnd: start + Buffer.byteLength(url) }, features: [{ $type: "app.bsky.richtext.facet#link", uri: url }] }],
    },
  }, { Authorization: `Bearer ${s.accessJwt}` });
}

/** Publica en todas las redes configuradas. */
export async function publish(texto, url) {
  const out = {};
  const redes = [
    env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID && ["telegram", telegram],
    env.BLUESKY_HANDLE && env.BLUESKY_APP_PASSWORD && ["bluesky", bluesky],
  ].filter(Boolean);
  for (const [nombre, fn] of redes) {
    try { await fn(texto, url); out[nombre] = "ok"; } catch (e) { out[nombre] = `error: ${e.message}`; }
  }
  return out;
}
