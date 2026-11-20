// Actualización automática de los sucesos.
// La llama cron-job.org cada 5 minutos (y Vercel Cron una vez al día) con
// la cabecera "Authorization: Bearer <CRON_SECRET>".
//
// 1. Lee titulares recientes sobre sucesos ferroviarios.
// 2. Si hay titulares nuevos, pide a Gemini (plan gratuito) las cifras y quién las da.
// 3. Aplica las reglas de lib/merge.js y guarda el resultado en Redis.
import { createHash } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { fetchNews } from "../../lib/news.js";
import { extract, QuotaError } from "../../lib/extract.js";
import { merge } from "../../lib/merge.js";
import { getJSON, setJSON, storeEnabled } from "../../lib/store.js";
import { loadState, KEY_STATE, KEY_SEEN, KEY_LAST_CALL } from "../../lib/sucesos-state.js";
import { fetchAlerts, buildLive } from "../../lib/renfe.js";
import { guardarSiToca } from "../../lib/historico.js";
import { TEMAS, avisosDe } from "../../lib/temas.js";
import { publish, socialEnabled } from "../../lib/social.js";

const KEY_LAST_DEPLOY = "sucesos:ultimo-despliegue";
const KEY_PAUSE = "sucesos:pausa-cupo";
const KEY_PENDING_DEPLOY = "sucesos:despliegue-pendiente";
const KEY_TEMAS = "temas:avisos"; // ids de los avisos de cada tema en la última revisión
const SITE = (process.env.SITE_URL || "https://andentren.es").replace(/\/$/, "");
const recorta = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

const MIN_INTERVAL_MS = Number(process.env.GEMINI_MIN_INTERVAL_MIN || 10) * 60_000;
const QUOTA_PAUSE_MS = 60 * 60_000; // si se agota el cupo gratuito, se espera una hora
// Noticias ya vistas: huella corta del enlace → minuto en que se vio. Se guardan 3 días
// (las noticias se buscan de las últimas 48 h). Antes se guardaba la dirección entera de
// Google News durante 7 días y la lista pasaba de 1 MB: leerla y escribirla cada 5 minutos
// agotó la transferencia gratuita de Upstash.
const SEEN_TTL_MIN = 3 * 24 * 60;
const huella = (link) => createHash("sha1").update(String(link)).digest("base64url").slice(0, 10);
const minuto = (d) => Math.floor(d.getTime() / 60_000);
// Guarda solo si el contenido ha cambiado: cada escritura cuenta como transferencia
async function setIfChanged(key, value, before) {
  if (JSON.stringify(value) === JSON.stringify(before)) return false;
  await setJSON(key, value);
  return true;
}

export const config = { maxDuration: 120 };

const KEY_LAST_RUN = "sucesos:ultima-ejecucion";

// cron-job.org corta a los 30 s y, tras varios cortes seguidos, desactiva la tarea. Consultar a
// Gemini puede tardar más, así que se contesta enseguida y el trabajo sigue en segundo plano
// (waitUntil). La respuesta lleva el resumen de la ejecución anterior.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: "No autorizado" });
  if (!storeEnabled()) return res.status(500).json({ error: "Falta conectar Upstash Redis en Vercel" });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "Falta la variable GEMINI_API_KEY" });

  let anterior = null;
  try { anterior = await getJSON(KEY_LAST_RUN); } catch (e) { return res.status(500).json({ error: `Redis no responde: ${e.message}` }); }
  const inicio = new Date();
  waitUntil(run(inicio)
    .then((r) => setJSON(KEY_LAST_RUN, { ...r, inicio: inicio.toISOString(), segundos: Math.round((Date.now() - inicio) / 1000) }))
    .catch((e) => setJSON(KEY_LAST_RUN, { error: String(e.message || e), inicio: inicio.toISOString() }).catch(() => {})));
  res.status(200).json({ ok: true, enMarcha: true, ultimaEjecucion: anterior });
}

