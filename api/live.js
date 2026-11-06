// Función de Vercel: GET /api/live devuelve los datos de Renfe ya resumidos.
// La caché de Vercel guarda la respuesta 15 s, así Renfe recibe como mucho
// una petición cada 15 s aunque haya muchos visitantes.
import { buildLive } from "../lib/renfe.js";

export default async function handler(req, res) {
  const data = await buildLive();
  res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=30");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify(data));
}
