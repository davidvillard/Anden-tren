"use strict";
// Página de un corredor de alta velocidad (/alta-velocidad/<slug>): trenes de hoy según el horario
// oficial, con su estado en directo, cifras del corredor e incidencias en curso.
(function () {
  const A = window.AndenLive, { h } = window.Anden, C = window.ANDEN_CORREDOR;
  if (!A || !C) return;
  const nums = new Set(C.nums);
  const reA = new RegExp(C.ra, "i"), reB = new RegExp(C.rb, "i");
  let H = null, sucesos = [];
  const $ = (id) => document.getElementById(id);
  const madridHoy = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const ahoraMin = () => { const [a, b] = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).split(":"); return Number(a) * 60 + Number(b); };
  const min = (t) => { const [a, b] = t.split(":"); return Number(a) * 60 + Number(b); };
  const ciudad = (n) => n.split(/[-/]/)[0].replace(/ (Delicias|Santa Justa|Sants|Atocha|Chamartín|María Zambrano|Abando|Campo Grande|Estació del Nord)$/, "").trim();

  // Trenes del corredor que circulan hoy, con la variante de hoy
  function deHoy() {
    if (!H) return [];
    const idx = Math.round((new Date(`${madridHoy()}T00:00:00Z`) - new Date(`${H.desde}T00:00:00Z`)) / 86400_000);
    const out = [];
    for (const num of nums) {
      const v = H.trenes[num]?.v.find((x) => x.d[idx] === "1");
      if (v) out.push({ num, tipo: H.trenes[num].tipo, v });
    }
    return out.sort((a, b) => a.v.p[0][2].localeCompare(b.v.p[0][2]));
  }

  function paint() {
    const hoy = deHoy();
    const vivos = new Map(A.ldTrains().filter((t) => nums.has(t.num)).map((t) => [t.num, t]));
    const cancel = new Set(A.ldCancelled().filter((c) => c.fecha === madridHoy() && nums.has(c.num)).map((c) => c.num));
    const conDato = [...vivos.values()].filter((t) => t.delayMin !== null && t.delayMin !== undefined);
    const tarde = conDato.filter((t) => t.delayMin >= 5);
    $("kpis").replaceChildren(
      A.kpi(hoy.length, hoy.length === 1 ? "tren de Renfe hoy" : "trenes de Renfe hoy"),
      A.kpi(vivos.size, vivos.size === 1 ? "en marcha ahora" : "en marcha ahora"),
      A.kpi(conDato.length ? tarde.length : "—", "con 5 min o más de retraso"),
      A.kpi(cancel.size, cancel.size === 1 ? "cancelado hoy" : "cancelados hoy"));

    const now = ahoraMin();
    const estado = (x) => {
      if (cancel.has(x.num)) return h("span", { class: "tag crit" }, "Cancelado");
      const t = vivos.get(x.num);
      if (t) { const d = A.delayInfo(t.delayMin); return h("span", { class: `tag ${d.cls}` }, t.delayMin > 0 ? `En marcha · +${t.delayMin} min` : "En marcha · en hora"); }
      const sale = min(x.v.p[0][2]); let llega = min(x.v.p[x.v.p.length - 1][1]); if (llega < sale) llega += 1440;
      if (now < sale) return h("span", { class: "tag info" }, "Programado");
      if (now > llega + 30) return h("span", { class: "tag none" }, "Ya llegó");
      return h("span", { class: "tag none" }, "Sin posición");
    };
    if (H) $("hoy-corredor").replaceChildren(hoy.length
      ? h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", {}, "Tren"), h("th", {}, "Sale"), h("th", {}, "Llega"), h("th", {}, "Estado"))),
        h("tbody", {}, hoy.map((x) => h("tr", {},
          h("td", {}, h("a", { href: `/horario/${x.num}` }, `${x.tipo} ${x.num}`)),
          h("td", {}, `${ciudad(H.paradas[x.v.p[0][0]])} ${x.v.p[0][2]}`),
          h("td", {}, `${ciudad(H.paradas[x.v.p[x.v.p.length - 1][0]])} ${x.v.p[x.v.p.length - 1][1]}`),
          h("td", {}, estado(x)))))))
      : h("div", { class: "empty" }, "Hoy no hay trenes de Renfe programados en este corredor."));

    // Incidencias en curso que nombran los dos extremos o la línea
    const enLinea = sucesos.filter((s) => s.activo && (() => { const t = `${s.titulo} ${s.resumen} ${s.linea || ""} ${s.circulacion || ""}`; return (reA.test(t) && reB.test(t)) || /alta velocidad|ave|larga distancia/i.test(`${s.servicio} ${s.linea || ""}`) && (reA.test(t) || reB.test(t)); })());
    $("incidencias-corredor").replaceChildren(...(enLinea.length ? [h("div", { class: "section-head", style: "margin-top:8px" }, h("h2", {}, "Incidencias en la línea")),
      ...enLinea.map((s) => h("article", { class: `incident${s.clase === "incidencia" ? " inc" : ""}` }, h("div", { class: "incident-body" },
        h("h3", {}, h("a", { href: s.pagina || (s.clase === "incidencia" ? `/incidencia/${s.id}` : `/accidente-tren/${s.id}`) }, s.titulo)),
        h("p", {}, s.circulacion || s.resumen))))] : []));
  }

  fetch("/data/horarios-ld.json").then((r) => r.json()).then((j) => { H = j; paint(); }).catch(() => {});
  (async () => {
    for (const url of ["/api/sucesos", "/data/sucesos.json"]) {
      try { const r = await fetch(url); if (r.ok) { sucesos = (await r.json()).sucesos || []; paint(); return; } } catch (e) {}
    }
  })();
  A.onUpdate(paint);
  A.start();
})();
