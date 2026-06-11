import {
  buildPaymeCheckoutUrl,
  buildPaymentDescription,
  createPaymentsAdminClient,
  isPaymeCheckoutConfigured,
  isSupabasePaymentServerConfigured,
  resolvePaymentPricing,
  type PaymentType,
} from "@/lib/server/payme";

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

export async function POST(request: Request): Promise<Response> {
  if (!isSupabasePaymentServerConfigured()) {
    return Response.json({ error: "Server configuration error" }, { status: 503 });
  }

  if (!isPaymeCheckoutConfigured()) {
    return Response.json({ error: "Payme checkout not configured" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
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
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (type === "article" && !articleId) {
      return Response.json({ error: "Article id is required" }, { status: 400 });
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
      return Response.json({ error: "Failed to create payment record" }, { status: 500 });
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

    return Response.json({
      payment_url: paymentUrl,
      payment_id: paymentId,
      provider: "payme",
      type,
      tier: pricing.tier,
      article_id: articleId,
    });
  } catch (error) {
    console.error("[Payme create-payment] unhandled error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}