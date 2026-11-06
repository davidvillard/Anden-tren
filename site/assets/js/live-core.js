"use strict";
// Datos en directo compartidos por todas las páginas: trenes, líneas, avisos,
// enlaces a cada ficha y el buscador.
(function () {
  const { h, norm, css, fmtTime, ago } = window.Anden;
  const LIVE_URL = "/api/live";
  const REFRESH_MS = 30000;
  const S = { live: null, redes: [], acc: [], subs: [], scope: window.ANDEN_RED || null };

  /* ---------- Trenes y líneas ---------- */
  const LINE_RE = /\b(RT\d|RG\d|RL\d|R\d{1,2}[NS]?|C-?\d{1,2}[a-z]?|S\d{1,2}|T\d)\b/i;
  function lineOf(t) {
    for (const s of [t.label, t.routeId]) { const m = s && String(s).match(LINE_RE); if (m) return m[1].toUpperCase().replace("-", "").replace(/([A-Z]+\d+)[A-Z]$/, "$1"); }
    return null;
  }
  function trainNumber(t) { const m = String(t.label || "").match(/\b(\d{4,6})\b/) || String(t.tripId || "").match(/(\d{4,6})/); return m ? m[1] : t.id; }
  function delayInfo(min) {
    if (min === null || min === undefined) return { cls: "none", text: "Sin dato de retraso", short: "Sin dato", color: css("--faint") };
    if (min <= 0) return { cls: "ok", text: "En hora", short: "En hora", color: css("--ok") };
    if (min < 3) return { cls: "ok", text: `${min} min de retraso`, short: `+${min} min`, color: css("--ok") };
    if (min <= 10) return { cls: "warn", text: `${min} min de retraso`, short: `+${min} min`, color: css("--warn") };
    return { cls: "crit", text: `${min} min de retraso`, short: `+${min} min`, color: css("--crit") };
  }
  const redBySlug = (slug) => S.redes.find((r) => r.slug === slug) || null;
  const redOf = (t) => S.redes.find((r) => t.lat >= r.bbox[0] && t.lat <= r.bbox[2] && t.lon >= r.bbox[1] && t.lon <= r.bbox[3]) || null;
  const lineKey = (code, slug) => `${code}|${slug || "otras"}`;
  const lineName = (key, withRed = !S.scope) => { if (!key) return null; const [code, slug] = key.split("|"); const r = redBySlug(slug); return withRed && r ? `${code} · ${r.corto}` : code; };
  const lineCode = (key) => (key ? key.split("|")[0] : null);
  // Las líneas de redes.json tienen su propia página; el resto usa la ficha genérica
  const lineUrl = (key) => {
    const [code, slug] = key.split("|");
    return redBySlug(slug)?.lineas?.includes(code) ? `/cercanias/${slug}/${code.toLowerCase()}` : `/linea?red=${encodeURIComponent(slug)}&l=${encodeURIComponent(code)}`;
  };
  const trainUrl = (t) => `/tren?id=${encodeURIComponent(t.id)}`;

  function allTrains() {
    return (S.live?.cercanias?.trains || []).map((t) => {
      const red = redOf(t), code = lineOf(t);
      return { ...t, red, code, line: code ? lineKey(code, red?.slug) : null, num: trainNumber(t) };
    });
  }
  const trains = (scope = S.scope) => allTrains().filter((t) => !scope || t.red?.slug === scope);

  // routeId de Renfe: <red>T<nº><línea>, p. ej. 10T0011C4 → red 10, línea C4
  const routeRed = (r) => { const m = /^(\d{2})T/.exec(r || ""); return m ? S.redes.find((x) => (x.codigos || []).includes(m[1])) || null : null; };
  const routeLine = (r) => { const m = /T\d+([A-Za-z]+\d+[a-zA-Z]?)$/.exec(r || ""); return m ? m[1].toUpperCase().replace(/([A-Z]+\d+)[A-Z]$/, "$1") : null; };
  const alertText = (a) => norm(`${a.header} ${a.desc} ${a.routes.join(" ")}`);
  const alertRedes = (a) => [...new Set(a.routes.map((x) => routeRed(x)?.slug).filter(Boolean))];
  const alertLines = (a) => [...new Set(a.routes.map((x) => { const r = routeRed(x), l = routeLine(x); return l ? lineKey(l, r?.slug) : null; }).filter(Boolean))];
  function alerts(scope = S.scope) {
    const all = S.live?.cercanias?.alerts || [];
    if (!scope) return all;
    const r = redBySlug(scope);
    return all.filter((a) => alertRedes(a).includes(scope) || (!a.routes.length && r && r.claves.some((k) => alertText(a).includes(norm(k)))));
  }
  const alertsOfLine = (key) => (S.live?.cercanias?.alerts || []).filter((a) => alertLines(a).includes(key));

  // Resumen por línea (para tablas y fichas)
  function lines(scope = S.scope) {
    const map = new Map();
    for (const t of trains(scope)) {
      if (!t.line) continue;
      const o = map.get(t.line) || { key: t.line, code: t.code, red: t.red, trains: [], known: 0, late: 0, sum: 0 };
      o.trains.push(t);
      if (t.delayMin !== null && t.delayMin !== undefined) { o.known++; o.sum += Math.max(0, t.delayMin); if (t.delayMin >= 3) o.late++; }
      map.set(t.line, o);
    }
    return [...map.values()].map((o) => ({ ...o, avg: o.known ? o.sum / o.known : null, pctLate: o.known ? o.late / o.known : null, alerts: alertsOfLine(o.key).length }));
  }
  function lineStatus(o) {
    if (!o || !o.known) return { cls: "none", text: "Sin datos de retraso" };
    if (o.pctLate > 0.3) return { cls: "crit", text: "Muchos retrasos" };
    if (o.late) return { cls: "warn", text: "Algunos retrasos" };
    return { cls: "ok", text: "Funciona con normalidad" };
  }
  function summary(scope = S.scope) {
    const all = trains(scope);
    const known = all.filter((t) => t.delayMin !== null && t.delayMin !== undefined);
    const late = known.filter((t) => t.delayMin >= 3);
    const ld = S.live?.largaDistancia?.trips || [];
    return {
      trains: all.length, known: known.length, late: late.length,
      pctLate: known.length ? late.length / known.length : null,
      avg: known.length ? known.reduce((s, t) => s + Math.max(0, t.delayMin), 0) / known.length : null,
      alerts: alerts(scope).length,
      ldCancelled: ld.filter((t) => t.cancelled).length, ld: ld.length,
    };
  }
  const fmtMin = (v) => (v === null ? "—" : `${v.toFixed(1).replace(".", ",")} min`);
  const fmtPct = (v) => (v === null ? "—" : `${Math.round(v * 100)} %`);

  /* ---------- Componentes ---------- */
  const lineBadge = (code) => h("span", { class: "line-badge" }, code || "—");
  const trainRow = (t) => {
    const d = delayInfo(t.delayMin);
    return h("a", { class: "row", href: trainUrl(t) },
      lineBadge(t.code),
      h("span", { class: "grow" }, h("strong", {}, `Tren ${t.num}`),
        h("span", {}, [t.red && !S.scope ? t.red.corto : "", t.ts ? `posición de las ${fmtTime(t.ts)}` : ""].filter(Boolean).join(" · "))),
      h("span", { class: `tag ${d.cls}` }, d.short));
  };
  const alertCard = (a) => h("article", { class: "card alert-item", id: `aviso-${a.id}` },
    h("h3", {}, a.header || a.desc),
    a.desc && a.desc !== a.header ? h("p", {}, a.desc) : "",
    alertLines(a).length ? h("div", { class: "lines" }, alertLines(a).slice(0, 8).map((k) => h("a", { class: "tag info", href: lineUrl(k) }, lineName(k, true)))) : "",
    a.start || a.end ? h("p", { class: "small muted" }, [a.start ? `Desde el ${new Date(a.start * 1000).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "medium", timeStyle: "short" })}` : "", a.end ? `hasta el ${new Date(a.end * 1000).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "medium", timeStyle: "short" })}` : ""].filter(Boolean).join(" ")) : "");
  const kpi = (val, label, href) => h(href ? "a" : "div", { class: "card kpi tile", href }, h("b", {}, val), h("span", {}, label), href ? h("span", { class: "more" }, "Ver") : "");

  function drawTrains(map, layer, list) {
    layer.clearLayers();
    for (const t of list) {
      const d = delayInfo(t.delayMin);
      L.circleMarker([t.lat, t.lon], { radius: 6, color: "#fff", weight: 1.5, fillColor: d.color, fillOpacity: 0.95 })
        .bindPopup(() => h("div", {},
          h("strong", {}, t.line ? `${lineName(t.line, true)} · tren ${t.num}` : `Tren ${t.num}`), h("br"),
          h("span", { class: `tag ${d.cls}` }, d.text), h("br"),
          h("a", { href: trainUrl(t) }, "Ver ficha del tren")))
        .addTo(layer);
    }
  }

  function paintPill() {
    const pill = document.getElementById("live-pill"); if (!pill) return;
    const dot = pill.querySelector(".pulse"), txt = pill.querySelector("[data-text]") || pill.lastElementChild;
    const d = S.live, ok = d && Object.values(d.sources || {}).some((s) => s.ok);
    if (!d || !ok) { dot.className = "pulse off"; txt.textContent = d ? "Renfe no responde ahora mismo. Reintentando…" : "Conectando con Renfe…"; return; }
    const age = Date.now() / 1000 - d.generatedAt;
    dot.className = age > 300 ? "pulse stale" : "pulse";
    txt.textContent = age > 300 ? `Sin conexión con Renfe. Últimos datos ${ago(d.generatedAt)}` : `En directo · actualizado ${ago(d.generatedAt)}`;
  }

  /* ---------- Buscador ---------- */
  function attachSearch(form) {
    if (!form) return;
    const input = form.querySelector("input"), list = form.querySelector(".suggest");
    let results = [], active = -1;
    function search(qRaw) {
      const q = norm(qRaw); if (!q) return [];
      const out = [];
      for (const o of lines()) if (norm(o.code).startsWith(q.replace(/\s|-/g, "")) || norm("linea " + lineName(o.key, true)).includes(q))
        out.push({ href: lineUrl(o.key), badge: o.code, title: `Línea ${lineName(o.key, true)}`, sub: `${o.trains.length} ${o.trains.length === 1 ? "tren" : "trenes"} · ${lineStatus(o).text}`, group: "Líneas" });
      for (const r of S.redes) if (norm(`${r.nombre} ${r.claves.join(" ")}`).includes(q)) out.push({ href: `/cercanias/${r.slug}`, badge: "C", title: r.nombre, sub: "Retrasos e incidencias de la red", group: "Redes de Cercanías" });
      for (const t of trains()) if ([t.num, t.label, t.tripId, t.id].some((v) => v && norm(v).includes(q))) out.push({ href: trainUrl(t), badge: t.code || "—", title: `Tren ${t.num}${t.line ? " · " + lineName(t.line) : ""}`, sub: delayInfo(t.delayMin).text, group: "Trenes" });
      for (const a of alerts()) if (alertText(a).includes(q)) out.push({ href: `/avisos#aviso-${a.id}`, badge: "!", title: a.header || a.desc, sub: alertLines(a).map((k) => lineName(k, true)).slice(0, 3).join(", ") || "Aviso de Renfe", group: "Avisos" });
      for (const d of S.acc) if (norm(`${d.place} ${d.prov}`).includes(q)) out.push({ href: `/accidentes#${d.id}`, badge: "⚑", title: `${d.place} (${d.prov})`, sub: `${d.type} · ${window.Anden.fmtDate(d.date)}`, group: "Accidentes" });
      const per = {};
      return out.filter((r) => (per[r.group] = (per[r.group] || 0) + 1) <= 6);
    }
    function render() {
      list.replaceChildren();
      if (!input.value.trim()) return close();
      if (!results.length) list.append(h("li", { class: "empty-opt", role: "presentation" }, S.live ? "Sin resultados. Prueba con el número del tren, la línea (C1, R2…) o una ciudad." : "Cargando datos de Renfe…"));
      let group = null;
      results.forEach((r, i) => {
        if (r.group !== group) { group = r.group; list.append(h("li", { class: "grp", role: "presentation" }, group)); }
        list.append(h("li", { role: "option", id: `opt-${i}`, "aria-selected": i === active ? "true" : "false", onmousedown: (e) => { e.preventDefault(); location.href = r.href; } },
          h("span", { class: "line-badge", "aria-hidden": "true" }, r.badge), h("span", { class: "opt-main" }, h("strong", {}, r.title), h("span", {}, r.sub))));
      });
      list.hidden = false; input.setAttribute("aria-expanded", "true");
      if (active >= 0) input.setAttribute("aria-activedescendant", `opt-${active}`); else input.removeAttribute("aria-activedescendant");
    }
    function close() { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; }
    input.addEventListener("input", () => { results = search(input.value); active = results.length ? 0 : -1; render(); });
    input.addEventListener("focus", () => { if (input.value.trim()) { results = search(input.value); render(); } });
    input.addEventListener("blur", () => setTimeout(close, 120));
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { active = Math.min(results.length - 1, active + 1); render(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); render(); e.preventDefault(); }
      else if (e.key === "Escape") close();
    });
    // Búsqueda que llega por la URL (?q=...), por ejemplo desde Google
    const q0 = new URLSearchParams(location.search).get("q");
    if (q0) { input.value = q0; let done = false; S.subs.push(() => { if (done || !S.live) return; done = true; results = search(q0); active = results.length ? 0 : -1; render(); input.focus(); }); }
    form.addEventListener("submit", (e) => { e.preventDefault(); results = search(input.value); if (results.length) location.href = results[Math.max(0, active)].href; else render(); });
    // Sugerencias rápidas: líneas con más trenes
    const hints = form.parentElement.querySelector(".hints");
    S.subs.push(() => {
      if (!hints) return;
      const top = lines().sort((a, b) => b.trains.length - a.trains.length).slice(0, 4);
      hints.replaceChildren(...(top.length ? [h("span", {}, "Prueba:"), ...top.map((o) => h("a", { class: "hint", href: lineUrl(o.key) }, lineName(o.key)))] : []));
    });
  }

  /* ---------- Carga ---------- */
  async function load() {
    try { const r = await fetch(LIVE_URL, { cache: "no-store" }); if (r.ok) S.live = await r.json(); } catch (e) {}
    paintPill();
    for (const f of S.subs) try { f(); } catch (e) { console.error(e); }
  }
  async function start() {
    try { S.redes = (await (await fetch("/data/redes.json")).json()).redes; } catch (e) {}
    try { S.acc = (await (await fetch("/data/accidentes.json")).json()).accidentes; } catch (e) {}
    await load();
    setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    setInterval(paintPill, 5000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  }

  window.AndenLive = {
    S, start, onUpdate: (f) => S.subs.push(f), attachSearch,
    trains, alerts, alertsOfLine, alertLines, alertRedes, lines, lineStatus, summary, redBySlug,
    delayInfo, lineName, lineCode, lineUrl, trainUrl, lineKey,
    fmtMin, fmtPct, lineBadge, trainRow, alertCard, kpi, drawTrains,
  };
})();
