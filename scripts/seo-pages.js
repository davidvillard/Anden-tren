// Páginas pensadas para buscadores, generadas en cada build:
//  - /accidente-tren-hoy           todos los sucesos en curso y recientes
//  - /accidente-tren/<id> (o la ruta de "pagina")  una por accidente, con FAQ
//  - /incidencias                  averías, trenes parados y cortes de vía en curso
//  - /incidencia/<id>              una por incidencia
//  - /cercanias/<red>              retrasos e incidencias de cada red de Cercanías
//  - /cercanias/<red>/<línea>      una por línea (C5, R2…), con su recorrido y estaciones
//  - /huelga-renfe, /obras-cercanias  avisos de Renfe por tema (lib/temas.js)
// El contenido principal va escrito en el HTML para que Google lo lea sin JS;
// después los scripts lo actualizan en directo.
import { TEMAS, avisosDe } from "../lib/temas.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const TZ = { timeZone: "Europe/Madrid" };
const fecha = (iso) => new Date(iso).toLocaleDateString("es-ES", { ...TZ, day: "numeric", month: "long", year: "numeric" });
const hora = (iso) => new Date(iso).toLocaleTimeString("es-ES", { ...TZ, hour: "2-digit", minute: "2-digit" });
const cifra = (c) => c && c.valor !== null && c.valor !== undefined ? `${c.prefijo === "≥" ? "al menos " : ""}${c.valor}` : null;
// Texto de un aviso de Renfe sin las etiquetas internas del principio (#MadC5)
const limpio = (x) => String(x || "").replace(/^(\s*#\w+)+\s*/, "").trim();
const isInc = (s) => s.clase === "incidencia";
// Más grave primero: más fallecidos, luego más heridos, luego más reciente
const val = (c) => (c && c.valor > 0 ? c.valor : 0);
const porGravedad = (a, b) => (val(b.cifras?.fallecidos) * 1000 + val(b.cifras?.heridos)) - (val(a.cifras?.fallecidos) * 1000 + val(a.cifras?.heridos)) || new Date(b.inicio) - new Date(a.inicio);
export const sucesoPath = (s) => s.pagina || (isInc(s) ? `/incidencia/${s.id}` : `/accidente-tren/${s.id}`);

function shell({ path, title, description, ogType = "website", jsonld = [], body, scripts = [], leaflet = false, inline = "", dataPage = "" }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="__SITE_URL__${path}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="__SITE_URL__${path}">
<!--#head-->
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
${leaflet ? '<link rel="stylesheet" href="/vendor/leaflet/leaflet.css">' : ""}
</head>
<body${dataPage ? ` data-page="${dataPage}"` : ""}>
<!--#header-->
<main id="contenido">
${body}
</main>
<!--#footer-->
${inline ? `<script>${inline}</script>\n` : ""}${scripts.map((s) => `<script src="${s}"></script>`).join("\n")}
</body>
</html>
`;
}

const crumbs = (items) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `__SITE_URL__${path}` })),
});
const faqLd = (qs) => ({
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: qs.map((q) => ({ "@type": "Question", name: q.p, acceptedAnswer: { "@type": "Answer", text: q.r } })),
});
const faqHtml = (qs) => `<section class="section" aria-labelledby="faq"><div class="container">
  <h2 id="faq">Preguntas frecuentes</h2>
  <div class="prose">${qs.map((q) => `<details class="card pad"><summary><strong>${esc(q.p)}</strong></summary><p style="margin-top:8px"${q.id ? ` data-faq="${q.id}"` : ""}>${esc(q.r)}</p></details>`).join("\n")}</div>
</div></section>`;

/* ---------- Sucesos ---------- */

// Respuestas que dependen del último dato: se escriben aquí y sucesos.js las actualiza
// en el navegador con la misma regla (data-faq), para que nunca difieran de la ficha.
export function balanceTexto(s) {
  const f = cifra(s.cifras?.fallecidos), hh = cifra(s.cifras?.heridos);
  if (!f && !hh) return null;
  const fuentes = [...new Set([s.cifras?.fallecidos?.fuente, s.cifras?.heridos?.fuente].filter(Boolean))].join(" y ");
  const her = hh && `${hh} heridos${s.cifras.heridos.nota ? ` (${s.cifras.heridos.nota})` : ""}`;
  return `Según el último balance${fuentes ? ` (${fuentes})` : ""}, hay ${[f && `${f} fallecidos`, her].filter(Boolean).join(" y ")}. Las cifras son provisionales.`;
}
export function causasTexto(s) {
  return `Está en investigación por la CIAF (Comisión de Investigación de Accidentes Ferroviarios) y la Guardia Civil.${s.causas ? ` Lo último publicado, pendiente de la investigación oficial: ${s.causas}` : ""}`;
}
function preguntasSuceso(s) {
  const balanceR = balanceTexto(s);
  const balance = balanceR ? { p: "¿Cuántos fallecidos y heridos hay?", r: balanceR, id: "balance" } : null;
  if (s.preguntas?.length) {
    const rest = s.preguntas.filter((q) => !/cu[aá]nt[oa]s (fallecidos|muertos|heridos)/i.test(q.p)).map((q) => {
      if (s.circulacion && /funcionan los trenes|circulaci[oó]n/i.test(q.p)) return { ...q, r: s.circulacion, id: "circulacion" };
      if (/causa/i.test(q.p)) return { ...q, r: causasTexto(s), id: "causas" };
      return q;
    });
    return [rest[0], balance, ...rest.slice(1)].filter(Boolean);
  }
  return [
    { p: "¿Qué ha pasado?", r: `${s.resumen} Ocurrió el ${fecha(s.inicio)} hacia las ${hora(s.inicio)}.` },
    balance,
    s.circulacion && { p: "¿Cómo está la circulación de trenes?", r: s.circulacion, id: "circulacion" },
    !isInc(s) && { p: "¿Cuál ha sido la causa?", r: causasTexto(s), id: "causas" },
  ].filter(Boolean);
}

function sucesoPage(s, actualizado) {
  const path = sucesoPath(s);
  const f = cifra(s.cifras?.fallecidos), hh = cifra(s.cifras?.heridos);
  const inc = isInc(s);
  const title = s.seo?.title || (inc
    ? `Incidencia${s.operador ? ` de ${s.operador}` : " ferroviaria"} en ${s.lugar}: última hora`
    : `Accidente de tren en ${s.lugar}: última hora, fallecidos y heridos`);
  const description = s.seo?.description || `${s.resumen}${f ? ` Balance: ${f} fallecidos` : ""}${hh ? ` y ${hh} heridos` : ""}.`;
  const qs = preguntasSuceso(s);
  const parent = inc ? ["Incidencias", "/incidencias"] : ["Accidente de tren hoy", "/accidente-tren-hoy"];
  const fuentes = (s.enlaces || []).map((e) => Array.isArray(e) ? { nombre: e[0], url: e[1] } : e);
  const article = {
    "@context": "https://schema.org", "@type": "NewsArticle",
    headline: title.slice(0, 110), description, inLanguage: "es-ES",
    datePublished: s.inicio, dateModified: actualizado || s.inicio,
    image: ["__SITE_URL__/assets/img/og.png"],
    author: { "@type": "Organization", name: "Andén", url: "__SITE_URL__/" },
    publisher: { "@type": "Organization", name: "Andén", logo: { "@type": "ImageObject", url: "__SITE_URL__/assets/img/icon-512.png" } },
    mainEntityOfPage: `__SITE_URL__${path}`,
  };
  const fig = (c, label, crit) => c && c.valor !== null && c.valor !== undefined
    ? `<div class="figure${crit ? " crit" : ""}"><b>${esc(c.prefijo ? c.prefijo + " " : "")}${c.valor}</b><span>${esc(label)}${c.nota ? ", " + esc(c.nota) : ""}</span>${c.fuente ? `<span class="small" style="display:block;margin-top:4px">Fuente: ${esc(c.fuente)}</span>` : ""}</div>` : "";
  const body = `
  <section class="page-head band"><div class="container">
    <p class="crumbs"><a href="/">Inicio</a> › <a href="${parent[1]}">${parent[0]}</a> › ${esc(s.lugar)}</p>
    <h1>${esc(s.titulo)}</h1>
    <p>${esc(s.lugar)} · ${fecha(s.inicio)}, ${hora(s.inicio)} · ${esc(s.tipo || "")}</p>
  </div></section>
  <section class="section"><div class="container" id="suceso" data-modo="completo" data-id="${esc(s.id)}">
    <article class="incident"><div class="incident-body">
      <p style="font-size:1.1rem">${esc(s.resumen)}</p>
      ${s.telefonos?.length ? `<h2>Teléfonos para familiares</h2><ul>${s.telefonos.map((t) => `<li><a href="tel:${esc(t.numero.replace(/\s/g, ""))}"><strong>${esc(t.numero)}</strong></a>: ${esc(t.nombre)}</li>`).join("")}</ul>` : ""}
      <div class="figures">${fig(s.cifras?.fallecidos, "fallecidos", true)}${fig(s.cifras?.heridos, "heridos")}${fig(s.cifras?.aBordo, "personas a bordo")}</div>
      ${actualizado ? `<p class="small muted">Actualizado: ${fecha(actualizado)}, ${hora(actualizado)}. Las cifras son provisionales.</p>` : ""}
      ${s.circulacion ? `<h2>Trenes afectados</h2><p>${esc(s.circulacion)}</p>` : ""}
      ${!inc ? `<h2>Causas</h2><p>${esc(causasTexto(s))}</p>` : ""}
      ${!inc ? `<h2>Webs oficiales</h2><ul><li><a href="https://www.renfe.com" rel="noopener" target="_blank">Renfe</a></li>${/iryo/i.test(s.titulo + s.resumen) ? '<li><a href="https://iryo.eu" rel="noopener" target="_blank">Iryo</a></li>' : ""}${/ouigo/i.test(s.titulo + s.resumen) ? '<li><a href="https://www.ouigo.com/es" rel="noopener" target="_blank">Ouigo</a></li>' : ""}<li><a href="https://www.adif.es" rel="noopener" target="_blank">Adif</a></li><li><a href="https://www.transportes.gob.es" rel="noopener" target="_blank">Ministerio de Transportes (CIAF)</a></li></ul>` : ""}
      ${fuentes.length ? `<h2>${inc ? "Fuentes" : "Noticias en prensa"}</h2><ul>${fuentes.map((e) => `<li><a href="${esc(e.url)}" rel="noopener" target="_blank">${esc(e.nombre)}</a></li>`).join("")}</ul>` : ""}
    </div></article>
  </div></section>
  ${faqHtml(qs)}
  <section class="section"><div class="container"><div class="card pad promo">
    <div style="display:grid;gap:6px"><h2>¿Viajas en tren hoy?</h2><p class="muted">Consulta retrasos y avisos de tu línea en directo.</p></div>
    <a class="btn" href="/">Buscar mi tren</a>
  </div></div></section>`;
  return {
    path, priority: s.activo ? "0.9" : "0.6", freq: s.activo ? "always" : "weekly",
    html: shell({ path, title: `${title} · Andén`, description, ogType: "article", body,
      jsonld: [article, faqLd(qs), crumbs([["Inicio", "/"], parent, [s.lugar, path]])],
      scripts: ["/assets/js/sucesos.js"] }),
  };
}

function hoyPage(data) {
  const path = "/accidente-tren-hoy";
  const activos = (data.sucesos || []).filter((s) => s.activo && !isInc(s)).sort(porGravedad);
  const title = "Accidente de tren hoy en España: última hora, heridos y trenes afectados";
  const description = activos.length
    ? `Última hora: ${activos.map((s) => s.titulo).join(". ")}. Cifras oficiales, teléfonos para familiares y estado de los trenes.`
    : "Accidentes de tren en España en las últimas horas: cifras oficiales de fallecidos y heridos, teléfonos de atención y trenes afectados.";
  const qs = [
    { p: "¿Ha habido hoy algún accidente de tren en España?", r: activos.length ? `Sí. ${activos.map((s) => `${s.titulo}.`).join(" ")}` : "Ahora mismo no hay ningún accidente ferroviario grave en curso registrado en Andén." },
    { p: "¿De dónde salen las cifras de víctimas?", r: "De los balances que publican los servicios de emergencias, los gobiernos, el Ministerio de Transportes, la Guardia Civil y la CIAF. Cada cifra indica qué organismo la da." },
    { p: "¿Cada cuánto se actualiza esta página?", r: "Andén revisa las noticias cada pocos minutos y actualiza las cifras cuando un organismo oficial publica un balance nuevo." },
  ];
  const body = `
  <section class="page-head band"><div class="container">
    <p class="crumbs"><a href="/">Inicio</a> › Accidente de tren hoy</p>
    <h1>Accidente de tren hoy</h1>
    <p>Última hora de los accidentes ferroviarios en España: cifras oficiales, teléfonos para familiares y trenes afectados. Se actualiza automáticamente.</p>
  </div></section>
  <section class="section"><div class="container" id="suceso" data-modo="lista">
    ${activos.length ? activos.map((s) => `<article class="incident"><div class="incident-body"><h2><a href="${sucesoPath(s)}">${esc(s.titulo)}</a></h2><p>${esc(s.resumen)}</p></div></article>`).join("") : '<div class="empty">No hay ningún accidente ferroviario grave en curso ahora mismo. Debajo, los más recientes.</div>'}
  </div></section>
  ${faqHtml(qs)}
  <section class="section"><div class="container"><div class="card pad promo">
    <div style="display:grid;gap:6px"><h2>Registro histórico</h2><p class="muted">Todos los accidentes graves desde 2003, en un mapa.</p></div>
    <a class="btn" href="/accidentes">Ver accidentes anteriores</a>
  </div></div></section>`;
  return { path, priority: "0.9", freq: "always",
    html: shell({ path, title: `${title} · Andén`, description, body, jsonld: [faqLd(qs), crumbs([["Inicio", "/"], ["Accidente de tren hoy", path]])], scripts: ["/assets/js/sucesos.js"] }) };
}

function incidenciasPage(data) {
  const path = "/incidencias";
  const incs = (data.sucesos || []).filter(isInc);
  const activas = incs.filter((s) => s.activo);
  const title = "Incidencias de trenes hoy: averías, trenes parados y cortes de vía";
  const description = activas.length
    ? `Ahora: ${activas.map((s) => s.titulo).join(". ")}. Incidencias de Renfe, Iryo, Ouigo y Adif en directo.`
    : "Incidencias ferroviarias en España en directo: averías, trenes detenidos, problemas de catenaria y cortes de vía en Renfe, Iryo, Ouigo y Cercanías.";
  const qs = [
    { p: "¿Hay hoy alguna incidencia en los trenes?", r: activas.length ? `Sí. ${activas.map((s) => `${s.titulo}.`).join(" ")}` : "Ahora mismo Andén no tiene registrada ninguna incidencia importante en la red ferroviaria." },
    { p: "¿De dónde sale esta información?", r: "De las noticias de al menos dos medios distintos que informan de la incidencia, enlazados en cada caso. Para los avisos oficiales de Cercanías, consulta la página de avisos de Renfe." },
    { p: "¿Cada cuánto se actualiza?", r: "Andén revisa las noticias cada pocos minutos. Una incidencia deja de mostrarse como en curso cuando se restablece la circulación o tras unas horas sin novedades." },
  ];
  const card = (s) => `<article class="incident inc${s.activo ? "" : " done"}"><div class="incident-body"><h3><a href="${sucesoPath(s)}">${esc(s.titulo)}</a></h3><p>${esc(s.resumen)}</p></div></article>`;
  const body = `
  <section class="page-head band"><div class="container">
    <p class="crumbs"><a href="/">Inicio</a> › Incidencias</p>
    <h1>Incidencias en los trenes</h1>
    <p>Averías, trenes parados, problemas de catenaria y cortes de vía en toda España y en cualquier compañía. Se actualiza automáticamente.</p>
  </div></section>
  <section class="section"><div class="container" id="suceso" data-modo="incidencias">
    ${activas.length ? `<div class="alerts">${activas.map(card).join("")}</div>` : '<div class="empty">Ahora mismo no hay ninguna incidencia importante en la red ferroviaria.</div>'}
  </div></section>
  <section class="section"><div class="container"><div class="card pad promo">
    <div style="display:grid;gap:6px"><h2>Avisos oficiales de Renfe</h2><p class="muted">Obras, cortes y cambios de servicio en Cercanías, tal como los publica Renfe.</p></div>
    <a class="btn" href="/avisos">Ver avisos de Renfe</a>
  </div></div></section>
  ${faqHtml(qs)}`;
  return { path, priority: "0.9", freq: "always",
    html: shell({ path, title: `${title} · Andén`, description, body, jsonld: [faqLd(qs), crumbs([["Inicio", "/"], ["Incidencias", path]])], scripts: ["/assets/js/sucesos.js"] }) };
}

/* ---------- Redes y líneas de Cercanías ---------- */

export const lineaPath = (l) => `/cercanias/${l.red}/${l.slug}`;
const recorridoTxt = (l) => l.recorridos.map((r) => `${l.recorridos.length > 1 ? `${r.variante}: ` : ""}${r.desde} – ${r.hasta}`).join(" · ");
const lineaChips = (lineas) => `<div class="chips">${lineas.map((l) => `<a class="chip" href="${lineaPath(l)}"><span class="line-badge">${esc(l.code)}</span> ${esc(l.recorridos[0].desde)} – ${esc(l.recorridos[0].hasta)}</a>`).join("")}</div>`;

const liveTrains = `
  <section class="section" aria-labelledby="directo-titulo"><div class="container">
    <div class="section-head"><h2 id="directo-titulo">Trenes en directo</h2>
      <div class="segmented" role="group" aria-label="Forma de ver los trenes"><button type="button" id="view-map" aria-pressed="true">Mapa</button><button type="button" id="view-list" aria-pressed="false">Lista</button></div></div>
    <div class="card mapbox"><div id="map" class="map" role="region" aria-label="Mapa con la posición de los trenes"></div>
      <div class="legend"><span><i style="background:var(--ok)"></i>En hora</span><span><i style="background:var(--warn)"></i>De 3 a 10 min tarde</span><span><i style="background:var(--crit)"></i>Más de 10 min tarde</span><span><i style="background:var(--faint)"></i>Sin dato</span></div>
      <p class="map-hint">Usa la rueda del ratón o pellizca para acercar. Toca un tren para ver su ficha.</p></div>
    <div data-list hidden><div class="list-scroll" id="train-list"></div></div>
  </div></section>`;
const liveScripts = ["/vendor/leaflet/leaflet.js", "/assets/js/live-core.js", "/assets/js/live-pages.js"];

function lineaPage(l, red, hermanas) {
  const path = lineaPath(l);
  const nombre = `${l.code} ${red.nombre}`;
  const title = `${nombre} hoy: retrasos, avisos y trenes en directo`;
  const description = `Retrasos de la ${l.code} de ${red.nombre} (${recorridoTxt(l)}) ahora mismo: trenes en el mapa, minutos de retraso y avisos de Renfe, actualizados cada 15 segundos.`;
  const estaciones = [...new Set(l.recorridos.flatMap((r) => r.paradas))];
  const qs = [
    { p: `¿Hay retrasos en la ${l.code} de ${red.corto} ahora?`, r: `En esta página ves en directo cuántos trenes de la ${l.code} circulan, cuántos van con 3 minutos o más de retraso y el retraso medio, con datos de Renfe actualizados cada 15 segundos.` },
    { p: `¿Qué recorrido hace la ${l.code}?`, r: `${l.recorridos.map((r) => `${l.recorridos.length > 1 ? `La ${r.variante} va` : "Va"} de ${r.desde} a ${r.hasta} (${r.paradas.length} estaciones)`).join(". ")}, según los horarios que publica Renfe.` },
    { p: `¿Qué estaciones tiene la ${l.code}?`, r: `${estaciones.join(", ")}.` },
    { p: `¿Hay obras o incidencias en la ${l.code}?`, r: `La sección de avisos muestra las obras, cortes y cambios de servicio que Renfe comunica para la ${l.code}. Si no aparece ninguno, Renfe no tiene avisos publicados para esta línea.` },
  ];
  const body = `
  <section class="page-head"><div class="container">
    <p class="crumbs"><a href="/">Inicio</a> › <a href="/cercanias">Cercanías</a> › <a href="/cercanias/${red.slug}">${esc(red.corto)}</a> › ${esc(l.code)}</p>
    <h1>${esc(l.code)} ${esc(red.nombre)}: retrasos hoy</h1>
    <p>${esc(recorridoTxt(l))}</p>
    <div id="status"></div>
    <span class="live-pill" id="live-pill"><span class="pulse off" aria-hidden="true"></span><span data-text>Conectando con Renfe…</span></span>
  </div></section>
  <section class="section"><div class="container"><div class="kpis" id="kpis"></div></div></section>
  ${liveTrains}
  <section class="section" id="avisos" aria-labelledby="a-t"><div class="container">
    <h2 id="a-t">Avisos de la ${esc(l.code)}</h2><div class="alerts" id="alerts"></div>
  </div></section>
  <section class="section" aria-labelledby="e-t"><div class="container">
    <h2 id="e-t">Recorrido y estaciones de la ${esc(l.code)}</h2>
    ${l.recorridos.map((r) => `<div class="card pad" style="margin-top:12px"><h3>${l.recorridos.length > 1 ? `${esc(r.variante)}: ` : ""}${esc(r.desde)} – ${esc(r.hasta)}</h3><ol class="stations">${r.paradas.map((p) => `<li>${esc(p)}</li>`).join("")}</ol></div>`).join("")}
    <p class="small muted">Según los horarios que publica Renfe en datos abiertos.</p>
  </div></section>
  ${faqHtml(qs)}
  ${hermanas.length ? `<section class="section"><div class="container"><h2>Otras líneas de ${esc(red.nombre)}</h2>${lineaChips(hermanas)}<p style="margin-top:12px"><a class="more" href="/cercanias/${red.slug}">Ver toda la red de ${esc(red.corto)}</a></p></div></section>` : ""}`;
  return { path, priority: "0.8", freq: "always",
    og: { badge: l.code, color: l.color, titulo: red.nombre, subtitulo: `${l.recorridos[0].desde} – ${l.recorridos[0].hasta} · Retrasos en directo` },
    html: shell({ path, title: `${title} · Andén`, description, body, leaflet: true, dataPage: "linea",
      jsonld: [faqLd(qs), crumbs([["Inicio", "/"], ["Cercanías", "/cercanias"], [red.nombre, `/cercanias/${red.slug}`], [l.code, path]])],
      inline: `window.ANDEN_LINEA=${JSON.stringify({ red: red.slug, l: l.code })};`,
      scripts: liveScripts }) };
}

function redPage(red, redes, lineas) {
  const path = `/cercanias/${red.slug}`;
  const title = `${red.nombre} hoy: retrasos, incidencias y trenes en directo`;
  const description = `Retrasos de ${red.nombre} ahora mismo: estado de cada línea, trenes en el mapa y avisos de Renfe, actualizados cada 15 segundos.`;
  const qs = [
    { p: `¿Hay retrasos en ${red.nombre} ahora?`, r: `En esta página ves en directo cuántos trenes de ${red.nombre} circulan, cuántos van con retraso y el estado de cada línea, con datos de Renfe actualizados cada 15 segundos.` },
    { p: `¿Cómo sé si mi tren de ${red.corto} va con retraso?`, r: "Toca tu línea en la tabla o busca el número del tren. Verás su retraso, su posición y los avisos de su línea." },
    { p: `¿Hay obras o incidencias en ${red.nombre}?`, r: "La sección de avisos muestra las obras, cortes y cambios de servicio que Renfe comunica para esta red." },
  ];
  const others = redes.filter((r) => r.slug !== red.slug).map((r) => `<a class="chip" href="/cercanias/${r.slug}">${esc(r.corto)}</a>`).join("");
  const body = `
  <section class="page-head"><div class="container">
    <p class="crumbs"><a href="/">Inicio</a> › <a href="/cercanias">Cercanías</a> › ${esc(red.corto)}</p>
    <h1>${esc(red.nombre)}: retrasos hoy</h1>
    <span class="live-pill" id="live-pill"><span class="pulse off" aria-hidden="true"></span><span data-text>Conectando con Renfe…</span></span>
  </div></section>
  <section class="section"><div class="container"><div class="kpis" id="kpis"></div></div></section>
  <section class="section" aria-labelledby="l-t"><div class="container">
    <div class="section-head"><h2 id="l-t">Estado de las líneas</h2><p class="small">Toca una línea para ver sus trenes y avisos.</p></div>
    <div id="lines"></div>
  </div></section>
  ${liveTrains}
  <section class="section" aria-labelledby="a-t"><div class="container">
    <div class="section-head"><h2 id="a-t">Avisos de Renfe</h2><a class="more" href="/avisos?red=${red.slug}">Todos los avisos de ${esc(red.corto)}</a></div>
    <div class="alerts" id="alerts"></div>
  </div></section>
  ${lineas.length ? `<section class="section" aria-labelledby="ls-t"><div class="container"><h2 id="ls-t">Líneas de ${esc(red.nombre)}</h2>${lineaChips(lineas)}</div></section>` : ""}
  ${faqHtml(qs)}
  <section class="section"><div class="container"><h2>Otras redes de Cercanías</h2><div class="chips">${others}</div></div></section>`;
  return { path, priority: "0.8", freq: "always",
    og: { badge: red.slug === "rodalies-catalunya" ? "R" : "C", color: "#1446D8", titulo: red.nombre, subtitulo: "Retrasos, avisos y trenes en directo" },
    html: shell({ path, title: `${title} · Andén`, description, body, leaflet: true, dataPage: "red",
      jsonld: [faqLd(qs), crumbs([["Inicio", "/"], ["Cercanías", "/cercanias"], [red.nombre, path]])],
      inline: `window.ANDEN_RED=${JSON.stringify(red.slug)};`,
      scripts: liveScripts }) };
}

/* ---------- Avisos de Renfe por tema (huelga, obras) ---------- */

function temaPage(tema, live) {
  const path = `/${tema.slug}`;
  const ahora = live ? avisosDe(tema, live.cercanias.alerts) : null;
  const cuando = live ? `${fecha(live.generatedAt * 1000)}, ${hora(live.generatedAt * 1000)}` : "";
  const periodo = (a) => [a.start && `desde el ${fecha(a.start * 1000)}`, a.end && `hasta el ${fecha(a.end * 1000)}`].filter(Boolean).join(" ");
  // Lo que había al publicar la página: Google lo lee sin JS y el script lo sustituye por el directo
  const foto = !ahora ? '<div class="empty">Cargando avisos de Renfe…</div>'
    : !ahora.length ? `<div class="empty">${esc(tema.vacio)}</div>`
    : ahora.slice(0, 30).map((a) => { const hd = limpio(a.header), ds = limpio(a.desc); return `<article class="card alert-item">${hd ? `<h3>${esc(hd)}</h3>` : ""}${ds && ds !== hd ? `<p${hd ? "" : ' class="alert-text"'}>${esc(ds.slice(0, 400))}</p>` : ""}${periodo(a) ? `<p class="small muted">${esc(periodo(a))}</p>` : ""}</article>`; }).join("");
  const body = `
  <section class="page-head band"><div class="container">
    <p class="crumbs"><a href="/">Inicio</a> › <a href="/avisos">Avisos</a> › ${esc(tema.h1)}</p>
    <h1>${esc(tema.h1)}</h1>
    <p>${esc(tema.intro)}</p>
    <span class="live-pill" id="live-pill"><span class="pulse off" aria-hidden="true"></span><span data-text>Conectando con Renfe…</span></span>
  </div></section>
  ${tema.slug === "huelga-renfe" ? '<section class="section"><div class="container"><div class="kpis" id="kpis"></div></div></section>' : ""}
  <section class="section" aria-labelledby="t-a"><div class="container">
    <div class="section-head"><h2 id="t-a">Avisos de Renfe</h2><span class="small muted" id="count">${ahora ? `${ahora.length} ${ahora.length === 1 ? "aviso" : "avisos"} · ${esc(cuando)}` : ""}</span></div>
    <div class="alerts" id="alerts">${foto}</div>
  </div></section>
  ${faqHtml(tema.preguntas)}
  <section class="section"><div class="container"><div class="card pad promo">
    <div style="display:grid;gap:6px"><h2>¿Cómo va tu línea?</h2><p class="muted">Retrasos y avisos de tu línea de Cercanías, en directo.</p></div>
    <a class="btn" href="/cercanias">Ver Cercanías</a>
  </div></div></section>`;
  return { path, priority: "0.8", freq: "always", og: tema.og,
    html: shell({ path, title: `${tema.titulo} · Andén`, description: tema.descripcion, body, dataPage: "tema",
      jsonld: [faqLd(tema.preguntas), crumbs([["Inicio", "/"], ["Avisos", "/avisos"], [tema.h1, path]])],
      inline: `window.ANDEN_TEMA=${JSON.stringify({ patron: tema.patron, vacio: tema.vacio, ld: tema.slug === "huelga-renfe" })};`,
      scripts: ["/assets/js/live-core.js", "/assets/js/live-pages.js"] }) };
}

/* ---------- Horarios de alta velocidad, larga y media distancia ---------- */

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const corto = (n) => String(n).replace(/-Clara Campoamor|-Almudena Grandes|-Julio Anguita|-Joaquín Sorolla|-Daniel Castelao|-Fernando Zóbel| Indalecio Prieto/g, "");
// Variante principal: la que circula más días
const principal = (t) => [...t.v].sort((a, b) => b.d.split("1").length - a.d.split("1").length)[0];
export const trenSlug = (num) => `/horario/${num}`;
// Ciudad de una estación ("Madrid-Puerta de Atocha" → "Madrid")
export const ciudad = (n) => corto(n).split(/[-/]/)[0].replace(/ (Delicias|Santa Justa|Sants|Atocha|Chamartín|María Zambrano|Abando|Campo Grande|Estació del Nord)$/, "").trim();

function horarioPage(num, t, H) {
  const path = trenSlug(num);
  const v = principal(t);
  const st = (x) => H.paradas[x[0]];
  const origen = st(v.p[0]), destino = st(v.p[v.p.length - 1]);
  const ruta = `${ciudad(origen)} – ${ciudad(destino)}`;
  const nombre = `${t.tipo} ${num}`;
  const title = `${nombre} ${ruta}: horario, paradas y retraso hoy`;
  const description = `Tren ${nombre} de Renfe de ${corto(origen)} (${v.p[0][2]}) a ${corto(destino)} (${v.p[v.p.length - 1][1]}): todas sus paradas, qué días circula y si hoy va con retraso o está cancelado.`;
  const dias7 = [...Array(7)].map((_, i) => {
    const d = new Date(`${H.desde}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
    const circula = t.v.some((x) => x.d[i] === "1");
    return `<span class="chip${circula ? "" : " off"}" title="${circula ? "Circula" : "No circula"}">${DIAS_SEMANA[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()}${circula ? "" : " ✕"}</span>`;
  }).join("");
  const tabla = (x) => `<div class="table-wrap"><table><thead><tr><th>Estación</th><th>Llegada</th><th>Salida</th></tr></thead><tbody>${x.p.map((r, i) => `<tr><td>${esc(corto(st(r)))}</td><td class="num">${i ? r[1] : "—"}</td><td class="num">${i < x.p.length - 1 ? r[2] : "—"}</td></tr>`).join("")}</tbody></table></div>`;
  const otras = t.v.filter((x) => x !== v);
  const trip = {
    "@context": "https://schema.org", "@type": "TrainTrip", name: `${nombre} ${ruta}`, trainNumber: num, trainName: t.tipo,
    provider: { "@type": "Organization", name: "Renfe" },
    departureStation: { "@type": "TrainStation", name: corto(origen) }, arrivalStation: { "@type": "TrainStation", name: corto(destino) },
    departureTime: v.p[0][2], arrivalTime: v.p[v.p.length - 1][1],
  };
  const qs = [
    { p: `¿A qué hora sale el ${nombre}?`, r: `Sale de ${corto(origen)} a las ${v.p[0][2]} y llega a ${corto(destino)} a las ${v.p[v.p.length - 1][1]}, según el horario oficial de Renfe.` },
    { p: `¿Dónde para el ${nombre}?`, r: `Para en ${v.p.map((x) => corto(st(x))).join(", ")}.` },
    { p: `¿Va con retraso hoy el ${nombre}?`, r: "Esta página lo muestra en directo con los datos abiertos de Renfe: retraso, próxima parada o cancelación." },
  ];
  const body = `
  <section class="page-head band"><div class="container">
    <p class="crumbs"><a href="/">Inicio</a> › <a href="/horarios">Horarios</a> › ${esc(nombre)}</p>
    <h1>${esc(nombre)}: ${esc(ruta)}</h1>
    <p>Sale de ${esc(corto(origen))} a las <strong>${v.p[0][2]}</strong> y llega a ${esc(corto(destino))} a las <strong>${v.p[v.p.length - 1][1]}</strong>.</p>
  </div></section>
  <section class="section"><div class="container">
    <div class="card pad" id="hoy" data-num="${esc(num)}" style="display:grid;gap:8px"><h2>Hoy</h2><p class="muted">Consultando a Renfe…</p></div>
    <h2 style="margin-top:12px">Próximos 7 días</h2>
    <div class="chips">${dias7}</div>
    <h2 style="margin-top:12px">Paradas y horario</h2>
    ${tabla(v)}
    ${otras.length ? `<details class="card pad"><summary><strong>Otros horarios de este tren (${otras.length})</strong></summary><p class="small muted" style="margin:8px 0">Algunos días el ${esc(nombre)} hace otro recorrido u otro horario.</p>${otras.map(tabla).join("")}</details>` : ""}
    <p class="small muted">Horario oficial de Renfe (datos abiertos), actualizado el ${fecha(H.generado)}. Si tu tren se retrasa o se cancela, mira <a href="/indemnizaciones">tus derechos</a>.</p>
  </div></section>
  ${faqHtml(qs)}`;
  return {
    path, priority: "0.4", freq: "daily",
    html: shell({ path, title: `${title} · Andén`, description, body, jsonld: [trip, faqLd(qs), crumbs([["Inicio", "/"], ["Horarios", "/horarios"], [nombre, path]])],
      scripts: ["/assets/js/live-core.js", "/assets/js/horario.js"] }),
  };
}

