"use strict";
(function () {
  const { h, norm, css, fmtDate, makeMap } = window.Anden;
  const STATUS = {
    open: { t: "Investigación abierta", c: "--crit", tag: "crit" },
    final: { t: "Informe final", c: "--ok", tag: "ok" },
    pre: { t: "Antes de la CIAF", c: "--muted", tag: "none" },
  };
  const SERVICES = ["Alta velocidad", "Larga distancia", "Internacional / Media distancia", "Cercanías"];
  const st = { data: [], service: new Set(), status: new Set(), sort: "date", sel: null, q: "" };
  const radius = (f) => 7 + Math.sqrt(f) * 2;
  const visible = (d) => (!st.service.size || st.service.has(d.service)) && (!st.status.size || st.status.has(d.status)) && (!st.q || norm(`${d.place} ${d.prov}`).includes(norm(st.q)));
  const toggle = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));

  const map = makeMap("acc-map");
  const markers = {};

  function chips() {
    const mk = (box, label, set, val) => {
      const b = h("button", { class: "chip", type: "button", "aria-pressed": "false" }, label);
      b.onclick = () => { toggle(set, val); b.setAttribute("aria-pressed", set.has(val)); render(); };
      box.append(b);
    };
    SERVICES.forEach((s) => mk(document.getElementById("f-service"), s, st.service, s));
    Object.entries(STATUS).forEach(([k, v]) => mk(document.getElementById("f-status"), v.t, st.status, k));
    const sd = document.getElementById("sort-date"), sf = document.getElementById("sort-fat");
    sd.onclick = () => { st.sort = "date"; sd.setAttribute("aria-pressed", "true"); sf.setAttribute("aria-pressed", "false"); render(); };
    sf.onclick = () => { st.sort = "fat"; sf.setAttribute("aria-pressed", "true"); sd.setAttribute("aria-pressed", "false"); render(); };
    document.getElementById("acc-q").oninput = (e) => { st.q = e.target.value; render(); };
  }

  function drawMarkers() {
    for (const d of [...st.data].sort((a, b) => b.fat - a.fat)) {
      markers[d.id] = L.circleMarker([d.lat, d.lon], { radius: radius(d.fat), weight: 2, fillOpacity: 0.85 })
        .bindTooltip(`${d.place} · ${fmtDate(d.date)} · ${window.Anden.t("{n} fallecidos", { n: d.fatTxt })}`)
        .on("click", () => select(d.id, true))
        .addTo(map);
    }
    paintMarkers();
  }
  function paintMarkers() {
    for (const d of st.data) {
      const on = visible(d), sel = st.sel === d.id;
      markers[d.id]?.setStyle({ fillColor: css(STATUS[d.status].c), color: sel ? css("--ink") : css("--surface"), weight: sel ? 4 : 2, fillOpacity: on ? 0.85 : 0.1, opacity: on ? 1 : 0.2, dashArray: d.provisional ? "4 4" : null });
    }
  }

  function render() {
    const rows = st.data.filter(visible).sort((a, b) => (st.sort === "date" ? b.date.localeCompare(a.date) : b.fat - a.fat));
    const tot = rows.reduce((s, d) => s + d.fat, 0);
    document.getElementById("summary").textContent = window.Anden.t(`${rows.length} accidentes · ${rows.some((d) => d.provisional) ? "al menos " : ""}${tot} fallecidos`);
    const list = document.getElementById("list");
    if (!rows.length) { list.replaceChildren(h("div", { class: "empty" }, "Ningún accidente coincide. Quita algún filtro para ver más.")); paintMarkers(); return; }
    list.replaceChildren(...rows.map((d) => {
      const s = STATUS[d.status];
      const el = h("article", { class: `card acc${st.sel === d.id ? " sel" : ""}`, id: d.id, tabindex: "0", "aria-expanded": st.sel === d.id ? "true" : "false" },
        h("div", { class: "acc-top" },
          h("div", {}, h("h3", {}, d.place), h("p", { class: "small muted" }, `${d.prov} · ${fmtDate(d.date)}${d.time ? " · " + d.time : ""}`)),
          h("span", { class: `tag ${d.provisional ? "crit" : s.tag}` }, d.provisional ? "Provisional" : s.t)),
        h("p", { class: "small" }, `${window.Anden.t(d.type)} · ${window.Anden.t(d.service)}`),
        h("div", { class: "acc-nums" },
          h("div", {}, h("b", { class: "crit" }, d.fatTxt), "fallecidos"),
          h("div", {}, h("b", {}, d.inj), `heridos${d.injNote ? " · " + d.injNote : ""}`)),
        h("dl", { class: "acc-detail" },
          h("dt", {}, "Trenes"), h("dd", {}, d.trains),
          h("dt", {}, "Qué pasó"), h("dd", {}, d.summary),
          h("dt", {}, "Causa e investigación"), h("dd", {}, d.cause),
          h("dt", {}, "Fuentes"), h("dd", { class: "sources" }, d.src.map(([n, u]) => h("a", { href: u, target: "_blank", rel: "noopener" }, n)))),
        d.pagina ? h("p", {}, h("a", { class: "btn ghost", href: d.pagina }, "Última hora de este accidente")) : "",
        h("button", { class: "link-btn more-btn", type: "button", "aria-expanded": st.sel === d.id ? "true" : "false" }, st.sel === d.id ? "Ocultar detalles" : "Ver detalles"));
      el.addEventListener("click", (e) => { if (!e.target.closest("a")) select(d.id, false); });
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(d.id, false); } });
      return el;
    }));
    paintMarkers();
  }

  function select(id, fromMap) {
    st.sel = st.sel === id && !fromMap ? null : id;
    const d = st.data.find((x) => x.id === id);
    if (d && !visible(d)) { st.service.clear(); st.status.clear(); st.q = ""; document.getElementById("acc-q").value = ""; document.querySelectorAll("#f-service .chip,#f-status .chip").forEach((b) => b.setAttribute("aria-pressed", "false")); }
    render();
    if (st.sel && d) {
      map.setView([d.lat, d.lon], Math.max(map.getZoom(), 7));
      history.replaceState(null, "", `#${id}`);
      if (fromMap) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  window.addEventListener("anden:prefs", paintMarkers);
  chips();
  // Los accidentes que siguen abiertos toman los fallecidos del último balance oficial
  // (el mismo dato que su página de última hora) y enlazan a esa página.
  const sucesos = () => fetch("/api/sucesos", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject()))
    .catch(() => fetch("/data/sucesos.json").then((r) => r.json())).catch(() => ({ sucesos: [] }));
  Promise.all([fetch("/data/accidentes.json").then((r) => r.json()), sucesos()]).then(([j, live]) => {
    for (const d of j.accidentes) {
      const s = (live.sucesos || []).find((x) => x.accidenteId === d.id);
      if (!s) continue;
      d.pagina = s.pagina || `/accidente-tren/${s.id}`;
      const f = s.cifras?.fallecidos;
      if (f && f.valor > 0) { d.fat = f.valor; d.fatTxt = `${f.prefijo === "≥" ? "≥ " : ""}${f.valor}`; }
    }
    st.data = j.accidentes;
    drawMarkers();
    const hash = location.hash.slice(1);
    if (hash && st.data.some((d) => d.id === hash)) { select(hash, true); document.getElementById(hash)?.scrollIntoView({ block: "center" }); }
    else render();
  }).catch(() => {
    document.getElementById("list").replaceChildren(h("div", { class: "empty" }, "No se ha podido cargar el registro. Recarga la página."));
  });
})();
