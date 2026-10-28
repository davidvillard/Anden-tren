"use strict";
// Suceso en curso: se lee de /data/sucesos.json y se refresca cada minuto.
// Cuando exista la actualización automática, solo cambiará la URL de origen.
(function () {
  const { h, fmtDate } = window.Anden;
  const wrap = document.getElementById("suceso-wrap");
  const box = document.getElementById("suceso");
  if (!wrap || !box) return;
  const SOURCE = "/data/sucesos.json";

  const fig = (c, label, crit) => c ? h("div", { class: `figure${crit ? " crit" : ""}` },
    h("b", {}, `${c.prefijo ? c.prefijo + " " : ""}${c.valor.toLocaleString("es-ES")}`),
    h("span", {}, label + (c.nota ? `, ${c.nota}` : ""))) : "";

  function render(data) {
    const s = (data.sucesos || []).find((x) => x.activo);
    if (!s) { wrap.hidden = true; return; }
    const hora = new Date(s.inicio).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
    const upd = data.actualizado ? new Date(data.actualizado) : null;
    box.replaceChildren(h("article", { class: "incident", "aria-labelledby": "suceso-titulo" },
      h("div", { class: "incident-top" },
        h("span", {}, "● Suceso en curso"),
        s.estado === "provisional" ? h("span", {}, "Cifras provisionales") : "",
        h("span", {}, `${fmtDate(s.inicio)} · ${hora}`)),
      h("div", { class: "incident-body" },
        h("h2", { id: "suceso-titulo" }, s.titulo),
        h("p", {}, s.resumen),
        h("div", { class: "figures" },
          fig(s.cifras.fallecidos, "fallecidos", true),
          fig(s.cifras.heridos, "heridos"),
          fig(s.cifras.aBordo, "personas a bordo")),
        s.circulacion ? h("p", {}, h("strong", {}, "Circulación: "), s.circulacion) : "",
        s.historial?.length ? h("div", {},
          h("h3", { style: "margin-bottom:6px" }, "Cómo han cambiado las cifras"),
          h("ol", { class: "timeline" }, s.historial.map((e) => h("li", {}, h("span", {}, h("strong", {}, e.cuando + ": "), e.texto, h("span", { class: "muted" }, ` (${e.fuente})`)))))) : "",
        h("div", { class: "meta-line" },
          h("span", {}, `Fuente: ${s.fuente}`),
          upd ? h("span", {}, `Revisado: ${upd.toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" })}`) : ""),
        h("div", { class: "meta-line" }, h("span", {}, "Más información:"),
          s.enlaces.map(([n, u]) => h("a", { href: u, target: "_blank", rel: "noopener" }, n))))
    ));
    wrap.hidden = false;
  }

  async function load() {
    try {
      const r = await fetch(SOURCE, { cache: "no-store" });
      if (r.ok) render(await r.json());
    } catch (e) { /* se mantiene lo último mostrado */ }
  }
  load();
  setInterval(() => { if (!document.hidden) load(); }, 60000);
})();
