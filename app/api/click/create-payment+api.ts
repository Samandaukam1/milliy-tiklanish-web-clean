/**
 * POST /api/click/create-payment
 *
 * Creates a payment record in Supabase and returns a Click payment URL.
 *
 * Required Supabase table (run once in Supabase SQL editor):
 * ─────────────────────────────────────────────────────────
 * create table if not exists payments (
 *   id            uuid primary key default gen_random_uuid(),
 *   user_id       text not null,
 *   type          text not null,         -- 'subscription' | 'article'
 *   tier          text,                  -- 'premium' | 'vip'
 *   article_id    uuid,
 *   amount        numeric(12, 2) not null,
 *   status        text not null default 'pending',
 *   click_trans_id text,
 *   click_paydoc_id text,
 *   paid_at       timestamptz,
 *   created_at    timestamptz default now(),
 *   updated_at    timestamptz default now()
 * );
 * alter table payments enable row level security;
 * create policy "service role full access" on payments using (true) with check (true);
 * ─────────────────────────────────────────────────────────
 *
 * Required env vars (server-side, no EXPO_PUBLIC_ prefix):
 *   CLICK_SERVICE_ID       — from Click merchant panel
 *   CLICK_MERCHANT_ID      — from Click merchant panel
 *   SUPABASE_SERVICE_ROLE_KEY  — service role key (server only)
 *   SUPABASE_URL           — Supabase project URL (or falls back to EXPO_PUBLIC_SUPABASE_URL)
 */

import { createClient } from "@supabase/supabase-js";
import { normalizeSubscriptionPlan } from "@/lib/server/subscriptions";

// ─── Subscription amounts (server-authoritative, never trust client) ──────────
const TIER_AMOUNTS: Record<string, number> = {
  premium: 24000,
  pro: 89000,
};

// ─── Env ─────────────────────────────────────────────────────────────────────
const CLICK_SERVICE_ID = process.env.CLICK_SERVICE_ID ?? "";
const CLICK_MERCHANT_ID = process.env.CLICK_MERCHANT_ID ?? "";
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(request: Request): Promise<Response> {
  // Guard: fail fast if server env vars are missing
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[Click create-payment] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    return Response.json({ error: "Server configuration error" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { userId, type, tier, articleId, amount, returnUrlBase } = body as {
      userId?: string;
      type?: string;
      tier?: string;
      articleId?: string;
      amount?: number;
      returnUrlBase?: string;
    };

    // ── Input validation ────────────────────────────────────────────────────
    if (!userId || !type || !returnUrlBase) {
      return Response.json(
        { error: "Missing required fields: userId, type, returnUrlBase" },
        { status: 400 }
      );
    }
    if (type !== "subscription" && type !== "article") {
      return Response.json({ error: "Invalid type" }, { status: 400 });
    }

    // ── Resolve amount ──────────────────────────────────────────────────────
    let resolvedAmount: number;
    const normalizedTier = normalizeSubscriptionPlan(tier);
    if (type === "subscription") {
      if (!tier || normalizedTier === "free" || !TIER_AMOUNTS[normalizedTier]) {
        return Response.json({ error: "Invalid tier" }, { status: 400 });
      }
      resolvedAmount = TIER_AMOUNTS[normalizedTier];
    } else {
      // article purchase — client-supplied, validate reasonable range
      if (!amount || amount <= 0 || amount > 1_000_000) {
        return Response.json({ error: "Invalid amount" }, { status: 400 });
      }
      resolvedAmount = amount;
    }

    // ── Click config check ──────────────────────────────────────────────────
    if (!CLICK_SERVICE_ID || !CLICK_MERCHANT_ID) {
      console.error("[Click] CLICK_SERVICE_ID or CLICK_MERCHANT_ID not set");
      return Response.json(
        { error: "Payment provider not configured" },
        { status: 503 }
      );
    }

    // ── Create payment record in Supabase ───────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: payment, error: dbError } = await supabase
      .from("payments")
      .insert({
        user_id: userId,
        type,
        tier: type === "subscription" ? normalizedTier : tier ?? null,
        article_id: articleId ?? null,
        amount: resolvedAmount,
        status: "pending",
      })
      .select("id")
      .single();

    if (dbError || !payment) {
      console.error("[Click] DB insert error:", dbError?.message);
      return Response.json(
        { error: "Failed to create payment record" },
        { status: 500 }
      );
    }

    // ── Build Click payment URL ─────────────────────────────────────────────
    const returnTier = type === "subscription" ? normalizedTier : tier;
    const returnUrl = `${returnUrlBase}?payment_id=${payment.id}${returnTier ? `&tier=${returnTier}` : ""}`;
    const params = new URLSearchParams({
      service_id: CLICK_SERVICE_ID,
      merchant_id: CLICK_MERCHANT_ID,
      amount: String(resolvedAmount),
      transaction_param: payment.id,
      return_url: returnUrl,
    });

    const paymentUrl = `https://my.click.uz/services/pay?${params.toString()}`;

    console.log(
      "[Click] payment created:",
      payment.id,
      "| type:",
      type,
      "| amount:",
      resolvedAmount
    );

    return Response.json({ payment_url: paymentUrl, payment_id: payment.id });
  } catch (e) {
    console.error("[Click] create-payment unhandled error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
