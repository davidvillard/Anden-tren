// Build de la web: copia site/ en dist/, inserta cabecera y pie, genera las páginas
// de texto, el sitemap y el robots.txt, y pone la URL pública en las etiquetas SEO.
//
// URL pública: variable SITE_URL (por ejemplo https://anden.es). Si no existe,
// se usa el dominio de producción que Vercel da en el build.
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { PAGES } from "./pages.js";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "site");
const OUT = join(ROOT, "dist");

const SITE_URL = (process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || "http://localhost:3000").replace(/\/$/, "");

const partial = async (n) => (await readFile(join(ROOT, "partials", `${n}.html`), "utf8")).trim();
const parts = { head: await partial("head"), header: await partial("header"), footer: await partial("footer") };
const fill = (html) => html
  .replace("<!--#head-->", parts.head)
  .replace("<!--#header-->", parts.header)
  .replace("<!--#footer-->", parts.footer)
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

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(SRC, OUT, { recursive: true });

const indexable = [];
for (const file of await walk(OUT)) {
  if (!/\.(html|webmanifest)$/.test(file)) continue;
  await writeFile(file, fill(await readFile(file, "utf8")));
  if (file.endsWith(".html")) {
    const path = "/" + relative(OUT, file).replace(/index\.html$/, "").replace(/\.html$/, "");
    indexable.push(path);
  }
}
for (const p of PAGES) {
  await writeFile(join(OUT, `${p.path.slice(1)}.html`), fill(p.html));
  if (!p.noindex) indexable.push(p.path);
}

const today = new Date().toISOString().slice(0, 10);
const priority = (p) => (p === "/" ? "1.0" : p === "/accidentes" ? "0.8" : "0.4");
const freq = (p) => (p === "/" ? "always" : p === "/accidentes" ? "daily" : "monthly");
await writeFile(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexable.sort().map((p) => `  <url><loc>${SITE_URL}${p}</loc><lastmod>${today}</lastmod><changefreq>${freq(p)}</changefreq><priority>${priority(p)}</priority></url>`).join("\n")}
</urlset>
`);
await writeFile(join(OUT, "robots.txt"), `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`);

console.log(`Build listo en dist/ · ${indexable.length} páginas · URL pública: ${SITE_URL}`);
