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
  <div class="prose">${qs.map((q) => `<details class="card pad"><summary><strong>${esc(q.p)}</strong></summary><p style="margin-top:8px">${esc(q.r)}</p></details>`).join("\n")}</div>
</div></section>`;

/* ---------- Sucesos ---------- */

function preguntasSuceso(s) {
  const f = cifra(s.cifras?.fallecidos), hh = cifra(s.cifras?.heridos);
  const balance = (f || hh) ? {
    p: "¿Cuántos fallecidos y heridos hay?",
    r: `Según el último balance${s.fuente ? ` (${s.fuente})` : ""}, hay ${[f && `${f} fallecidos`, hh && `${hh} heridos${s.cifras.heridos.nota ? ` (${s.cifras.heridos.nota})` : ""}`].filter(Boolean).join(" y ")}. Las cifras son provisionales.`,
  } : null;
  if (s.preguntas?.length) {
    const rest = s.preguntas.filter((q) => !/cu[aá]nt[oa]s (fallecidos|muertos|heridos)/i.test(q.p));
    return [rest[0], balance, ...rest.slice(1)].filter(Boolean);
  }
  return [
    { p: "¿Qué ha pasado?", r: `${s.resumen} Ocurrió el ${fecha(s.inicio)} hacia las ${hora(s.inicio)}.` },
    balance,
    s.circulacion && { p: "¿Cómo está la circulación de trenes?", r: s.circulacion },
    s.causas && { p: "¿Cuál ha sido la causa?", r: s.causas },
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
      <div class="figures">${fig(s.cifras?.fallecidos, "fallecidos", true)}${fig(s.cifras?.heridos, "heridos")}${fig(s.cifras?.aBordo, "personas a bordo")}</div>
      ${s.telefonos?.length ? `<h2>Teléfonos para familiares</h2><ul>${s.telefonos.map((t) => `<li><strong>${esc(t.numero)}</strong>: ${esc(t.nombre)}</li>`).join("")}</ul>` : ""}
      ${s.circulacion ? `<h2>Trenes afectados</h2><p>${esc(s.circulacion)}</p>` : ""}
      ${s.causas ? `<h2>Causas</h2><p>${esc(s.causas)}</p>` : ""}
      ${fuentes.length ? `<h2>Fuentes</h2><ul>${fuentes.map((e) => `<li><a href="${esc(e.url)}" rel="noopener" target="_blank">${esc(e.nombre)}</a></li>`).join("")}</ul>` : ""}
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
    ${activos.length ? activos.map((s) => `<article class="incident"><div class="incident-body"><h2><a href="${sucesoPath(s)}">${esc(s.titulo)}</a></h2><p>${esc(s.resumen)}</p></div></article>`).join("") : '<div class="empty">Ahora mismo no hay ningún accidente ferroviario grave en curso en España.</div>'}
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
  const description = `Retrasos de la ${l.code} de ${red.nombre} (${recorridoTxt(l)}) ahora mismo: trenes en el mapa, minutos de retraso y avisos de Renfe, actualizados cada 30 segundos.`;
  const estaciones = [...new Set(l.recorridos.flatMap((r) => r.paradas))];
  const qs = [
    { p: `¿Hay retrasos en la ${l.code} de ${red.corto} ahora?`, r: `En esta página ves en directo cuántos trenes de la ${l.code} circulan, cuántos van con 3 minutos o más de retraso y el retraso medio, con datos de Renfe actualizados cada 30 segundos.` },
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
  const description = `Retrasos de ${red.nombre} ahora mismo: estado de cada línea, trenes en el mapa y avisos de Renfe, actualizados cada 30 segundos.`;
  const qs = [
    { p: `¿Hay retrasos en ${red.nombre} ahora?`, r: `En esta página ves en directo cuántos trenes de ${red.nombre} circulan, cuántos van con retraso y el estado de cada línea, con datos de Renfe actualizados cada 30 segundos.` },
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
    : ahora.slice(0, 30).map((a) => `<article class="card alert-item"><h3>${esc(a.header || a.desc)}</h3>${a.desc && a.desc !== a.header ? `<p>${esc(a.desc.slice(0, 400))}</p>` : ""}${periodo(a) ? `<p class="small muted">${esc(periodo(a))}</p>` : ""}</article>`).join("");
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

export function generate({ sucesos, redes, lineas, live }) {
  const pages = [hoyPage(sucesos), incidenciasPage(sucesos)];
  for (const s of sucesos.sucesos || []) pages.push(sucesoPage(s, sucesos.actualizado));
  for (const r of redes.redes) {
    const deRed = lineas.filter((l) => l.red === r.slug);
    pages.push(redPage(r, redes.redes, deRed));
    for (const l of deRed) pages.push(lineaPage(l, r, deRed.filter((x) => x !== l)));
  }
  for (const t of TEMAS) pages.push(temaPage(t, live));
  return pages;
}
