"use strict";
// Página /historico: ranking de líneas (barras) y evolución diaria (línea) a partir de /api/historico.
// Un solo color para los datos (el azul de Andén); textos en tinta neutra; tabla equivalente.
(function () {
  const { h } = window.Anden;
  const $ = (id) => document.getElementById(id);
  const SVG = "http://www.w3.org/2000/svg";
  const s = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); kids.forEach((k) => el.append(k)); return el; };
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const num = (v, d = 1) => (v === null || v === undefined ? "—" : Number(v).toLocaleString((window.ANDEN_LOCALE || "es-ES"), { maximumFractionDigits: d, minimumFractionDigits: d }));
  let redes = [], filas = [], dias = 7;

  // Tooltip compartido
  const tip = h("div", { class: "chart-tip", role: "status", hidden: true });
  document.body.append(tip);
  const showTip = (e, html) => { tip.innerHTML = html.split("<br>").map((x) => x.replace(/^(<b>[^<]*<\/b>)?(.*)$/, (m, b, r) => (b || "") + window.Anden.t(r))).join("<br>"); tip.hidden = false; const r = tip.getBoundingClientRect(); tip.style.left = `${Math.min(innerWidth - r.width - 8, Math.max(8, e.clientX - r.width / 2))}px`; tip.style.top = `${e.clientY - r.height - 14 + scrollY}px`; };
  const hideTip = () => { tip.hidden = true; };

  const redNombre = (slug) => (slug === "larga-distancia" ? "Larga distancia" : redes.find((r) => r.slug === slug)?.corto || slug);
  const lineaNombre = (f) => (f.red === "larga-distancia" ? { AV: "Alta velocidad", LD: "Larga distancia", MD: "Media distancia" }[f.linea] || f.linea : `${f.linea} · ${redNombre(f.red)}`);

  // Agrega varias filas diarias ponderando por muestras y trenes
  function agrega(rows) {
    let w = 0, pct = 0, ret = 0, wr = 0, n = 0;
    for (const f of rows) {
      const peso = (f.muestras || 1) * (f.trenes_medio || 1);
      if (f.pct_tarde !== null) { pct += f.pct_tarde * peso; w += peso; }
      if (f.retraso_medio !== null) { ret += f.retraso_medio * peso; wr += peso; }
      n += f.muestras || 0;
    }
    return { pct: w ? pct / w : null, ret: wr ? ret / wr : null, muestras: n };
  }

  function ranking() {
    const red = $("red").value;
    const grupos = new Map();
    for (const f of filas) {
      if (red ? f.red !== red : f.red === "larga-distancia") continue;
      const k = `${f.red}|${f.linea}`;
      (grupos.get(k) || grupos.set(k, []).get(k)).push(f);
    }
    // Solo líneas con datos suficientes (al menos 3 h de fotos en el periodo)
    const items = [...grupos.values()].map((rows) => ({ f: rows[0], ...agrega(rows) })).filter((x) => x.muestras >= 12 && x.pct !== null)
      .sort((a, b) => b.pct - a.pct).slice(0, 10);
    const box = $("ranking");
    if (!items.length) { box.replaceChildren(h("div", { class: "empty" }, "Todavía no hay datos suficientes para este periodo.")); return []; }
    const W = Math.max(300, box.clientWidth), ROW = 34, LABEL = Math.min(170, W * 0.38), PAD = 52, H = items.length * ROW + 8;
    const max = Math.max(...items.map((x) => x.pct), 10);
    const bw = (v) => Math.max(2, ((W - LABEL - PAD) * v) / max);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H });
    items.forEach((x, i) => {
      const y = i * ROW + 6;
      const g = s("g", { class: "bar-row", tabindex: "0" });
      const label = lineaNombre(x.f);
      g.append(
        s("text", { x: LABEL - 10, y: y + 16, "text-anchor": "end", class: "lbl" }, label),
        s("rect", { x: LABEL, y: y + 2, width: bw(x.pct), height: 20, rx: 4, fill: css("--accent") }),
        s("text", { x: LABEL + bw(x.pct) + 8, y: y + 16, class: "val" }, `${num(x.pct)} %`),
        s("rect", { x: 0, y, width: W, height: ROW, fill: "transparent" }));
      const html = `<b>${label}</b><br>${num(x.pct)} % de trenes con retraso<br>Retraso medio: ${num(x.ret)} min`;
      g.addEventListener("mousemove", (e) => showTip(e, html)); g.addEventListener("mouseleave", hideTip);
      g.addEventListener("focus", () => { const r = g.getBoundingClientRect(); showTip({ clientX: r.left + LABEL + 40, clientY: r.top }, html); }); g.addEventListener("blur", hideTip);
      svg.append(g);
    });
    box.replaceChildren(svg);
    $("rk-sub").textContent = window.Anden.t(red === "larga-distancia" ? "% de trenes con 5 minutos o más de retraso en el periodo." : "% de trenes con 3 minutos o más de retraso en el periodo.");
    return items;
  }

  function evolucion() {
    const red = $("red").value;
    const porDia = new Map();
    for (const f of filas) { if (red ? f.red !== red : f.red === "larga-distancia") continue; (porDia.get(f.dia) || porDia.set(f.dia, []).get(f.dia)).push(f); }
    const pts = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, rows]) => ({ dia, ...agrega(rows) })).filter((p) => p.ret !== null);
    const box = $("evolucion");
    $("ev-sub").textContent = window.Anden.t(`Retraso medio de los trenes${red ? ` de ${redNombre(red)}` : " de Cercanías"}, en minutos.`);
    if (pts.length < 2) { box.replaceChildren(h("div", { class: "empty" }, "Hacen falta al menos dos días de datos para ver la evolución.")); return pts; }
    const W = Math.max(300, box.clientWidth), H = 220, L = 40, R = 12, T = 12, B = 28;
    const maxY = Math.max(1, Math.ceil(Math.max(...pts.map((p) => p.ret)) * 1.15));
    const x = (i) => L + ((W - L - R) * i) / (pts.length - 1), y = (v) => T + (H - T - B) * (1 - v / maxY);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H });
    for (let k = 0; k <= 3; k++) { const v = (maxY * k) / 3; svg.append(s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "grid" }), s("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "axis" }, num(v, 0))); }
    const fecha = (d) => new Date(`${d}T12:00:00`).toLocaleDateString((window.ANDEN_LOCALE || "es-ES"), { day: "numeric", month: "short" });
    [0, Math.floor((pts.length - 1) / 2), pts.length - 1].forEach((i) => svg.append(s("text", { x: x(i), y: H - 8, "text-anchor": i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle", class: "axis" }, fecha(pts[i].dia))));
    svg.append(s("path", { d: pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.ret)}`).join(""), fill: "none", stroke: css("--accent"), "stroke-width": 2, "stroke-linejoin": "round" }));
    const cross = s("line", { y1: T, y2: H - B, class: "cross", visibility: "hidden" });
    const dot = s("circle", { r: 5, fill: css("--accent"), stroke: css("--surface"), "stroke-width": 2, visibility: "hidden" });
    const hit = s("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "transparent" });
    svg.append(cross, dot, hit);
    hit.addEventListener("mousemove", (e) => {
      const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(pts.length - 1, Math.round(((px - L) / (W - L - R)) * (pts.length - 1)))), p = pts[i];
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(p.ret)); dot.setAttribute("visibility", "visible");
      showTip(e, `<b>${fecha(p.dia)}</b><br>Retraso medio: ${num(p.ret)} min<br>${num(p.pct)} % con retraso`);
    });
    hit.addEventListener("mouseleave", () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); hideTip(); });
    box.replaceChildren(svg);
    return pts;
  }

  function tabla(items, pts) {
    $("tabla").replaceChildren(
      h("h3", {}, "Ranking"), h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Línea"), h("th", {}, "% con retraso"), h("th", {}, "Retraso medio"))),
        h("tbody", {}, items.map((x) => h("tr", {}, h("td", {}, lineaNombre(x.f)), h("td", { class: "num" }, `${num(x.pct)} %`), h("td", { class: "num" }, `${num(x.ret)} min`)))))),
      h("h3", { style: "margin-top:12px" }, "Día a día"), h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Día"), h("th", {}, "Retraso medio"), h("th", {}, "% con retraso"))),
        h("tbody", {}, pts.map((p) => h("tr", {}, h("td", {}, p.dia), h("td", { class: "num" }, `${num(p.ret)} min`), h("td", { class: "num" }, `${num(p.pct)} %`)))))));
  }

  const pintar = () => { const it = ranking(), pts = evolucion(); tabla(it, pts); };

  async function cargar() {
    $("estado").textContent = window.Anden.t("Cargando…");
    const red = $("red").value;
    $("dl-csv").href = `/api/historico?formato=csv&dias=${dias}${red ? `&red=${red}` : ""}`;
    $("dl-json").href = `/api/historico?dias=${dias}${red ? `&red=${red}` : ""}`;
    try {
      const r = await fetch(`/api/historico?dias=${dias}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      filas = j.filas || [];
      const d = new Set(filas.map((f) => f.dia)).size;
      $("estado").textContent = d ? window.Anden.t(`${d} ${d === 1 ? "día" : "días"} con datos.`) : "";
      pintar();
    } catch (e) {
      $("estado").textContent = "";
      for (const id of ["ranking", "evolucion"]) $(id).replaceChildren(h("div", { class: "empty" }, "El histórico se está empezando a guardar. Vuelve en unos días para ver los primeros rankings."));
    }
  }

  fetch("/data/redes.json").then((r) => r.json()).then((j) => {
    redes = j.redes;
    $("red").append(...redes.map((r) => h("option", { value: r.slug }, r.nombre)), h("option", { value: "larga-distancia" }, "Alta velocidad, larga y media distancia"));
    const p = new URLSearchParams(location.search);
    if (p.get("red")) $("red").value = p.get("red");
    if (["7", "30", "90"].includes(p.get("dias"))) dias = Number(p.get("dias"));
    $("periodo").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.dias) === dias)));
    cargar();
  });
  $("periodo").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; dias = Number(b.dataset.dias); $("periodo").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); cargar(); });
  $("red").addEventListener("change", () => { history.replaceState(null, "", `?red=${$("red").value}&dias=${dias}`); cargar(); });
  addEventListener("resize", () => filas.length && pintar());
})();
