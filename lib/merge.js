// Reglas que deciden qué propuestas de la IA (Gemini) se publican.
// - Una cifra solo cambia si la noticia la atribuye a un organismo oficial.
// - Un suceso nuevo necesita al menos dos medios distintos y una cifra oficial.
// - Los enlaces solo pueden ser de las noticias recibidas (nada inventado).
// - Un accidente nuevo necesita al menos dos medios distintos y una cifra oficial.
// - Una incidencia nueva (avería, tren parado, corte de vía) necesita al menos dos medios distintos.
// - Un accidente sin novedades en 72 h (una incidencia, en 6 h) deja de mostrarse como "en curso".
// - Las incidencias de hace más de 14 días se borran del estado.

const STALE_MS = 72 * 3600_000;
const STALE_INC_MS = 6 * 3600_000;
const KEEP_INC_MS = 14 * 86400_000;
// Quien da una cifra tiene que ser un organismo, no una persona suelta
const OFFICIAL = /(gobierno|junta|generalitat|xunta|govern|consejer|conselleria|ministeri|delegaci|subdelegaci|ayuntamiento|diputaci|112|emergencias|protecci[oó]n civil|guardia civil|polic[ií]a|mossos|ertzaintza|bomberos|samur|summa|sanidad|servicio|salud|hospital|ciaf|renfe|adif|iryo|ouigo|euskotren|fgc|ferrocarrils|transportes|presiden)/i;
const isInc = (x) => x?.clase === "incidencia";
// Fuentes que llegaron con el nombre de una persona en vez del organismo
const ALIAS = { page: "Gobierno de Castilla-La Mancha", "garcia-page": "Gobierno de Castilla-La Mancha", "garcía-page": "Gobierno de Castilla-La Mancha" };
// Duplicados: dos incidencias con menos de 48 h de diferencia son la misma si
// comparten una palabra del lugar (sin la provincia) o algún enlace.
const STOP = new Set(["tunel", "estacion", "entre", "cerca", "altura", "linea", "via", "tramo", "salida", "llegada", "zona", "puerta"]);
const placeWords = (l) => new Set(String(l || "").replace(/\([^)]*\)/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)));
const urls = (x) => new Set((x.enlaces || []).map((e) => e.url ?? e[1]));
function sameIncident(a, b, links) {
  if (Math.abs(new Date(a.inicio) - new Date(b.inicio)) > 48 * 3600_000) return false;
  const wa = placeWords(a.lugar), wb = placeWords(b.lugar);
  if ([...wa].some((w) => wb.has(w))) return true;
  const ua = urls(a);
  return [...(links || urls(b))].some((u) => ua.has(u));
}
// ¿La noticia habla de este suceso? Debe nombrar una palabra del lugar o la línea.
const LINE_CODE = /\b(C-?\d{1,2}[a-z]?|R\d{1,2}[NS]?|RT\d|RG\d|RL\d|T\d)\b/gi;
const plain = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function aboutIt(item, p) {
  const text = plain(`${item.title} ${item.summary}`);
  const place = [...placeWords(p.lugar), ...placeWords(p.provincia)];
  if (place.some((w) => new RegExp(`\\b${w}\\b`).test(text))) return true;
  const codes = [...new Set(String(`${p.linea || ""} ${p.titulo || ""}`).match(LINE_CODE) || [])].map((c) => plain(c).replace("-", ""));
  return codes.some((c) => new RegExp(`\\b${c.replace(/^([a-z]+)(\\d)/, "$1-?$2")}\\b`).test(text));
}
// Metro, tranvía y similares no son competencia de esta web
const isNotRail = (x) => /\b(metro|metros de|tranv[ií]a|metro ligero|funicular)\b/i.test(`${x.titulo} ${x.linea || ""}`)
  && !/cercan[ií]as|renfe|rodalies|adif|\bave\b|mercanc/i.test(`${x.titulo} ${x.linea || ""}`);
const fixFuente = (f) => (f && ALIAS[f.trim().toLowerCase()]) || f;
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const madrid = (d) => d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function cifraText(c, label) {
  if (!c || c.valor === null || c.valor === undefined) return null;
  return `${c.prefijo === "≥" ? "al menos " : ""}${c.valor} ${label}${c.nota ? ` (${c.nota})` : ""}`;
}

