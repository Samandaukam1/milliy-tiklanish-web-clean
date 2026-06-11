import {
  buildPaymeCheckoutUrl,
  buildPaymentDescription,
  createPaymentsAdminClient,
  isPaymeCheckoutConfigured,
  isSupabasePaymentServerConfigured,
  resolvePaymentPricing,
  type PaymentType,
} from "../../lib/server/payme";

type ServerlessRequest = {
  method?: string;
  body?: unknown;
  [Symbol.asyncIterator]?: () => AsyncIterator<Buffer | string>;
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

async function readJsonBody(req: ServerlessRequest): Promise<unknown> {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }

  const chunks: string[] = [];
  if (typeof req[Symbol.asyncIterator] === "function") {
    for await (const chunk of req as AsyncIterable<Buffer | string>) {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    }
  }

  return JSON.parse(chunks.join("") || "{}");
}

function appendQueryParams(baseUrl: string, params: Record<string, string | null | undefined>) {
  try {
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value != null && value !== "") {
        url.searchParams.set(key, value);
      }
    });
    return url.toString();
  } catch {
    const query = Object.entries(params)
      .filter(([, value]) => value != null && value !== "")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");

    if (!query) {
      return baseUrl;
    }

    return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${query}`;
  }
}

export default async function handler(req: ServerlessRequest, res: ServerlessResponse): Promise<void> {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!isSupabasePaymentServerConfigured()) {
    sendJson(res, 503, { error: "Server configuration error" });
    return;
  }

  if (!isPaymeCheckoutConfigured()) {
    sendJson(res, 503, { error: "Payme checkout not configured" });
    return;
  }

  try {
    const body = (await readJsonBody(req)) as {
      userId?: string;
      type?: PaymentType;
      tier?: string;
      articleId?: string;
      returnUrlBase?: string;
      language?: string;
    };

    const userId = body.userId?.trim();
    const type = body.type;
    const articleId = body.articleId?.trim() || null;
    const returnUrlBase = body.returnUrlBase?.trim();

    if (!userId || !returnUrlBase || (type !== "subscription" && type !== "article")) {
      sendJson(res, 400, { error: "Missing required fields" });
      return;
    }

    if (type === "article" && !articleId) {
      sendJson(res, 400, { error: "Article id is required" });
      return;
    }

    const pricing = resolvePaymentPricing({ type, tier: body.tier });
    const description = buildPaymentDescription({ type, tier: pricing.tier, articleId });
    const admin = createPaymentsAdminClient();

    const { data, error } = await (admin.from("payments") as any)
      .insert({
        provider: "payme",
        user_id: userId,
        type,
        tier: pricing.tier,
        article_id: articleId,
        amount: pricing.amount_sum,
        amount_tiyin: pricing.amount_tiyin,
        status: "pending",
        description,
        metadata: {
          user_id: userId,
          type,
          tier: pricing.tier,
          article_id: articleId,
        },
      })
      .select("id, type, tier, article_id")
      .single();

    if (error || !data) {
      console.error("[Payme create-payment] DB insert error:", error);
      sendJson(res, 500, { error: "Failed to create payment record" });
      return;
    }

    const paymentId = String(data.id);
    const returnUrl = appendQueryParams(returnUrlBase, {
      payment_id: paymentId,
      provider: "payme",
      type,
      tier: pricing.tier,
      article_id: articleId,
    });

    const paymentUrl = buildPaymeCheckoutUrl({
      paymentId,
      userId,
      type,
      tier: pricing.tier,
      articleId,
      amountTiyin: pricing.amount_tiyin,
      returnUrl,
      language: body.language,
    });

    await (admin.from("payments") as any)
      .update({
        return_url: returnUrl,
        checkout_url: paymentUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);

    sendJson(res, 200, {
      payment_url: paymentUrl,
      payment_id: paymentId,
      provider: "payme",
      type,
      tier: pricing.tier,
      article_id: articleId,
    });
  } catch (error) {
    console.error("[Payme create-payment] unhandled error:", error);
    sendJson(res, 500, { error: "Internal server error" });
  }
}
