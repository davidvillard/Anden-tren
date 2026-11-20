"use strict";
// Modo accesible, enlace activo del menú, idioma, cookies (Google Tag Manager) y utilidades.

// ---- Idioma: la web se escribe en español; /en/ y /ca/ cargan antes su diccionario (window.ANDEN_T) ----
window.ANDEN_LANG = window.ANDEN_T?.lang || "es";
window.ANDEN_LOCALE = window.ANDEN_T?.locale || "es-ES";
(function () {
  const lang = window.ANDEN_LANG;
  // Rutas que solo existen en español: las páginas legales y la ficha de cada suceso
  const SOLO_ES = /^\/(api|data|assets|vendor|og|aviso-legal|privacidad|cookies|accesibilidad|fuentes|contacto|huelga-renfe|obras-cercanias|accidente-tren\/|accidente-tren-toledo|incidencia\/|favicon|manifest|sitemap|robots)/;
  window.ANDEN_URL = (p) => (lang === "es" || typeof p !== "string" || !p.startsWith("/") || p.startsWith("//") || SOLO_ES.test(p) || /^\/(en|ca)(\/|$)/.test(p) ? p : `/${lang}${p === "/" ? "" : p}`);
  // Selector de idioma: misma página en el otro idioma
  const base = location.pathname.replace(/^\/(en|ca)(?=\/|$)/, "") || "/";
  document.querySelectorAll("[data-lang-link]").forEach((a) => {
    const l = a.dataset.langLink;
    a.href = (l === "es" ? base : `/${l}${base === "/" ? "" : base}`) + location.search + location.hash;
    if (l === lang) a.setAttribute("aria-current", "true");
  });
})();

(function () {
  const root = document.documentElement;
  const store = (k, v) => { try { v ? localStorage.setItem("anden-" + k, v) : localStorage.removeItem("anden-" + k); } catch (e) {} };
  const setPref = (k, v) => { if (v) root.dataset[k] = v; else delete root.dataset[k]; store(k, v); };

  // ---- Accesibilidad: botón pequeño que abre un panel ----
  const btn = document.getElementById("a11y-btn");
  const pop = document.getElementById("a11y-pop");
  const toggle = document.getElementById("a11y-toggle");
  const panel = document.getElementById("a11y-panel");
  const paint = () => {
    const on = root.dataset.a11y === "on";
    toggle?.setAttribute("aria-checked", String(on));
    if (panel) panel.hidden = !on;
    panel?.querySelectorAll("[data-text]").forEach((b) => b.setAttribute("aria-pressed", String((root.dataset.text || "") === b.dataset.text)));
    panel?.querySelectorAll("[data-contrast]").forEach((b) => b.setAttribute("aria-pressed", String((root.dataset.contrast || "") === b.dataset.contrast)));
    panel?.querySelectorAll("[data-maps]").forEach((b) => b.setAttribute("aria-pressed", String((root.dataset.maps || "on") === b.dataset.maps)));
  };
  const openPop = (open) => {
    if (!pop || !btn) return;
    pop.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  };
  btn?.addEventListener("click", (e) => { e.stopPropagation(); openPop(pop.hidden); if (!pop.hidden) toggle?.focus(); });
  document.addEventListener("click", (e) => { if (pop && !pop.hidden && !e.target.closest(".a11y")) openPop(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pop && !pop.hidden) { openPop(false); btn.focus(); } });
  const changed = () => { paint(); window.dispatchEvent(new CustomEvent("anden:prefs")); };
  toggle?.addEventListener("click", () => {
    const on = root.dataset.a11y !== "on";
    setPref("a11y", on ? "on" : "");
    if (on && !root.dataset.maps) setPref("maps", "off"); // en modo fácil, la lista es más cómoda que el mapa
    if (!on) { setPref("text", ""); setPref("contrast", ""); setPref("maps", ""); }
    changed();
  });
  panel?.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if ("text" in b.dataset) setPref("text", b.dataset.text);
    if ("contrast" in b.dataset) setPref("contrast", b.dataset.contrast);
    if ("maps" in b.dataset) setPref("maps", b.dataset.maps === "off" ? "off" : "");
    changed();
  });
  paint();

  // ---- Enlace activo ----
  const sinIdioma = (p) => p.replace(/^\/(en|ca)(?=\/|$)/, "") || "/";
  const path = sinIdioma(location.pathname.replace(/\.html$/, "").replace(/\/$/, "")) || "/";
  document.querySelectorAll(".nav a").forEach((a) => {
    const href = sinIdioma(a.getAttribute("href"));
    const match = href === "/" ? path === "/" : path === href || path.startsWith(href + "/") ||
      (href === "/accidente-tren-hoy" && /^\/(accidentes|accidente-tren)/.test(path)) ||
      (href === "/mapa-trenes" && /^\/tren(\/|$)/.test(path)) || (href === "/retrasos" && (path === "/linea" || /^\/cercanias(\/|$)/.test(path))) || (href === "/incidencias" && path.startsWith("/incidencia/"));
    if (match) { a.setAttribute("aria-current", "page"); a.scrollIntoView?.({ block: "nearest", inline: "center" }); }
  });
  // En el móvil el menú se desliza de lado: se marca con un degradado si hay más a la derecha
  const nav = document.querySelector(".nav");
  const edge = () => nav && nav.classList.toggle("more-right", nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4);
  nav?.addEventListener("scroll", edge, { passive: true }); addEventListener("resize", edge); edge();
})();

