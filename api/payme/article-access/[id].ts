import {
  createPaymentsAdminClient,
  isSupabasePaymentServerConfigured,
  resolveArticleAccess,
} from "../../../lib/server/payme";

type ServerlessRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ServerlessResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): ServerlessResponse;
  json(body: unknown): void;
};

function sendJson(res: ServerlessResponse, statusCode: number, body: unknown): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(statusCode).json(body);
}

function firstQueryValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function handler(req: ServerlessRequest, res: ServerlessResponse): Promise<void> {
  if (req.method !== "GET") {
    sendJson(res, 405, { allowed: false, source: "none" });
    return;
  }

  if (!isSupabasePaymentServerConfigured()) {
    sendJson(res, 200, { allowed: false, source: "none" });
    return;
  }

  const articleId = firstQueryValue(req.query?.id);
  const userId = firstQueryValue(req.query?.user_id) || null;

  if (!articleId || !userId) {
    sendJson(res, 200, { allowed: false, source: "none" });
    return;
  }

  try {
    const admin = createPaymentsAdminClient();
    sendJson(res, 200, await resolveArticleAccess(admin, { userId, articleId }));
  } catch (error) {
    console.error("[Payme article-access] error:", error);
    sendJson(res, 200, { allowed: false, source: "none" });
  }
}
