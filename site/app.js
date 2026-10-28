"use strict";

const SPAIN = [[35.8, -9.6], [43.9, 4.4]];
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtDate = (s) => { const [y, m, d] = s.split("-"); return `${+d} ${MESES[+m - 1]} ${y}`; };
const fmtTime = (unix) => new Date(unix * 1000).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

// Crea un elemento con texto seguro (los datos externos nunca se insertan como HTML).
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

function makeMap(id) {
  const map = L.map(id, { scrollWheelZoom: false, minZoom: 5 }).fitBounds(SPAIN);
  L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 16 }).addTo(map);
  return map;
}

/* ---------------- En directo ---------------- */

const live = { map: null, layer: null, data: null, q: "" };

function delayColor(min) {
  if (min === null || min === undefined) return css("--muted");
  if (min < 3) return css("--ok");
  if (min <= 10) return css("--accent");
  return css("--crit");
}

function renderLive() {
  const d = live.data;
  const status = document.getElementById("live-status");
  const kpis = document.getElementById("live-kpis");
  kpis.replaceChildren();
  live.layer.clearLayers();

  if (!d || !d.generatedAt) {
    status.replaceChildren(h("span", { class: "live-dot off" }), "Aún no hay datos. Se cargan en la primera actualización automática, en unos minutos.");
    document.getElementById("alerts").replaceChildren(h("div", { class: "empty" }, "Los avisos de Renfe aparecerán aquí."));
    return;
  }

  const ageMin = (Date.now() / 1000 - d.generatedAt) / 60;
  const NAMES = { vehicles: "posiciones de Cercanías", trips: "retrasos de Cercanías", alerts: "avisos", tripsLD: "retrasos de larga distancia" };
  const failed = Object.entries(d.sources || {}).filter(([, s]) => !s.ok).map(([k]) => NAMES[k] || k);
  const dotClass = ageMin > 20 ? "live-dot stale" : "live-dot";
  status.replaceChildren(
    h("span", { class: dotClass }),
    `Datos de Renfe de las ${fmtTime(d.generatedAt)}`,
    ageMin > 20 ? ` (hace ${Math.round(ageMin)} min, la actualización se ha retrasado)` : "",
    failed.length ? `. Sin respuesta de: ${failed.join(", ")}.` : "."
  );

  const trains = d.cercanias.trains || [];
  const withDelay = trains.filter((t) => t.delayMin !== null && t.delayMin !== undefined);
  const late = withDelay.filter((t) => t.delayMin >= 3);
  const avg = withDelay.length ? withDelay.reduce((s, t) => s + Math.max(0, t.delayMin), 0) / withDelay.length : null;
  const ldLate = (d.largaDistancia.trips || []).filter((t) => t.delayMin !== null && t.delayMin >= 5).length;
  const kpi = (val, label) => h("div", { class: "kpi" }, h("b", {}, val), h("span", {}, label));
  kpis.append(
    kpi(trains.length, "trenes de Cercanías circulando"),
    kpi(withDelay.length ? `${Math.round((late.length / withDelay.length) * 100)} %` : "—", "con 3 min o más de retraso"),
    kpi(avg !== null ? `${avg.toFixed(1)} min` : "—", "retraso medio"),
    kpi((d.cercanias.alerts || []).length, "avisos activos"),
  );
  if ((d.largaDistancia.trips || []).length) kpis.append(kpi(ldLate, "trenes de larga distancia con 5 min o más de retraso"));

  for (const t of trains) {
    const color = delayColor(t.delayMin);
    const m = L.circleMarker([t.lat, t.lon], { radius: 5, color: css("--panel"), weight: 1, fillColor: color, fillOpacity: 0.9 });
    const delayTxt = t.delayMin === null || t.delayMin === undefined ? "Sin dato de retraso" : t.delayMin <= 0 ? "En hora" : `${t.delayMin} min de retraso`;
    m.bindPopup(h("div", {}, h("strong", {}, t.label || `Tren ${t.id}`), h("br"), delayTxt, t.ts ? h("div", { class: "note" }, `Posición de las ${fmtTime(t.ts)}`) : ""));
    m.addTo(live.layer);
  }
  renderAlerts();
}