// ---- Google Tag Manager / Analytics: solo con consentimiento ----
(function () {
  const id = window.ANDEN_GTM;
  if (!id || !/^GTM-[A-Z0-9]+$/.test(id)) return;
  document.querySelectorAll("[data-ga-only]").forEach((el) => { el.hidden = false; });
  const KEY = "anden-consent";
  const get = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const set = (v) => { try { localStorage.setItem(KEY, v); } catch (e) {} };
  let loaded = false;
  function load() {
    if (loaded) return; loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const s = document.createElement("script");
    s.async = true; s.src = `https://www.googletagmanager.com/gtm.js?id=${id}`;
    document.head.appendChild(s);
  }
  function banner() {
    if (document.getElementById("consent")) return;
    const el = document.createElement("div");
    el.className = "consent"; el.id = "consent"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Cookies");
    const t = window.ANDEN_T || ((x) => x);
    el.innerHTML = `<div class="consent-in"><p>${t("Usamos cookies de Google Analytics para contar visitas de forma anónima y mejorar Andén. Solo se activan si las aceptas.")} <a href="/cookies">${t("Más información")}</a></p><div class="row-btns"><button type="button" class="btn ghost" data-v="no">${t("Rechazar")}</button><button type="button" class="btn" data-v="si">${t("Aceptar")}</button></div></div>`;
    el.addEventListener("click", (e) => {
      const v = e.target.closest("button")?.dataset.v; if (!v) return;
      set(v); el.remove();
      if (v === "si") load(); else if (loaded) location.reload();
    });
    document.body.appendChild(el);
  }
  if (get() === "si") load(); else if (!get()) banner();
  document.getElementById("cookie-settings")?.addEventListener("click", banner);
})();

// ---- Utilidades compartidas ----
window.Anden = {
  // Crea un elemento. En inglés y catalán traduce sola cada texto con el diccionario y lleva los
  // enlaces internos a la versión del idioma, así el resto del código se escribe una sola vez.
  h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    const T = window.ANDEN_T;
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "href") el.setAttribute(k, window.ANDEN_URL(v));
      else el.setAttribute(k, v === true ? "" : T && /^(title|aria-label|placeholder|alt)$/.test(k) ? T(v) : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false && c !== "") el.append(c instanceof Node ? c : T ? T(String(c)) : String(c));
    return el;
  },
  t: (s, vars) => (window.ANDEN_T ? window.ANDEN_T(s, vars) : vars ? String(s).replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? `{${n}}`) : s),
  url: (p) => window.ANDEN_URL(p),
  norm: (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(),
  css: (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
  fmtDate(iso) {
    const [y, m, d] = iso.slice(0, 10).split("-");
    if (window.ANDEN_LANG !== "es") return new Date(Date.UTC(+y, +m - 1, +d, 12)).toLocaleDateString(window.ANDEN_LOCALE, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
    const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${+d} ${MESES[+m - 1]} ${y}`;
  },
  fmtTime: (unix) => new Date(unix * 1000).toLocaleTimeString(window.ANDEN_LOCALE || "es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }),
  ago(unix) {
    const s = Math.max(0, Math.round(Date.now() / 1000 - unix));
    if (s < 60) return `hace ${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `hace ${m} min`;
    return `a las ${window.Anden.fmtTime(unix)}`;
  },
  mapsOff: () => document.documentElement.dataset.maps === "off",
  // Mapa base de OpenStreetMap (gratis, sin clave), en gris suave por CSS, con zoom por rueda, doble clic y pellizco
  makeMap(id, bounds) {
    const map = L.map(id, {
      scrollWheelZoom: true, wheelPxPerZoomLevel: 90, zoomSnap: 0.25, zoomDelta: 0.5,
      doubleClickZoom: true, touchZoom: true, minZoom: 5, maxZoom: 17,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: `© <a href="https://www.openstreetmap.org/copyright">${window.Anden.t("colaboradores de OpenStreetMap")}</a>`,
    }).addTo(map);
    map.fitBounds(bounds || [[35.9, -9.4], [43.8, 3.4]]);
    return map;
  },
};
