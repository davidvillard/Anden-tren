// Build de la web: copia site/ en dist/, inserta cabecera y pie, genera las
// páginas de texto, de sucesos y de redes, el sitemap y el robots.txt.
//
// Variables de entorno (todas opcionales, se configuran en Vercel):
//   SITE_URL           dominio público, p. ej. https://anden.es
//   GA_MEASUREMENT_ID  Google Analytics 4, p. ej. G-ABC123XYZ
//   GSC_VERIFICATION   código de verificación de Google Search Console
//   CONTACT_EMAIL      correo de contacto que aparece en las páginas legales
//   OWNER_NAME         nombre del titular (si quieres que aparezca)
//   OWNER_NIF          NIF del titular (solo si la web pasa a tener actividad económica)
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { pages as textPages } from "./pages.js";
import { generate as seoPages } from "./seo-pages.js";
import { loadState } from "../lib/sucesos-state.js";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "site");
const OUT = join(ROOT, "dist");
const env = process.env;

const SITE_URL = (env.SITE_URL
  || (env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || "http://localhost:3000").replace(/\/$/, "");
const GA = /^G-[A-Z0-9]+$/.test(env.GA_MEASUREMENT_ID || "") ? env.GA_MEASUREMENT_ID : "";
const GSC = (env.GSC_VERIFICATION || "").replace(/[^A-Za-z0-9_-]/g, "");
const cfg = {
  ga: Boolean(GA),
  contact: env.CONTACT_EMAIL || "davidvillard6@gmail.com",
  ownerName: env.OWNER_NAME || "",
  ownerNif: env.OWNER_NIF || "",
};

const partial = async (n) => (await readFile(join(ROOT, "partials", `${n}.html`), "utf8")).trim();
const parts = { head: await partial("head"), header: await partial("header"), footer: await partial("footer") };
const fill = (html) => html
  .replace("<!--#head-->", parts.head)
  .replace("<!--#header-->", parts.header)
  .replace("<!--#footer-->", parts.footer)
  .replace("<!--#verification-->", GSC ? `<meta name="google-site-verification" content="${GSC}">` : "")
  .replaceAll("__GA_ID__", GA)
  .replaceAll("__SITE_URL__", SITE_URL);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
async function writePage(path, html) {
  const file = join(OUT, `${path.slice(1)}.html`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, fill(html));
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(SRC, OUT, { recursive: true });

const sitemap = [];
for (const file of await walk(OUT)) {
  if (!/\.(html|webmanifest)$/.test(file)) continue;
  await writeFile(file, fill(await readFile(file, "utf8")));
  if (file.endsWith(".html")) {
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
for (const p of seoPages({ sucesos, redes })) {
  await writePage(p.path, p.html);
  sitemap.push(p);
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

console.log(`Build listo en dist/ · ${sitemap.length} páginas · ${SITE_URL}${GA ? " · Analytics activo" : ""}${GSC ? " · Search Console verificado" : ""}`);
