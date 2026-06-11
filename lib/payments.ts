import { Platform } from "react-native";
import { getSharedApiBase } from "@/lib/authApi";
import type { SubscriptionInfo } from "@/lib/types";

export type PaymentType = "subscription" | "article";

export interface CreatePaymentParams {
  userId: string;
  type: PaymentType;
  tier?: string;
  articleId?: string;
  returnUrlBase: string;
  language?: string;
}

export interface CreatePaymentResult {
  payment_url?: string;
  payment_id?: string;
  provider?: string;
  type?: PaymentType;
  tier?: string | null;
  article_id?: string | null;
  error?: string;
}

export interface PaymentStatus {
  status: "pending" | "paid" | "failed" | "cancelled";
  provider?: string;
  amount?: number;
  amount_tiyin?: number;
  tier?: string | null;
  type?: PaymentType;
  article_id?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: number | null;
  subscription_info?: SubscriptionInfo;
  article_access?: boolean;
}

export interface ArticleAccessResult {
  allowed: boolean;
  source?: "free" | "subscription" | "article_purchase" | "none";
  subscription_info?: SubscriptionInfo;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function getApiBase(): string {
  return trimTrailingSlash(getSharedApiBase());
}

export function getReturnUrlBase(): string {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.location.origin) {
      return `${window.location.origin}/payment-result`;
    }

    return "/payment-result";
  }

  return "rork-app://payment-result";
}

export async function createPaymePayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
  const response = await fetch(`${getApiBase()}/api/payme/create-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  return response.json();
}

export async function getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
  const response = await fetch(`${getApiBase()}/api/payme/status/${paymentId}`);
  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status}`);
  }

  return response.json();
}

export async function getArticleAccess(articleId: string, userId: string | null | undefined): Promise<ArticleAccessResult> {
  if (!userId) {
    return { allowed: false, source: "none" };
  }

  const response = await fetch(
    `${getApiBase()}/api/payme/article-access/${encodeURIComponent(articleId)}?user_id=${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    throw new Error(`Article access check failed: ${response.status}`);
  }

  return response.json();
}