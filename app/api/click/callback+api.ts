/**
 * POST /api/click/callback
 *
 * Click SHOP-API callback handler.
 * Click calls this endpoint twice for every payment:
 *   action=0  Prepare — verify the payment exists and amount matches
 *   action=1  Complete — payment confirmed; grant access
 *
 * Required env vars (server-side):
 *   CLICK_SECRET_KEY           — from Click merchant panel (used for sign verification)
 *   CLICK_SERVICE_ID           — from Click merchant panel
 *   SUPABASE_SERVICE_ROLE_KEY  — service role key
 *   SUPABASE_URL               — Supabase project URL
 *
 * Click error codes:
 *   0   Success
 *  -1   SIGN CHECK FAILED
 *  -2   INCORRECT PARAMETER AMOUNT
 *  -3   ACTION NOT FOUND
 *  -4   ALREADY PAID
 *  -5   USER DOES NOT EXIST
 *  -6   TRANSACTION DOES NOT EXIST
 *  -7   FAILED TO UPDATE USER
 *  -8   ERROR IN REQUEST FROM CLICK
 *  -9   TRANSACTION CANCELLED
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { normalizeSubscriptionPlan, upsertSubscriptionInfo } from "@/lib/server/subscriptions";

// ─── Env ─────────────────────────────────────────────────────────────────────
const CLICK_SECRET_KEY = process.env.CLICK_SECRET_KEY ?? "";
const CLICK_SERVICE_ID = process.env.CLICK_SERVICE_ID ?? "";
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function md5(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

/**
 * Click sign verification.
 * Prepare (action=0): MD5(click_trans_id + service_id + secret + merchant_trans_id + amount + action + sign_time)
 * Complete (action=1): MD5(click_trans_id + service_id + secret + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
 */
