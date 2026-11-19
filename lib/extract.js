// Extrae cifras de sucesos ferroviarios a partir de titulares, con Gemini
// (plan gratuito de Google AI Studio). Gemini solo propone: las reglas de
// lib/merge.js deciden qué se publica.
//
// Coste: 0 €. Sin cuenta de facturación vinculada al proyecto de Google, la API
// nunca cobra; si se pasa del límite gratuito responde 429 y se reintenta luego.
import { GoogleGenAI } from "@google/genai";

// Modelos con plan gratuito, en orden de preferencia. Si uno agota su cupo
// (429) o no existe (404), se prueba el siguiente.
const MODELS = (process.env.GEMINI_MODELS || "gemini-3.8-flash,gemini-3.5-flash-lite,gemini-2.5-flash")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Sin nulos en el esquema (máxima compatibilidad): -1 y "" significan "no se sabe".
const CIFRA = {
  type: "object",
  properties: {
    valor: { type: "integer", description: "Número de personas. -1 si ninguna noticia da una cifra." },
    minimo: { type: "boolean", description: "true si la fuente dice 'al menos' o la cifra puede subir." },
    nota: { type: "string", description: "Matiz breve, p. ej. 'graves, 15 de ellos muy graves'. Vacío si no hay. Sin nombres de personas." },
    organismo: { type: "string", description: "Nombre del organismo oficial al que la noticia atribuye la cifra, escrito como organismo y nunca como apellido de una persona (p. ej. 'Gobierno de Castilla-La Mancha', '112 de Andalucía', 'Delegación del Gobierno', 'Ministerio de Transportes', 'Guardia Civil', 'CIAF', 'Renfe', 'Adif', 'Iryo', 'Ouigo', 'Hospital ...'). Vacío si la noticia no la atribuye a nadie." },
    noticia: { type: "integer", description: "Índice de la noticia de la que sale la cifra. -1 si no hay cifra." },
  },
  required: ["valor", "minimo", "nota", "organismo", "noticia"],
};

const SCHEMA = {
  type: "object",
  properties: {
    sucesos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id_existente: { type: "string", description: "id del suceso del estado actual si es el mismo suceso; vacío si es nuevo." },
          clase: { type: "string", enum: ["accidente", "incidencia"], description: "accidente: choque, descarrilamiento, arrollamiento de vehículo o incendio con víctimas o daños graves. incidencia: avería, enganchón de catenaria, tren detenido o atrapado, corte de vía, problema de infraestructura o evacuación sin víctimas graves." },
          operador: { type: "string", description: "Empresa del tren afectado: Renfe, Iryo, Ouigo, Euskotren, FGC, mercancías, etc. Vacío si no se sabe o afecta a varias." },
          linea: { type: "string", description: "Línea o trayecto afectado, p. ej. 'Alta velocidad Madrid–Levante' o 'Cercanías Madrid C3'. Vacío si no se sabe." },
          titulo: { type: "string", description: "Titular neutro y breve en español." },
          resumen: { type: "string", description: "Una o dos frases: qué pasó, dónde y qué trenes. Sin nombres de personas ni detalles morbosos." },
          lugar: { type: "string" },
          provincia: { type: "string" },
          lat: { type: "number", description: "Latitud aproximada del lugar. 0 si no se sabe." },
          lon: { type: "number", description: "Longitud aproximada del lugar. 0 si no se sabe." },
          inicio: { type: "string", description: "Fecha y hora del suceso en ISO 8601 con zona horaria de Madrid. Vacío si no se sabe." },
          tipo: { type: "string", description: "Accidentes: descarrilamiento, colisión, colisión por alcance, paso a nivel, incendio u otro. Incidencias: avería del tren, avería de catenaria, avería de señalización, tren detenido, corte de vía, incendio junto a la vía u otro." },
          servicio: { type: "string", description: "Alta velocidad, Larga distancia, Media distancia, Cercanías, Mercancías u otro." },
          activo: { type: "boolean", description: "false si la circulación ya está normalizada o el suceso ya no genera novedades." },
          fallecidos: CIFRA,
          heridos: CIFRA,
          circulacion: { type: "string", description: "Estado de la circulación y alternativas, si las noticias lo dicen. Vacío si no." },
          causas: { type: "string", description: "Lo que se sabe de las causas, atribuido a quien lo dice. Vacío si no se sabe." },
          noticias: { type: "array", items: { type: "integer" }, description: "Índices de las noticias que hablan de este suceso." },
        },
        required: ["id_existente", "clase", "operador", "linea", "titulo", "resumen", "lugar", "provincia", "lat", "lon", "inicio", "tipo", "servicio", "activo", "fallecidos", "heridos", "circulacion", "causas", "noticias"],
      },
    },
  },
  required: ["sucesos"],
};

