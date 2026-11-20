// Genera las versiones en inglés (/en/) y catalán (/ca/) de las páginas ya publicadas en español.
// - Cada página se traduce con su diccionario (site/i18n/<idioma>.json) usando scripts/i18n-html.js.
// - Las páginas legales y la ficha de cada suceso (texto de terceros) solo existen en español.
// - Todas las páginas llevan sus alternativas de idioma (hreflang) para Google.
// - El diccionario se publica como /assets/js/i18n-<idioma>.js para lo que se pinta en directo.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { createHash } from "node:crypto";
import { makeT } from "./i18n-core.js";
import { translateHtml } from "./i18n-html.js";

export const IDIOMAS = ["en", "ca"];
const SOLO_ES = /^\/(aviso-legal|privacidad|cookies|accesibilidad|fuentes|contacto|huelga-renfe|obras-cercanias|accidente-tren\/|accidente-tren-toledo|incidencia\/|404|og\/)/;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}
const rutaDe = (OUT, file) => "/" + relative(OUT, file).replace(/\\/g, "/").replace(/index\.html$/, "").replace(/\.html$/, "").replace(/\/$/, "");

export async function traducirSitio({ OUT, ROOT, SITE_URL, sitemap }) {
  const files = (await walk(OUT)).filter((f) => !/^(en|ca)\//.test(relative(OUT, f).replace(/\\/g, "/")));
  const rutas = new Map(files.map((f) => [rutaDe(OUT, f) || "/", f]));
  const traducibles = new Set([...rutas.keys()].filter((r) => !SOLO_ES.test(r)));
  const alternates = (r) => {
    const abs = (p) => `${SITE_URL}${p}`;
    if (!traducibles.has(r)) return "";
    return [`<link rel="alternate" hreflang="es" href="${abs(r)}">`, ...IDIOMAS.map((l) => `<link rel="alternate" hreflang="${l}" href="${abs(`/${l}${r === "/" ? "" : r}`)}">`), `<link rel="alternate" hreflang="x-default" href="${abs(r)}">`].join("");
  };

  let total = 0;
  for (const lang of IDIOMAS) {
    const dict = JSON.parse(await readFile(join(ROOT, "site", "i18n", `${lang}.json`), "utf8"));
    const t = makeT(dict, lang);
    // Diccionario para el navegador
    const js = `window.ANDEN_T=(${makeT.toString()})(${JSON.stringify(dict)},${JSON.stringify(lang)});\n`;
    await writeFile(join(OUT, "assets", "js", `i18n-${lang}.js`), js);
    const v = createHash("sha1").update(js).digest("hex").slice(0, 10);
    const pathFor = (p) => {
      const r = p.replace(/\.html$/, "").replace(/\/$/, "") || "/";
      return traducibles.has(r) ? `/${lang}${r === "/" ? "" : r}` : null;
    };
    for (const r of traducibles) {
      const html = await readFile(rutas.get(r), "utf8");
      const out = translateHtml(html, { t, lang, path: r, pathFor, alternates: alternates(r) }).replace("__I18N_V__", v);
      const dest = join(OUT, lang, r === "/" ? "index.html" : `${r.slice(1)}.html`);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, out);
      total++;
    }
    for (const p of sitemap.filter((x) => traducibles.has(x.path === "/" ? "/" : x.path.replace(/\/$/, "")))) {
      sitemap.push({ ...p, path: `/${lang}${p.path === "/" ? "" : p.path}` });
    }
  }
  // Las páginas en español también anuncian sus versiones en otros idiomas
  for (const r of traducibles) {
    const f = rutas.get(r);
    const html = await readFile(f, "utf8");
    await writeFile(f, html.replace("</head>", `${alternates(r)}</head>`));
  }
  return total;
}
