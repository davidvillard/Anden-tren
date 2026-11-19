// GET /api/sucesos: sucesos en curso y recientes, con sus cifras y fuentes.
import { loadState } from "../lib/sucesos-state.js";

// La caché de Vercel guarda la respuesta 2 minutos: así cada visitante no provoca una
// lectura de Redis (la transferencia gratuita de Upstash es de 10 GB al mes).
export default async function handler(req, res) {
  const state = await loadState();
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify(state));
}
