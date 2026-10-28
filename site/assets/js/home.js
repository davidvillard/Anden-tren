"use strict";
(function () {
  const { h, norm, css, ago, fmtTime, tiles } = window.Anden;
  const LIVE_URL = "/api/live";
  const REFRESH_MS = 30000;
  const state = { live: null, acc: [], redes: [], line: "", view: "map", alertsAll: false, alertQ: "", focus: null, lastOk: null };
  const SCOPE = window.ANDEN_RED || null; // página de una red concreta

  /* ---------- Utilidades de trenes ---------- */
  const LINE_RE = /\b(RT\d|RG\d|RL\d|R\d{1,2}[NS]?|C-?\d{1,2}[a-z]?|S\d{1,2}|T\d)\b/i;
  function lineOf(t) {
    for (const s of [t.label, t.routeId]) {
      const m = s && String(s).match(LINE_RE);
      if (m) return m[1].toUpperCase().replace("-", "");
    }
    return null;
  }
  function trainNumber(t) {
    const m = String(t.label || "").match(/\b(\d{4,6})\b/) || String(t.tripId || "").match(/(\d{4,6})/);
    return m ? m[1] : t.id;
  }
  function delayInfo(min) {
    if (min === null || min === undefined) return { cls: "none", text: "Sin dato de retraso", short: "Sin dato", color: css("--muted") };
    if (min <= 0) return { cls: "ok", text: "En hora", short: "En hora", color: css("--ok") };
    if (min < 3) return { cls: "ok", text: `${min} min de retraso`, short: `+${min} min`, color: css("--ok") };
    if (min <= 10) return { cls: "warn", text: `${min} min de retraso`, short: `+${min} min`, color: css("--warn") };
    return { cls: "crit", text: `${min} min de retraso`, short: `+${min} min`, color: css("--crit") };
  }
  const redOf = (t) => state.redes.find((r) => t.lat >= r.bbox[0] && t.lat <= r.bbox[2] && t.lon >= r.bbox[1] && t.lon <= r.bbox[3]) || null;
  const scopeRed = () => state.redes.find((r) => r.slug === SCOPE) || null;
  // Una línea se identifica por su código y su red (la C1 de Madrid no es la C1 de Valencia)
  const lineName = (key) => { if (!key) return null; const [code, slug] = key.split("|"); const r = state.redes.find((x) => x.slug === slug); return SCOPE || !r ? code : `${code} · ${r.corto}`; };
  const lineCode = (key) => (key ? key.split("|")[0] : null);
  const trains = () => (state.live?.cercanias?.trains || []).map((t) => {
    const red = redOf(t), code = lineOf(t);
    return { ...t, red, code, line: code ? `${code}|${red ? red.slug : "otras"}` : null, num: trainNumber(t) };
  }).filter((t) => !SCOPE || t.red?.slug === SCOPE);
  const alertText = (a) => norm(`${a.header} ${a.desc} ${a.routes.join(" ")}`);
  const alerts = () => {
    const all = state.live?.cercanias?.alerts || [];
    const r = scopeRed();
    if (!r) return all;
    const codes = new Set(trains().map((t) => norm(t.code)).filter(Boolean));
    return all.filter((a) => r.claves.some((k) => alertText(a).includes(norm(k))) || a.routes.some((x) => [...codes].some((c) => norm(x).endsWith(c))));
  };
  const alertMatchesLine = (a, key) => { const code = norm(lineCode(key)); const r = state.redes.find((x) => x.slug === key.split("|")[1]); const byCode = a.routes.some((x) => norm(x).endsWith(code)) || new RegExp(`\\b${code}\\b`).test(alertText(a)); return byCode && (!r || SCOPE || r.claves.some((k) => alertText(a).includes(norm(k))) || a.routes.length > 0); };
  const visibleTrains = () => trains().filter((t) => !state.line || t.line === state.line);

  /* ---------- Mapa ---------- */
  const map = L.map("map", { scrollWheelZoom: false, minZoom: 5 }).fitBounds([[35.9, -9.4], [43.8, 3.4]]);
  function fitScope() { const r = scopeRed(); if (r) map.fitBounds([[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]]); }
  tiles(map);
  const layer = L.layerGroup().addTo(map);
  const markers = new Map();

  function popupFor(t) {
    const d = delayInfo(t.delayMin);
    return h("div", {},
      h("strong", {}, t.line ? `${lineName(t.line)} · tren ${t.num}` : `Tren ${t.num}`), h("br"),
      h("span", { class: `tag ${d.cls}` }, d.text),
      t.ts ? h("div", { class: "small muted", style: "margin-top:4px" }, `Posición de las ${fmtTime(t.ts)}`) : "");
  }
  function drawMap() {
    layer.clearLayers();
    markers.clear();
    for (const t of visibleTrains()) {
      const d = delayInfo(t.delayMin);
      const m = L.circleMarker([t.lat, t.lon], { radius: 7, color: css("--surface"), weight: 2, fillColor: d.color, fillOpacity: 0.95 })
        .bindPopup(() => popupFor(t))
        .on("click", () => showTrain(t, false));
      m.addTo(layer);
      markers.set(t.id, m);
    }
  }

  /* ---------- Lista ---------- */
  let listLimit = 40;
  function drawList() {
    const box = document.getElementById("train-list");
    const rows = visibleTrains().sort((a, b) => (b.delayMin ?? -99) - (a.delayMin ?? -99));
    if (!rows.length) { box.replaceChildren(h("div", { class: "empty" }, state.live ? "No hay trenes que mostrar con este filtro." : "Cargando trenes…")); return; }
    const items = rows.slice(0, listLimit).map((t) => {
      const d = delayInfo(t.delayMin);
      return h("button", { class: "row", type: "button", onclick: () => showTrain(t, true) },
        h("span", { class: "line-badge" }, t.code || "—"),
        h("span", { class: "grow" }, h("strong", {}, `Tren ${t.num}`), h("span", {}, [t.red && !SCOPE ? t.red.corto : "", t.ts ? `posición de las ${fmtTime(t.ts)}` : "posición sin hora"].filter(Boolean).join(" · "))),
        h("span", { class: `tag ${d.cls}` }, d.short));
    });
    if (rows.length > listLimit) items.push(h("button", { class: "btn ghost", type: "button", onclick: () => { listLimit += 40; drawList(); } }, `Mostrar más (${rows.length - listLimit} restantes)`));
    box.replaceChildren(...items);
  }

  /* ---------- Cifras ---------- */
  function drawKpis() {
    const all = trains();
    const known = all.filter((t) => t.delayMin !== null && t.delayMin !== undefined);
    const late = known.filter((t) => t.delayMin >= 3);
    const avg = known.length ? known.reduce((s, t) => s + Math.max(0, t.delayMin), 0) / known.length : null;
    const k = (v, l) => h("div", { class: "card kpi" }, h("b", {}, v), h("span", {}, l));
    document.getElementById("kpis").replaceChildren(
      k(all.length ? all.length.toLocaleString("es-ES") : "—", "trenes circulando"),
      k(known.length ? `${Math.round((late.length / known.length) * 100)} %` : "—", "van con 3 min o más de retraso"),
      k(avg !== null ? `${avg.toFixed(1).replace(".", ",")} min` : "—", "de retraso medio"),
      k(alerts().length.toLocaleString("es-ES"), "avisos activos"));
  }

  function drawLineFilter() {
    const sel = document.getElementById("line-filter");
    const counts = {};
    for (const t of trains()) if (t.line) counts[t.line] = (counts[t.line] || 0) + 1;
    const lines = Object.keys(counts).sort((a, b) => lineName(a).localeCompare(lineName(b), "es", { numeric: true }));
    const cur = state.line;
    sel.replaceChildren(h("option", { value: "" }, "Todas las líneas"), ...lines.map((l) => h("option", { value: l }, `${lineName(l)} · ${counts[l]} ${counts[l] === 1 ? "tren" : "trenes"}`)));
    sel.value = lines.includes(cur) ? cur : "";
    const hints = document.getElementById("hints");
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l]) => l);
    hints.replaceChildren(h("span", {}, top.length ? "Prueba:" : ""), ...top.map((l) => h("button", { class: "hint", type: "button", onclick: () => pick({ type: "line", line: l }) }, lineName(l))));
  }

  /* ---------- Avisos ---------- */
  function drawAlerts() {
    const box = document.getElementById("alerts");
    const more = document.getElementById("alerts-more");
    const q = norm(state.alertQ);
    let rows = alerts();
    if (state.line) rows = rows.filter((a) => alertMatchesLine(a, state.line));
    if (q) rows = rows.filter((a) => norm(`${a.header} ${a.desc} ${a.routes.join(" ")}`).includes(q));
    if (!state.live) { box.replaceChildren(h("div", { class: "empty" }, "Cargando avisos…")); more.hidden = true; return; }
    if (!rows.length) { box.replaceChildren(h("div", { class: "empty" }, q || state.line ? "No hay avisos que coincidan." : "Renfe no tiene avisos activos ahora mismo.")); more.hidden = true; return; }
    const shown = state.alertsAll ? rows : rows.slice(0, 5);
    box.replaceChildren(...shown.map((a) => h("article", { class: "card alert-item", id: `aviso-${a.id}` },
      h("h3", {}, a.header || a.desc),
      a.desc && a.desc !== a.header ? h("p", {}, a.desc) : "",
      a.routes.length ? h("div", { class: "lines" }, a.routes.slice(0, 10).map((r) => h("span", { class: "tag info" }, r))) : "",
      a.start || a.end ? h("p", { class: "small muted" }, [a.start ? `Desde el ${new Date(a.start * 1000).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "medium", timeStyle: "short" })}` : "", a.end ? `hasta el ${new Date(a.end * 1000).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "medium", timeStyle: "short" })}` : ""].filter(Boolean).join(" ")) : "")));
    more.hidden = rows.length <= 5;
    more.textContent = state.alertsAll ? "Ver menos avisos" : `Ver los ${rows.length} avisos`;
  }

  /* ---------- Ficha de lo buscado ---------- */
  const focusWrap = document.getElementById("focus-wrap");
  const focusBox = document.getElementById("focus");
  let quiet = false;
  function openFocus(...children) {
    focusBox.replaceChildren(...children);
    focusWrap.hidden = false;
    if (quiet) return;
    focusWrap.scrollIntoView({ block: "start", behavior: "smooth" });
    focusBox.focus({ preventScroll: true });
  }
  const closeBtn = () => h("button", { class: "close", type: "button", onclick: () => { focusWrap.hidden = true; state.focus = null; if (state.line) setLine(""); } }, "Cerrar");

  function showTrain(t, zoom) {
    state.focus = { type: "train", id: t.id };
    const d = delayInfo(t.delayMin);
    const lineAlerts = t.line ? alerts().filter((a) => alertMatchesLine(a, t.line)) : [];
    openFocus(
      h("div", { class: "focus-head" }, h("span", { class: "line-badge" }, t.code || "—"), h("h3", {}, `Tren ${t.num}`), t.red && !SCOPE ? h("span", { class: "muted" }, t.red.nombre) : "", closeBtn()),
      h("p", { style: "font-size:1.3rem" }, h("span", { class: `tag ${d.cls}`, style: "font-size:1.05rem;padding:6px 14px" }, d.text)),
      h("p", { class: "muted" }, t.ts ? `Última posición recibida a las ${fmtTime(t.ts)}.` : "Renfe no indica la hora de la posición."),
      lineAlerts.length ? h("p", {}, h("strong", {}, `${lineAlerts.length} aviso${lineAlerts.length > 1 ? "s" : ""} en la línea ${lineName(t.line)}. `), h("a", { href: "#avisos", onclick: () => setLine(t.line) }, "Ver avisos")) : "",
      h("div", { class: "focus-actions" },
        h("button", { class: "btn", type: "button", onclick: () => locate(t) }, "Ver en el mapa"),
        t.line ? h("button", { class: "btn ghost", type: "button", onclick: () => pick({ type: "line", line: t.line }) }, `Toda la línea ${lineName(t.line)}`) : ""));
    if (zoom) locate(t, false);
  }
  function locate(t, scroll = true) {
    setView("map");
    map.setView([t.lat, t.lon], 13);
    markers.get(t.id)?.openPopup();
    if (scroll) document.getElementById("directo").scrollIntoView({ behavior: "smooth" });
  }
  function showLine(line) {
    state.focus = { type: "line", line };
    setLine(line);
    const ts = trains().filter((t) => t.line === line);
    const known = ts.filter((t) => t.delayMin !== null && t.delayMin !== undefined);
    const late = known.filter((t) => t.delayMin >= 3);
    const avg = known.length ? known.reduce((s, t) => s + Math.max(0, t.delayMin), 0) / known.length : null;
    const la = alerts().filter((a) => alertMatchesLine(a, line));
    const status = !known.length ? { cls: "none", text: "Sin datos de retraso" } : late.length / known.length > 0.3 ? { cls: "crit", text: "Muchos retrasos" } : late.length ? { cls: "warn", text: "Algunos retrasos" } : { cls: "ok", text: "Funciona con normalidad" };
    openFocus(
      h("div", { class: "focus-head" }, h("span", { class: "line-badge" }, lineCode(line)), h("h3", {}, `Línea ${lineName(line)}`), closeBtn()),
      h("p", {}, h("span", { class: `tag ${status.cls}`, style: "font-size:1.05rem;padding:6px 14px" }, status.text)),
      h("div", { class: "kpis" },
        h("div", { class: "kpi card" }, h("b", {}, ts.length), h("span", {}, ts.length === 1 ? "tren circulando" : "trenes circulando")),
        h("div", { class: "kpi card" }, h("b", {}, late.length), h("span", {}, "con 3 min o más de retraso")),
        h("div", { class: "kpi card" }, h("b", {}, avg !== null ? `${avg.toFixed(1).replace(".", ",")} min` : "—"), h("span", {}, "de retraso medio")),
        h("div", { class: "kpi card" }, h("b", {}, la.length), h("span", {}, "avisos"))),
      h("div", { class: "focus-actions" },
        h("a", { class: "btn", href: "#directo" }, "Ver trenes de la línea"),
        la.length ? h("a", { class: "btn ghost", href: "#avisos" }, "Ver avisos de la línea") : ""));
    if (ts.length) map.fitBounds(L.latLngBounds(ts.map((t) => [t.lat, t.lon])).pad(0.2));
  }
  function showLD(trip) {
    state.focus = { type: "ld", id: trip.tripId };
    const d = trip.cancelled ? { cls: "crit", text: "Cancelado" } : delayInfo(trip.delayMin);
    openFocus(
      h("div", { class: "focus-head" }, h("span", { class: "line-badge" }, "LD"), h("h3", {}, `Tren ${trip.tripId}`), closeBtn()),
      h("p", {}, h("span", { class: `tag ${d.cls}`, style: "font-size:1.05rem;padding:6px 14px" }, d.text)),
      h("p", { class: "muted" }, "Alta velocidad o larga distancia. Renfe no publica la posición de estos trenes, solo su retraso."));
  }
  function showAlert(a) {
    state.alertsAll = true;
    drawAlerts();
    const el = document.getElementById(`aviso-${a.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.setAttribute("tabindex", "-1");
    el?.focus({ preventScroll: true });
  }

  /* ---------- Buscador ---------- */
  const input = document.getElementById("q");
  const list = document.getElementById("suggest");
  let results = [];
  let active = -1;

  function search(qRaw) {
    const q = norm(qRaw);
    if (!q) return [];
    const out = [];
    const counts = {};
    for (const t of trains()) if (t.line) counts[t.line] = (counts[t.line] || 0) + 1;
    for (const l of Object.keys(counts)) if (norm(lineCode(l)).startsWith(q.replace(/\s|-/g, "")) || norm("linea " + lineName(l)).includes(q))
      out.push({ type: "line", line: l, title: `Línea ${lineName(l)}`, sub: `${counts[l]} ${counts[l] === 1 ? "tren circulando" : "trenes circulando"}`, group: "Líneas" });
    for (const t of trains()) {
      if ([t.num, t.label, t.tripId, t.id].some((v) => v && norm(v).includes(q))) {
        out.push({ type: "train", t, title: `Tren ${t.num}${t.line ? " · " + lineName(t.line) : ""}`, sub: delayInfo(t.delayMin).text, group: "Trenes de Cercanías" });
      }
    }
    for (const trip of state.live?.largaDistancia?.trips || []) {
      if (norm(trip.tripId).includes(q)) out.push({ type: "ld", trip, title: `Tren ${trip.tripId}`, sub: trip.cancelled ? "Cancelado" : delayInfo(trip.delayMin).text, group: "Larga distancia" });
    }
    for (const a of alerts()) {
      if (norm(`${a.header} ${a.desc} ${a.routes.join(" ")}`).includes(q)) out.push({ type: "alert", a, title: a.header || a.desc, sub: a.routes.slice(0, 4).join(", ") || "Aviso de Renfe", group: "Avisos" });
    }
    for (const d of state.acc) {
      if (norm(`${d.place} ${d.prov}`).includes(q)) out.push({ type: "acc", d, title: `${d.place} (${d.prov})`, sub: `${d.type} · ${window.Anden.fmtDate(d.date)}`, group: "Accidentes" });
    }
    const per = {};
    return out.filter((r) => (per[r.group] = (per[r.group] || 0) + 1) <= 6);
  }

  function renderSuggest() {
    list.replaceChildren();
    if (!input.value.trim()) { closeSuggest(); return; }
    if (!results.length) {
      list.append(h("li", { class: "empty-opt", role: "presentation" }, state.live ? "No hay resultados. Prueba con el número del tren, la línea (C1, R2…) o un lugar." : "Cargando datos de Renfe…"));
    }
    let group = null;
    results.forEach((r, i) => {
      if (r.group !== group) { group = r.group; list.append(h("li", { class: "grp", role: "presentation" }, group)); }
      const badge = r.type === "line" ? lineCode(r.line) : r.type === "train" ? (r.t.code || "—") : r.type === "ld" ? "LD" : r.type === "alert" ? "!" : "⚑";
      list.append(h("li", { role: "option", id: `opt-${i}`, "aria-selected": i === active ? "true" : "false", onmousedown: (e) => { e.preventDefault(); pick(r); } },
        h("span", { class: "line-badge", "aria-hidden": "true" }, badge),
        h("span", { class: "opt-main" }, h("strong", {}, r.title), h("span", {}, r.sub))));
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-activedescendant", active >= 0 ? `opt-${active}` : "");
  }
  function closeSuggest() { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; }

  function pick(r) {
    closeSuggest();
    if (r.type === "line") { input.value = lineName(r.line); showLine(r.line); }
    else if (r.type === "train") showTrain(r.t, true);
    else if (r.type === "ld") showLD(r.trip);
    else if (r.type === "alert") showAlert(r.a);
    else if (r.type === "acc") location.href = `/accidentes#${r.d.id}`;
    const url = new URL(location.href);
    url.searchParams.set("q", input.value.trim());
    history.replaceState(null, "", url);
  }

  input.addEventListener("input", () => { results = search(input.value); active = results.length ? 0 : -1; renderSuggest(); });
  input.addEventListener("focus", () => { if (input.value.trim()) { results = search(input.value); renderSuggest(); } });
  input.addEventListener("blur", () => setTimeout(closeSuggest, 120));
  input.addEventListener("keydown", (e) => {
    if (list.hidden && e.key === "ArrowDown") { results = search(input.value); active = 0; renderSuggest(); e.preventDefault(); return; }
    if (e.key === "ArrowDown") { active = Math.min(results.length - 1, active + 1); renderSuggest(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); renderSuggest(); e.preventDefault(); }
    else if (e.key === "Escape") { closeSuggest(); }
  });
  document.getElementById("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    results = search(input.value);
    if (results.length) pick(results[Math.max(0, active)]);
    else renderSuggest();
  });

  /* ---------- Controles ---------- */
  function setView(v) {
    state.view = v;
    document.getElementById("view-map").setAttribute("aria-pressed", v === "map");
    document.getElementById("view-list").setAttribute("aria-pressed", v === "list");
    document.getElementById("map-view").hidden = v !== "map";
    document.getElementById("list-view").hidden = v !== "list";
    if (v === "map") setTimeout(() => map.invalidateSize(), 50); else drawList();
  }
  function setLine(l) {
    state.line = l;
    document.getElementById("line-filter").value = l;
    drawMap(); drawList(); drawAlerts();
  }
  document.getElementById("view-map").onclick = () => setView("map");
  document.getElementById("view-list").onclick = () => setView("list");
  document.getElementById("line-filter").onchange = (e) => setLine(e.target.value);
  document.getElementById("alert-q").oninput = (e) => { state.alertQ = e.target.value; drawAlerts(); };
  document.getElementById("alerts-more").onclick = () => { state.alertsAll = !state.alertsAll; drawAlerts(); };
  window.addEventListener("anden:theme", () => drawMap());

  /* ---------- Estado de la conexión ---------- */
  function drawPill() {
    const dot = document.querySelector("#live-pill .pulse");
    const txt = document.getElementById("live-pill-text");
    const d = state.live;
    const anyOk = d && Object.values(d.sources || {}).some((s) => s.ok);
    if (!d || !anyOk) { dot.className = "pulse off"; txt.textContent = d ? "Renfe no responde ahora mismo. Reintentando…" : "Conectando con Renfe…"; return; }
    const age = Date.now() / 1000 - d.generatedAt;
    dot.className = age > 300 ? "pulse stale" : "pulse";
    txt.textContent = age > 300 ? `Sin conexión con Renfe. Últimos datos ${ago(d.generatedAt)}` : `En directo · actualizado ${ago(d.generatedAt)}`;
  }

  async function loadLive() {
    try {
      const r = await fetch(LIVE_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      state.live = await r.json();
    } catch (e) { /* se mantiene lo último */ }
    drawPill(); drawKpis(); drawLineFilter(); drawMap(); drawAlerts();
    if (state.view === "list") drawList();
    // Refresca la ficha abierta con los datos nuevos
    if (state.focus?.type === "train") { const t = trains().find((x) => x.id === state.focus.id); if (t && !focusWrap.hidden) showTrainQuiet(t); }
  }
  function showTrainQuiet(t) { quiet = true; try { showTrain(t, false); } finally { quiet = false; } }

  async function loadAcc() {
    try { state.acc = (await (await fetch("/data/accidentes.json")).json()).accidentes; } catch (e) {}
  }

  async function loadRedes() {
    try { state.redes = (await (await fetch("/data/redes.json")).json()).redes; } catch (e) {}
    fitScope();
  }

  async function start() {
    await loadRedes();
    await Promise.all([loadLive(), loadAcc()]);
    const q = new URLSearchParams(location.search).get("q");
    if (q) { input.value = q; const r = search(q); if (r.length) pick(r[0]); }
    setInterval(() => { if (!document.hidden) loadLive(); }, REFRESH_MS);
    setInterval(drawPill, 5000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) loadLive(); });
  }
  start();
})();
