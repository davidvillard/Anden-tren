// Alertas por Telegram: cada pasada del cron mira las líneas que sigue cada persona y, si está en su
// franja horaria, le escribe cuando Renfe publica un aviso nuevo de esa línea o cuando la línea va
// con muchos retrasos (una vez al día por línea). Las suscripciones y lo ya enviado viven en Supabase.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sbSelect, sbInsert, sbRpc } from "./supabase.js";
import { tgEnabled, send, esc } from "./telegram.js";
import { resumen } from "./historico.js";

const SITE = (process.env.SITE_URL || "https://andentren.es").replace(/\/$/, "");
let datos = null;
async function load() {
  if (datos) return datos;
  const leer = async (f) => JSON.parse(await readFile(join(process.cwd(), "site", "data", f), "utf8"));
  const { redes } = await leer("redes.json");
  const { lineas } = await leer("lineas.json");
  // Estaciones → líneas (para los avisos que Renfe publica sin línea)
  const plano = (x) => ` ${String(x).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñç]+/g, " ").trim()} `;
  const est = new Map();
  for (const l of lineas) for (const r of l.recorridos || []) for (const p of r.paradas || []) {
    for (const n of [p, ...p.split(/\s*[-/]\s*/).filter((x) => x.length >= 4)]) {
      const w = plano(n).trim();
      if (w.length < 4 || /^(madrid|barcelona|sevilla|valencia|malaga|bilbao|cadiz)$/.test(w)) continue;
      if (!est.has(w)) est.set(w, new Set());
      est.get(w).add(`${l.code}|${l.red}`);
    }
  }
  datos = { redes, lineas, plano, estaciones: [...est.entries()].sort((a, b) => b[0].length - a[0].length) };
  return datos;
}

// Líneas a las que afecta un aviso de Renfe: por su ruta o, si no trae, por la estación que nombra
export async function lineasDeAviso(a) {
  const { redes, plano, estaciones } = await load();
  const out = new Set();
  for (const r of a.routes || []) {
    const red = /^(\d{2})T/.exec(r)?.[1], line = /T\d+([A-Za-z]+\d+)[a-zA-Z]?$/.exec(r)?.[1];
    const slug = redes.find((x) => (x.codigos || []).includes(red))?.slug;
    if (slug && line) out.add(`${line.toUpperCase()}|${slug}`);
  }
  if (out.size) return [...out];
  let text = plano(`${a.header} ${a.desc}`);
  for (const [w, keys] of estaciones) if (text.includes(` ${w} `)) { keys.forEach((k) => out.add(k)); text = text.split(` ${w} `).join(" · "); }
  const per = {};
  for (const k of out) { const r = k.split("|")[1]; per[r] = (per[r] || 0) + 1; }
  const best = Math.max(0, ...Object.values(per));
  return [...out].filter((k) => per[k.split("|")[1]] === best);
}

// "C3 madrid", "c-3 Madrid", "R2 Barcelona" → "C3|madrid"
export async function parseLinea(texto) {
  const { redes, lineas, plano } = await load();
  const m = /\b([crst]-?\d{1,2}|r[tgl]\d)[a-z]?\b/i.exec(texto || "");
  if (!m) return null;
  const code = m[1].toUpperCase().replace("-", "");
  const resto = plano(texto.replace(m[0], ""));
  const red = redes.find((r) => [r.slug.replace(/-/g, " "), r.corto, r.nombre, ...r.claves].some((k) => resto.includes(plano(k))));
  const candidatas = lineas.filter((l) => l.code === code && (!red || l.red === red.slug));
  if (candidatas.length === 1 || (red && candidatas.length)) return `${code}|${candidatas[0].red}`;
  return candidatas.length ? { ambigua: code, redes: candidatas.map((l) => l.red) } : null;
}
export async function nombreLinea(key) {
  const { redes } = await load();
  const [code, slug] = key.split("|");
  return `${code} · ${redes.find((r) => r.slug === slug)?.corto || slug}`;
}
export const urlLinea = (key) => { const [code, slug] = key.split("|"); return `${SITE}/cercanias/${slug}/${code.toLowerCase()}`; };

