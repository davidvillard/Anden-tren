// Traduce una página ya generada en español a otro idioma, con el diccionario (makeT):
// texto de cada bloque (con sus enlaces o negritas dentro), títulos y descripciones, atributos
// legibles (placeholder, aria-label, title, alt) y datos estructurados JSON-LD. Además cambia los
// enlaces internos a la versión del idioma (/en/..., /ca/...) cuando esa página existe traducida.
import { parse } from "node-html-parser";

const INLINE = new Set(["a", "b", "strong", "em", "i", "span", "code", "small", "br", "abbr", "sup", "sub", "kbd", "time", "mark", "u", "s"]);
const SKIP = new Set(["script", "style", "svg", "noscript", "template", "pre"]);
const ATTRS = ["placeholder", "aria-label", "title", "alt", "data-empty"];

const soloInline = (el) => el.childNodes.every((n) => n.nodeType === 3 || (n.nodeType === 1 && INLINE.has(n.rawTagName?.toLowerCase()) && soloInline(n)));
const tieneTexto = (s) => /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(s.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, ""));

function walk(el, t) {
  for (const child of el.childNodes) {
    if (child.nodeType === 3) {
      const raw = child.rawText;
      if (tieneTexto(raw)) { const out = t(raw); if (out !== raw) child.rawText = out; }
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tag = child.rawTagName?.toLowerCase();
    if (SKIP.has(tag)) continue;
    for (const a of ATTRS) { const v = child.getAttribute(a); if (v && tieneTexto(v)) child.setAttribute(a, t(v)); }
    if (child.childNodes.length && soloInline(child)) {
      const inner = child.innerHTML;
      if (tieneTexto(inner)) {
        const out = t(inner);
        if (out !== inner) { child.set_content(out); continue; }
        if (child.childNodes.some((n) => n.nodeType === 1)) walk(child, t); // traducir sus trozos sueltos
      }
      continue;
    }
    walk(child, t);
  }
}

function traducirJson(v, t, key) {
  if (key === "inLanguage" && typeof v === "string") return t.locale ? t.locale.replace(/-.*/, "") : v;
  if (typeof v === "string") return /^(@|url|contentUrl|item|logo|mainEntityOfPage|license|encodingFormat|image|target|departureTime|arrivalTime|trainNumber)/.test(key || "") || /^https?:/.test(v) ? v : t(v);
  if (Array.isArray(v)) return v.map((x) => traducirJson(x, t, key));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k.startsWith("@") ? x : traducirJson(x, t, k)]));
  return v;
}

// pathFor(path) → la ruta traducida si existe (p. ej. "/en/retrasos"), o null para dejarla en español
export function translateHtml(html, { t, lang, path, pathFor, alternates }) {
  const root = parse(html, { comment: true, blockTextElements: { script: true, style: true, noscript: true, pre: true } });
  root.querySelector("html")?.setAttribute("lang", lang);
  const head = root.querySelector("head"), body = root.querySelector("body");
  // Título y metadatos
  const title = root.querySelector("title");
  if (title) title.set_content(t(title.text));
  for (const m of root.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[property="og:image:alt"], meta[name="twitter:title"], meta[name="twitter:description"]')) {
    const c = m.getAttribute("content"); if (c) m.setAttribute("content", t(c));
  }
  root.querySelector('meta[property="og:locale"]')?.setAttribute("content", lang === "en" ? "en_GB" : "ca_ES");
  // Datos estructurados
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try { s.set_content(JSON.stringify(traducirJson(JSON.parse(s.text), t))); } catch (e) { /* se deja como está */ }
  }
  if (body) walk(body, t);
  // Enlaces internos y canónica
  const local = (href) => { const m = /^(https?:\/\/[^/]+)?(\/[^?#]*)(.*)$/.exec(href || ""); return m ? { base: m[1] || "", p: m[2], rest: m[3] } : null; };
  for (const a of root.querySelectorAll("a[href], link[rel=canonical], meta[property='og:url']")) {
    const attr = a.rawTagName === "meta" ? "content" : "href";
    const l = local(a.getAttribute(attr));
    if (!l || (l.base && !/andentren|__SITE_URL__|localhost/.test(l.base))) continue;
    const to = pathFor(l.p);
    if (to) a.setAttribute(attr, `${l.base}${to}${l.rest}`);
  }
  // Idiomas alternativos y diccionario para la parte en directo
  if (head) {
    head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((x) => x.remove());
    head.insertAdjacentHTML("beforeend", alternates);
    head.insertAdjacentHTML("beforeend", `<script src="/assets/js/i18n-${lang}.js?v=__I18N_V__"></script>`);
  }
  void path;
  return root.toString();
}
