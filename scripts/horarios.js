// Horarios oficiales de Renfe de alta velocidad, larga y media distancia (GTFS de datos abiertos).
// Se descargan en cada publicación y se convierten en un archivo compacto para la web:
//
//   site/data/horarios-ld.json
//   {
//     generado, desde: "2026-11-20", dias: 60,
//     paradas: ["Madrid-Chamartín-Clara Campoamor", ...],
//     trenes: { "190": { tipo: "Intercity", v: [ { p: [[parada, "08:30", "08:30"], ...], d: "1101..." } ] } }
//   }
//
// "d" dice qué días circula esa variante: un carácter por día desde "desde" (1 = circula).
// También se puede ejecutar a mano con una carpeta ya descomprimida:
//   node scripts/horarios.js <carpeta del GTFS>
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";

export const GTFS_LD_URL = "https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip";
const DIAS = 60;

// CSV sencillo de Renfe (sin comillas dentro de los campos; las filas vienen rellenas de espacios)
function* filas(texto) {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/);
  const head = lineas[0].split(",").map((c) => c.trim());
  for (let i = 1; i < lineas.length; i++) {
    if (!lineas[i].trim()) continue;
    const c = lineas[i].split(",");
    const o = {};
    for (let j = 0; j < head.length; j++) o[head[j]] = (c[j] || "").trim();
    yield o;
  }
}

const hhmm = (t) => { const [h, m] = t.split(":"); return `${String(Number(h) % 24).padStart(2, "0")}:${m}`; };
const isoDia = (d) => d.toISOString().slice(0, 10);
const gtfsFecha = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

export function generar(files, hoy = new Date()) {
  const desde = new Date(`${hoy.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" })}T00:00:00Z`);
  const dias = [...Array(DIAS)].map((_, i) => isoDia(new Date(desde.getTime() + i * 86400_000)));
  const idxDia = new Map(dias.map((d, i) => [d, i]));

  // Días de cada servicio: calendario semanal + excepciones
  const servicio = new Map();
  for (const c of filas(files["calendar.txt"])) {
    const bits = dias.map((d) => {
      if (d < gtfsFecha(c.start_date) || d > gtfsFecha(c.end_date)) return 0;
      const wd = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(`${d}T12:00:00Z`).getUTCDay()];
      return c[wd] === "1" ? 1 : 0;
    });
    servicio.set(c.service_id, bits);
  }
  for (const c of filas(files["calendar_dates.txt"] || "")) {
    const i = idxDia.get(gtfsFecha(c.date));
    if (i === undefined) continue;
    const bits = servicio.get(c.service_id) || dias.map(() => 0);
    bits[i] = c.exception_type === "1" ? 1 : 0;
    servicio.set(c.service_id, bits);
  }

  const tipoRuta = new Map([...filas(files["routes.txt"])].map((r) => [r.route_id, r.route_short_name || r.route_long_name]));
  const nombreParada = new Map([...filas(files["stops.txt"])].map((s) => [s.stop_id, s.stop_name]));
  const paradas = [], idxParada = new Map();
  const parada = (id) => {
    const n = nombreParada.get(id) || id;
    if (!idxParada.has(n)) { idxParada.set(n, paradas.length); paradas.push(n); }
    return idxParada.get(n);
  };

  const viajes = new Map(); // trip_id → { num, tipo, service }
  for (const t of filas(files["trips.txt"])) {
    viajes.set(t.trip_id, { num: String(Number(t.trip_short_name || t.trip_id.slice(0, 5))), tipo: tipoRuta.get(t.route_id) || "Tren", service: t.service_id, p: [] });
  }
  for (const s of filas(files["stop_times.txt"])) {
    const v = viajes.get(s.trip_id);
    if (v) v.p.push([Number(s.stop_sequence), parada(s.stop_id), hhmm(s.arrival_time), hhmm(s.departure_time)]);
  }

  // Un tren (número) puede tener varias variantes de recorrido u horario según el día
  const trenes = {};
  for (const v of viajes.values()) {
    const bits = servicio.get(v.service);
    if (!bits || !bits.some(Boolean) || v.p.length < 2) continue; // no circula en los próximos 60 días
    const p = v.p.sort((a, b) => a[0] - b[0]).map(([, st, a, d]) => [st, a, d]);
    const clave = JSON.stringify(p);
    const tren = (trenes[v.num] ||= { tipo: v.tipo, v: [] });
    let variante = tren.v.find((x) => x.k === clave);
    if (!variante) { variante = { k: clave, p, bits: dias.map(() => 0) }; tren.v.push(variante); }
    bits.forEach((b, i) => { if (b) variante.bits[i] = 1; });
  }
  // Renfe a veces parte un viaje en tramos (Madrid–Calatayud y Zaragoza–Barcelona): se quitan los
  // tramos ya incluidos en el recorrido completo de los mismos días
  for (const t of Object.values(trenes)) {
    t.v = t.v.filter((a) => !t.v.some((b) => b !== a && b.p.length > a.p.length
      && a.p.every((x) => b.p.some((y) => y[0] === x[0] && (y[2] === x[2] || y[1] === x[1])))
      && a.bits.every((bit, i) => !bit || b.bits[i])));
    t.v = t.v.map(({ p, bits }) => ({ p, d: bits.join("") }));
  }

  return { generado: new Date().toISOString(), desde: dias[0], dias: DIAS, fuente: GTFS_LD_URL, paradas, trenes };
}

// Descarga el ZIP oficial y genera el archivo; devuelve null si Renfe no responde
export async function descargarYGenerar() {
  const r = await fetch(GTFS_LD_URL, { headers: { "user-agent": "Anden/1.0 (datos abiertos)" } });
  if (!r.ok) throw new Error(`Renfe respondió ${r.status}`);
  const zip = unzipSync(new Uint8Array(await r.arrayBuffer()));
  const files = Object.fromEntries(Object.entries(zip).map(([k, v]) => [k.split("/").pop(), strFromU8(v)]));
  return generar(files);
}

// Uso manual: node scripts/horarios.js <carpeta>
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  const names = ["calendar.txt", "calendar_dates.txt", "routes.txt", "stops.txt", "trips.txt", "stop_times.txt"];
  const files = dir
    ? Object.fromEntries(await Promise.all(names.map(async (n) => [n, await readFile(join(dir, n), "utf8").catch(() => "")])))
    : null;
  const out = files ? generar(files) : await descargarYGenerar();
  await writeFile(new URL("../site/data/horarios-ld.json", import.meta.url), JSON.stringify(out));
  console.log(`${Object.keys(out.trenes).length} trenes, ${out.paradas.length} paradas`);
}