function horariosIndex(H) {
  const path = "/horarios";
  const porTipo = {};
  for (const [num, t] of Object.entries(H.trenes)) (porTipo[t.tipo] ||= []).push([num, t]);
  const orden = ["AVE", "AVLO", "AVE Euromed", "AVANT", "AVANT EXP", "Intercity", "Regional"];
  const tipos = Object.keys(porTipo).sort((a, b) => (orden.indexOf(a) + 99) % 99 - (orden.indexOf(b) + 99) % 99);
  const body = `
  <section class="page-head band"><div class="container">
    <p class="crumbs"><a href="/">Inicio</a> › Horarios</p>
    <h1>Horarios de trenes de Renfe</h1>
    <p>Todos los trenes de alta velocidad, larga y media distancia de Renfe con su horario oficial y su estado de hoy. Busca tu número de tren arriba o elige en la lista.</p>
  </div></section>
  <section class="section"><div class="container">
    ${tipos.map((tp) => `<details class="card pad"><summary><strong>${esc(tp)}</strong> <span class="muted">(${porTipo[tp].length} trenes)</span></summary><ul class="train-index">${porTipo[tp].sort((a, b) => Number(a[0]) - Number(b[0])).map(([num, t]) => { const v = principal(t); return `<li><a href="${trenSlug(num)}">${esc(num)}</a> <span class="muted">${esc(ciudad(H.paradas[v.p[0][0]]))} ${v.p[0][2]} → ${esc(ciudad(H.paradas[v.p[v.p.length - 1][0]]))}</span></li>`; }).join("")}</ul></details>`).join("")}
  </div></section>`;
  return { path, priority: "0.6", freq: "daily",
    html: shell({ path, title: "Horarios de trenes Renfe: AVE, Avlo, Avant, Alvia e Intercity · Andén", description: "Horario oficial de todos los trenes de alta velocidad, larga y media distancia de Renfe, con sus paradas y su estado de hoy.", body,
      jsonld: [crumbs([["Inicio", "/"], ["Horarios", path]])] }) };
}

