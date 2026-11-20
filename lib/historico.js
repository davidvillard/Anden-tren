// Histórico de retrasos: resume los datos en directo de Renfe por línea y los guarda en Supabase
// cada 15 minutos. Usa las mismas reglas que la web: red por la posición del tren (zona de cada red
// en redes.json), línea por la etiqueta del tren, "con retraso" desde 3 min (5 en larga distancia).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sbEnabled, sbInsert } from "./supabase.js";

const LINE_RE = /\b(RT\d|RG\d|RL\d|R\d{1,2}[NS]?|C-?\d{1,2}[a-z]?|S\d{1,2}|T\d)\b/i;
const lineOf = (t) => {
  for (const s of [t.label, t.routeId]) { const m = s && String(s).match(LINE_RE); if (m) return m[1].toUpperCase().replace("-", "").replace(/([A-Z]+\d+)[A-Z]$/, "$1"); }
  return null;
};

let redes = null;
async function loadRedes() {
  if (!redes) redes = JSON.parse(await readFile(join(process.cwd(), "site", "data", "redes.json"), "utf8")).redes;
  return redes;
}

// Hora de Madrid en minutos desde las 00:00
const madridMin = (d) => { const [h, m] = d.toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).split(":"); return Number(h) * 60 + Number(m); };

export async function resumen(live, now = new Date()) {
  const rs = await loadRedes();
  const map = new Map();
  const add = (red, linea, delay, umbral) => {
    const k = `${red}|${linea}`;
    const o = map.get(k) || { red, linea, trenes: 0, con_dato: 0, tarde: 0, suma: 0 };
    o.trenes++;
    if (delay !== null && delay !== undefined) { o.con_dato++; o.suma += Math.max(0, delay); if (delay >= umbral) o.tarde++; }
    map.set(k, o);
  };
  for (const t of live.cercanias?.trains || []) {
    const red = rs.find((r) => t.lat >= r.bbox[0] && t.lat <= r.bbox[2] && t.lon >= r.bbox[1] && t.lon <= r.bbox[3]);
    const linea = lineOf(t);
    if (red && linea) add(red.slug, linea, t.delayMin, 3);
  }
  for (const t of live.largaDistancia?.trains || []) add("larga-distancia", t.grupo === "av" ? "AV" : t.grupo === "md" ? "MD" : "LD", t.delayMin, 5);
  // Un "ts" por franja de 15 minutos: si el cron pasa dos veces en la misma franja no se duplica
  const slot = new Date(Math.floor(now.getTime() / 900_000) * 900_000).toISOString();
  return [...map.values()].map(({ suma, ...o }) => ({ ts: slot, ...o, retraso_medio: o.con_dato ? Math.round((suma / o.con_dato) * 100) / 100 : null }));
}

// Guarda una foto cada 15 minutos, salvo de madrugada (00:30–05:00), cuando casi no hay trenes
export async function guardarSiToca(live, now = new Date()) {
  if (!sbEnabled()) return "sin Supabase";
  const m = madridMin(now);
  if (m >= 30 && m < 300) return "madrugada";
  if (now.getUTCMinutes() % 15 >= 5) return "no toca";
  const filas = await resumen(live, now);
  if (!filas.length) return "sin trenes";
  await sbInsert("retrasos_linea", filas, "ts,red,linea");
  return `${filas.length} líneas`;
}
