"use strict";
// Sucesos en curso. Se leen de /api/sucesos (actualización automática) y, si no
// responde, del archivo /data/sucesos.json. Se refrescan cada minuto.
//
// Modos (atributo data-modo en #suceso):
//   "resumen"  tarjeta corta con enlace a la página del suceso (portada)
//   "completo" ficha entera de un suceso concreto (data-id)
//   "lista"       accidentes en curso y recientes (página "Accidente de tren hoy")
//   "incidencias" incidencias en curso y de los últimos 7 días (averías, trenes parados, cortes)
(function () {
  const { h, fmtDate } = window.Anden;
  const wrap = document.getElementById("suceso-wrap");
  const box = document.getElementById("suceso");
  if (!box) return;
  const modo = box.dataset.modo || "resumen";
  const TZ = { timeZone: "Europe/Madrid" };

  const link = (e) => Array.isArray(e) ? { nombre: e[0], url: e[1] } : e;
  const num = (c) => `${c.prefijo ? c.prefijo + " " : ""}${Number(c.valor).toLocaleString("es-ES")}`;
  const fig = (c, label, crit) => c && c.valor !== null && c.valor !== undefined ? h("div", { class: `figure${crit ? " crit" : ""}` },
    h("b", {}, num(c)), h("span", {}, label + (c.nota ? `, ${c.nota}` : "")),
    c.fuente ? h("span", { class: "small", style: "display:block;margin-top:4px" }, `Fuente: ${c.fuente}`) : "") : "";
  const hora = (iso) => new Date(iso).toLocaleTimeString("es-ES", { ...TZ, hour: "2-digit", minute: "2-digit" });
  const stamp = (iso) => new Date(iso).toLocaleString("es-ES", { ...TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const isInc = (s) => s.clase === "incidencia";
  const pathOf = (s) => s.pagina || (isInc(s) ? `/incidencia/${s.id}` : `/accidente-tren/${s.id}`);
  function head(s) {
    const inc = isInc(s);
    return h("div", { class: "incident-top" },
      h("span", {}, s.activo ? (inc ? "● Incidencia en curso" : "● Suceso en curso") : (inc ? "Incidencia terminada" : "Suceso reciente")),
      !inc && s.estado === "provisional" ? h("span", {}, "Cifras provisionales") : "",
      inc && s.operador ? h("span", {}, s.operador) : "",
      h("span", {}, `${fmtDate(s.inicio)} · ${hora(s.inicio)}`));
  }

  // Tarjeta compacta de una incidencia (avería, tren parado, corte de vía)
  function incidencia(s) {
    const href = pathOf(s);
    const fuentes = (s.enlaces || []).map(link).slice(0, 3);
    return h("article", { class: `incident inc${s.activo ? "" : " done"}` }, head(s),
      h("div", { class: "incident-body" },
        h("h3", {}, h("a", { href, style: "color:inherit" }, s.titulo)),
        h("p", {}, s.resumen),
        s.circulacion ? h("p", { class: "small" }, h("strong", {}, "Circulación: "), s.circulacion) : "",
        h("p", { class: "small muted" }, s.linea ? `${s.linea} · ` : "", "Fuentes: ",
          ...fuentes.flatMap((e, i) => [i ? ", " : "", h("a", { href: e.url, target: "_blank", rel: "noopener" }, e.nombre)]))));
  }

  function resumen(s, actualizado) {
    const href = pathOf(s);
    return h("article", { class: "incident" }, head(s),
      h("div", { class: "incident-body" },
        h("h2", {}, h("a", { href, style: "color:inherit;text-decoration:none" }, s.titulo)),
        h("p", {}, s.resumen),
        h("div", { class: "figures" }, fig(s.cifras?.fallecidos, "fallecidos", true), fig(s.cifras?.heridos, "heridos")),
        s.circulacion ? h("p", {}, h("strong", {}, "Circulación: "), s.circulacion) : "",
        h("div", { class: "focus-actions" },
          h("a", { class: "btn", href }, s.telefonos?.length ? "Última hora, teléfonos y trenes afectados" : "Última hora y trenes afectados")),
        actualizado ? h("p", { class: "small muted" }, `Actualizado: ${stamp(actualizado)}`) : ""));
  }

  function completo(s, actualizado) {
    const sec = (titulo, ...children) => h("section", { class: "card pad", style: "display:grid;gap:10px" }, h("h2", {}, titulo), ...children);
    return h("div", { style: "display:grid;gap:16px" },
      h("article", { class: "incident", id: s.id }, head(s),
        h("div", { class: "incident-body" },
          h("p", { style: "font-size:1.1rem" }, s.resumen),
          h("div", { class: "figures" }, fig(s.cifras?.fallecidos, "fallecidos", true), fig(s.cifras?.heridos, "heridos"), fig(s.cifras?.aBordo, "personas a bordo")),
          s.circulacion && isInc(s) ? h("p", {}, h("strong", {}, "Circulación: "), s.circulacion) : "",
          h("p", { class: "small muted" }, actualizado ? `Actualizado: ${stamp(actualizado)}. ` : "", isInc(s) ? "Información según los medios citados abajo." : "Las cifras son provisionales y pueden cambiar.")),
      ),
      s.telefonos?.length ? sec("Teléfonos para familiares y afectados",
        h("div", { class: "kpis" }, s.telefonos.map((t) => h("div", { class: "card kpi" },
          h("b", {}, h("a", { href: `tel:${t.numero.replace(/\s/g, "")}`, style: "color:inherit;text-decoration:none" }, t.numero)), h("span", {}, t.nombre)))),
        s.atencion ? h("p", {}, s.atencion) : "") : "",
      (s.circulacion && !isInc(s)) || s.billetes ? sec("Trenes afectados y billetes",
        s.circulacion ? h("p", {}, s.circulacion) : "", s.billetes ? h("p", {}, s.billetes) : "") : "",
      s.causas ? sec("Qué se sabe de las causas", h("p", {}, s.causas)) : "",
      s.historial?.length ? sec("Evolución de las cifras",
        h("ol", { class: "timeline" }, s.historial.map((e) => h("li", {}, h("span", {}, h("strong", {}, `${e.cuando}: `), e.texto, e.fuente ? h("span", { class: "muted" }, ` (${e.fuente})`) : ""))))) : "",
      s.enlaces?.length ? sec("Fuentes", h("ul", { class: "sources", style: "list-style:none;padding:0;margin:0" },
        s.enlaces.map(link).map((e) => h("li", {}, h("a", { href: e.url, target: "_blank", rel: "noopener" }, e.nombre))))) : "");
  }

  // Gravedad: primero los accidentes con víctimas (más fallecidos y heridos, más arriba),
  // después las incidencias en curso, y a igualdad, la más reciente.
  const val = (c) => (c && c.valor > 0 ? c.valor : 0);
  const peso = (s) => (isInc(s) ? 0 : 1e6 + val(s.cifras?.fallecidos) * 1000 + val(s.cifras?.heridos) * 10) + (s.activo ? 1e9 : 0);
  const porGravedad = (a, b) => peso(b) - peso(a) || new Date(b.inicio) - new Date(a.inicio);

  function render(data) {
    const everything = [...(data.sucesos || [])].sort(porGravedad);
    const all = everything.filter((s) => !isInc(s));
    const incs = everything.filter(isInc);
    if (modo === "completo") {
      const s = everything.find((x) => x.id === box.dataset.id);
      if (s) box.replaceChildren(completo(s, data.actualizado));
      return;
    }
    if (modo === "lista") {
      const activos = all.filter((s) => s.activo);
      const recientes = all.filter((s) => !s.activo && Date.now() - new Date(s.inicio) < 30 * 86400_000);
      box.replaceChildren(
        activos.length ? h("div", { style: "display:grid;gap:16px" }, activos.map((s) => resumen(s, data.actualizado)))
          : h("div", { class: "empty" }, "Ahora mismo no hay ningún accidente ferroviario grave en curso en España."),
        recientes.length ? h("h2", { style: "margin-top:24px" }, "Últimos 30 días") : "",
        ...recientes.map((s) => resumen(s, null)));
      return;
    }
    if (modo === "incidencias") {
      const activas = incs.filter((s) => s.activo);
      const recientes = incs.filter((s) => !s.activo && Date.now() - new Date(s.inicio) < 7 * 86400_000);
      box.replaceChildren(
        activas.length ? h("div", { class: "alerts" }, activas.map(incidencia))
          : h("div", { class: "empty" }, "Ahora mismo no hay ninguna incidencia importante en la red ferroviaria."),
        recientes.length ? h("h2", { style: "margin-top:24px" }, "Últimos 7 días") : "",
        recientes.length ? h("div", { class: "alerts" }, recientes.map(incidencia)) : "");
      return;
    }
    // Portada: accidentes en curso y, debajo, incidencias en curso. Si no hay nada, no se muestra.
    const accs = all.filter((x) => x.activo);
    const activas = incs.filter((x) => x.activo);
    if (!accs.length && !activas.length) { if (wrap) wrap.hidden = true; return; }
    box.replaceChildren(
      ...accs.map((s) => resumen(s, data.actualizado)),
      activas.length ? h("div", { class: "section-head", style: accs.length ? "margin-top:8px" : "" },
        h("h2", {}, "Incidencias ahora"), h("a", { class: "more", href: "/incidencias" }, "Todas las incidencias")) : "",
      activas.length ? h("div", { class: "alerts" }, activas.slice(0, 3).map(incidencia)) : "");
    if (wrap) wrap.hidden = false;
  }

  async function load() {
    for (const url of ["/api/sucesos", "/data/sucesos.json"]) {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) { render(await r.json()); return; }
      } catch (e) { /* siguiente fuente */ }
    }
  }
  load();
  setInterval(() => { if (!document.hidden) load(); }, 60000);
})();