/* ---------- Corredores de alta velocidad ---------- */
// Un tren pertenece a un corredor si para en una estación de cada extremo
export const CORREDORES = [
  { slug: "madrid-barcelona", a: "Madrid", b: "Barcelona", ra: "madrid", rb: "barcelona", via: "Zaragoza y Lleida" },
  { slug: "madrid-sevilla", a: "Madrid", b: "Sevilla", ra: "madrid", rb: "sevilla", via: "Ciudad Real y Córdoba" },
  { slug: "madrid-malaga", a: "Madrid", b: "Málaga", ra: "madrid", rb: "m[aá]laga", via: "Córdoba y Antequera" },
  { slug: "madrid-valencia", a: "Madrid", b: "Valencia", ra: "madrid", rb: "val[eè]ncia", via: "Cuenca" },
  { slug: "madrid-alicante", a: "Madrid", b: "Alicante", ra: "madrid", rb: "alicante|alacant", via: "Albacete" },
  { slug: "madrid-murcia", a: "Madrid", b: "Murcia", ra: "madrid", rb: "murcia", via: "Albacete" },
  { slug: "madrid-galicia", a: "Madrid", b: "Galicia", ra: "madrid", rb: "ourense|santiago|coru|vigo|pontevedra|lugo|ferrol", via: "Zamora y Ourense" },
  { slug: "madrid-asturias", a: "Madrid", b: "Asturias y León", ra: "madrid", rb: "oviedo|gij[oó]n|le[oó]n|avil[eé]s", via: "Valladolid" },
  { slug: "madrid-valladolid", a: "Madrid", b: "Valladolid", ra: "madrid", rb: "valladolid", via: "Segovia" },
  { slug: "madrid-pais-vasco", a: "Madrid", b: "País Vasco", ra: "madrid", rb: "bilbao|vitoria|donostia|irun", via: "Valladolid y Burgos" },
  { slug: "madrid-granada", a: "Madrid", b: "Granada", ra: "madrid", rb: "granada", via: "Antequera" },
  { slug: "madrid-cadiz", a: "Madrid", b: "Cádiz", ra: "madrid", rb: "c[aá]diz|jerez", via: "Sevilla" },
  { slug: "barcelona-valencia", a: "Barcelona", b: "Valencia", ra: "barcelona", rb: "val[eè]ncia", via: "Tarragona y Castellón" },
];
export function trenesCorredor(c, H) {
  const A = new RegExp(c.ra, "i"), B = new RegExp(c.rb, "i");
  return Object.entries(H.trenes).filter(([, t]) => t.v.some((v) => { const n = v.p.map((x) => H.paradas[x[0]]); return n.some((x) => A.test(x)) && n.some((x) => B.test(x)); })).map(([num]) => num);
}

