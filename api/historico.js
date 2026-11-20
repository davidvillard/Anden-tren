// GET /api/historico: retrasos por línea y día (hora de Madrid), a partir de fotos cada 15 minutos.
// Parámetros (todos opcionales):
//   dias=7|30|90|365  periodo hacia atrás desde hoy (por defecto 30)
//   red=madrid        una red (slug de /data/redes.json) o "larga-distancia"
//   linea=C3          una línea
//   formato=csv       CSV en vez de JSON
// Licencia: datos derivados de los datos abiertos de Renfe; cita "Andén (andentren.es)".
import { storeEnabled } from "../lib/store.js";
import { leerDias } from "../lib/historico.js";

const COLS = ["dia", "red", "linea", "muestras", "trenes_medio", "pct_tarde", "retraso_medio"];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!storeEnabled()) return res.status(503).json({ error: "El histórico no está disponible." });
  const q = req.query || {};
  const dias = Math.min(365, Math.max(1, Number(q.dias) || 30));
  const hoy = new Date(`${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" })}T12:00:00Z`);
  const fechas = [...Array(dias)].map((_, i) => new Date(hoy.getTime() - (dias - 1 - i) * 86400_000).toISOString().slice(0, 10));
  try {
    let filas = await leerDias(fechas);
    if (q.red && /^[a-z-]+$/.test(q.red)) filas = filas.filter((f) => f.red === q.red);
    if (q.linea && /^[A-Za-z0-9]{1,5}$/.test(q.linea)) filas = filas.filter((f) => f.linea === q.linea.toUpperCase());
    filas.sort((a, b) => a.dia.localeCompare(b.dia) || a.red.localeCompare(b.red) || a.linea.localeCompare(b.linea, "es", { numeric: true }));
    // La caché de Vercel guarda la respuesta una hora: muy pocas lecturas de Redis
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    if (q.formato === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="anden-retrasos-${fechas[0]}.csv"`);
      return res.status(200).send([COLS.join(","), ...filas.map((f) => COLS.map((c) => f[c] ?? "").join(","))].join("\n") + "\n");
    }
    res.status(200).json({
      fuente: "Andén (andentren.es), a partir de los datos abiertos de Renfe (GTFS-Realtime)",
      licencia: "CC BY 4.0: puedes reutilizarlos citando a Andén",
      definiciones: {
        pct_tarde: "% de trenes con dato que llevaban 3 min o más de retraso (5 min en alta velocidad, larga y media distancia), sumando las fotos de cada 15 min del día",
        retraso_medio: "minutos de retraso medio de los trenes con dato (los adelantos cuentan como 0)",
        muestras: "fotos de 15 minutos guardadas ese día (de 05:00 a 00:30)",
      },
      desde: fechas[0], dias, filas,
    });
  } catch (e) {
    res.status(502).json({ error: `No se pudo leer el histórico: ${e.message}` });
  }
}