function verifySign(
  params: Record<string, string>,
  action: number
): boolean {
  if (!CLICK_SECRET_KEY) {
    console.warn("[Click callback] CLICK_SECRET_KEY not set — skipping sign check");
    return true; // allow in unconfigured dev environments
  }
  const merchantPrepareId =
    action === 1 ? (params.merchant_prepare_id ?? "") : "";
  const raw = [
    params.click_trans_id,
    params.service_id,
    CLICK_SECRET_KEY,
    params.merchant_trans_id,
    ...(action === 1 ? [merchantPrepareId] : []),
    params.amount,
    String(action),
    params.sign_time,
  ].join("");
  const expected = md5(raw);
  return params.sign_string === expected;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(request: Request): Promise<Response> {
  // Guard: fail fast if server env vars are missing
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[Click callback] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    return Response.json({ error: -8, error_note: "ERROR IN REQUEST FROM CLICK" });
  }

  let params: Record<string, string>;

  // Click sends JSON body
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = await request.json();
      params = json as Record<string, string>;
    } else {
      // fallback: form-encoded
      const form = await request.formData();
      params = Object.fromEntries(
        (Array.from((form as any).entries()) as [string, unknown][]).map(([k, v]) => [k, String(v)])
      );
    }
  } catch (e) {
    console.error("[Click callback] failed to parse request body:", e);
    return Response.json({ error: -8, error_note: "ERROR IN REQUEST FROM CLICK" });
  }

  const action = Number(params.action ?? "-1");
  const paymentId = String(params.merchant_trans_id ?? "");
  const clickTransId = String(params.click_trans_id ?? "");
  const clickPaydocId = String(params.click_paydoc_id ?? "");
  const amount = Number(params.amount ?? "0");
  const clickError = Number(params.error ?? "0");

  console.log(
    "[Click callback] action:", action,
    "| payment_id:", paymentId,
    "| click_trans_id:", clickTransId,
    "| amount:", amount,
    "| click_error:", clickError
  );

  // ── Signature verification ──────────────────────────────────────────────
  if (!verifySign(params, action)) {
    console.warn("[Click callback] sign check FAILED for payment:", paymentId);
    return Response.json({ error: -1, error_note: "SIGN CHECK FAILED" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── Fetch payment record ────────────────────────────────────────────────
  const { data: payment, error: fetchErr } = await supabase
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .single();

  if (fetchErr || !payment) {
    console.warn("[Click callback] payment not found:", paymentId);
    return Response.json({ error: -6, error_note: "TRANSACTION DOES NOT EXIST" });
  }

  // ── Amount verification ─────────────────────────────────────────────────
  if (Number(payment.amount) !== amount) {
    console.warn(
      "[Click callback] amount mismatch — DB:",
      payment.amount,
      "Click:",
      amount
    );
    return Response.json({ error: -2, error_note: "INCORRECT PARAMETER AMOUNT" });
  }

  // ── ACTION 0: Prepare ───────────────────────────────────────────────────
  if (action === 0) {
    if (payment.status === "paid") {
      return Response.json({ error: -4, error_note: "ALREADY PAID" });
    }

    return Response.json({
      click_trans_id: clickTransId,
      merchant_trans_id: paymentId,
      merchant_prepare_id: paymentId, // use our UUID as the prepare ID
      error: 0,
      error_note: "Success",
    });
  }

  // ── ACTION 1: Complete ──────────────────────────────────────────────────
  if (action === 1) {
    if (payment.status === "paid") {
      // Idempotent: already processed
      return Response.json({
        click_trans_id: clickTransId,
        merchant_trans_id: paymentId,
        merchant_confirm_id: paymentId,
        error: 0,
        error_note: "Success",
      });
    }

    // Click signalled an error on their side
    if (clickError !== 0) {
      await supabase
        .from("payments")
        .update({
          status: "failed",
          click_trans_id: clickTransId,
          click_paydoc_id: clickPaydocId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentId);

      console.log("[Click callback] payment failed (Click error):", paymentId);
      return Response.json({
        click_trans_id: clickTransId,
        merchant_trans_id: paymentId,
        merchant_confirm_id: paymentId,
        error: 0,
        error_note: "Success",
      });
    }

    // ── Mark payment as paid ──────────────────────────────────────────────
    const { error: updateErr } = await supabase
      .from("payments")
      .update({
        status: "paid",
        click_trans_id: clickTransId,
        click_paydoc_id: clickPaydocId,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);

    if (updateErr) {
      console.error("[Click callback] failed to update payment status:", updateErr.message);
      return Response.json({ error: -7, error_note: "FAILED TO UPDATE USER" });
    }

    // ── Grant access ──────────────────────────────────────────────────────
    try {
      if (payment.type === "subscription" && payment.tier) {
        const plan = normalizeSubscriptionPlan(payment.tier);
        const startsAt = new Date().toISOString();
        // Upsert into subscriptions table
        const expiresAt = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString();

        await supabase
          .from("profiles")
          .update({
            subscription: plan,
            updated_at: startsAt,
          })
          .eq("id", payment.user_id);

        await upsertSubscriptionInfo(
          supabase as any,
          {
            userId: payment.user_id,
            plan,
            status: "active",
            starts_at: startsAt,
            expires_at: expiresAt,
            payment_id: paymentId,
          },
          { strict: false }
        );

        console.log(
          "[Click callback] subscription granted:",
          payment.user_id,
          "->",
          plan
        );
      } else if (payment.type === "article" && payment.article_id) {
        await supabase.from("article_purchases").insert({
          user_id: payment.user_id,
          article_id: payment.article_id,
          payment_id: paymentId,
          created_at: new Date().toISOString(),
        });
        console.log(
          "[Click callback] article purchased:",
          payment.user_id,
          "->",
          payment.article_id
        );
      }
    } catch (grantErr) {
      // Access grant failure should NOT block the Click confirmation response
      console.error("[Click callback] access grant error (non-fatal):", grantErr);
    }

    return Response.json({
      click_trans_id: clickTransId,
      merchant_trans_id: paymentId,
      merchant_confirm_id: paymentId,
      error: 0,
      error_note: "Success",
    });
  }

  return Response.json({ error: -3, error_note: "ACTION NOT FOUND" });
}