function corredorPage(c, H) {
  const path = `/alta-velocidad/${c.slug}`;
  const nums = trenesCorredor(c, H);
  const ruta = `${c.a}–${c.b}`;
  const title = `Trenes ${ruta} hoy: AVE, Avlo, Iryo y Ouigo, retrasos y cancelaciones`;
  const description = `Estado de los trenes de alta velocidad ${ruta} (por ${c.via}): horarios de hoy, retrasos en directo, trenes cancelados e incidencias en la línea.`;
  const filas = nums.map((num) => { const t = H.trenes[num]; const v = principal(t); return [num, t, v]; })
    .sort((x, y) => x[2].p[0][2].localeCompare(y[2].p[0][2]));
  const qs = [
    { p: `¿Cuántos trenes de Renfe hay entre ${c.a} y ${c.b}?`, r: `Según el horario oficial de Renfe, ${nums.length} trenes distintos unen ${c.a} y ${c.b} (en uno u otro sentido) en los próximos días. Iryo y Ouigo no publican datos abiertos, así que sus trenes no aparecen en la lista.` },
    { p: `¿Hay retrasos hoy entre ${c.a} y ${c.b}?`, r: "Esta página lo muestra en directo con los datos de Renfe: trenes en marcha con su retraso, cancelados de hoy e incidencias en la línea." },
  ];
  const body = `
  <section class="page-head band"><div class="container">
    <p class="crumbs"><a href="/">Inicio</a> › <a href="/alta-velocidad">Alta velocidad</a> › ${esc(ruta)}</p>
    <h1>Trenes ${esc(ruta)} hoy</h1>
    <p>Alta velocidad y larga distancia de Renfe entre ${esc(c.a)} y ${esc(c.b)}, por ${esc(c.via)}: retrasos en directo, cancelaciones e incidencias.</p>
  </div></section>
  <section class="section"><div class="container">
    <div class="kpis" id="kpis"></div>
    <div id="incidencias-corredor"></div>
    <div class="section-head"><h2>Trenes de hoy</h2><p class="small">Horario oficial de Renfe con su estado en directo.</p></div>
    <div id="hoy-corredor"><div class="table-wrap"><table><thead><tr><th>Tren</th><th>Sale</th><th>Llega</th></tr></thead><tbody>${filas.map(([num, t, v]) => `<tr><td><a href="${trenSlug(num)}">${esc(t.tipo)} ${esc(num)}</a></td><td>${esc(ciudad(H.paradas[v.p[0][0]]))} ${v.p[0][2]}</td><td>${esc(ciudad(H.paradas[v.p[v.p.length - 1][0]]))} ${v.p[v.p.length - 1][1]}</td></tr>`).join("")}</tbody></table></div></div>
    <p class="small muted">Iryo y Ouigo no publican datos abiertos de sus trenes: sus incidencias sí aparecen arriba si salen en las noticias. Si tu tren se retrasa o se cancela, mira <a href="/indemnizaciones">tus derechos</a>.</p>
  </div></section>
  ${faqHtml(qs)}`;
  return { path, priority: "0.7", freq: "hourly",
    html: shell({ path, title: `${title} · Andén`, description, body, jsonld: [faqLd(qs), crumbs([["Inicio", "/"], ["Alta velocidad", "/alta-velocidad"], [ruta, path]])],
      inline: `window.ANDEN_CORREDOR=${JSON.stringify({ slug: c.slug, a: c.a, b: c.b, ra: c.ra, rb: c.rb, nums })};`,
      scripts: ["/assets/js/live-core.js", "/assets/js/corredor.js"] }) };
}

