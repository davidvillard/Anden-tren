// GET /api/sucesos: sucesos en curso y recientes, con sus cifras y fuentes.
import { loadState } from "../lib/sucesos-state.js";

export default async function handler(req, res) {
  const state = await loadState();
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify(state));
}
