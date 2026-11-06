// Genera site/data/lineas.json (líneas de cada red con su recorrido y estaciones)
// y añade a site/data/redes.json la lista de líneas de cada red.
// Se ejecuta a mano cuando Renfe cambia sus líneas (unas pocas veces al año):
//
//   1. Descarga https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip
//   2. Descomprímelo en una carpeta (tar -xf fomento_transit.zip -C gtfs)
//   3. node scripts/lineas.js gtfs
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

const dir = process.argv[2];
if (!dir) { console.error("Uso: node scripts/lineas.js <carpeta del GTFS de Cercanías>"); process.exit(1); }
const DATA = new URL("../site/data/", import.meta.url);

// Mismo criterio que la web en directo: C4a y C4b son la línea C4; R2N y R2S, la R2.
export const lineCode = (raw) => raw.toUpperCase().replace(/([A-Z]+\d+)[A-Z]$/, "$1");

async function* rows(file) {
  let head = null;
  for await (const line of createInterface({ input: createReadStream(join(dir, file)), crlfDelay: Infinity })) {
    const cells = line.split(",").map((c) => c.trim());
    if (!head) { head = cells.map((c) => c.replace(/^﻿/, "")); continue; }
    if (cells.length < head.length) continue;
    yield Object.fromEntries(head.map((k, i) => [k, cells[i]]));
  }
}

const redesFile = new URL("redes.json", DATA);
const redesDoc = JSON.parse(await readFile(redesFile, "utf8"));
const redPorCodigo = new Map(redesDoc.redes.flatMap((r) => r.codigos.map((c) => [c, r])));

// Rutas: red, variante (C4a) y color
const routes = new Map();
for await (const r of rows("routes.txt")) {
  const red = redPorCodigo.get(r.route_id.slice(0, 2));
  if (!red || !/\d/.test(r.route_short_name)) continue; // fuera de las 12 redes o autobús
  routes.set(r.route_id, { red: red.slug, variante: r.route_short_name, color: r.route_color });
}

const tripRoute = new Map();
for await (const t of rows("trips.txt")) if (routes.has(t.route_id)) tripRoute.set(t.trip_id, t.route_id);

// Para cada variante se toma el viaje con más paradas como su recorrido completo
const stopsPerTrip = new Map();
for await (const s of rows("stop_times.txt")) {
  if (!tripRoute.has(s.trip_id)) continue;
  const list = stopsPerTrip.get(s.trip_id) || [];
  list.push([Number(s.stop_sequence), s.stop_id]);
  stopsPerTrip.set(s.trip_id, list);
}
const stopName = new Map();
for await (const s of rows("stops.txt")) stopName.set(s.stop_id, s.stop_name);

const best = new Map(); // "red|variante" → paradas
for (const [trip, list] of stopsPerTrip) {
  const r = routes.get(tripRoute.get(trip));
  const key = `${r.red}|${r.variante}`;
  if ((best.get(key)?.length || 0) >= list.length) continue;
  best.set(key, list.sort((a, b) => a[0] - b[0]).map(([, id]) => stopName.get(id) || id));
}

const lineas = new Map();
for (const r of routes.values()) {
  const key = `${r.red}|${lineCode(r.variante)}`;
  const paradas = best.get(`${r.red}|${r.variante}`);
  if (!paradas) continue;
  const o = lineas.get(key) || { red: r.red, code: lineCode(r.variante), slug: lineCode(r.variante).toLowerCase(), color: `#${r.color || "75B6E0"}`, recorridos: [] };
  if (!o.recorridos.some((x) => x.variante === r.variante)) o.recorridos.push({ variante: r.variante, desde: paradas[0], hasta: paradas.at(-1), paradas });
  lineas.set(key, o);
}

const orden = (a, b) => a.localeCompare(b, "es", { numeric: true });
const lista = [...lineas.values()].sort((a, b) => orden(a.red, b.red) || orden(a.code, b.code));
for (const l of lista) l.recorridos.sort((a, b) => orden(a.variante, b.variante));

await writeFile(new URL("lineas.json", DATA), JSON.stringify({
  nota: "Generado con scripts/lineas.js a partir del GTFS de Cercanías de Renfe (datos abiertos).",
  lineas: lista,
}, null, 1) + "\n");

for (const red of redesDoc.redes) red.lineas = lista.filter((l) => l.red === red.slug).map((l) => l.code);
await writeFile(redesFile, JSON.stringify(redesDoc, null, 1) + "\n");

console.log(`${lista.length} líneas en ${new Set(lista.map((l) => l.red)).size} redes`);