async function run(now) {
  const state = await loadState();
  const seenRaw = (await getJSON(KEY_SEEN)) || {};
  // Formato antiguo (dirección completa → fecha ISO) se convierte al nuevo sobre la marcha
  const seen = {};
  for (const [k, t] of Object.entries(seenRaw)) {
    const key = k.length > 12 ? huella(k) : k;
    const m = typeof t === "number" ? t : minuto(new Date(t));
    if (minuto(now) - m <= SEEN_TTL_MIN) seen[key] = m;
  }

  const { items, errors } = await fetchNews();
  const fresh = items.filter((it) => !seen[huella(it.link)]);
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
        for (const it of items) seen[huella(it.link)] = minuto(now);
        summary.gemini = { modelo: model };
      } catch (e) {
        if (e instanceof QuotaError) await setJSON(KEY_PAUSE, now.getTime() + QUOTA_PAUSE_MS);
        summary.gemini = { error: String(e.message || e) };
      }
    }
  }
  // Sin consulta a Gemini (en espera, sin cupo o sin titulares nuevos): se aplican
  // igualmente las reglas de limpieza (duplicados, caducidad de incidencias).
  if (next === state) ({ state: next, changes } = merge({ state, proposal: { sucesos: [] }, items: [], now }));

  summary.guardado = {
    estado: await setIfChanged(KEY_STATE, next, state),
    vistos: await setIfChanged(KEY_SEEN, seen, seenRaw),
  };

  // Avisos de Renfe por tema urgente (huelga): si cambian, se republica la web
  // para que su página lleve la lista nueva y los nuevos se publican en redes.
  let temasCambian = false;
  const avisosNuevos = [];
  const alerts = await fetchAlerts();
  if (alerts) {
    const antes = await getJSON(KEY_TEMAS);
    const ahora = {};
    for (const t of TEMAS) {
      const lista = avisosDe(t, alerts);
      ahora[t.slug] = lista.map((a) => a.id).sort();
      if (!antes) continue; // primera revisión: solo se guarda, sin publicar nada
      const previos = new Set(antes[t.slug] || []);
      if (!t.urgente) continue;
      if (ahora[t.slug].join() !== [...previos].sort().join()) temasCambian = true;
      for (const a of lista) if (!previos.has(a.id)) avisosNuevos.push({ tema: t, aviso: a });
    }
    await setIfChanged(KEY_TEMAS, ahora, antes);
  }

  // Histórico de retrasos: resumen diario por línea en Redis, una foto cada 15 minutos
  try { summary.historico = await guardarSiToca(await buildLive(), now); } catch (e) { summary.historico = `error: ${e.message}`; }

  // Redes sociales: sucesos nuevos en curso y avisos nuevos de huelga.
  // Se enlaza a la página de lista, que ya existe; la del suceso tarda un minuto en publicarse.
  if (socialEnabled()) {
    const previos = new Set((state.sucesos || []).map((s) => s.id));
    const posts = [
      ...(next.sucesos || []).filter((s) => s.activo && !previos.has(s.id)).map((s) => ({
        texto: `${s.clase === "incidencia" ? "⚠️" : "🚨"} ${s.titulo}\n\n${recorta(s.resumen || "", 180)}`,
        url: `${SITE}${s.clase === "incidencia" ? "/incidencias" : "/accidente-tren-hoy"}`,
      })),
      ...avisosNuevos.slice(0, 3).map(({ tema, aviso }) => ({
        texto: `📢 Aviso de Renfe: ${recorta(aviso.header || aviso.desc, 200)}`,
        url: `${SITE}/${tema.slug}`,
      })),
    ];
    if (posts.length) summary.redes = await Promise.all(posts.map((p) => publish(p.texto, p.url)));
  }

  // Si han cambiado las cifras o los avisos por tema, se vuelve a publicar la web
  // para que las páginas que lee Google lleven el dato nuevo (como mucho cada 15 min).
  // Un cambio que llega antes de esos 15 min queda pendiente para la siguiente revisión.
  const yaPendiente = process.env.DEPLOY_HOOK_URL ? Boolean(await getJSON(KEY_PENDING_DEPLOY)) : false;
  const pendiente = changes.length || temasCambian || yaPendiente;
  if (pendiente && process.env.DEPLOY_HOOK_URL) {
    const lastDeploy = (await getJSON(KEY_LAST_DEPLOY)) || 0;
    if (now - lastDeploy > 15 * 60_000) {
      try {
        await fetch(process.env.DEPLOY_HOOK_URL, { method: "POST" });
        await setJSON(KEY_LAST_DEPLOY, now.getTime());
        await setJSON(KEY_PENDING_DEPLOY, false);
        summary.redeploy = true;
      } catch (e) { summary.redeploy = `error: ${e.message}`; await setJSON(KEY_PENDING_DEPLOY, true); }
    } else {
      if (!yaPendiente) await setJSON(KEY_PENDING_DEPLOY, true);
      summary.redeploy = "pendiente";
    }
  }
  return { ok: true, ...summary, cambios: changes };
}
