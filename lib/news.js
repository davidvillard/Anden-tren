// Descubre noticias recientes sobre sucesos ferroviarios en España.
// Fuente: búsquedas RSS de Google News (titulares de medios que citan a los
// organismos oficiales). Se pueden añadir RSS oficiales con la variable
// NEWS_FEEDS (URLs separadas por comas).

const QUERIES = [
  "accidente tren",
  "accidente ferroviario",
  "descarrilamiento tren",
  "choque trenes",
  "heridos tren Renfe",
  "fallecidos accidente tren",
  "arrollado tren",
];
const GOOGLE_NEWS = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:2d")}&hl=es&gl=ES&ceid=ES:es`;

// Un titular solo interesa si habla de trenes y de víctimas o daños.
const RAIL = /\b(tren|trenes|ferroviari[oa]s?|cercan[ií]as|rodalies|ave|alvia|avlo|iryo|ouigo|renfe|adif|avant|talgo|maquinista|v[ií]a f[eé]rrea)\b/i;
const HARM = /(accidente|choque|colisi[oó]n|descarril|arrollad|atropell|herid|muert|fallec|v[ií]ctima|evacu|siniestro|tragedia|alcance)/i;
const FOREIGN = /\b(argentina|m[eé]xico|chile|colombia|per[uú]|india|china|ee\.?\s?uu|estados unidos|reino unido|italia|francia|alemania|grecia|egipto|pakist[aá]n|brasil)\b/i;

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1]) : ""; };

export function parseRss(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const title = tag(it, "title");
    const source = tag(it, "source");
    items.push({
      title: source && title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)) : title,
      link: tag(it, "link"),
      source: source || "",
      date: new Date(tag(it, "pubDate") || Date.now()).toISOString(),
      summary: tag(it, "description").slice(0, 300),
    });
  }
  return items;
}

export function isRelevant(item) {
  const text = `${item.title} ${item.summary}`;
  return RAIL.test(text) && HARM.test(text) && !FOREIGN.test(text);
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; Anden/1.0)" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

export async function fetchNews({ maxAgeHours = 48 } = {}) {
  const extra = (process.env.NEWS_FEEDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const urls = [...QUERIES.map(GOOGLE_NEWS), ...extra];
  const errors = [];
  const results = await Promise.all(urls.map(async (u) => {
    try { return parseRss(await fetchText(u)); } catch (e) { errors.push(`${u}: ${e.message}`); return []; }
  }));
  const cutoff = Date.now() - maxAgeHours * 3600_000;
  const seen = new Set();
  const items = [];
  for (const it of results.flat()) {
    const key = it.title.toLowerCase();
    if (!it.link || seen.has(key) || new Date(it.date).getTime() < cutoff || !isRelevant(it)) continue;
    seen.add(key);
    items.push(it);
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  return { items: items.slice(0, 80), errors };
}
