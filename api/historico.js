// GET /api/historico: retrasos por línea y día (hora de Madrid), guardados cada 15 minutos.
// Parámetros (todos opcionales):
//   dias=7|30|90|365  periodo hacia atrás desde hoy (por defecto 30)
//   red=madrid        una red (slug de /data/redes.json) o "larga-distancia"
//   linea=C3          una línea
//   formato=csv       CSV en vez de JSON
// Licencia: datos derivados de los datos abiertos de Renfe; cita "Andén (andentren.es)".
import { sbEnabled, sbSelect } from "../lib/supabase.js";

const COLS = "dia,red,linea,muestras,trenes_medio,pct_tarde,retraso_medio";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!sbEnabled()) return res.status(503).json({ error: "El histórico aún no está activado." });
  const q = req.query || {};
  const dias = Math.min(365, Math.max(1, Number(q.dias) || 30));
  const desde = new Date(Date.now() - dias * 86400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const filtro = [`dia=gte.${desde}`];
  if (q.red && /^[a-z-]+$/.test(q.red)) filtro.push(`red=eq.${q.red}`);
  if (q.linea && /^[A-Za-z0-9]{1,5}$/.test(q.linea)) filtro.push(`linea=eq.${q.linea.toUpperCase()}`);
  try {
    // Supabase devuelve como mucho 1000 filas por consulta: se pide por páginas
    const filas = [];
    for (let off = 0; off < 50000; off += 1000) {
      const page = await sbSelect(`retrasos_diarios?select=${COLS}&${filtro.join("&")}&order=dia.asc,red.asc,linea.asc&limit=1000&offset=${off}`);
      filas.push(...(page || []));
      if (!page || page.length < 1000) break;
    }
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    if (q.formato === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="anden-retrasos-${desde}.csv"`);
      const esc = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
      return res.status(200).send([COLS, ...filas.map((f) => COLS.split(",").map((c) => esc(f[c])).join(","))].join("\n") + "\n");
    }
    res.status(200).json({
      fuente: "Andén (andentren.es), a partir de los datos abiertos de Renfe (GTFS-Realtime)",
      licencia: "CC BY 4.0: puedes reutilizarlos citando a Andén",
      definiciones: {
        pct_tarde: "% de trenes con dato que llevaban 3 min o más de retraso (5 min en larga distancia), sumando las fotos de cada 15 min del día",
        retraso_medio: "minutos de retraso medio de los trenes con dato (los adelantos cuentan como 0)",
        muestras: "fotos de 15 minutos guardadas ese día (de 05:00 a 00:30)",
      },
      desde, dias, filas,
    });
  } catch (e) {
    res.status(502).json({ error: `No se pudo leer el histórico: ${e.message}` });
  }
}
