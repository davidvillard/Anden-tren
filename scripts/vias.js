// Genera site/data/vias.json: la red de vías de tren de España, simplificada, para que
// el mapa mueva los trenes siguiendo la vía. Sale de OpenStreetMap (© colaboradores de
// OpenStreetMap, licencia ODbL), porque Renfe no publica el trazado de la larga distancia.
// Se ejecuta a mano de vez en cuando (la red cambia poco):
//
//   1. Descarga las vías con la consulta de scripts/vias.overpass:
//      curl -X POST --data-urlencode data@scripts/vias.overpass https://overpass-api.de/api/interpreter -o vias-osm.json
//   2. node scripts/vias.js vias-osm.json
//
// Formato de salida: "tramos" es una lista de vías entre cruces; cada una es
// [lat0, lon0, dlat1, dlon1, …] en enteros de 1e-5 grados (unos 1,1 m), con cada punto
// como diferencia del anterior. Dos tramos que se tocan comparten el punto exacto.
import { readFile, writeFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) { console.error("Uso: node scripts/vias.js <vias-osm.json>"); process.exit(1); }
const TOLERANCIA_M = 10; // un tren nunca se aparta de la vía más que esto

const { elements } = JSON.parse(await readFile(file, "utf8"));
const ways = elements.filter((e) => e.type === "way" && e.nodes?.length > 1 && e.geometry?.length === e.nodes.length);

// Nodos que comparten varias vías (cruces y desvíos): ahí se parte cada vía
const uso = new Map();
for (const w of ways) for (const [i, n] of w.nodes.entries()) uso.set(n, (uso.get(n) || 0) + (i === 0 || i === w.nodes.length - 1 ? 2 : 1));

// Douglas-Peucker en metros (proyección local)
const M = 111320;
function simplifica(pts) {
  if (pts.length < 3) return pts;
  const cos = Math.cos((pts[0][0] * Math.PI) / 180);
  const xy = pts.map(([la, lo]) => [lo * M * cos, la * M]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = xy[a], [bx, by] = xy[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > max) { max = d; idx = i; }
    }
    if (max > TOLERANCIA_M) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const q = (v) => Math.round(v * 1e5);
const tramos = [];
let puntos = 0;
for (const w of ways) {
  let chain = [];
  for (const [i, n] of w.nodes.entries()) {
    chain.push([w.geometry[i].lat, w.geometry[i].lon]);
    if (chain.length > 1 && (i === w.nodes.length - 1 || uso.get(n) > 1)) {
      const s = simplifica(chain).map(([la, lo]) => [q(la), q(lo)]);
      const flat = [s[0][0], s[0][1]];
      for (let k = 1; k < s.length; k++) flat.push(s[k][0] - s[k - 1][0], s[k][1] - s[k - 1][1]);
      tramos.push(flat); puntos += s.length;
      chain = [chain.at(-1)];
    }
  }
}

await writeFile(new URL("../site/data/vias.json", import.meta.url), JSON.stringify({
  nota: "Vías de tren de España simplificadas para el mapa. © colaboradores de OpenStreetMap, licencia ODbL (openstreetmap.org/copyright). Generado con scripts/vias.js.",
  tramos,
}));
console.log(`${ways.length} vías de OSM → ${tramos.length} tramos, ${puntos} puntos`);
