"use strict";
// Preferencias de lectura (tamaño de texto y tema) y enlace activo del menú.
(function () {
  const root = document.documentElement;
  const store = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };

  const SIZES = [
    { key: null, label: "Texto" },
    { key: "l", label: "Texto +" },
    { key: "xl", label: "Texto ++" },
  ];
  const textBtn = document.getElementById("btn-text");
  const textLabel = document.getElementById("btn-text-label");
  const curSize = () => Math.max(0, SIZES.findIndex((s) => s.key === (root.dataset.text || null)));
  const paintText = () => {
    const s = SIZES[curSize()];
    textLabel.textContent = s.label;
    textBtn.setAttribute("aria-label", `Tamaño del texto: ${["normal", "grande", "muy grande"][curSize()]}. Pulsa para cambiarlo`);
  };
  textBtn?.addEventListener("click", () => {
    const next = SIZES[(curSize() + 1) % SIZES.length].key;
    if (next) root.dataset.text = next; else delete root.dataset.text;
    store("anden-text", next);
    paintText();
    window.dispatchEvent(new Event("resize"));
  });
  if (textBtn) paintText();

  const themeBtn = document.getElementById("btn-theme");
  const themeLabel = document.getElementById("btn-theme-label");
  const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const paintTheme = () => {
    themeLabel.textContent = isDark() ? "Claro" : "Oscuro";
    themeBtn.setAttribute("aria-label", isDark() ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
  };
  themeBtn?.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    store("anden-theme", next);
    paintTheme();
    window.dispatchEvent(new CustomEvent("anden:theme"));
  });
  if (themeBtn) paintTheme();

  const path = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  document.querySelectorAll(".nav a").forEach((a) => {
    const href = a.getAttribute("href");
    if ((href === "/" && path === "/" ) || (href !== "/" && !href.includes("#") && path === href)) a.setAttribute("aria-current", "page");
  });
})();

// Google Analytics: solo si está configurado y la persona lo acepta.
(function () {
  const id = window.ANDEN_GA;
  if (!id || !/^G-[A-Z0-9]+$/.test(id)) return;
  document.querySelectorAll("[data-ga-only]").forEach((el) => { el.hidden = false; });
  const KEY = "anden-consent";
  const get = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const set = (v) => { try { localStorage.setItem(KEY, v); } catch (e) {} };
  let loaded = false;
  function loadGA() {
    if (loaded) return; loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id);
    const s = document.createElement("script");
    s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(s);
  }
  function banner() {
    if (document.getElementById("consent")) return;
    const el = document.createElement("div");
    el.className = "consent"; el.id = "consent"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Cookies");
    el.innerHTML = '<div class="consent-in"><p>Usamos cookies de Google Analytics para saber cuánta gente visita Andén y mejorarlo. Solo se activan si las aceptas. <a href="/cookies">Más información</a></p><div class="row-btns"><button type="button" class="btn ghost" data-v="no">Rechazar</button><button type="button" class="btn" data-v="si">Aceptar</button></div></div>';
    el.addEventListener("click", (e) => {
      const v = e.target.closest("button")?.dataset.v; if (!v) return;
      set(v); el.remove();
      if (v === "si") loadGA(); else if (loaded) location.reload();
    });
    document.body.appendChild(el);
  }
  if (get() === "si") loadGA(); else if (!get()) banner();
  document.getElementById("cookie-settings")?.addEventListener("click", banner);
})();

// Utilidades compartidas
window.Anden = {
  h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false && c !== "") el.append(c instanceof Node ? c : String(c));
    return el;
  },
  norm: (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(),
  css: (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
  fmtDate(iso) {
    const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${+d} ${MESES[+m - 1]} ${y}`;
  },
  fmtTime: (unix) => new Date(unix * 1000).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }),
  ago(unix) {
    const s = Math.max(0, Math.round(Date.now() / 1000 - unix));
    if (s < 60) return `hace ${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `hace ${m} min`;
    return `a las ${Anden.fmtTime(unix)}`;
  },
  tiles(map) {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
  },
};
