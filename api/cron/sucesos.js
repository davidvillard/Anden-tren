// Actualización automática de los sucesos.
// La llama cron-job.org cada 5 minutos (y Vercel Cron una vez al día) con
// la cabecera "Authorization: Bearer <CRON_SECRET>".
//
// 1. Lee titulares recientes sobre sucesos ferroviarios.
// 2. Si hay titulares nuevos, pide a Gemini (plan gratuito) las cifras y quién las da.
// 3. Aplica las reglas de lib/merge.js y guarda el resultado en Redis.
import { fetchNews } from "../../lib/news.js";
import { extract, QuotaError } from "../../lib/extract.js";
import { merge } from "../../lib/merge.js";
import { getJSON, setJSON, storeEnabled } from "../../lib/store.js";
import { loadState, KEY_STATE, KEY_SEEN, KEY_LAST_CALL } from "../../lib/sucesos-state.js";

const KEY_LAST_DEPLOY = "sucesos:ultimo-despliegue";
const KEY_PAUSE = "sucesos:pausa-cupo";

const MIN_INTERVAL_MS = Number(process.env.GEMINI_MIN_INTERVAL_MIN || 10) * 60_000;
const QUOTA_PAUSE_MS = 60 * 60_000; // si se agota el cupo gratuito, se espera una hora
const SEEN_TTL_MS = 7 * 24 * 3600_000;

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: "No autorizado" });
  if (!storeEnabled()) return res.status(500).json({ error: "Falta conectar Upstash Redis en Vercel" });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "Falta la variable GEMINI_API_KEY" });

  const now = new Date();
  const state = await loadState();
  const seen = (await getJSON(KEY_SEEN)) || {};
  for (const [k, t] of Object.entries(seen)) if (now - new Date(t) > SEEN_TTL_MS) delete seen[k];

  const { items, errors } = await fetchNews();
  const fresh = items.filter((it) => !seen[it.link]);
  const summary = { titulares: items.length, nuevos: fresh.length, erroresFuentes: errors.length };

  let next = state;
  let changes = [];
  if (fresh.length) {
    const last = (await getJSON(KEY_LAST_CALL)) || 0;
    const pausedUntil = (await getJSON(KEY_PAUSE)) || 0;
    if (now < pausedUntil) {
      summary.gemini = "En pausa: cupo gratuito agotado, se reintenta a las " + new Date(pausedUntil).toISOString();
    } else if (now - last < MIN_INTERVAL_MS) {
      summary.gemini = "En espera: se consultó hace menos de " + MIN_INTERVAL_MS / 60000 + " min";
    } else {
      await setJSON(KEY_LAST_CALL, now.getTime());
      try {
        const { data, model } = await extract({ state, items: items.slice(0, 90), now });
        ({ state: next, changes } = merge({ state, proposal: data, items: items.slice(0, 90), now }));
        for (const it of items) seen[it.link] = now.toISOString();
        summary.gemini = { modelo: model };
      } catch (e) {
        if (e instanceof QuotaError) await setJSON(KEY_PAUSE, now.getTime() + QUOTA_PAUSE_MS);
        summary.gemini = { error: String(e.message || e) };
      }
    }
  } else {
    ({ state: next, changes } = merge({ state, proposal: { sucesos: [] }, items: [], now }));
  }

  await setJSON(KEY_STATE, next);
  await setJSON(KEY_SEEN, seen);

  // Si han cambiado las cifras, se vuelve a publicar la web para que las
  // páginas que lee Google lleven el dato nuevo (como mucho cada 15 min).
  if (changes.length && process.env.DEPLOY_HOOK_URL) {
    const lastDeploy = (await getJSON(KEY_LAST_DEPLOY)) || 0;
    if (now - lastDeploy > 15 * 60_000) {
      try { await fetch(process.env.DEPLOY_HOOK_URL, { method: "POST" }); await setJSON(KEY_LAST_DEPLOY, now.getTime()); summary.redeploy = true; }
      catch (e) { summary.redeploy = `error: ${e.message}`; }
    }
  }
  res.status(200).json({ ok: true, ...summary, cambios: changes });
}
