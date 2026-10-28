// Prueba local: muestra un resumen de lo que devuelve Renfe ahora mismo.
// Uso: node scripts/live.js
import { buildLive } from "../lib/renfe.js";

const d = await buildLive();
console.log(`${d.cercanias.trains.length} trenes, ${d.cercanias.alerts.length} avisos, ${d.largaDistancia.trips.length} viajes de larga distancia`);
for (const [k, s] of Object.entries(d.sources)) console.log(`  ${k}: ${s.ok ? `OK (${s.entities})` : s.error}`);