function renderAlerts() {
  const box = document.getElementById("alerts");
  const all = (live.data && live.data.cercanias.alerts) || [];
  const q = live.q.trim().toLowerCase();
  const rows = q ? all.filter((a) => `${a.header} ${a.desc} ${a.routes.join(" ")}`.toLowerCase().includes(q)) : all;
  if (!rows.length) {
    box.replaceChildren(h("div", { class: "empty" }, all.length ? "Ningún aviso coincide con la búsqueda." : "Renfe no tiene avisos activos ahora mismo."));
    return;
  }
  box.replaceChildren(...rows.map((a) => h("article", { class: "alert-card" },
    a.header ? h("strong", {}, a.header) : "",
    a.desc && a.desc !== a.header ? h("p", {}, a.desc) : "",
    a.routes.length ? h("div", { class: "routes" }, a.routes.slice(0, 12).map((r) => h("span", {}, r))) : "",
    a.start || a.end ? h("div", { class: "note" }, [a.start ? `Desde ${new Date(a.start * 1000).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}` : "", a.end ? `hasta ${new Date(a.end * 1000).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}` : ""].filter(Boolean).join(" ")) : ""
  )));
}

async function loadLive() {
  try {
    const r = await fetch(`data/live.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    live.data = await r.json();
  } catch {
    // Si falla una recarga, se mantienen los últimos datos mostrados.
  }
  renderLive();
}

/* ---------------- Accidentes ---------------- */

const STATUS = {
  open: { t: "Investigación abierta", c: "--crit", p: "crit" },
  final: { t: "Informe final", c: "--ok", p: "ok" },
  pre: { t: "Anterior a la CIAF", c: "--muted", p: "neutral" },
};
const SERVICES = ["Alta velocidad", "Larga distancia", "Internacional / Media distancia", "Cercanías"];
const acc = { map: null, markers: {}, data: [], service: new Set(), status: new Set(), sort: "date", sel: "urda" };
const radius = (f) => 5 + Math.sqrt(f) * 1.8;
const visible = (d) => (!acc.service.size || acc.service.has(d.service)) && (!acc.status.size || acc.status.has(d.status));
const toggle = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));

function buildChips() {
  const fs = document.getElementById("f-service");
  const fst = document.getElementById("f-status");
  for (const s of SERVICES) {
    const b = h("button", { class: "chip", "aria-pressed": "false" }, s);
    b.onclick = () => { toggle(acc.service, s); b.setAttribute("aria-pressed", acc.service.has(s)); renderAcc(); };
    fs.append(b);
  }
  for (const [k, v] of Object.entries(STATUS)) {
    const b = h("button", { class: "chip", "aria-pressed": "false" }, v.t);
    b.onclick = () => { toggle(acc.status, k); b.setAttribute("aria-pressed", acc.status.has(k)); renderAcc(); };
    fst.append(b);
  }
  const sd = document.getElementById("sort-date");
  const sf = document.getElementById("sort-fat");
  sd.onclick = () => { acc.sort = "date"; sd.setAttribute("aria-pressed", "true"); sf.setAttribute("aria-pressed", "false"); renderAcc(); };
  sf.onclick = () => { acc.sort = "fat"; sf.setAttribute("aria-pressed", "true"); sd.setAttribute("aria-pressed", "false"); renderAcc(); };
}

function drawAccMarkers() {
  for (const d of [...acc.data].sort((a, b) => b.fat - a.fat)) {
    const m = L.circleMarker([d.lat, d.lon], {
      radius: radius(d.fat), color: css("--panel"), weight: 1.5,
      fillColor: css(STATUS[d.status].c), fillOpacity: 0.85,
      dashArray: d.provisional ? "3 3" : null,
    });
    m.bindTooltip(`${d.place} · ${fmtDate(d.date)} · ${d.fatTxt} fallecidos`);
    m.on("click", () => select(d.id, true));
    m.addTo(acc.map);
    acc.markers[d.id] = m;
  }
}

function renderAcc() {
  const rows = acc.data.filter(visible).sort((a, b) => (acc.sort === "date" ? b.date.localeCompare(a.date) : b.fat - a.fat));
  const totF = rows.reduce((s, d) => s + d.fat, 0);
  const prov = rows.some((d) => d.provisional);
  document.getElementById("summary").replaceChildren(
    h("span", {}, h("b", {}, rows.length), " accidentes"),
    h("span", {}, h("b", {}, `${prov ? "≥ " : ""}${totF}`), " fallecidos en total"),
    prov ? h("span", {}, "incluye cifras provisionales") : ""
  );
  const list = document.getElementById("list");
  if (!rows.length) {
    list.replaceChildren(h("div", { class: "empty" }, "Ningún accidente coincide con estos filtros. Quita alguno para ver más resultados."));
  } else {
    list.replaceChildren(...rows.map((d) => {
      const s = STATUS[d.status];
      const card = h("article", { class: `card${acc.sel === d.id ? " sel" : ""}`, id: `c-${d.id}`, tabindex: "0" },
        h("div", { class: "card-top" },
          h("h3", {}, d.place, " ", h("span", { class: "meta" }, `· ${d.prov}`)),
          h("span", { class: `pill ${d.provisional ? "crit" : s.p}` }, `${d.provisional ? "Provisional · " : ""}${s.t}`)),
        h("div", { class: "meta mono" }, `${fmtDate(d.date)}${d.time ? " · " + d.time : ""} · ${d.type} · ${d.service}`),
        h("div", { class: "nums" },
          h("div", {}, h("b", { class: "crit" }, d.fatTxt), "fallecidos"),
          h("div", {}, h("b", {}, d.inj), `heridos${d.injNote ? " · " + d.injNote : ""}`)),
        h("div", { class: "detail" },
          h("p", {}, h("span", { class: "label" }, "Trenes"), h("br"), d.trains),
          h("p", {}, h("span", { class: "label" }, "Qué pasó"), h("br"), d.summary),
          h("p", {}, h("span", { class: "label" }, "Causa e investigación"), h("br"), d.cause),
          h("div", { class: "src" }, h("span", { class: "label" }, "Fuentes"),
            d.src.map(([n, u]) => h("a", { href: u, target: "_blank", rel: "noopener" }, n))))
      );
      card.addEventListener("click", (e) => { if (!e.target.closest("a")) select(d.id, false); });
      card.addEventListener("keydown", (e) => { if (e.key === "Enter") select(d.id, false); });
      return card;
    }));
  }
  for (const d of acc.data) {
    const m = acc.markers[d.id];
    if (!m) continue;
    const on = visible(d);
    m.setStyle({ fillOpacity: on ? 0.85 : 0.12, opacity: on ? 1 : 0.2, color: acc.sel === d.id ? css("--ink") : css("--panel"), weight: acc.sel === d.id ? 3 : 1.5 });
  }
}

function select(id, fromMap) {
  acc.sel = acc.sel === id && !fromMap ? null : id;
  const d = acc.data.find((x) => x.id === id);
  if (!visible(d)) {
    acc.service.clear(); acc.status.clear();
    document.querySelectorAll("#f-service .chip, #f-status .chip").forEach((b) => b.setAttribute("aria-pressed", "false"));
  }
  renderAcc();
  if (fromMap) document.getElementById(`c-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function loadAcc() {
  try {
    const r = await fetch("data/accidentes.json");
    acc.data = (await r.json()).accidentes;
  } catch {
    document.getElementById("list").replaceChildren(h("div", { class: "empty" }, "No se ha podido cargar el registro de accidentes. Recarga la página."));
    return;
  }
  drawAccMarkers();
  renderAcc();
}

/* ---------------- Inicio ---------------- */

live.map = makeMap("live-map");
live.layer = L.layerGroup().addTo(live.map);
acc.map = makeMap("acc-map");
document.getElementById("alert-q").addEventListener("input", (e) => { live.q = e.target.value; renderAlerts(); });
buildChips();
loadAcc();
loadLive();
setInterval(loadLive, 60_000);
