"use strict";
// Ficha de un tren por número (/horario/<nº>): el recuadro "Hoy" cruza el horario oficial
// con los datos en directo de Renfe (en marcha, retraso, cancelado, aún no ha salido...).
(function () {
  const A = window.AndenLive, { h } = window.Anden;
  const box = document.getElementById("hoy");
  if (!A || !box) return;
  const num = box.dataset.num;
  let H = null;
  const madridHoy = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const ahoraMin = () => { const [hh, mm] = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).split(":"); return Number(hh) * 60 + Number(mm); };
  const min = (t) => { const [hh, mm] = t.split(":"); return Number(hh) * 60 + Number(mm); };
  const dia = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString((window.ANDEN_LOCALE || "es-ES"), { weekday: "long", day: "numeric", month: "long" });

  function paint() {
    const parts = [h("h2", {}, "Hoy")];
    const vivo = A.ldTrains().find((t) => t.num === num);
    const cancel = A.ldCancelled().find((c) => c.num === num && c.fecha === madridHoy());
    const tren = H?.trenes?.[num];
    const idx = H ? Math.round((new Date(`${madridHoy()}T00:00:00Z`) - new Date(`${H.desde}T00:00:00Z`)) / 86400_000) : -1;
    const hoy = tren?.v.find((v) => v.d[idx] === "1");
    const name = (x) => H.paradas[x[0]];
    if (cancel) {
      parts.push(h("p", {}, h("span", { class: "tag crit", style: "font-size:1rem" }, "Cancelado hoy")),
        h("p", {}, "Renfe da este tren como cancelado hoy. Consulta tu billete en la web o la app de Renfe: te corresponde cambio o devolución. ", h("a", { href: "/indemnizaciones" }, "Tus derechos")));
    } else if (vivo) {
      const d = A.delayInfo(vivo.delayMin);
      parts.push(h("p", {}, h("span", { class: `tag ${d.cls}`, style: "font-size:1rem" }, `En marcha · ${d.text}`)),
        h("p", {}, vivo.siguiente ? `Próxima parada: ${vivo.siguiente}. ` : "", vivo.llegada ? `Llegada prevista a ${vivo.destino || "destino"}: ${new Date(vivo.llegada).toLocaleTimeString((window.ANDEN_LOCALE || "es-ES"), { hour: "2-digit", minute: "2-digit" })}.` : ""),
        h("p", {}, h("a", { class: "btn ghost", href: A.trainUrl(vivo) }, "Ver en el mapa")));
    } else if (hoy) {
      const sale = hoy.p[0][2], llega = hoy.p[hoy.p.length - 1][1], now = ahoraMin();
      const fin = min(llega) < min(sale) ? min(llega) + 1440 : min(llega);
      if (now < min(sale)) parts.push(h("p", {}, h("span", { class: "tag info", style: "font-size:1rem" }, `Sale hoy a las ${sale}`)), h("p", { class: "muted" }, `De ${name(hoy.p[0])}. Cuando esté en marcha verás aquí su retraso y su próxima parada.`));
      else if (now > fin + 30) parts.push(h("p", {}, h("span", { class: "tag none", style: "font-size:1rem" }, "Hoy ya ha terminado su recorrido")), h("p", { class: "muted" }, `Llegada prevista a ${name(hoy.p[hoy.p.length - 1])}: ${llega}.`));
      else parts.push(h("p", {}, h("span", { class: "tag none", style: "font-size:1rem" }, "Debería estar en marcha")), h("p", { class: "muted" }, "Renfe no está dando ahora su posición. Vuelve a mirar en unos minutos."));
    } else if (tren) {
      const prox = tren.v.map((v) => v.d.indexOf("1", idx + 1)).filter((i) => i > 0).sort((a, b) => a - b)[0];
      const fecha = prox ? new Date(new Date(`${H.desde}T12:00:00Z`).getTime() + prox * 86400_000).toISOString().slice(0, 10) : null;
      parts.push(h("p", {}, h("span", { class: "tag none", style: "font-size:1rem" }, "Hoy no circula")), fecha ? h("p", { class: "muted" }, `Próximo día que circula: ${dia(fecha)}.`) : "");
    } else {
      parts.push(h("p", { class: "muted" }, A.S.live ? "Sin datos de este tren ahora mismo." : "Consultando a Renfe…"));
    }
    box.replaceChildren(...parts);
  }

  fetch("/data/horarios-ld.json").then((r) => r.json()).then((j) => { H = j; paint(); }).catch(() => {});
  A.onUpdate(paint);
  A.start();
})();
