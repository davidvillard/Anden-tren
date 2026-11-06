// Páginas temáticas que recogen avisos de Renfe por palabras clave.
// Las comparten el build (página con los avisos del momento), la web en directo
// y el cron (vuelve a publicar la web y avisa en redes cuando cambian).

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const TEMAS = [
  {
    slug: "huelga-renfe",
    patron: "huelga|servicios minimos|paros? (parcial|convocad)",
    urgente: true, // aviso nuevo: se publica en redes y se republica la web
    titulo: "Huelga de Renfe hoy: servicios mínimos y trenes cancelados",
    h1: "Huelga de Renfe hoy",
    descripcion: "Huelga de Renfe en directo: avisos oficiales de servicios mínimos, trenes cancelados de Cercanías, alta velocidad y larga distancia, actualizados cada 15 segundos.",
    intro: "Avisos de Renfe sobre huelgas y servicios mínimos, tal como los publica la compañía, y los trenes de alta velocidad y larga distancia cancelados ahora mismo.",
    vacio: "Ahora mismo Renfe no tiene publicado ningún aviso de huelga ni de servicios mínimos.",
    og: { badge: "HUELGA", color: "#B4372D", titulo: "Huelga de Renfe hoy", subtitulo: "Servicios mínimos y trenes cancelados, en directo" },
    preguntas: [
      { p: "¿Hay huelga de Renfe hoy?", r: "Esta página muestra en directo los avisos de huelga y servicios mínimos que publica Renfe. Si no aparece ninguno, Renfe no ha comunicado ninguna huelga para hoy." },
      { p: "¿Qué trenes funcionan durante una huelga?", r: "Los que fijan los servicios mínimos. Renfe los publica en sus avisos; aquí los ves junto con los trenes de alta velocidad y larga distancia cancelados en este momento." },
      { p: "¿Cómo sé si mi tren está cancelado?", r: "Busca tu tren o tu línea en Andén: verás si circula y con cuánto retraso. Para cambios de billete, consulta con Renfe." },
    ],
  },
  {
    slug: "obras-cercanias",
    patron: "obras?\\b|trabajos|mantenimiento|corte de via|interrump|servicio alternativo|plan alternativo|transbordo por carretera|autobus",
    urgente: false, // cambian a menudo: la página se actualiza en directo y en cada despliegue
    titulo: "Obras en Cercanías: cortes de vía y cambios de servicio hoy",
    h1: "Obras y cortes en Cercanías",
    descripcion: "Obras de Renfe y Adif en Cercanías y Rodalies: cortes de vía, autobuses alternativos y cambios de horario, con los avisos oficiales de Renfe en directo.",
    intro: "Obras, cortes de vía, autobuses alternativos y cambios de servicio que Renfe comunica en sus redes de Cercanías y Rodalies.",
    vacio: "Ahora mismo Renfe no tiene publicado ningún aviso de obras ni cortes en Cercanías.",
    og: { badge: "OBRAS", color: "#F2BE3A", titulo: "Obras y cortes en Cercanías", subtitulo: "Avisos oficiales de Renfe, en directo" },
    preguntas: [
      { p: "¿Hay obras en Cercanías este fin de semana?", r: "Aquí ves todos los avisos de obras y cortes que Renfe tiene publicados, con las fechas de cada uno. Los cortes de fin de semana suelen anunciarse con unos días de antelación." },
      { p: "¿Hay autobuses cuando se corta la vía?", r: "Cuando Renfe organiza un servicio alternativo por carretera lo indica en el aviso, con las paradas y los horarios." },
      { p: "¿Cómo veo solo las obras de mi línea?", r: "Entra en la página de tu línea de Cercanías: muestra sus avisos y el estado de sus trenes en directo." },
    ],
  },
];

export const avisosDe = (tema, alerts) => {
  const re = new RegExp(tema.patron, "i");
  return alerts.filter((a) => re.test(norm(`${a.header} ${a.desc}`)));
};
