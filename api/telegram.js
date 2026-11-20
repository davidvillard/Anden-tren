// Webhook del bot de Telegram de Andén. Telegram manda aquí cada mensaje que recibe el bot.
// Órdenes:
//   /start C3_madrid      (desde el botón de la web) sigue esa línea
//   /seguir C3 Madrid     sigue una línea
//   /horario 6-9 lv       avisa solo de 6 a 9, de lunes a viernes (lv, fds o todos)
//   /mis                  líneas que sigues
//   /dejar C3 Madrid      deja de seguir una línea (/dejar todo para todas)
import { tgEnabled, TG_SECRET, send, esc } from "../lib/telegram.js";
import { sbEnabled, sbSelect, sbUpsert, sbDelete } from "../lib/supabase.js";
import { parseLinea, nombreLinea, urlLinea, marcarAvisosVistos } from "../lib/alertas.js";
import { fetchAlerts } from "../lib/renfe.js";

const AYUDA = `Soy el bot de <b>Andén</b> (andentren.es). Te aviso si tu línea de Cercanías tiene avisos de Renfe o va con muchos retrasos.

• <code>/seguir C3 Madrid</code> — seguir una línea
• <code>/horario 6-9 lv</code> — avisar solo de 6 a 9 de lunes a viernes (<code>lv</code>, <code>fds</code> o <code>todos</code>)
• <code>/mis</code> — tus líneas
• <code>/dejar C3 Madrid</code> — dejar de seguirla (<code>/dejar todo</code> para todas)

Andén no es Renfe. En una emergencia, llama al 112.`;

const DIAS = { lv: "12345", fds: "67", todos: "1234567", diario: "1234567" };
const descr = (s) => `${s.hora_desde === 0 && s.hora_hasta === 24 ? "a cualquier hora" : `de ${s.hora_desde}:00 a ${s.hora_hasta}:00`}, ${s.dias === "12345" ? "de lunes a viernes" : s.dias === "67" ? "los fines de semana" : "todos los días"}`;

async function seguir(chat, texto) {
  const key = await parseLinea(texto.replace(/_/g, " "));
  if (!key) return send(chat, "No he entendido la línea. Escribe por ejemplo <code>/seguir C3 Madrid</code> o <code>/seguir R2 Barcelona</code>.");
  if (key.ambigua) return send(chat, `Hay varias líneas ${esc(key.ambigua)}. Dime la ciudad, por ejemplo <code>/seguir ${esc(key.ambigua)} ${esc(key.redes[0])}</code>.`);
  const [linea, red] = key.split("|");
  await sbUpsert("alertas", [{ chat_id: chat, red, linea }], "chat_id,red,linea");
  const actuales = await marcarAvisosVistos(chat, key, await fetchAlerts().catch(() => []));
  const nombre = await nombreLinea(key);
  return send(chat, `✅ Sigues la <b>${esc(nombre)}</b>. Te escribiré si Renfe publica un aviso nuevo o si va con muchos retrasos.
${actuales.length ? `\nAhora mismo tiene ${actuales.length} ${actuales.length === 1 ? "aviso" : "avisos"}:\n${actuales.slice(0, 3).map((t) => `• ${esc(t.slice(0, 200))}`).join("\n")}\n` : "\nAhora mismo no tiene avisos de Renfe.\n"}
Para recibir avisos solo a ciertas horas: <code>/horario 6-9 lv</code>
<a href="${urlLinea(key)}">Ver la línea en Andén</a>`);
}

async function handle(msg) {
  const chat = msg.chat?.id, texto = String(msg.text || "").trim();
  if (!chat || !texto) return;
  const [cmd, ...rest] = texto.split(/\s+/);
  const arg = rest.join(" ");
  const c = cmd.toLowerCase().replace(/@.*$/, "");
  if (c === "/start") return arg ? seguir(chat, arg) : send(chat, AYUDA);
  if (c === "/ayuda" || c === "/help") return send(chat, AYUDA);
  if (c === "/seguir") return seguir(chat, arg);
  if (c === "/mis") {
    const subs = await sbSelect(`alertas?select=red,linea,hora_desde,hora_hasta,dias&chat_id=eq.${chat}`);
    if (!subs?.length) return send(chat, "No sigues ninguna línea. Prueba con <code>/seguir C3 Madrid</code>.");
    return send(chat, `Tus líneas:\n${(await Promise.all(subs.map(async (s) => `• <b>${esc(await nombreLinea(`${s.linea}|${s.red}`))}</b>, ${descr(s)}`))).join("\n")}`);
  }
  if (c === "/dejar") {
    if (/^(todo|todas)$/i.test(arg)) { await sbDelete(`alertas?chat_id=eq.${chat}`); return send(chat, "Has dejado de seguir todas tus líneas."); }
    const key = await parseLinea(arg);
    if (!key || key.ambigua) return send(chat, "Dime qué línea, por ejemplo <code>/dejar C3 Madrid</code>, o <code>/dejar todo</code>.");
    const [linea, red] = key.split("|");
    await sbDelete(`alertas?chat_id=eq.${chat}&red=eq.${red}&linea=eq.${linea}`);
    return send(chat, `Has dejado de seguir la ${esc(await nombreLinea(key))}.`);
  }
  if (c === "/horario") {
    const m = /(\d{1,2})\s*-\s*(\d{1,2})/.exec(arg);
    const dias = DIAS[(/\b(lv|fds|todos|diario)\b/i.exec(arg)?.[1] || "todos").toLowerCase()];
    const desde = m ? Math.min(23, Number(m[1])) : 0, hasta = m ? Math.min(24, Math.max(desde + 1, Number(m[2]))) : 24;
    const subs = await sbSelect(`alertas?select=red,linea&chat_id=eq.${chat}`);
    if (!subs?.length) return send(chat, "Primero sigue una línea, por ejemplo <code>/seguir C3 Madrid</code>.");
    await sbUpsert("alertas", subs.map((s) => ({ chat_id: chat, red: s.red, linea: s.linea, hora_desde: desde, hora_hasta: hasta, dias })), "chat_id,red,linea");
    return send(chat, `Hecho: te avisaré ${descr({ hora_desde: desde, hora_hasta: hasta, dias })} (hora peninsular).`);
  }
  // Texto suelto tipo "C3 Madrid": se entiende como /seguir
  if (/\b[crst]-?\d{1,2}\b/i.test(texto)) return seguir(chat, texto);
  return send(chat, AYUDA);
}

export default async function handler(req, res) {
  if (!tgEnabled() || !sbEnabled()) return res.status(503).json({ error: "Bot sin configurar" });
  if (!TG_SECRET || req.headers["x-telegram-bot-api-secret-token"] !== TG_SECRET) return res.status(401).json({ error: "No autorizado" });
  try { if (req.body?.message) await handle(req.body.message); } catch (e) { console.error(e); }
  res.status(200).json({ ok: true });
}
