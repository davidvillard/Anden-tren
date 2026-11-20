// Bot de Telegram de Andén. Variables en Vercel:
//   TELEGRAM_BOT_TOKEN        el token que da @BotFather
//   TELEGRAM_WEBHOOK_SECRET   una contraseña larga cualquiera (Telegram la manda en cada mensaje)
//   TELEGRAM_BOT_USERNAME     el nombre del bot sin @ (para los enlaces de la web)
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
export const tgEnabled = () => Boolean(TOKEN);
export const TG_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";

export async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`);
  return j.result;
}

export const send = (chat_id, text) => tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true });
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
