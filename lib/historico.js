// Histórico de retrasos en Redis (Upstash): cada 15 minutos se resume el estado de cada línea y se
// suma al resumen de ese día, una sola clave por día (hist:AAAA-MM-DD, unos 5 KB). Así ocupa y
// transfiere muy poco (menos de 30 MB al mes, frente a los 10 GB gratuitos).
//
// Mismas reglas que la web: red por la posición del tren (zona de cada red en redes.json), línea por
// la etiqueta del tren, "con retraso" desde 3 min (5 en alta velocidad, larga y media distancia).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getJSON, setJSON, getMany, storeEnabled } from "./store.js";

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

const madrid = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
};
export const histKey = (fecha) => `hist:${fecha}`;

// Foto del momento: por línea, trenes, con dato, con retraso y suma de minutos de retraso
export async function resumen(live) {
  const rs = await loadRedes();
  const map = new Map();
  const add = (red, linea, delay, umbral) => {
    const k = `${red}|${linea}`;
    const o = map.get(k) || { trenes: 0, con_dato: 0, tarde: 0, suma: 0 };
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
  return map;
}

// Suma la foto al resumen del día, una vez por franja de 15 minutos y nunca de madrugada
// (00:30–05:00, cuando casi no hay trenes y los datos de Renfe son poco fiables)
export async function guardarSiToca(live, now = new Date()) {
  if (!storeEnabled()) return "sin Redis";
  const m = madrid(now);
  if (m.min >= 30 && m.min < 300) return "madrugada";
  const franja = Math.floor(m.min / 15);
  const key = histKey(m.fecha);
  const dia = (await getJSON(key)) || { franjas: [], lineas: {} };
  if (dia.franjas.includes(franja)) return "ya guardada";
  const foto = await resumen(live);
  if (!foto.size) return "sin trenes";
  for (const [k, o] of foto) {
    // [fotos, suma de trenes, suma con dato, suma con retraso, suma de minutos de retraso]
    const a = dia.lineas[k] || [0, 0, 0, 0, 0];
    dia.lineas[k] = [a[0] + 1, a[1] + o.trenes, a[2] + o.con_dato, a[3] + o.tarde, Math.round((a[4] + o.suma) * 10) / 10];
  }
  dia.franjas.push(franja);
  await setJSON(key, dia);
  return `${foto.size} líneas`;
}

// Filas por día y línea, como las da /api/historico
export async function leerDias(fechas) {
  const dias = await getMany(fechas.map(histKey));
  const filas = [];
  fechas.forEach((dia, i) => {
    for (const [k, [n, trenes, conDato, tarde, suma]] of Object.entries(dias[i]?.lineas || {})) {
      const [red, linea] = k.split("|");
      filas.push({
        dia, red, linea, muestras: n,
        trenes_medio: Math.round((trenes / n) * 10) / 10,
        pct_tarde: conDato ? Math.round((tarde / conDato) * 1000) / 10 : null,
        retraso_medio: conDato ? Math.round((suma / conDato) * 100) / 100 : null,
      });
    }
  });
  return filas;
}
