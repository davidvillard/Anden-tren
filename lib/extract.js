// Extrae cifras de sucesos ferroviarios a partir de titulares, con Claude.
// Claude solo propone: las reglas de lib/merge.js deciden qué se publica.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const CIFRA = {
  type: "object",
  additionalProperties: false,
  required: ["valor", "minimo", "nota", "organismo", "noticia"],
  properties: {
    valor: { type: ["integer", "null"], description: "Número de personas. null si ninguna noticia da una cifra." },
    minimo: { type: "boolean", description: "true si la fuente dice 'al menos' o la cifra puede subir." },
    nota: { type: ["string", "null"], description: "Matiz breve, p. ej. 'graves, 15 de ellos muy graves'. Sin nombres de personas." },
    organismo: { type: ["string", "null"], description: "Organismo oficial que da la cifra según la noticia (112, gobierno autonómico, Delegación del Gobierno, ministerio, Guardia Civil, policía, CIAF, Renfe, Adif, Iryo, Ouigo, hospital). null si la noticia no atribuye la cifra a ningún organismo." },
    noticia: { type: ["integer", "null"], description: "Índice de la noticia de la que sale la cifra." },
  },
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sucesos"],
  properties: {
    sucesos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id_existente", "titulo", "resumen", "lugar", "provincia", "lat", "lon", "inicio", "tipo", "servicio", "activo", "fallecidos", "heridos", "circulacion", "causas", "noticias"],
        properties: {
          id_existente: { type: ["string", "null"], description: "id del suceso del estado actual si es el mismo suceso; null si es nuevo." },
          titulo: { type: "string", description: "Titular neutro y breve en español." },
          resumen: { type: "string", description: "Una o dos frases: qué pasó, dónde y qué trenes. Sin nombres de personas ni detalles morbosos." },
          lugar: { type: "string" },
          provincia: { type: "string" },
          lat: { type: ["number", "null"] },
          lon: { type: ["number", "null"] },
          inicio: { type: ["string", "null"], description: "Fecha y hora del suceso en ISO 8601 con zona horaria de Madrid, si se conoce." },
          tipo: { type: "string", description: "Descarrilamiento, colisión, colisión por alcance, paso a nivel, incendio, otro." },
          servicio: { type: "string", description: "Alta velocidad, Larga distancia, Media distancia, Cercanías, Mercancías u otro." },
          activo: { type: "boolean", description: "false si el suceso ya no genera novedades o la circulación está normalizada." },
          fallecidos: CIFRA,
          heridos: CIFRA,
          circulacion: { type: ["string", "null"], description: "Estado de la circulación y alternativas, si las noticias lo dicen." },
          causas: { type: ["string", "null"], description: "Lo que se sabe de las causas, atribuido a quien lo dice. null si no se sabe nada." },
          noticias: { type: "array", items: { type: "integer" }, description: "Índices de las noticias que hablan de este suceso." },
        },
      },
    },
  },
};

const SYSTEM = `Eres el editor de datos de Andén, una web pública de información ferroviaria en España.
Recibes el estado actual de los sucesos y una lista numerada de titulares recientes.
Devuelve la lista actualizada de sucesos ferroviarios en España que cumplan esto:
- Accidentes de trenes de pasajeros o mercancías con fallecidos o heridos, o con un corte grave de la circulación.
- No incluyas atropellos de una persona aislada por un tren ni posibles suicidios.
- No incluyas sucesos fuera de España.
Reglas de las cifras:
- Usa solo cifras que aparezcan literalmente en los titulares o resúmenes. Nunca estimes ni sumes por tu cuenta.
- Si varias noticias dan cifras distintas, quédate con la más reciente que esté atribuida a un organismo oficial.
- Indica en "organismo" quién da la cifra solo si la noticia lo dice. Si la noticia no lo atribuye, pon null.
- Si una cifra del estado actual no tiene novedades, repítela tal cual con su organismo.
Otras reglas:
- Si un titular habla de un suceso del estado actual, usa su id en "id_existente".
- Nunca incluyas nombres, edades ni datos de personas concretas.
- Tono neutro e informativo, sin adjetivos dramáticos.
- Si no hay ningún suceso que cumpla los criterios, devuelve una lista vacía.`;

const client = new Anthropic();

export async function extract({ state, items, now = new Date() }) {
  const current = (state.sucesos || []).filter((s) => s.activo).map((s) => ({
    id: s.id, titulo: s.titulo, lugar: s.lugar, inicio: s.inicio, tipo: s.tipo, servicio: s.servicio,
    fallecidos: s.cifras?.fallecidos ?? null, heridos: s.cifras?.heridos ?? null,
    circulacion: s.circulacion ?? null, causas: s.causas ?? null,
  }));
  const news = items.map((it, i) => ({ i, fecha: it.date, medio: it.source, titular: it.title, resumen: it.summary }));
  const input = `Fecha y hora actual (Madrid): ${now.toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}

Estado actual de los sucesos:
${JSON.stringify(current, null, 1)}

Titulares recientes:
${JSON.stringify(news, null, 1)}`;

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: input }],
  });

  if (response.stop_reason === "refusal") throw new Error(`Claude no ha respondido (refusal: ${response.stop_details?.category ?? "sin categoría"})`);
  if (response.stop_reason === "max_tokens") throw new Error("Respuesta de Claude cortada por longitud");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { data: JSON.parse(text), model: response.model, usage: response.usage };
}