const SYSTEM = `Eres el editor de datos de Andén, una web pública de información ferroviaria en España.
Recibes el estado actual de los sucesos y una lista numerada de titulares recientes.
Devuelve la lista actualizada de sucesos ferroviarios en España, de dos clases:
- "accidente": choques, descarrilamientos, arrollamientos de vehículos o incendios de trenes de pasajeros o mercancías con fallecidos, heridos o daños graves.
- "incidencia": cualquier hecho de hoy que deje trenes parados o afecte a la circulación: averías de trenes, enganchones o caídas de catenaria, fallos de señalización, trenes detenidos o atrapados, evacuaciones, cortes de vía, incendios junto a la vía. Da igual la empresa (Renfe, Iryo, Ouigo, Euskotren, FGC…).
No incluyas:
- Atropellos de una persona por un tren ni posibles suicidios, tampoco como incidencia.
- Huelgas, obras programadas, cambios de horario, precios o noticias políticas.
- Metro, tranvía, metro ligero o funicular: solo trenes (Renfe, Iryo, Ouigo, Euskotren, FGC, mercancías…).
- En "noticias" pon solo los titulares que hablan de ESTE suceso (mismo lugar o misma línea), nunca otros.
- Sucesos fuera de España.
- Las consecuencias de un accidente ya listado (retrasos o cortes por ese accidente) como suceso aparte: van en su "circulacion".
Reglas de las cifras:
- Usa solo cifras que aparezcan literalmente en los titulares o resúmenes. Nunca estimes ni sumes por tu cuenta.
- Si varias noticias dan cifras distintas, quédate con la más reciente que esté atribuida a un organismo oficial.
- Indica en "organismo" quién da la cifra solo si la noticia lo dice. Si no lo atribuye, déjalo vacío.
- Si una cifra del estado actual no tiene novedades, repítela tal cual con su organismo.
Otras reglas:
- Si un titular habla de un suceso del estado actual, usa su id en "id_existente".
- Para una incidencia, "activo" es false en cuanto las noticias digan que la circulación se ha restablecido.
- Nunca incluyas nombres, edades ni datos de personas concretas.
- Tono neutro e informativo, sin adjetivos dramáticos.
- Si no hay ningún suceso que cumpla los criterios, devuelve una lista vacía.`;

// Pasa los valores "no se sabe" (-1, "", 0) al formato que espera lib/merge.js (null).
const orNull = (v, empty) => (v === empty || v === undefined ? null : v);
function normalize(data) {
  const cifra = (c = {}) => ({
    valor: c.valor >= 0 ? c.valor : null,
    minimo: Boolean(c.minimo),
    nota: orNull(c.nota, ""),
    organismo: orNull(c.organismo, ""),
    noticia: c.noticia >= 0 ? c.noticia : null,
  });
  return {
    sucesos: (data.sucesos || []).map((s) => ({
      ...s,
      id_existente: orNull(s.id_existente, ""),
      clase: s.clase === "incidencia" ? "incidencia" : "accidente",
      operador: orNull(s.operador, ""),
      linea: orNull(s.linea, ""),
      inicio: orNull(s.inicio, ""),
      lat: s.lat ? s.lat : null,
      lon: s.lon ? s.lon : null,
      circulacion: orNull(s.circulacion, ""),
      causas: orNull(s.causas, ""),
      fallecidos: cifra(s.fallecidos),
      heridos: cifra(s.heridos),
      noticias: Array.isArray(s.noticias) ? s.noticias : [],
    })),
  };
}

export class QuotaError extends Error {}

export async function extract({ state, items, now = new Date() }) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  // En curso y, además, los de las últimas 48 h, para que no se repitan como nuevos
  const recent = (s) => s.activo || now - new Date(s.ultimaNovedad || s.inicio) < 48 * 3600_000;
  const current = (state.sucesos || []).filter(recent).map((s) => ({ activo: s.activo,
    id: s.id, clase: s.clase || "accidente", titulo: s.titulo, lugar: s.lugar, inicio: s.inicio, tipo: s.tipo, servicio: s.servicio,
    fallecidos: s.cifras?.fallecidos ?? null, heridos: s.cifras?.heridos ?? null,
    circulacion: s.circulacion ?? null, causas: s.causas ?? null,
  }));
  const news = items.map((it, i) => ({ i, fecha: it.date, medio: it.source, titular: it.title, resumen: it.summary }));
  const input = `Fecha y hora actual (Madrid): ${now.toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}

Estado actual de los sucesos:
${JSON.stringify(current, null, 1)}

Titulares recientes:
${JSON.stringify(news, null, 1)}`;

  let lastErr;
  for (const model of MODELS) {
    try {
      const it = await ai.interactions.create({
        model,
        system_instruction: SYSTEM,
        input,
        store: false,
        response_format: { type: "text", mime_type: "application/json", schema: SCHEMA },
      });
      if (!it.output_text) throw new Error("Respuesta vacía");
      return { data: normalize(JSON.parse(it.output_text)), model };
    } catch (e) {
      lastErr = e;
      const status = e?.status ?? e?.code;
      // 429: cupo gratuito agotado · 404: el modelo no existe para esta clave → siguiente modelo
      if (status === 429 || status === 404 || /quota|RESOURCE_EXHAUSTED|not found/i.test(String(e?.message))) continue;
      throw e;
    }
  }
  throw new QuotaError(`Ningún modelo gratuito disponible ahora mismo: ${lastErr?.message ?? lastErr}`);
}
