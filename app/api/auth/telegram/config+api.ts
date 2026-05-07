const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? "";

let cachedBotUsername: string | null = TELEGRAM_BOT_USERNAME || null;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function fetchBotUsername(): Promise<string> {
  if (cachedBotUsername) {
    return cachedBotUsername;
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
  const data = (await response.json()) as {
    ok?: boolean;
    result?: { username?: string };
    description?: string;
  };

  const botUsername = data.result?.username;
  if (!response.ok || !data.ok || !botUsername) {
    throw new Error(data.description || "Telegram bot topilmadi");
  }

  cachedBotUsername = botUsername;
  return botUsername;
}

export async function GET(): Promise<Response> {
  if (!TELEGRAM_BOT_USERNAME && !TELEGRAM_BOT_TOKEN) {
    console.error("[telegram-config] Telegram bot not configured");
    return jsonResponse({ error: "TELEGRAM_BOT_TOKEN missing" }, 500);
  }

  try {
    const botUsername = await fetchBotUsername();
    return jsonResponse({ success: true, botUsername });
  } catch (error) {
    console.error("[telegram-config] Failed to fetch bot username:", error);
    return jsonResponse({ error: "Telegram bot ma'lumotini olishda xatolik" }, 502);
  }
}