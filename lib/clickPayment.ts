import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { SubscriptionInfo } from "@/lib/types";

// ─── Device user ID ───────────────────────────────────────────────────────────

const DEVICE_ID_KEY = "mt.device.id.v1";

export async function getDeviceUserId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id =
      "u-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 9);
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    // Fallback: non-persistent session ID
    return "u-" + Date.now().toString(36);
  }
}

// ─── API base URL ─────────────────────────────────────────────────────────────
// Set EXPO_PUBLIC_API_URL in your .env to the deployed app URL.
// On web the default empty string results in relative URLs (same origin).

function getApiBase(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
}

// ─── Return URL base ──────────────────────────────────────────────────────────
// Native deep-link scheme is used on iOS/Android.
// Web uses the current origin so the in-app browser can intercept the redirect.

export function getReturnUrlBase(): string {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/payment-result`;
    }
    return "/payment-result";
  }
  return "rork-app://payment-result";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentType = "subscription" | "article";

export interface CreatePaymentParams {
  userId: string;
  type: PaymentType;
  tier?: string;       // "premium" | "pro" — for subscription
  articleId?: string;  // for article purchase
  amount?: number;     // required for article purchase; subscriptions use server amounts
  returnUrlBase: string;
}

export interface CreatePaymentResult {
  payment_url?: string;
  payment_id?: string;
  error?: string;
}

export interface PaymentStatus {
  status: "pending" | "paid" | "failed" | "cancelled";
  amount?: number;
  tier?: string;
  type?: string;
  article_id?: string;
  subscription_info?: SubscriptionInfo;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function createClickPayment(
  params: CreatePaymentParams
): Promise<CreatePaymentResult> {
  const url = `${getApiBase()}/api/click/create-payment`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function getPaymentStatus(
  paymentId: string
): Promise<PaymentStatus> {
  const url = `${getApiBase()}/api/click/status/${paymentId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return res.json();
}
