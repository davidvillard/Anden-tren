// Reglas que deciden qué propuestas de Claude se publican.
// - Una cifra solo cambia si la noticia la atribuye a un organismo oficial.
// - Un suceso nuevo necesita al menos dos medios distintos y una cifra oficial.
// - Los enlaces solo pueden ser de las noticias recibidas (nada inventado).
// - Un suceso sin novedades en 72 h deja de mostrarse como "en curso".

const STALE_MS = 72 * 3600_000;
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const madrid = (d) => d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function cifraText(c, label) {
  if (!c || c.valor === null || c.valor === undefined) return null;
  return `${c.prefijo === "≥" ? "al menos " : ""}${c.valor} ${label}${c.nota ? ` (${c.nota})` : ""}`;
}

function acceptCifra(prev, prop, items) {
  if (!prop || prop.valor === null || prop.valor < 0 || prop.valor > 5000) return prev ?? null;
  if (!prop.organismo || prop.noticia === null || !items[prop.noticia]) return prev ?? null;
  const next = { valor: prop.valor, prefijo: prop.minimo ? "≥" : "", fuente: prop.organismo };
  if (prop.nota) next.nota = prop.nota;
  return next;
}

export function merge({ state, proposal, items, now = new Date() }) {
  const out = { ...state, sucesos: (state.sucesos || []).map((s) => ({ ...s })) };
  const changes = [];
  const byId = new Map(out.sucesos.map((s) => [s.id, s]));

  for (const p of proposal.sucesos || []) {
    const refs = [...new Set((p.noticias || []).filter((i) => items[i]))];
    const links = refs.map((i) => ({ nombre: items[i].source || "Noticia", url: items[i].link }));
    let s = p.id_existente ? byId.get(p.id_existente) : null;

    if (!s) {
      const medios = new Set(refs.map((i) => items[i].source).filter(Boolean));
      const fall = acceptCifra(null, p.fallecidos, items);
      const her = acceptCifra(null, p.heridos, items);
      if (medios.size < 2 || (!fall && !her)) continue;
      const fecha = (p.inicio || now.toISOString()).slice(0, 10);
      s = {
        id: `${slug(p.lugar)}-${fecha}`, activo: true, auto: true,
        titulo: p.titulo, resumen: p.resumen, lugar: `${p.lugar} (${p.provincia})`,
        inicio: p.inicio || now.toISOString(), tipo: p.tipo, servicio: p.servicio, estado: "provisional",
        lat: p.lat, lon: p.lon,
        cifras: { ...(fall && { fallecidos: fall }), ...(her && { heridos: her }) },
        circulacion: p.circulacion || null, causas: p.causas || null,
        fuente: [fall?.fuente, her?.fuente].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" y "),
        historial: [{ cuando: madrid(now), texto: [cifraText(fall, "fallecidos"), cifraText(her, "heridos")].filter(Boolean).join(" y "), fuente: fall?.fuente || her?.fuente }],
        enlaces: links.slice(0, 8),
        ultimaNovedad: now.toISOString(),
      };
      if (byId.has(s.id)) continue;
      out.sucesos.unshift(s);
      byId.set(s.id, s);
      changes.push(`Nuevo suceso: ${s.titulo}`);
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
    if (p.circulacion && p.circulacion !== s.circulacion) { s.circulacion = p.circulacion; changes.push(`${s.id}: circulación actualizada`); }
    if (p.causas && p.causas !== s.causas) { s.causas = p.causas; changes.push(`${s.id}: causas actualizadas`); }
    const known = new Set((s.enlaces || []).map((e) => e.url ?? e[1]));
    const fresh = links.filter((l) => !known.has(l.url));
    if (fresh.length) s.enlaces = [...fresh, ...(s.enlaces || [])].slice(0, 8);
    if (refs.length) s.ultimaNovedad = now.toISOString();
    if (p.activo === false && s.activo) { s.activo = false; changes.push(`${s.id}: deja de estar en curso`); }
  }

  for (const s of out.sucesos) {
    const last = new Date(s.ultimaNovedad || s.inicio).getTime();
    if (s.activo && now.getTime() - last > STALE_MS) { s.activo = false; changes.push(`${s.id}: sin novedades en 72 h`); }
  }
  if (changes.length) out.actualizado = now.toISOString();
  return { state: out, changes };
}
