// Función de Vercel: GET /api/live devuelve los datos de Renfe ya resumidos.
// La caché de Vercel guarda la respuesta 30 s, así Renfe recibe como mucho
// una petición cada 30 s aunque haya muchos visitantes.
import { buildLive } from "../lib/renfe.js";

export default async function handler(req, res) {
  const data = await buildLive();
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify(data));
}