const madrid = (now) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return { hora: Number(p.hour) % 24, dia: { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday], fecha: `${p.year}-${p.month}-${p.day}` };
};
const activa = (s, m) => s.dias.includes(String(m.dia)) && m.hora >= s.hora_desde && m.hora < s.hora_hasta;
const textoAviso = (a) => String(a.header || a.desc || "").replace(/^(\s*#\w+)+\s*/, "").trim();

export async function enviarAlertas(live, now = new Date()) {
  if (!tgEnabled()) return "sin Telegram";
  const subs = await sbSelect("alertas?select=chat_id,red,linea,hora_desde,hora_hasta,dias&limit=5000");
  if (!subs?.length) return "sin suscripciones";
  const m = madrid(now);
  const activas = subs.filter((s) => activa(s, m));
  if (!activas.length) return "fuera de horario";
  if (m.hora === 4 && now.getUTCMinutes() < 5) await sbRpc("limpiar_alertas_enviadas").catch(() => {});

  // Estado de cada línea y avisos de cada línea
  const filas = await resumen(live, now);
  const avisosPorLinea = new Map();
  for (const a of live.cercanias?.alerts || []) for (const k of await lineasDeAviso(a)) (avisosPorLinea.get(k) || avisosPorLinea.set(k, []).get(k)).push(a);

  const pendientes = [];
  for (const s of activas) {
    const key = `${s.linea}|${s.red}`, nombre = await nombreLinea(key);
    for (const a of avisosPorLinea.get(key) || []) pendientes.push({ chat_id: s.chat_id, clave: `a:${a.id}`, texto: `⚠️ <b>${esc(nombre)}</b> · aviso de Renfe\n\n${esc(textoAviso(a))}\n\n<a href="${urlLinea(key)}">Ver la línea en Andén</a>` });
    const f = filas.find((x) => x.red === s.red && x.linea === s.linea);
    if (f && f.con_dato >= 3 && f.tarde / f.con_dato > 0.3) pendientes.push({ chat_id: s.chat_id, clave: `r:${s.linea}-${s.red}:${m.fecha}`, texto: `🕒 <b>${esc(nombre)}</b> va con muchos retrasos: ${f.tarde} de ${f.con_dato} trenes llevan 3 min o más (retraso medio ${String(f.retraso_medio).replace(".", ",")} min).\n\n<a href="${urlLinea(key)}">Ver los trenes en directo</a>` });
  }
  if (!pendientes.length) return "nada nuevo";
  const chats = [...new Set(pendientes.map((p) => p.chat_id))];
  const claves = [...new Set(pendientes.map((p) => p.clave))];
  const ya = await sbSelect(`alertas_enviadas?select=chat_id,clave&chat_id=in.(${chats.join(",")})&clave=in.(${claves.map((c) => `"${c}"`).join(",")})`);
  const enviadas = new Set((ya || []).map((x) => `${x.chat_id} ${x.clave}`));
  const nuevas = pendientes.filter((p) => !enviadas.has(`${p.chat_id} ${p.clave}`)).slice(0, 200);
  let ok = 0;
  for (const p of nuevas) { try { await send(p.chat_id, p.texto); ok++; } catch (e) { /* chat bloqueado o borrado */ } }
  if (nuevas.length) await sbInsert("alertas_enviadas", nuevas.map(({ chat_id, clave }) => ({ chat_id, clave })), "chat_id,clave");
  return `${ok} mensajes`;
}

// Al suscribirse: los avisos que ya hay se dan por vistos (se resumen en la respuesta) para no
// mandar luego de golpe avisos antiguos
export async function marcarAvisosVistos(chat_id, key, alerts) {
  const vistos = [];
  for (const a of alerts || []) if ((await lineasDeAviso(a)).includes(key)) vistos.push(a);
  if (vistos.length) await sbInsert("alertas_enviadas", vistos.map((a) => ({ chat_id, clave: `a:${a.id}` })), "chat_id,clave");
  return vistos.map(textoAviso);
}
