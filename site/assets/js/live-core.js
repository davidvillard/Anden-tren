"use strict";
// Datos en directo compartidos por todas las páginas: trenes, líneas, avisos,
// enlaces a cada ficha y el buscador.
(function () {
  const { h, norm, css, fmtTime, ago } = window.Anden;
  const LIVE_URL = "/api/live";
  const REFRESH_MS = 15000;
  const S = { live: null, redes: [], lineas: [], acc: [], subs: [], scope: window.ANDEN_RED || null };

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

  // Alta velocidad, larga y media distancia (visor de Renfe). grupo: av, ld o md
  const GRUPOS = { cerc: "Cercanías", md: "Media distancia y regionales", ld: "Larga distancia", av: "Alta velocidad" };
  const GRUPO_COLOR = { md: "#E07B00", ld: "#1E3BA6", av: "#7B2D8E" };
  const TIPO_CORTO = { AVE: "AVE", Avlo: "AVLO", Avant: "AVANT", Euromed: "EMED", Alvia: "ALVIA", Intercity: "IC", "Media Distancia": "MD", Regional: "R", "Regional Exprés": "RE" };
  const tipoCorto = (tipo) => TIPO_CORTO[tipo] || "LD";
  const ldTrains = () => (S.live?.largaDistancia?.trains || []).map((t) => ({ ...t, ld: true, code: tipoCorto(t.tipo) }));
  const trainTitle = (t) => (t.ld ? `${t.tipo} ${t.num}` : `Tren ${t.num}`);

  // routeId de Renfe: <red>T<nº><línea>, p. ej. 10T0011C4 → red 10, línea C4
  const routeRed = (r) => { const m = /^(\d{2})T/.exec(r || ""); return m ? S.redes.find((x) => (x.codigos || []).includes(m[1])) || null : null; };
  const routeLine = (r) => { const m = /T\d+([A-Za-z]+\d+[a-zA-Z]?)$/.exec(r || ""); return m ? m[1].toUpperCase().replace(/([A-Z]+\d+)[A-Z]$/, "$1") : null; };
  const alertText = (a) => norm(`${a.header} ${a.desc} ${a.routes.join(" ")}`);
  // Texto con solo letras y números separados por un espacio: para buscar palabras
  // enteras ("vic" no debe encontrarse dentro de "servicio").
  const words = (x) => ` ${norm(x).replace(/[^a-z0-9ñç]+/g, " ").trim()} `;
  const hasWord = (text, w) => { const k = words(w); return k.trim().length > 1 && text.includes(k); };

  /* Índice de estaciones (de /data/lineas.json): nombre → líneas que paran allí.
     Sirve para colocar en su línea los avisos que Renfe publica sin línea
     (ascensores, estaciones cerradas...) y para buscar por estación. */
  const CIUDADES = new Set(["madrid", "barcelona", "sevilla", "valencia", "malaga", "cadiz", "bilbao", "zaragoza", "murcia", "alicante", "oviedo", "gijon", "santander"]);
  let stationIdx = null;
  function stations() {
    if (stationIdx || !S.lineas.length) return stationIdx || [];
    const map = new Map();
    const add = (name, label, key, short = false) => {
      const w = words(name).trim();
      if (w.length < 3) return;
      if (!map.has(w)) map.set(w, { w, label, keys: new Set() });
      const st = map.get(w);
      st.keys.add(key);
      if (short) st.short = true; else (st.full ||= new Set()).add(key);
    };
    for (const l of S.lineas) {
      const key = lineKey(l.code, l.red);
      for (const rec of l.recorridos || []) for (const p of rec.paradas || []) {
        add(p, p, key);
        // "Asamblea de Madrid-Entrevías" también se nombra "Entrevías"; "Madrid-Atocha", "Atocha"
        const parts = p.split(/\s*[-/]\s*/).map((x) => x.trim()).filter(Boolean);
        if (parts.length > 1) for (const x of parts) if (x.length >= 4 && !CIUDADES.has(words(x).trim())) add(x, p, key);
        // "Villalba de Guadarrama" también se nombra "Villalba"
        const m = /^(.{5,}?) de [A-ZÁÉÍÓÚ]/.exec(p);
        if (m && !/[-/]/.test(m[1]) && !CIUDADES.has(words(m[1]).trim())) add(m[1], p, key, true);
      }
    }
    // Un nombre corto ("Villalba") solo vale si no es a la vez el nombre completo de otra estación
    for (const [w, st] of map) if (st.short && st.full) st.keys = st.full;
    // Los nombres largos primero, para que "Alcalá de Henares-Universidad" gane a "Alcalá de Henares"
    stationIdx = [...map.values()].sort((a, b) => b.w.length - a.w.length);
    return stationIdx;
  }
  // Líneas de un aviso sin línea, deducidas de las estaciones que nombra
  const inferred = new Map();
  function inferLines(a) {
    if (inferred.has(a.id)) return inferred.get(a.id);
    const scan = (raw) => {
      let text = words(raw);
      const keys = new Set();
      for (const st of stations()) if (text.includes(` ${st.w} `)) { st.keys.forEach((k) => keys.add(k)); text = text.split(` ${st.w} `).join(" · "); }
      return keys;
    };
    // Primero la estación de la que habla el aviso ("ascensor de la estación de Sol..."),
    // sin contar los destinos que nombra después ("sentido Príncipe Pío-Chamartín")
    const full = `${a.header} ${a.desc}`;
    const lead = /(?:estaci[oó]n(?:es)?(?: de)?|ascensor(?:es)?(?: de)?|plataforma de)\s+([^,.;:(]+)/i.exec(full) || /^\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ -]{2,})[.:]/.exec(full);
    let keys = lead ? scan(lead[1].split(/\s+(?:con|que|sentido|desde|en)\s/i)[0]) : new Set();
    if (!keys.size) keys = scan(full);
    // Si las estaciones caen en varias redes, se queda la red con más coincidencias
    const per = {};
    for (const k of keys) { const r = k.split("|")[1]; per[r] = (per[r] || 0) + 1; }
    const best = Math.max(0, ...Object.values(per));
    const out = [...keys].filter((k) => per[k.split("|")[1]] === best);
    if (S.lineas.length) inferred.set(a.id, out);
    return out;
  }
  const routedLines = (a) => [...new Set(a.routes.map((x) => { const r = routeRed(x), l = routeLine(x); return l ? lineKey(l, r?.slug) : null; }).filter(Boolean))];
  const alertLines = (a) => (a.routes.length ? routedLines(a) : inferLines(a));
  function alertRedes(a) {
    const fromLines = [...new Set(alertLines(a).map((k) => k.split("|")[1]).filter((x) => x && x !== "otras"))];
    if (a.routes.length) return [...new Set([...a.routes.map((x) => routeRed(x)?.slug).filter(Boolean), ...fromLines])];
    if (fromLines.length) return fromLines;
    // Último recurso: el nombre de la ciudad o de una estación conocida, como palabra entera
    const text = words(`${a.header} ${a.desc}`);
    const hits = S.redes.filter((r) => r.claves.some((k) => hasWord(text, k)));
    return hits.length === 1 ? [hits[0].slug] : [];
  }
  function alerts(scope = S.scope) {
    const all = S.live?.cercanias?.alerts || [];
    return scope ? all.filter((a) => alertRedes(a).includes(scope)) : all;
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
    // "Muchos retrasos" solo con al menos 3 trenes con dato: un tren suelto no define una línea
    if (o.pctLate > 0.3 && o.known >= 3) return { cls: "crit", text: "Muchos retrasos" };
    if (o.late) return { cls: "warn", text: "Algunos retrasos" };
    return { cls: "ok", text: "Funciona con normalidad" };
  }
  function summary(scope = S.scope) {
    const all = trains(scope);
    const known = all.filter((t) => t.delayMin !== null && t.delayMin !== undefined);
    const late = known.filter((t) => t.delayMin >= 3);
    const ld = S.live?.largaDistancia?.trips || [];
    // Con menos de 5 trenes con dato (de madrugada) un porcentaje engaña: no se calcula
    const few = known.length < 5;
    return {
      trains: all.length, known: known.length, late: late.length, few,
      pctLate: known.length && !few ? late.length / known.length : null,
      avg: known.length && !few ? known.reduce((s, t) => s + Math.max(0, t.delayMin), 0) / known.length : null,
      alerts: alerts(scope).length,
      ldCancelled: ld.filter((t) => t.cancelled).length, ld: ld.length,
    };
  }
  // Hora de Madrid entre las 00:30 y las 05:00: casi no hay servicio
  function isNight() {
    const h = Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", "."));
    return h >= 0.3 && h < 5;
  }
  function nightNote(s) {
    const h = Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", "."));
    const night = h >= 0.3 && h < 5;
    // De día, una red sin ningún tren casi siempre es un fallo de los datos de Renfe, no de servicio
    if (!night && S.scope && s.trains === 0) return "Renfe no está enviando ahora las posiciones de los trenes de esta red. No quiere decir que no circulen: los avisos de abajo sí están al día.";
    if (!s.few && !night) return null;
    return night
      ? "Fuera de horario: de madrugada casi no circulan trenes de Cercanías. El servicio vuelve entre las 5:00 y las 6:00, según la línea."
      : "Ahora mismo hay muy pocos trenes con datos de retraso; por eso no se calculan porcentajes.";
  }
  const fmtMin = (v) => (v === null ? "—" : `${v.toFixed(1).replace(".", ",")} min`);
  const fmtPct = (v) => (v === null ? "—" : `${Math.round(v * 100)} %`);

  /* ---------- Componentes ---------- */
  const lineBadge = (code) => h("span", { class: "line-badge" }, code || "—");
  const trainRow = (t) => {
    const d = delayInfo(t.delayMin);
    const sub = t.ld ? [t.origen && t.destino ? `${t.origen} → ${t.destino}` : "", t.ts ? `posición de las ${fmtTime(t.ts)}` : ""]
      : [t.red && !S.scope ? t.red.corto : "", t.ts ? `posición de las ${fmtTime(t.ts)}` : ""];
    return h("a", { class: "row", href: trainUrl(t) },
      lineBadge(t.code),
      h("span", { class: "grow" }, h("strong", {}, trainTitle(t)), h("span", {}, sub.filter(Boolean).join(" · "))),
      h("span", { class: `tag ${d.cls}` }, d.short));
  };
  // Texto del aviso para mostrar: sin las etiquetas internas de Renfe (#MadC5) al principio
  const cleanAlert = (x) => String(x || "").replace(/^(\s*#\w+)+\s*/, "").trim();
  // Los teléfonos que vienen dentro del aviso se pueden pulsar para llamar
  function withPhones(text) {
    const parts = String(text).split(/(\b(?:\+34\s?)?[6-9]\d{2}(?:[\s.]?\d{2,3}){3}\b)/);
    return parts.map((p, i) => (i % 2 ? h("a", { href: `tel:${p.replace(/[^\d+]/g, "")}` }, p) : p));
  }
  // Renfe suele mandar el título vacío y todo en la descripción: entonces se muestra una sola vez
  function alertCard(a) {
    const head = cleanAlert(a.header), body = cleanAlert(a.desc);
    const title = head || body, rest = head && body && body !== head ? body : "";
    return h("article", { class: "card alert-item", id: `aviso-${a.id}` },
    h(rest ? "h3" : "p", { class: rest ? "" : "alert-text" }, ...withPhones(title)),
    rest ? h("p", {}, ...withPhones(rest)) : "",
    alertLines(a).length ? h("div", { class: "lines" }, alertLines(a).slice(0, 8).map((k) => h("a", { class: "tag info", href: lineUrl(k) }, lineName(k, true)))) : "",
    a.start || a.end ? h("p", { class: "small muted" }, [a.start ? `Desde el ${new Date(a.start * 1000).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "medium", timeStyle: "short" })}` : "", a.end ? `hasta el ${new Date(a.end * 1000).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "medium", timeStyle: "short" })}` : ""].filter(Boolean).join(" ")) : "");
  }
  const kpi = (val, label, href) => h(href ? "a" : "div", { class: "card kpi tile", href }, h("b", {}, val), h("span", {}, label), href ? h("span", { class: "more" }, "Ver") : "");

  /* ---------- Vías: los trenes avanzan siguiendo la vía ---------- */
  // Red de vías de España simplificada (site/data/vias.json, de OpenStreetMap). Cada posición
  // se encaja en la vía más cercana y el tren va de una a otra por el camino más corto sobre
  // la red. Si no hay vía cerca o el camino es raro, se mueve en línea recta.
  const Vias = (() => {
    const CELL = 0.02; // celdas de unos 2 km para buscar vías cercanas
    const MAX_SNAP_M = 150;
    let pts = [], adj = [], grid = new Map(), ok = false, loading = null;
    // Distancia en metros (aproximación plana, de sobra para unos km)
    const dist = (a, b) => { const k = Math.cos((a[0] * Math.PI) / 180); return Math.hypot((b[0] - a[0]) * 111320, (b[1] - a[1]) * 111320 * k); };
    function build({ tramos }) {
      const index = new Map();
      const node = (la, lo) => { const k = la * 1e8 + lo; let id = index.get(k); if (id === undefined) { id = pts.length; index.set(k, id); pts.push([la / 1e5, lo / 1e5]); adj.push([]); } return id; };
      for (const t of tramos) {
        let la = t[0], lo = t[1], prev = node(la, lo);
        for (let i = 2; i < t.length; i += 2) {
          la += t[i]; lo += t[i + 1];
          const cur = node(la, lo);
          if (cur === prev) continue;
          const d = dist(pts[prev], pts[cur]);
          adj[prev].push(cur, d); adj[cur].push(prev, d);
          const [a, b] = [pts[prev], pts[cur]];
          for (let x = Math.floor(Math.min(a[0], b[0]) / CELL); x <= Math.floor(Math.max(a[0], b[0]) / CELL); x++)
            for (let y = Math.floor(Math.min(a[1], b[1]) / CELL); y <= Math.floor(Math.max(a[1], b[1]) / CELL); y++) {
              const k = `${x},${y}`; (grid.get(k) || grid.set(k, []).get(k)).push(prev, cur);
            }
          prev = cur;
        }
      }
      ok = true;
    }
    // Punto de la vía más cercano a p (a menos de MAX_SNAP_M), con el tramo [a, b] en que cae
    function snap(p) {
      let best = null;
      const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
        const segs = grid.get(`${x},${y}`); if (!segs) continue;
        for (let i = 0; i < segs.length; i += 2) {
          const A = pts[segs[i]], B = pts[segs[i + 1]];
          const k = Math.cos((p[0] * Math.PI) / 180);
          const bx = (B[1] - A[1]) * k, by = B[0] - A[0], px = (p[1] - A[1]) * k, py = p[0] - A[0];
          const L = bx * bx + by * by, t = L ? Math.max(0, Math.min(1, (px * bx + py * by) / L)) : 0;
          const q = [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])], d = dist(p, q);
          if (d <= MAX_SNAP_M && (!best || d < best.d)) best = { a: segs[i], b: segs[i + 1], q, d };
        }
      }
      return best;
    }
    // Camino más corto sobre la red desde s1 hasta s2 (Dijkstra con tope de longitud).
    // Si s2 no se alcanza (p. ej. está en la vía paralela de una vía doble), el tren sigue
    // por su propia vía hasta el punto más cercano a b, si queda a menos de 300 m.
    function route(s1, s2, b, maxLen) {
      if ((s1.a === s2.a && s1.b === s2.b) || (s1.a === s2.b && s1.b === s2.a)) return [s1.q, s2.q];
      const cost = new Map(), from = new Map(), heap = [];
      const push = (n, c, f) => { if (c >= (cost.get(n) ?? Infinity) || c > maxLen) return; cost.set(n, c); from.set(n, f); heap.push([c, n]); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
      push(s1.a, dist(s1.q, pts[s1.a]), -1); push(s1.b, dist(s1.q, pts[s1.b]), -1);
      const goal = new Map([[s2.a, dist(pts[s2.a], s2.q)], [s2.b, dist(pts[s2.b], s2.q)]]);
      let best = Infinity, end = -1, steps = 0, near = -1, nearD = 300;
      while (heap.length && steps++ < 20000) {
        const [c, n] = pop();
        if (c > (cost.get(n) ?? Infinity) || c >= best) continue;
        if (goal.has(n) && c + goal.get(n) < best) { best = c + goal.get(n); end = n; }
        const dn = dist(pts[n], b); if (dn < nearD) { nearD = dn; near = n; }
        const e = adj[n];
        for (let i = 0; i < e.length; i += 2) push(e[i], c + e[i + 1], n);
      }
      if (end < 0 && near < 0) return null;
      const path = end >= 0 ? [s2.q] : [];
      for (let n = end >= 0 ? end : near; n !== -1; n = from.get(n)) path.push(pts[n]);
      path.push(s1.q);
      return path.reverse();
    }
    return {
      load() { return (loading ||= fetch("/data/vias.json").then((r) => r.json()).then(build).catch(() => {})); },
      get ok() { return ok; },
      dist,
      // Posición sobre la vía (o la misma si no hay vía cerca)
      onTrack(p) { const s = ok && snap(p); return s ? s.q : p; },
      // Recorrido de a a b siguiendo la vía; termina en la vía si b está cerca de una
      path(a, b) {
        const s2 = ok && snap(b); if (!s2) return [a, b];
        const s1 = snap(a); if (!s1) return [a, s2.q];
        // Si el camino por la vía es mucho más largo que la línea recta, algo no cuadra (vías paralelas, datos raros)
        return route(s1, s2, b, 1.6 * dist(a, b) + 800) || [a, s2.q];
      },
    };
  })();

  // Capa de trenes del mapa. Cada tren conserva su punto entre actualizaciones y,
  // cuando llega una posición nueva, avanza hasta ella siguiendo la vía durante el
  // intervalo de refresco: así los trenes se ven moverse aunque Renfe dé la posición cada pocos segundos.
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // Punto a una fracción k (0–1) del recorrido
  function along(a, k) {
    const goal = a.len * k;
    while (a.i < a.cum.length - 2 && a.cum[a.i + 1] < goal) a.i++;
    const seg = a.cum[a.i + 1] - a.cum[a.i], f = seg ? (goal - a.cum[a.i]) / seg : 1;
    const p = a.path[a.i], q = a.path[a.i + 1];
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  }
  const popupOf = (t) => {
    const d = delayInfo(t.delayMin);
    return h("div", {},
      h("strong", {}, t.ld ? trainTitle(t) : t.line ? `${lineName(t.line, true)} · tren ${t.num}` : `Tren ${t.num}`), h("br"),
      t.ld && t.origen ? [h("span", {}, `${t.origen} → ${t.destino}`), h("br")] : "",
      h("span", { class: `tag ${d.cls}` }, d.text), h("br"),
      h("a", { href: trainUrl(t) }, "Ver ficha del tren"));
  };
  function trainLayer(map) {
    const group = L.layerGroup().addTo(map), marks = new Map();
    let raf = null, last = 0;
    Vias.load();
    function tick(now) {
      // 20 fotogramas por segundo bastan para trenes y ahorran batería en el móvil
      if (now - last < 50) { raf = requestAnimationFrame(tick); return; }
      last = now;
      let moving = false;
      for (const m of marks.values()) {
        const a = m.anim; if (!a) continue;
        const k = Math.min(1, (now - a.t0) / a.dur);
        m.setLatLng(along(a, k));
        if (k < 1) moving = true; else m.anim = null;
      }
      raf = moving ? requestAnimationFrame(tick) : null;
    }
    function update(list) {
      const seen = new Set(), now = performance.now();
      for (const t of list) {
        seen.add(t.id);
        const style = { fillColor: delayInfo(t.delayMin).color, color: t.ld ? GRUPO_COLOR[t.grupo] : "#fff", weight: t.ld ? 3 : 1.5, radius: t.ld ? 7 : 6 };
        const raw = [t.lat, t.lon];
        let m = marks.get(t.id);
        if (!m) {
          m = L.circleMarker(Vias.onTrack(raw), { ...style, fillOpacity: 0.95 }).bindPopup(() => popupOf(m.train)).addTo(group);
          marks.set(t.id, m);
        } else {
          m.setStyle(style);
          // Si el navegador no ha podido animar (pestaña en segundo plano, ahorro de energía),
          // el punto salta a donde debía llegar antes de seguir
          if (m.anim && now - m.anim.t0 >= m.anim.dur) { m.setLatLng(m.anim.path.at(-1)); m.anim = null; }
          if (raw[0] !== m.raw[0] || raw[1] !== m.raw[1]) {
            const cur = m.getLatLng(), from = [cur.lat, cur.lng];
            // Saltos imposibles (más de 360 km/h: datos raros de Renfe) o movimiento reducido: sin animación
            const segs = (now - (m.changedAt || now)) / 1000 || REFRESH_MS / 1000;
            if (reducedMotion || document.hidden || Vias.dist(from, raw) > Math.max(3000, 100 * segs)) { m.anim = null; m.setLatLng(Vias.onTrack(raw)); }
            else {
              const path = Vias.path(from, raw), cum = [0];
              for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Vias.dist(path[i - 1], path[i]));
              // Dura lo que tardó en llegar esta posición (Renfe no actualiza todos los trenes a la vez),
              // para que el tren no se pare a mitad de camino esperando la siguiente
              m.anim = { path, cum, len: cum.at(-1), i: 0, t0: now, dur: Math.min(3 * REFRESH_MS, Math.max(REFRESH_MS, now - (m.changedAt || now))) };
            }
            m.changedAt = now;
          }
        }
        m.raw = raw;
        m.train = t;
        if (m.isPopupOpen()) m.setPopupContent(popupOf(t));
      }
      for (const [id, m] of marks) if (!seen.has(id)) { group.removeLayer(m); marks.delete(id); }
      if (!raf && [...marks.values()].some((m) => m.anim)) raf = requestAnimationFrame(tick);
    }
    return { update };
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
    // Sinónimos: lo que escribe la gente → lo que aparece en los nombres de estación
    const SYN = [[/^(airport|aeropuerto|aeroport|el prat|prat)$/, "aeropuerto aeroport"]];
    const LD_WORDS = /^(ave|avlo|alvia|avant|euromed|alta velocidad|larga distancia|media distancia|ouigo|iryo|intercity)\b/;
    function search(qRaw) {
      const q = norm(qRaw).trim(); if (!q) return [];
      const qw = words(q).trim();
      const starts = (text) => words(text).includes(` ${qw}`); // palabra que empieza por lo escrito
      const out = [];
      // 1. Líneas: todas las del catálogo, tengan o no trenes ahora. "c3", "c-3", "c3 madrid", "linea c3"
      const live = new Map(lines(null).map((o) => [o.key, o]));
      const qCode = q.replace(/^linea\s+/, "").replace(/[\s-]/g, "");
      const lineHits = [];
      for (const l of S.lineas) {
        const key = lineKey(l.code, l.red), r = redBySlug(l.red);
        const code = norm(l.code).replace("-", "");
        const full = `${code}${norm(r?.corto || "").replace(/\s/g, "")}`;
        const qBase = qCode.replace(/(nord|sud|norte|sur)$/, "");
        if (!(code === qCode || code === qBase || (qCode.length > code.length && full.startsWith(qCode)) || (qCode.length >= 2 && code.startsWith(qCode) && /\d/.test(qCode)))) continue;
        const o = live.get(key);
        const redRank = Math.max(0, S.redes.length - S.redes.findIndex((x) => x.slug === l.red)) / 100; // Madrid, Rodalies... primero
        // Orden: código exacto, red de la página, red más usada (Madrid, Rodalies...), y si tiene trenes
        lineHits.push({ score: (code === qCode ? 1000 : 0) + (S.scope === l.red ? 500 : 0) + redRank * 1000 + (o ? 1 : 0), r: { href: lineUrl(key), badge: l.code, title: `Línea ${l.code} · ${r?.corto || ""}`,
          sub: o ? `${o.trains.length} ${o.trains.length === 1 ? "tren" : "trenes"} · ${lineStatus(o).text}` : (isNight() ? "Sin trenes circulando ahora" : "Sin datos en directo ahora") + " · ver recorrido y avisos", group: "Líneas" } });
      }
      lineHits.sort((a, b) => b.score - a.score).forEach((x) => out.push(x.r));
      // 2. Estaciones (y sinónimos como "aeropuerto")
      const ldWord = LD_WORDS.test(q);
      const syn = SYN.find(([re]) => re.test(q));
      const stTerms = syn ? syn[1].split(" ") : [qw];
      const seenSt = new Set();
      if (qw.length >= 3 && !ldWord) for (const st of stations()) {
        if (!stTerms.some((t) => ` ${st.w} `.includes(` ${t}`)) || seenSt.has(st.label)) continue;
        seenSt.add(st.label);
        const keys = [...(st.full || st.keys)];
        out.push({ href: lineUrl(keys[0]), badge: "●", title: st.label, sub: `Estación · ${keys.map((k) => lineName(k, true)).slice(0, 4).join(", ")}`, group: "Estaciones" });
      }
      // 3. Redes (ciudades)
      for (const r of S.redes) if ([r.nombre, r.corto, ...r.claves].some(starts)) out.push({ href: `/cercanias/${r.slug}`, badge: "C", title: r.nombre, sub: "Retrasos e incidencias de la red", group: "Redes de Cercanías" });
      // 4. Trenes por número
      for (const t of trains()) if ([t.num, t.label, t.tripId, t.id].some((v) => v && norm(v).includes(q))) out.push({ href: trainUrl(t), badge: t.code || "—", title: `Tren ${t.num}${t.line ? " · " + lineName(t.line) : ""}`, sub: delayInfo(t.delayMin).text, group: "Trenes" });
      if (!S.scope) for (const t of ldTrains()) if ([t.num, `${t.tipo} ${t.num}`, t.origen, t.destino].some((v) => v && (norm(v).includes(q) || starts(v)))) out.push({ href: trainUrl(t), badge: t.code, title: trainTitle(t), sub: `${t.origen ? `${t.origen} → ${t.destino} · ` : ""}${delayInfo(t.delayMin).text}`, group: "Alta velocidad, larga y media distancia" });
      if (LD_WORDS.test(q)) out.push({ href: "/retrasos#larga-distancia", badge: "AV", title: "Alta velocidad y larga distancia", sub: "Retrasos y trenes cancelados de Renfe ahora", group: "Alta velocidad, larga y media distancia" });
      if (/^\d{4,6}$/.test(q) && !out.some((r) => r.group === "Trenes" || r.group.startsWith("Alta"))) out.push({ href: "/retrasos#larga-distancia", badge: "?", title: `El tren ${q} no está circulando ahora`, sub: "Solo se ven los trenes en marcha. Mira los cancelados de alta velocidad y larga distancia", group: "Trenes" });
      // 5. Avisos y accidentes (palabras enteras)
      if (!ldWord) for (const a of alerts()) if (starts(`${a.header} ${a.desc}`) || a.routes.some((x) => norm(x).includes(q))) out.push({ href: `/avisos#aviso-${a.id}`, badge: "!", title: cleanAlert(a.header) || cleanAlert(a.desc), sub: alertLines(a).map((k) => lineName(k, true)).slice(0, 3).join(", ") || "Aviso de Renfe", group: "Avisos" });
      for (const d of S.acc) if (starts(`${d.place} ${d.prov}`)) out.push({ href: `/accidentes#${d.id}`, badge: "⚑", title: `${d.place} (${d.prov})`, sub: `${d.type} · ${window.Anden.fmtDate(d.date)}`, group: "Accidentes" });
      // Orden de los grupos: lo más probable primero (la ciudad antes que sus estaciones)
      const ORDER = syn ? ["Estaciones", "Líneas", "Redes de Cercanías", "Trenes", "Alta velocidad, larga y media distancia", "Avisos", "Accidentes"] : ldWord ? ["Alta velocidad, larga y media distancia", "Líneas", "Redes de Cercanías", "Estaciones", "Trenes", "Avisos", "Accidentes"]
        : ["Líneas", "Redes de Cercanías", "Estaciones", "Trenes", "Alta velocidad, larga y media distancia", "Avisos", "Accidentes"];
      const per = {};
      return out.filter((r) => (per[r.group] = (per[r.group] || 0) + 1) <= 6)
        .map((r, i) => [r, i]).sort((a, b) => ORDER.indexOf(a[0].group) - ORDER.indexOf(b[0].group) || a[1] - b[1]).map(([r]) => r);
    }
    function render() {
      list.replaceChildren();
      if (!input.value.trim()) return close();
      if (!results.length) list.append(h("li", { class: "empty-opt", role: "presentation" }, S.live ? "Sin resultados. Prueba con tu línea (C3, R2…), tu estación o tu ciudad." : "Cargando datos de Renfe…"));
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
    let pendingSubmit = false;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      results = search(input.value);
      if (results.length) location.href = results[Math.max(0, active)].href;
      else { pendingSubmit = !S.live; render(); }
    });
    // Si se pulsó Enter antes de que llegaran los datos, se busca en cuanto llegan
    S.subs.push(() => { if (document.activeElement === input && input.value.trim()) { results = search(input.value); active = results.length ? 0 : -1; render(); if (pendingSubmit && results.length) location.href = results[0].href; pendingSubmit = false; } });
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
    // Enlaces con #ancla (p. ej. /retrasos#larga-distancia): el contenido llega después de cargar,
    // así que se vuelve a saltar al ancla cuando ya está pintado
    if (!S.jumped && location.hash.length > 1) {
      S.jumped = true;
      try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: "start" }); } catch (e) {}
    }
  }
  async function start() {
    try { S.redes = (await (await fetch("/data/redes.json")).json()).redes; } catch (e) {}
    try { S.acc = (await (await fetch("/data/accidentes.json")).json()).accidentes; } catch (e) {}
    try { S.lineas = (await (await fetch("/data/lineas.json")).json()).lineas || []; } catch (e) {}
    await load();
    setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    setInterval(paintPill, 5000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  }

  window.AndenLive = {
    S, start, onUpdate: (f) => S.subs.push(f), attachSearch,
    trains, ldTrains, nightNote, isNight, alerts, alertsOfLine, alertLines, alertRedes, stations, cleanAlert, lines, lineStatus, summary, redBySlug,
    delayInfo, lineName, lineCode, lineUrl, trainUrl, lineKey, trainTitle, GRUPOS, GRUPO_COLOR, REFRESH_MS,
    fmtMin, fmtPct, lineBadge, trainRow, alertCard, kpi, trainLayer, Vias,
  };
})();