// Nota de una cifra: un matiz corto ("graves, 15 muy graves"), nunca un titular pegado.
export function cleanNota(n) {
  let t = String(n || "").replace(/\s+/g, " ").trim().replace(/[.;,]+$/, "");
  if (!t || t.length > 70 || /accidente|ferroviari|\d+\s+(heridos|fallecidos|muertos|personas)\b/i.test(t)) return "";
  return t.charAt(0).toLowerCase() + t.slice(1);
}
const NOTA_RE = /^(.*?\d+ (?:heridos|fallecidos)(?: graves)?) \((.*)\)$/;
function cleanTexto(texto) {
  const m = NOTA_RE.exec(texto || "");
  if (!m) return texto;
  const nota = cleanNota(m[2]);
  const sinRepetir = nota.replace(/^(heridos|fallecidos)\s+/i, "");
  return sinRepetir ? `${m[1]} (${sinRepetir})` : m[1];
}
// Cifras que menciona una entrada del historial: { fallecidos: 69, heridos: 10 }
function metricas(texto) {
  const out = {};
  for (const [, n, k] of String(texto || "").matchAll(/(\d+)\s+(fallecidos|heridos)/g)) out[k] ??= Number(n);
  return out;
}
/* Limpieza de un suceso, en cada pasada del cron (una sola fuente de verdad para la
   ficha, las preguntas frecuentes, el registro y lo que lee Google):
   - notas de las cifras cortas y en minúscula, sin titulares pegados;
   - en el historial se ocultan los picos que se corrigieron enseguida (74 → 69);
   - el historial siempre termina con la cifra que se muestra arriba. */
export function tidySuceso(s, now = new Date()) {
  // Un enlace por medio
  if (s.enlaces?.length) {
    const seen = new Set();
    s.enlaces = s.enlaces.filter((e) => { const n = Array.isArray(e) ? e[0] : e.nombre; return !seen.has(n) && seen.add(n); });
  }
  for (const c of Object.values(s.cifras || {})) {
    if (!c || c.nota === undefined) continue;
    const n = c.fuente || c.valor !== undefined ? cleanNota(c.nota) : c.nota;
    if (c.nota === "según medios") continue;
    if (n) c.nota = n; else delete c.nota;
  }
  const h = s.historial || [];
  for (const e of h) e.texto = cleanTexto(e.texto);
  for (const k of ["fallecidos", "heridos"]) {
    const seq = h.map((e, i) => ({ i, v: metricas(e.texto)[k] })).filter((x) => x.v !== undefined && !h[x.i].oculto);
    for (let j = 1; j < seq.length - 1; j++) {
      const a = seq[j - 1].v, v = seq[j].v, b = seq[j + 1].v;
      const pico = v > Math.max(a, b) * 1.05 || (k === "fallecidos" && v > b * 1.02 && b >= a);
      if (pico && Object.keys(metricas(h[seq[j].i].texto)).length === 1) h[seq[j].i].oculto = true;
    }
  }
  // Que la última entrada visible de cada cifra coincida con la de arriba
  for (const [k, label] of [["fallecidos", "fallecidos"], ["heridos", "heridos"]]) {
    const c = s.cifras?.[k];
    if (!c || c.valor === null || c.valor === undefined || !h.length) continue;
    const visibles = h.filter((e) => !e.oculto && metricas(e.texto)[k] !== undefined);
    const last = visibles[visibles.length - 1];
    const texto = cifraText(c, label);
    if (last && last.texto !== texto && !(metricas(last.texto)[k] === c.valor && !c.nota)) {
      // No se sabe a qué hora se publicó este matiz: se marca como el último balance
      h.push({ cuando: "Último balance", texto, fuente: c.fuente });
    }
  }
  if (h.length) s.historial = h;
  return s;
}

function acceptCifra(prev, prop, items) {
  if (!prop || prop.valor === null || prop.valor < 0 || prop.valor > 5000) return prev ?? null;
  if (!prop.organismo || !OFFICIAL.test(prop.organismo) || prop.noticia === null || !items[prop.noticia]) return prev ?? null;
  const next = { valor: prop.valor, prefijo: prop.minimo ? "≥" : "", fuente: prop.organismo };
  const nota = cleanNota(prop.nota);
  if (nota) next.nota = nota;
  return next;
}

