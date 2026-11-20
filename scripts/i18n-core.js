// Motor de traducción de Andén. La web se escribe en español; cada idioma tiene un diccionario
// (site/i18n/<idioma>.json) con el texto en español como clave:
//   "Retrasos": "Delays"                          → coincidencia exacta
//   "Trenes {a}–{b} hoy": "Trains {a}–{b} today"  → plantilla: {a} y {b} se copian (y se traducen si se puede)
// Lo que no está en el diccionario se queda en español: nunca se rompe nada.
//
// makeT se usa igual al publicar (Node) y en el navegador: el build la serializa en
// /assets/js/i18n-<idioma>.js, así que no puede usar nada de fuera de su propio cuerpo.
export function makeT(dict, lang) {
  const exact = new Map();
  const templates = [];
  for (const [k, v] of Object.entries(dict)) {
    if (k.startsWith("_")) continue;
    if (/\{\w+\}/.test(k)) {
      const names = [];
      const src = k.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{(\w+)\\?\}/g, (_, n) => { names.push(n); return "(.+?)"; });
      templates.push({ re: new RegExp(`^${src}$`, "s"), names, out: v, len: k.replace(/\{\w+\}/g, "").length });
    } else exact.set(k, v);
  }
  templates.sort((a, b) => b.len - a.len); // las plantillas más concretas primero

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const DIAS3 = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const loc = { en: "en-GB", ca: "ca-ES" }[lang] || "es-ES";
  const fmt = (y, m, d, opts) => new Date(Date.UTC(y, m, d, 12)).toLocaleDateString(loc, { timeZone: "UTC", ...opts });
  // Fechas escritas en español dentro de un texto ("20 de noviembre de 2026", "lunes, 23 de noviembre")
  function fechas(s) {
    const mes = MESES.join("|"), dia = DIAS.join("|");
    return s
      .replace(new RegExp(`\\b(?:(${dia}),? )?(\\d{1,2}) de (${mes})(?: de (\\d{4}))?`, "gi"), (all, wd, d, m, y) => {
        const mi = MESES.indexOf(m.toLowerCase());
        const year = y ? Number(y) : new Date().getFullYear();
        return fmt(year, mi, Number(d), { ...(wd ? { weekday: "long" } : {}), day: "numeric", month: "long", ...(y ? { year: "numeric" } : {}) });
      })
      .replace(new RegExp(`^(${DIAS3.join("|")}) (\\d{1,2})(.*)$`), (all, wd, d, rest) => {
        const names = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ca: ["dg.", "dl.", "dt.", "dc.", "dj.", "dv.", "ds."] }[lang];
        return names ? `${names[DIAS3.indexOf(wd)]} ${d}${rest}` : all;
      });
  }

  function t(input, vars) {
    if (input === null || input === undefined) return input;
    let s = String(input);
    if (lang === "es" || !s.trim()) return vars ? fill(s, vars) : s;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    const core = s.trim();
    let out = exact.get(core);
    if (out === undefined) {
      for (const tp of templates) {
        const m = tp.re.exec(core);
        if (!m) continue;
        const caps = {};
        tp.names.forEach((n, i) => { caps[n] = t(m[i + 1]); });
        out = tp.out.replace(/\{(\w+)\}/g, (_, n) => caps[n] ?? `{${n}}`);
        break;
      }
    }
    // Las fechas sueltas se traducen; dentro de textos largos (avisos de Renfe) se dejan como están
    if (out === undefined) out = core.length <= 60 ? fechas(core) : core;
    out = lead + out + trail;
    return vars ? fill(out, vars) : out;
  }
  function fill(s, vars) { return s.replace(/\{(\w+)\}/g, (_, n) => (vars[n] ?? `{${n}}`)); }
  t.lang = lang;
  t.locale = loc;
  return t;
}
