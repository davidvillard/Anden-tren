// Supabase (Postgres) por su API REST, sin dependencias. Solo se usa en el servidor, con la clave
// service_role, que nunca llega al navegador. Vercel crea estas variables al conectar Supabase:
//   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
// Si no están, todo lo que depende de Supabase (histórico, alertas) se queda apagado.

const URL_ = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

export const sbEnabled = () => Boolean(URL_ && KEY);

async function req(path, { method = "GET", body, prefer, csv = false } = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Accept: csv ? "text/csv" : "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  if (csv) return r.text();
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// select("tabla?columna=eq.valor&order=ts.desc")
export const sbSelect = (query, opts = {}) => req(query, opts);
// Inserta filas; con onConflict ignora las repetidas
export const sbInsert = (table, rows, onConflict) =>
  req(`${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`, { method: "POST", body: rows, prefer: onConflict ? "resolution=ignore-duplicates,return=minimal" : "return=minimal" });
export const sbUpsert = (table, rows, onConflict) =>
  req(`${table}?on_conflict=${onConflict}`, { method: "POST", body: rows, prefer: "resolution=merge-duplicates,return=minimal" });
export const sbDelete = (query) => req(query, { method: "DELETE", prefer: "return=minimal" });
export const sbRpc = (fn, args = {}) => req(`rpc/${fn}`, { method: "POST", body: args });