function altaVelocidadIndex(H) {
  const path = "/alta-velocidad";
  const body = `
  <section class="page-head band"><div class="container">
    <p class="crumbs"><a href="/">Inicio</a> › Alta velocidad</p>
    <h1>Alta velocidad hoy: estado de cada línea</h1>
    <p>Elige tu trayecto para ver los trenes de hoy, los retrasos en directo, las cancelaciones y las incidencias.</p>
  </div></section>
  <section class="section"><div class="container"><div class="rows">
    ${CORREDORES.map((c) => `<a class="row" href="/alta-velocidad/${c.slug}"><span class="line-badge">AV</span><span class="grow"><strong>${esc(c.a)} – ${esc(c.b)}</strong><span>Por ${esc(c.via)} · ${trenesCorredor(c, H).length} trenes de Renfe</span></span></a>`).join("")}
  </div>
  <p style="margin-top:16px"><a class="more" href="/horarios">Todos los horarios por número de tren</a></p></div></section>`;
  return { path, priority: "0.8", freq: "hourly",
    html: shell({ path, title: "Alta velocidad hoy: retrasos y cancelaciones de AVE por línea · Andén", description: "Estado de las líneas de alta velocidad de España: Madrid–Barcelona, Madrid–Sevilla, Madrid–Valencia y más, con retrasos en directo y cancelaciones.", body,
      jsonld: [crumbs([["Inicio", "/"], ["Alta velocidad", path]])] }) };
}

export function generate({ sucesos, redes, lineas, live, horarios }) {
  const pages = [hoyPage(sucesos), incidenciasPage(sucesos)];
  for (const s of sucesos.sucesos || []) pages.push(sucesoPage(s, sucesos.actualizado));
  for (const r of redes.redes) {
    const deRed = lineas.filter((l) => l.red === r.slug);
    pages.push(redPage(r, redes.redes, deRed));
    for (const l of deRed) pages.push(lineaPage(l, r, deRed.filter((x) => x !== l)));
  }
  for (const t of TEMAS) pages.push(temaPage(t, live));
  if (horarios?.trenes) {
    pages.push(horariosIndex(horarios), altaVelocidadIndex(horarios));
    for (const c of CORREDORES) pages.push(corredorPage(c, horarios));
    for (const [num, t] of Object.entries(horarios.trenes)) pages.push(horarioPage(num, t, horarios));
  }
  return pages;
}
