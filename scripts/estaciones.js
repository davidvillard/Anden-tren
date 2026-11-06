// Genera lib/estaciones.json (código de estación → nombre) a partir del listado
// de estaciones de Renfe (datos abiertos). Lo usa /api/live para nombrar el origen,
// el destino y la próxima parada de los trenes de media y larga distancia.
// Se ejecuta a mano cuando Renfe cambie sus estaciones:
//
//   curl -L -o estaciones.csv https://ssl.renfe.com/ftransit/Fichero_estaciones/estaciones.csv
//   node scripts/estaciones.js estaciones.csv
import { readFile, writeFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) { console.error("Uso: node scripts/estaciones.js <estaciones.csv>"); process.exit(1); }

// El CSV viene en mayúsculas: "SANTIAGO DE COMPOSTELA-DANIEL CASTELAO" → "Santiago de Compostela-Daniel Castelao"
const MENORES = new Set(["de", "del", "la", "las", "los", "el", "y", "i", "en", "a"]);
const nombre = (s) => s.toLowerCase().replace(/[\p{L}·'’]+/gu, (w, i) => (i > 0 && MENORES.has(w) ? w : w[0].toUpperCase() + w.slice(1)))
  .replace(/\b([dl])['’](\p{L})/gu, (m, a, b) => `${a}'${b.toUpperCase()}`);

const lines = new TextDecoder("latin1").decode(await readFile(file)).split(/\r?\n/).slice(1);
const out = {};
for (const l of lines) {
  const [code, desc] = l.split(";").map((c) => c.replace(/"/g, "").trim());
  if (/^\d+$/.test(code) && desc) out[code] = nombre(desc);
}
await writeFile(new URL("../lib/estaciones.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(`${Object.keys(out).length} estaciones`);
