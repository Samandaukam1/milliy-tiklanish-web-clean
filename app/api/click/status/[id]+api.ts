/**
 * GET /api/click/status/:id
 *
 * Returns the current status of a payment record.
 * The client polls this after returning from the Click payment page.
 */

import { createClient } from "@supabase/supabase-js";
import { readSubscriptionInfo } from "@/lib/server/subscriptions";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  // Guard: fail fast if server env vars are missing
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[Click status] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    return Response.json({ error: "Server configuration error" }, { status: 503 });
  }

  const id = params?.id;

  if (!id) {
    return Response.json({ error: "Missing payment id" }, { status: 400 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await supabase
      .from("payments")
      .select("id, user_id, status, amount, tier, type, article_id, paid_at, created_at")
      .eq("id", id)
      .single();

    if (error || !data) {
      return Response.json({ error: "Payment not found" }, { status: 404 });
    }

    const subscriptionInfo =
      data.type === "subscription"
        ? await readSubscriptionInfo(supabase as any, data.user_id, data.tier)
        : undefined;

    return Response.json({
      status: data.status,
      amount: data.amount,
      tier: data.tier,
      type: data.type,
      article_id: data.article_id,
      paid_at: data.paid_at,
      subscription_info:
        subscriptionInfo && data.type === "subscription"
          ? {
              ...subscriptionInfo,
              starts_at: subscriptionInfo.starts_at ?? data.paid_at ?? data.created_at ?? null,
            }
          : undefined,
    });
  } catch (e) {
    console.error("[Click status] error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