export function merge({ state, proposal, items, now = new Date() }) {
  const out = { ...state, sucesos: (state.sucesos || []).map((s) => ({ ...s })) };
  const changes = [];
  const byId = new Map(out.sucesos.map((s) => [s.id, s]));

  for (const p of proposal.sucesos || []) {
    if (isNotRail(p)) continue; // metro, tranvía: no es tren
    // Solo cuentan las noticias que nombran el lugar o la línea del suceso: Gemini a veces
    // asocia titulares de otro tema (p. ej. Canal Sur en un descarrilamiento en Martorell)
    const refs = [...new Set((p.noticias || []).filter((i) => items[i] && aboutIt(items[i], p)))];
    const seenOutlet = new Set();
    const links = refs.filter((i) => { const n = items[i].source || items[i].link; return !seenOutlet.has(n) && seenOutlet.add(n); })
      .map((i) => ({ nombre: items[i].source || "Noticia", url: items[i].link, titulo: String(items[i].title || "").slice(0, 160) }));
    let s = p.id_existente ? byId.get(p.id_existente) : null;

    if (!s) {
      const medios = new Set(refs.map((i) => items[i].source).filter(Boolean));
      const fall = acceptCifra(null, p.fallecidos, items);
      const her = acceptCifra(null, p.heridos, items);
      const inc = isInc(p);
      if (medios.size < 2 || (!inc && !fall && !her)) continue;
      if (inc && placeWords(p.lugar).size === 0) continue; // sin lugar concreto no se publica
      const twin = inc && out.sucesos.find((x) => isInc(x) && sameIncident(x, { lugar: p.lugar, inicio: p.inicio || now.toISOString() }, new Set(links.map((l) => l.url))));
      if (twin) {
        const known = urls(twin);
        const fresh = links.filter((l) => !known.has(l.url));
        if (fresh.length) { twin.enlaces = [...fresh, ...(twin.enlaces || [])].slice(0, 8); twin.ultimaNovedad = now.toISOString(); }
        if (p.circulacion && p.circulacion !== twin.circulacion) twin.circulacion = p.circulacion;
        if (p.activo === false && twin.activo) { twin.activo = false; changes.push(`${twin.id}: deja de estar en curso`); }
        continue;
      }
      const fecha = (p.inicio || now.toISOString()).slice(0, 10);
      s = {
        id: `${inc ? "incidencia-" : ""}${slug(p.lugar)}-${fecha}`, activo: inc ? p.activo !== false : true, auto: true,
        clase: inc ? "incidencia" : "accidente", operador: p.operador || null, linea: p.linea || null,
        titulo: p.titulo, resumen: p.resumen, lugar: `${p.lugar} (${p.provincia})`,
        inicio: p.inicio || now.toISOString(), tipo: p.tipo, servicio: p.servicio, estado: "provisional",
        lat: p.lat, lon: p.lon,
        cifras: { ...(fall && { fallecidos: fall }), ...(her && { heridos: her }) },
        circulacion: p.circulacion || null, causas: p.causas || null,
        fuente: [fall?.fuente, her?.fuente].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" y "),
        historial: (fall || her) ? [{ cuando: madrid(now), texto: [cifraText(fall, "fallecidos"), cifraText(her, "heridos")].filter(Boolean).join(" y "), fuente: fall?.fuente || her?.fuente }] : [],
        enlaces: links.slice(0, 8),
        ultimaNovedad: now.toISOString(),
      };
      if (byId.has(s.id)) continue;
      out.sucesos.unshift(s);
      byId.set(s.id, s);
      changes.push(`${inc ? "Nueva incidencia" : "Nuevo suceso"}: ${s.titulo}`);
      continue;
    }

    // Suceso existente: actualizar cifras, circulación, causas y enlaces
    const prevF = s.cifras?.fallecidos, prevH = s.cifras?.heridos;
    const fall = acceptCifra(prevF, p.fallecidos, items);
    const her = acceptCifra(prevH, p.heridos, items);
    const changedF = fall && fall.valor !== prevF?.valor;
    const changedH = her && her.valor !== prevH?.valor;
    s.cifras = { ...s.cifras, ...(fall && { fallecidos: fall }), ...(her && { heridos: her }) };
    if (changedF || changedH) {
      const texto = [changedF && cifraText(fall, "fallecidos"), changedH && cifraText(her, "heridos")].filter(Boolean).join(" y ");
      s.historial = [...(s.historial || []), { cuando: madrid(now), texto, fuente: (changedF ? fall : her).fuente }];
      s.fuente = [fall?.fuente, her?.fuente].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" y ");
      changes.push(`${s.id}: ${texto}`);
    }
    // Una incidencia pasa a accidente si aparecen víctimas con cifra oficial
    if (isInc(s) && p.clase === "accidente" && (fall || her)) { s.clase = "accidente"; changes.push(`${s.id}: pasa a accidente`); }
    if (p.resumen && isInc(s) && p.resumen !== s.resumen) s.resumen = p.resumen;
    if (p.linea && !s.linea) s.linea = p.linea;
    if (p.operador && !s.operador) s.operador = p.operador;
    if (p.circulacion && p.circulacion !== s.circulacion) { s.circulacion = p.circulacion; changes.push(`${s.id}: circulación actualizada`); }
    if (p.causas && p.causas !== s.causas) { s.causas = p.causas; changes.push(`${s.id}: causas actualizadas`); }
    const known = new Set((s.enlaces || []).map((e) => e.url ?? e[1]));
    const fresh = links.filter((l) => !known.has(l.url));
    if (fresh.length) s.enlaces = [...fresh, ...(s.enlaces || [])].slice(0, 8);
    if (refs.length) s.ultimaNovedad = now.toISOString();
    if (p.activo === false && s.activo) { s.activo = false; changes.push(`${s.id}: deja de estar en curso`); }
  }

  // Une incidencias duplicadas en la más antigua y quita las que no tienen lugar
  const kept = [];
  for (const s of [...out.sucesos].sort((a, b) => new Date(a.inicio) - new Date(b.inicio))) {
    if (!isInc(s)) { kept.push(s); continue; }
    if (placeWords(s.lugar).size === 0 && !kept.some((k) => isInc(k) && sameIncident(k, s))) { changes.push(`${s.id}: borrada, sin lugar`); continue; }
    const main = kept.find((k) => isInc(k) && sameIncident(k, s));
    if (!main) { kept.push(s); continue; }
    const known = urls(main);
    main.enlaces = [...(main.enlaces || []), ...(s.enlaces || []).filter((e) => !known.has(e.url ?? e[1]))].slice(0, 8);
    if (new Date(s.ultimaNovedad || 0) > new Date(main.ultimaNovedad || 0)) { main.ultimaNovedad = s.ultimaNovedad; if (s.circulacion) main.circulacion = s.circulacion; }
    main.activo = main.activo || s.activo;
    changes.push(`${s.id}: unida a ${main.id}`);
  }
  out.sucesos = out.sucesos.filter((s) => kept.includes(s));

  for (const s of out.sucesos) {
    const last = new Date(s.ultimaNovedad || s.inicio).getTime();
    const limit = isInc(s) ? STALE_INC_MS : STALE_MS;
    if (s.activo && now.getTime() - last > limit) { s.activo = false; changes.push(`${s.id}: sin novedades en ${limit / 3600_000} h`); }
  }
  for (const s of out.sucesos) {
    for (const c of Object.values(s.cifras || {})) if (c?.fuente) c.fuente = fixFuente(c.fuente);
    tidySuceso(s, now);
    if (s.fuente) s.fuente = [...new Set(s.fuente.split(" y ").map(fixFuente))].join(" y ");
    for (const e of s.historial || []) if (e.fuente) e.fuente = fixFuente(e.fuente);
  }
  out.sucesos = out.sucesos.filter((s) => !isInc(s) || s.activo || now.getTime() - new Date(s.inicio).getTime() < KEEP_INC_MS);
  out.sucesos = out.sucesos.filter((s) => !(isInc(s) && isNotRail(s)) || (changes.push(`${s.id}: borrada, no es tren`), false));
  if (changes.length) out.actualizado = now.toISOString();
  return { state: out, changes };
}
