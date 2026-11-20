// Build de la web: copia site/ en dist/, inserta cabecera y pie, genera las
// páginas de texto, de sucesos, de redes, de líneas y de temas, sus imágenes para compartir, el sitemap y el robots.txt.
//
// Variables de entorno (todas opcionales, se configuran en Vercel):
//   SITE_URL           dominio público (por defecto https://andentren.es)
//   GTM_ID             Google Tag Manager (por defecto GTM-NRM83968)
//   GSC_VERIFICATION   código de verificación de Search Console (por defecto el del proyecto)
//   CONTACT_EMAIL      correo de contacto que aparece en las páginas legales
//   OWNER_NAME         nombre del titular (si quieres que aparezca)
//   OWNER_NIF          NIF del titular (solo si la web pasa a tener actividad económica)
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { pages as textPages } from "./pages.js";
import { generate as seoPages } from "./seo-pages.js";
import { ogImage } from "./og.js";
import { loadState } from "../lib/sucesos-state.js";
import { buildLive } from "../lib/renfe.js";
import { descargarYGenerar } from "./horarios.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "site");
const OUT = join(ROOT, "dist");
const env = process.env;

// Dominio oficial: andentren.es (andentren.vercel.app y www redirigen aquí)
const SITE_URL = (env.SITE_URL || "https://andentren.es").replace(/\/$/, "");
// Google Tag Manager (Analytics) y Search Console: valores del proyecto, con opción de cambiarlos por variable
const GTM = /^GTM-[A-Z0-9]+$/.test(env.GTM_ID || "") ? env.GTM_ID : "GTM-NRM83968";
const GSC = (env.GSC_VERIFICATION || "gFf5Yx-WKMqeVB9tL1ZoBHpDn84roE32XKY4qD2je2A").replace(/[^A-Za-z0-9_-]/g, "");
const cfg = {
  ga: Boolean(GTM),
  contact: env.CONTACT_EMAIL || "davidvillard6@gmail.com",
  ownerName: env.OWNER_NAME || "",
  ownerNif: env.OWNER_NIF || "",
};

const partial = async (n) => (await readFile(join(ROOT, "partials", `${n}.html`), "utf8")).trim();
const parts = { head: await partial("head"), header: await partial("header"), footer: await partial("footer"), search: await partial("search") };
// Cada CSS/JS propio se enlaza con ?v=<huella de su contenido>: al publicar una
// versión nueva cambia la dirección y el navegador no puede usar la copia antigua.
const versions = new Map();
const stamp = (url) => {
  if (!versions.has(url)) {
    let v = "";
    try { v = createHash("sha1").update(readFileSync(join(SRC, url))).digest("hex").slice(0, 10); } catch (e) { /* archivo no encontrado: sin versión */ }
    versions.set(url, v);
  }
  return versions.get(url) ? `${url}?v=${versions.get(url)}` : url;
};
const versioned = (html) => html.replace(/(src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g, (m, attr, url) => `${attr}="${stamp(url)}"`);
const fill = (html, og = "/assets/img/og.png") => versioned(html
  .replace("<!--#head-->", parts.head)
  .replaceAll("__OG_IMAGE__", SITE_URL + og)
  .replace("<!--#header-->", parts.header)
  .replace("<!--#footer-->", parts.footer)
  .replace("<!--#search-->", parts.search)
  .replaceAll("__GSC__", GSC)
  .replaceAll("__GTM_ID__", GTM)
  .replaceAll("__SITE_URL__", SITE_URL));

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
// og: datos de la imagen para compartir propia de la página (si no, la general)
async function writePage(path, html, og) {
  const file = join(OUT, `${path.slice(1)}.html`);
  await mkdir(dirname(file), { recursive: true });
  let ogPath;
  if (og) {
    ogPath = `/og${path}.png`;
    await mkdir(dirname(join(OUT, ogPath.slice(1))), { recursive: true });
    await writeFile(join(OUT, ogPath.slice(1)), ogImage(og));
  }
  await writeFile(file, fill(html, ogPath));
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(SRC, OUT, { recursive: true });

const sitemap = [];
for (const file of await walk(OUT)) {
  if (!/\.(html|webmanifest)$/.test(file)) continue;
  const filled = fill(await readFile(file, "utf8"));
  await writeFile(file, filled);
  if (file.endsWith(".html") && !filled.includes('content="noindex')) {
    const path = "/" + relative(OUT, file).replace(/index\.html$/, "").replace(/\.html$/, "");
    sitemap.push({ path, priority: path === "/" ? "1.0" : "0.7", freq: path === "/" ? "always" : "daily" });
  }
}
for (const p of textPages(cfg)) {
  await writePage(p.path, p.html);
  if (!p.noindex) sitemap.push({ path: p.path, priority: p.path === "/fuentes" ? "0.4" : "0.2", freq: "monthly" });
}

// Sucesos: el estado más reciente (Redis si está configurado; si no, el archivo)
const sucesos = await loadState();
await writeFile(join(OUT, "data", "sucesos.json"), JSON.stringify(sucesos));
const redes = JSON.parse(await readFile(join(SRC, "data", "redes.json"), "utf8"));
const { lineas } = JSON.parse(await readFile(join(SRC, "data", "lineas.json"), "utf8"));
// Avisos de Renfe en el momento de publicar, para las páginas de huelga y obras.
// Si Renfe no responde, esas páginas se publican sin la lista y la cargan en directo.
const live = await buildLive();
const avisos = live.sources.alerts?.ok ? live : null;
// Horarios oficiales de alta velocidad, larga y media distancia: se descargan en cada publicación;
// si Renfe no responde, se usa la última copia guardada en el repositorio
let horarios;
try {
  horarios = await descargarYGenerar();
  await writeFile(join(OUT, "data", "horarios-ld.json"), JSON.stringify(horarios));
  console.log(`Horarios de Renfe: ${Object.keys(horarios.trenes).length} trenes`);
} catch (e) {
  horarios = JSON.parse(await readFile(join(SRC, "data", "horarios-ld.json"), "utf8"));
  console.log(`Horarios de Renfe: copia guardada (${e.message})`);
}
for (const p of seoPages({ sucesos, redes, lineas, live: avisos, horarios })) {
  await writePage(p.path, p.html, p.og);
  sitemap.push({ path: p.path, priority: p.priority, freq: p.freq });
}

const today = new Date().toISOString().slice(0, 10);
await writeFile(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.sort((a, b) => a.path.localeCompare(b.path)).map((p) => `  <url><loc>${SITE_URL}${p.path}</loc><lastmod>${today}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority></url>`).join("\n")}
</urlset>
`);
await writeFile(join(OUT, "robots.txt"), `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`);

console.log(`Build listo en dist/ · ${sitemap.length} páginas · ${SITE_URL}${GTM ? " · Tag Manager " + GTM : ""}${GSC ? " · Search Console verificado" : ""}`);
