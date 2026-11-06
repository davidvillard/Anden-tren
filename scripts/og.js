// Imágenes para compartir (og:image, 1200×630) de las páginas de cada red y línea.
// Se dibujan en SVG y se pasan a PNG con resvg: WhatsApp, Facebook y X no aceptan SVG.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const FONTS = [here("og/figtree-600.ttf"), here("og/figtree-800.ttf")];
const LOGO = `data:image/svg+xml;base64,${readFileSync(here("../site/assets/img/logo-mark.svg")).toString("base64")}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Texto claro u oscuro según el color de fondo (luminancia relativa)
function ink(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#121826" : "#FFFFFF";
}

// Ajusta el tamaño de letra para que una línea quepa en "ancho" píxeles (aprox. 0,58 em por letra)
const fit = (text, ancho, max) => Math.min(max, Math.floor(ancho / (0.58 * Math.max(1, text.length))));

/** badge: texto corto en la caja de color (C5, R2…); titulo y subtitulo debajo. */
export function ogImage({ badge, color = "#1446D8", titulo, subtitulo }) {
  const bw = Math.max(170, 60 + badge.length * 62);
  const t = fit(titulo, 1040, 76);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#F6F7F9"/>
  <rect x="0" y="0" width="1200" height="14" fill="#1446D8"/>
  <image x="80" y="70" width="72" height="72" xlink:href="${LOGO}"/>
  <text x="172" y="122" font-family="Figtree" font-weight="800" font-size="44" fill="#121826">Andén</text>
  <g transform="translate(1120 106)"><circle cx="-172" cy="-10" r="10" fill="#1F7A55"/>
    <text x="0" y="4" text-anchor="end" font-family="Figtree" font-weight="600" font-size="32" fill="#1F7A55">En directo</text></g>
  <rect x="80" y="196" width="${bw}" height="132" rx="24" fill="${color}"/>
  <text x="${80 + bw / 2}" y="290" text-anchor="middle" font-family="Figtree" font-weight="800" font-size="88" fill="${ink(color)}">${esc(badge)}</text>
  <text x="80" y="${400 + t * 0.2}" font-family="Figtree" font-weight="800" font-size="${t}" fill="#121826">${esc(titulo)}</text>
  <text x="80" y="500" font-family="Figtree" font-weight="600" font-size="${fit(subtitulo, 1040, 40)}" fill="#5B6474">${esc(subtitulo)}</text>
  <text x="80" y="574" font-family="Figtree" font-weight="800" font-size="32" fill="#1446D8">andentren.es</text>
</svg>`;
  return new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Figtree" } }).render().asPng();
}
