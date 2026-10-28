// Estado de los sucesos: el guardado en Redis o, si aún no hay, el archivo del repositorio.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getJSON } from "./store.js";

export const KEY_STATE = "sucesos:estado";
export const KEY_SEEN = "sucesos:vistos";
export const KEY_LAST_CALL = "sucesos:ultima-llamada";

export async function loadStatic() {
  return JSON.parse(await readFile(join(process.cwd(), "site", "data", "sucesos.json"), "utf8"));
}

export async function loadState() {
  try {
    const s = await getJSON(KEY_STATE);
    if (s) return s;
  } catch (e) { /* sin Redis: se usa el archivo */ }
  return loadStatic();
}
