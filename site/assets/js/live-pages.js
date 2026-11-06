"use strict";
// Páginas en directo. Cada página declara <body data-page="..."> y aquí se pinta.
(function () {
  const { h, fmtTime, mapsOff, makeMap } = window.Anden;
  const A = window.AndenLive;
  const $ = (id) => document.getElementById(id);
  const page = document.body.dataset.page;
  const params = new URLSearchParams(location.search);

  A.attachSearch($("search-form"));

  // Mapa + lista con interruptor (respeta "Ver lista" del modo accesible)
  function mapAndList({ mapId, listId, getTrains, bounds }) {
    const mapEl = $(mapId), listEl = $(listId);
    const viewMap = $("view-map"), viewList = $("view-list");
    let map = null, layer = null, limit = 40;
    const mapWrap = mapEl?.closest(".mapbox"), listWrap = listEl?.closest("[data-list]");
    function ensureMap() {
      if (map || !mapEl) return;
      map = makeMap(mapId, bounds && bounds());
      layer = A.trainLayer(map);
    }
    function setView(v) {
      viewMap?.setAttribute("aria-pressed", String(v === "map"));
      viewList?.setAttribute("aria-pressed", String(v === "list"));
      if (mapWrap) mapWrap.hidden = v !== "map";
      if (listWrap) listWrap.hidden = v !== "list";
      if (v === "map") { ensureMap(); setTimeout(() => map.invalidateSize(), 30); }
      draw();
    }
    function draw() {
      const list = getTrains();
      if (map && !mapWrap?.hidden) layer.update(list);
      if (listEl && !listWrap?.hidden) {
        const rows = [...list].sort((a, b) => (b.delayMin ?? -99) - (a.delayMin ?? -99));
        if (!rows.length) { listEl.replaceChildren(h("div", { class: "empty" }, A.S.live ? "No hay trenes que mostrar ahora mismo." : "Cargando trenes…")); return; }
        const items = rows.slice(0, limit).map(A.trainRow);
        if (rows.length > limit) items.push(h("button", { class: "btn ghost", type: "button", onclick: () => { limit += 40; draw(); } }, `Mostrar más (${rows.length - limit})`));
        listEl.replaceChildren(...items);
      }
    }
    viewMap?.addEventListener("click", () => setView("map"));
    viewList?.addEventListener("click", () => setView("list"));
    window.addEventListener("anden:prefs", () => setView(mapsOff() ? "list" : "map"));
    setView(mapsOff() || !mapEl ? "list" : "map");
    return { draw, fit: (b) => map && b && map.fitBounds(b), get map() { return map; } };
  }

  function linesTable(el, list, { compact = false } = {}) {
    if (!el) return;
    if (!list.length) { el.replaceChildren(h("div", { class: "empty" }, A.S.live ? "No hay líneas con trenes circulando ahora mismo." : "Cargando líneas…")); return; }
    const rows = [...list].sort((a, b) => (b.pctLate ?? -1) - (a.pctLate ?? -1) || b.trains.length - a.trains.length);
    if (compact) { el.replaceChildren(...rows.slice(0, 5).map((o) => { const s = A.lineStatus(o); return h("a", { class: "row", href: A.lineUrl(o.key) }, A.lineBadge(o.code), h("span", { class: "grow" }, h("strong", {}, `Línea ${A.lineName(o.key)}`), h("span", {}, `${o.trains.length} ${o.trains.length === 1 ? "tren" : "trenes"} · retraso medio ${A.fmtMin(o.avg)}`)), h("span", { class: `tag ${s.cls}` }, s.text)); })); return; }
    el.replaceChildren(h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, ["Línea", "Trenes", "Con retraso", "Retraso medio", "Avisos", "Estado"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", {}, rows.map((o) => { const s = A.lineStatus(o); return h("tr", {},
        h("td", {}, h("a", { href: A.lineUrl(o.key) }, A.lineBadge(o.code), " ", A.lineName(o.key))),
        h("td", { class: "num" }, o.trains.length),
        h("td", { class: "num" }, A.fmtPct(o.pctLate)),
        h("td", { class: "num" }, A.fmtMin(o.avg)),
        h("td", { class: "num" }, o.alerts ? h("a", { href: A.lineUrl(o.key) + "#avisos" }, o.alerts) : "0"),
        h("td", {}, h("span", { class: `tag ${s.cls}` }, s.text))); })))));
  }

  function alertsList(el, list, max, moreHref) {
    if (!el) return;
    if (!A.S.live) { el.replaceChildren(h("div", { class: "empty" }, "Cargando avisos…")); return; }
    if (!list.length) { el.replaceChildren(h("div", { class: "empty" }, "Renfe no tiene avisos activos aquí ahora mismo.")); return; }
    const shown = max ? list.slice(0, max) : list;
    el.replaceChildren(...shown.map(A.alertCard), ...(max && list.length > max && moreHref ? [h("a", { class: "more", href: moreHref }, `Ver los ${list.length} avisos`)] : []));
  }

  function kpis(el, s, links = true) {
    if (!el) return;
    el.replaceChildren(
      A.kpi(s.trains.toLocaleString("es-ES"), s.trains === 1 ? "tren circulando" : "trenes circulando", links && "/mapa-trenes"),
      A.kpi(A.fmtPct(s.pctLate), "van con 3 min o más de retraso", links && "/retrasos"),
      A.kpi(A.fmtMin(s.avg), "de retraso medio", links && "/retrasos"),
      A.kpi(s.alerts.toLocaleString("es-ES"), "avisos de Renfe", links && "/avisos"),
      ...(s.ldCancelled && !A.S.scope ? [A.kpi(s.ldCancelled.toLocaleString("es-ES"), "trenes de alta velocidad y larga distancia cancelados", links && "/retrasos#larga-distancia")] : []));
  }

  const redesChips = (el) => el && el.replaceChildren(...A.S.redes.map((r) => h("a", { class: "chip", href: `/cercanias/${r.slug}` }, r.corto)));
  const bbox = (r) => r && [[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]];

  /* ---------- Páginas ---------- */
  const pages = {
    home() {
      A.onUpdate(() => {
        kpis($("kpis"), A.summary());
        linesTable($("top-lines"), A.lines(), { compact: true });
        alertsList($("alerts"), A.alerts(), 3, "/avisos");
        redesChips($("redes"));
      });
    },
    trenes() {
      const red = params.get("red");
      const sel = $("red-filter");
      // Filtro por tipo de tren: Cercanías, media distancia, larga distancia y alta velocidad
      const on = new Set(Object.keys(A.GRUPOS));
      const tipos = $("type-filter");
      const enRed = (t, r) => !r || (t.lat >= r.bbox[0] && t.lat <= r.bbox[2] && t.lon >= r.bbox[1] && t.lon <= r.bbox[3]);
      const visibles = () => {
        const r = A.redBySlug(sel.value);
        return [...(on.has("cerc") ? A.trains(sel.value || null) : []), ...A.ldTrains().filter((t) => on.has(t.grupo) && enRed(t, r))];
      };
      const ml = mapAndList({ mapId: "map", listId: "train-list", getTrains: visibles, bounds: () => bbox(A.redBySlug(red)) });
      const chips = Object.entries(A.GRUPOS).map(([g, label]) => {
        const b = h("button", { type: "button", class: "chip", "aria-pressed": "true", "data-grupo": g },
          h("i", { class: "dot", style: g === "cerc" ? "" : `border-color:${A.GRUPO_COLOR[g]}`, "aria-hidden": "true" }), h("span", {}, label));
        b.addEventListener("click", () => { on.has(g) ? on.delete(g) : on.add(g); b.setAttribute("aria-pressed", String(on.has(g))); ml.draw(); });
        return b;
      });
      tipos.replaceChildren(...chips);
      const contar = () => {
        const r = A.redBySlug(sel.value), n = { cerc: A.trains(sel.value || null).length };
        for (const t of A.ldTrains()) if (enRed(t, r)) n[t.grupo] = (n[t.grupo] || 0) + 1;
        for (const b of chips) b.lastChild.textContent = `${A.GRUPOS[b.dataset.grupo]} (${n[b.dataset.grupo] || 0})`;
      };
      sel.addEventListener("change", () => { ml.fit(bbox(A.redBySlug(sel.value)) || [[35.9, -9.4], [43.8, 3.4]]); contar(); ml.draw(); history.replaceState(null, "", sel.value ? `?red=${sel.value}` : location.pathname); });
      let filled = false;
      A.onUpdate(() => {
        if (!filled && A.S.redes.length) { sel.append(...A.S.redes.map((r) => h("option", { value: r.slug }, r.nombre))); sel.value = red || ""; filled = true; if (red) ml.fit(bbox(A.redBySlug(red))); }
        contar();
        ml.draw();
      });
    },
    retrasos() {
      A.onUpdate(() => {
        kpis($("kpis"), A.summary(), false);
        linesTable($("lines"), A.lines());
        const late = A.trains().filter((t) => t.delayMin >= 3).sort((a, b) => b.delayMin - a.delayMin).slice(0, 15);
        $("late-trains").replaceChildren(...(late.length ? late.map(A.trainRow) : [h("div", { class: "empty" }, A.S.live ? "Ningún tren de Cercanías va con 3 minutos o más de retraso." : "Cargando…")]));
        const s = A.summary();
        const ld = A.ldTrains(), conDato = ld.filter((t) => t.delayMin !== null), tarde = conDato.filter((t) => t.delayMin >= 5);
        const media = conDato.length ? conDato.reduce((a, t) => a + Math.max(0, t.delayMin), 0) / conDato.length : null;
        $("ld").replaceChildren(
          h("p", {}, ld.length
            ? `Ahora circulan ${ld.length} trenes de alta velocidad, larga y media distancia: ${tarde.length} van con 5 minutos o más de retraso y el retraso medio es de ${A.fmtMin(media)}.`
            : A.S.live ? "Renfe no da ahora mismo la posición de los trenes de alta velocidad, larga y media distancia." : "Cargando…"),
          h("p", {}, s.ld
            ? `Renfe informa de ${s.ldCancelled.toLocaleString("es-ES")} ${s.ldCancelled === 1 ? "tren cancelado" : "trenes cancelados"} en este momento.`
            : "Renfe no informa ahora mismo de cancelaciones."),
          ...(tarde.length ? [h("div", { class: "rows" }, tarde.sort((a, b) => b.delayMin - a.delayMin).slice(0, 10).map(A.trainRow))] : []),
          h("a", { class: "more", href: "/mapa-trenes" }, "Ver todos en el mapa"));
      });
    },
    avisos() {
      const sel = $("red-filter"), q = $("alert-q");
      let filled = false;
      const draw = () => {
        let list = A.alerts(sel.value || null);
        const l = params.get("l");
        if (l && sel.value) list = list.filter((a) => A.alertLines(a).includes(A.lineKey(l, sel.value)));
        const t = window.Anden.norm(q.value);
        if (t) list = list.filter((a) => window.Anden.norm(`${a.header} ${a.desc}`).includes(t));
        $("count").textContent = A.S.live ? `${list.length} ${list.length === 1 ? "aviso" : "avisos"}` : "";
        alertsList($("alerts"), list);
        if (location.hash && !draw.jumped) { const el = document.querySelector(location.hash); if (el) { el.scrollIntoView({ block: "center" }); el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); draw.jumped = true; } }
      };
      sel.addEventListener("change", draw); q.addEventListener("input", draw);
      A.onUpdate(() => {
        if (!filled && A.S.redes.length) { sel.append(...A.S.redes.map((r) => h("option", { value: r.slug }, r.nombre))); sel.value = params.get("red") || ""; filled = true; }
        draw();
      });
    },
    linea() {
      // Página propia de la línea (/cercanias/madrid/c5) o ficha genérica (/linea?red=&l=)
      const fixed = window.ANDEN_LINEA;
      const slug = fixed ? fixed.red : params.get("red"), code = (fixed ? fixed.l : params.get("l") || "").toUpperCase(), key = A.lineKey(code, slug);
      const ml = mapAndList({ mapId: "map", listId: "train-list", getTrains: () => A.trains(null).filter((t) => t.line === key) });
      let fitted = false;
      A.onUpdate(() => {
        const r = A.redBySlug(slug);
        if (!fixed) {
          if (r?.lineas?.includes(code)) { location.replace(A.lineUrl(key) + location.hash); return; }
          const name = r ? `${code} · ${r.nombre}` : code;
          document.title = `Línea ${name}: retrasos y avisos en directo · Andén`;
          $("title").textContent = `Línea ${name}`;
          $("crumb-red").replaceChildren(r ? h("a", { href: `/cercanias/${r.slug}` }, r.nombre) : "Cercanías");
        }
        const o = A.lines(null).find((x) => x.key === key);
        const s = A.lineStatus(o);
        $("status").replaceChildren(h("span", { class: `tag ${s.cls}`, style: "font-size:1rem;padding:5px 12px" }, o ? s.text : "No hay trenes de esta línea circulando ahora"));
        $("kpis").replaceChildren(
          A.kpi(o ? o.trains.length : 0, o?.trains.length === 1 ? "tren circulando" : "trenes circulando"),
          A.kpi(o ? o.late : 0, "con 3 min o más de retraso"),
          A.kpi(A.fmtMin(o ? o.avg : null), "de retraso medio"),
          A.kpi(A.alertsOfLine(key).length, "avisos de Renfe"));
        alertsList($("alerts"), A.alertsOfLine(key));
        ml.draw();
        if (!fitted && ml.map && o?.trains.length) { ml.map.fitBounds(L.latLngBounds(o.trains.map((t) => [t.lat, t.lon])).pad(0.3), { maxZoom: 12 }); fitted = true; }
      });
    },
    tren() {
      const id = params.get("id");
      let map = null, marker = null;
      A.onUpdate(() => {
        const t = A.trains(null).find((x) => String(x.id) === id) || A.ldTrains().find((x) => x.id === id);
        if (!t) { $("card").replaceChildren(h("p", {}, A.S.live ? "Este tren ya no aparece en los datos de Renfe. Puede que haya terminado su recorrido." : "Cargando…"), h("a", { class: "more", href: "/mapa-trenes" }, "Ver todos los trenes")); return; }
        const d = A.delayInfo(t.delayMin);
        document.title = `${A.trainTitle(t)}${!t.ld && t.code ? " · " + t.code : ""}: retraso en directo · Andén`;
        $("title").textContent = A.trainTitle(t);
        const la = t.line ? A.alertsOfLine(t.line) : [];
        const hora = (iso) => iso.slice(11, 16);
        $("card").replaceChildren(
          h("div", { class: "focus-head" }, A.lineBadge(t.code), h("h2", {}, t.ld ? (t.origen ? `${t.origen} → ${t.destino}` : t.tipo) : t.line ? `Línea ${A.lineName(t.line, true)}` : "Cercanías")),
          h("p", {}, h("span", { class: `tag ${d.cls}`, style: "font-size:1.05rem;padding:6px 12px" }, d.text)),
          t.ld && t.siguiente ? h("p", {}, `Próxima parada: `, h("strong", {}, t.siguiente), t.llegada ? `, llegada prevista a las ${hora(t.llegada)}` : "", ".") : "",
          h("p", { class: "muted" }, t.ts ? `Última posición recibida a las ${fmtTime(t.ts)}.` : "Renfe no indica la hora de la posición."),
          h("div", { class: "focus-actions" },
            t.line ? h("a", { class: "btn", href: A.lineUrl(t.line) }, "Ver la línea") : "",
            la.length ? h("a", { class: "btn ghost", href: A.lineUrl(t.line) + "#avisos" }, `${la.length} ${la.length === 1 ? "aviso" : "avisos"} en la línea`) : ""));
        if (!mapsOff()) {
          if (!map) { $("map").hidden = false; map = makeMap("map", [[t.lat - 0.05, t.lon - 0.08], [t.lat + 0.05, t.lon + 0.08]]); }
          if (marker) marker.remove();
          marker = L.circleMarker([t.lat, t.lon], { radius: 9, color: "#fff", weight: 2, fillColor: d.color, fillOpacity: 1 }).addTo(map);
        }
      });
    },
    red() {
      const slug = A.S.scope;
      const ml = mapAndList({ mapId: "map", listId: "train-list", getTrains: () => A.trains(slug), bounds: () => bbox(A.redBySlug(slug)) });
      let fitted = false;
      A.onUpdate(() => {
        kpis($("kpis"), A.summary(slug), false);
        linesTable($("lines"), A.lines(slug));
        alertsList($("alerts"), A.alerts(slug), 3, `/avisos?red=${slug}`);
        ml.draw();
        if (!fitted && ml.map && A.redBySlug(slug)) { ml.fit(bbox(A.redBySlug(slug))); fitted = true; }
      });
    },
    tema() {
      const { patron, vacio, ld } = window.ANDEN_TEMA;
      const re = new RegExp(patron, "i");
      A.onUpdate(() => {
        if (!A.S.live) return; // se queda la lista escrita al publicar la página
        const list = A.alerts(null).filter((a) => re.test(window.Anden.norm(`${a.header} ${a.desc}`)));
        $("count").textContent = `${list.length} ${list.length === 1 ? "aviso" : "avisos"} ahora`;
        if (list.length) alertsList($("alerts"), list); else $("alerts").replaceChildren(h("div", { class: "empty" }, vacio));
        if (ld) {
          const s = A.summary(null);
          $("kpis").replaceChildren(
            A.kpi(s.ldCancelled.toLocaleString("es-ES"), "trenes de alta velocidad y larga distancia cancelados", "/retrasos#larga-distancia"),
            A.kpi(list.length.toLocaleString("es-ES"), "avisos de huelga de Renfe"),
            A.kpi(A.fmtPct(s.pctLate), "de los Cercanías van con retraso", "/retrasos"));
        }
      });
    },
    cercanias() {
      A.onUpdate(() => {
        $("redes-list").replaceChildren(...A.S.redes.map((r) => {
          const s = A.summary(r.slug);
          const st = s.trains ? (s.pctLate > 0.3 ? { cls: "crit", text: "Muchos retrasos" } : s.late ? { cls: "warn", text: "Algunos retrasos" } : s.known ? { cls: "ok", text: "Con normalidad" } : { cls: "none", text: "Sin datos de retraso" }) : { cls: "none", text: "Sin trenes ahora" };
          return h("a", { class: "row", href: `/cercanias/${r.slug}` }, h("span", { class: "grow" }, h("strong", {}, r.nombre), h("span", {}, `${s.trains} ${s.trains === 1 ? "tren" : "trenes"} · ${s.alerts} ${s.alerts === 1 ? "aviso" : "avisos"}`)), h("span", { class: `tag ${st.cls}` }, st.text));
        }));
      });
    },
  };

  pages[page]?.();
  A.start();
})();
