import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionInfo, SubscriptionPlan, SubscriptionStatus } from "../types";

const SUBSCRIPTION_TABLES = ["subscriptions", "user_subscriptions"] as const;

type SubscriptionRow = Record<string, unknown> & {
  plan?: unknown;
  tier?: unknown;
  status?: unknown;
  starts_at?: unknown;
  expires_at?: unknown;
  created_at?: unknown;
};

type UpsertSubscriptionInput = {
  userId: string;
  plan: unknown;
  status?: unknown;
  starts_at?: string | null;
  expires_at?: string | null;
  payment_id?: string | null;
};

type UpsertSubscriptionOptions = {
  strict?: boolean;
};

type SubscriptionInfoInput = {
  plan?: unknown;
  status?: unknown;
  starts_at?: unknown;
  expires_at?: unknown;
};

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function formatError(error: { message?: string | null; details?: string | null; hint?: string | null; code?: string | null } | null | undefined): string {
  return [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(" | ");
}

function isMissingTableError(errorText: string): boolean {
  return /relation .* does not exist|table .* does not exist|schema cache|could not find the table/i.test(errorText);
}

function isMissingColumnError(errorText: string): boolean {
  return /column .* does not exist|schema cache|could not find/i.test(errorText);
}

function isMissingUniqueConstraintError(errorText: string): boolean {
  return /no unique or exclusion constraint matching the on conflict specification|42p10/i.test(errorText);
}

export function normalizeSubscriptionPlan(value: unknown): SubscriptionPlan {
  const normalized = asOptionalString(value)?.toLowerCase();
  if (normalized === "premium") {
    return "premium";
  }

  if (normalized === "pro" || normalized === "vip") {
    return "pro";
  }

  return "free";
}

export function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  const normalized = asOptionalString(value)?.toLowerCase();
  if (normalized === "expired") {
    return "expired";
  }

  if (normalized === "cancelled") {
    return "cancelled";
  }

  return "active";
}

export function buildSubscriptionInfo(input: SubscriptionInfoInput | null | undefined, fallbackPlan: unknown = "free"): SubscriptionInfo {
  const plan = normalizeSubscriptionPlan(input?.plan ?? fallbackPlan);

  return {
    plan,
    status: normalizeSubscriptionStatus(input?.status),
    starts_at: asOptionalString(input?.starts_at) ?? null,
    expires_at: asOptionalString(input?.expires_at) ?? null,
  };
}

async function readTableSubscription(
  admin: SupabaseClient,
  table: (typeof SUBSCRIPTION_TABLES)[number],
  userId: string
): Promise<SubscriptionRow | null | undefined> {
  const result = await (admin.from(table) as any)
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    const errorText = formatError(result.error);
    if (isMissingTableError(errorText)) {
      return undefined;
    }

    throw new Error(errorText || `subscription_read_failed:${table}`);
  }

  return (result.data as SubscriptionRow | null) ?? null;
}

export async function readSubscriptionInfo(admin: SupabaseClient, userId: string, fallbackPlan: unknown = "free"): Promise<SubscriptionInfo> {
  for (const table of SUBSCRIPTION_TABLES) {
    const row = await readTableSubscription(admin, table, userId);
    if (!row) {
      continue;
    }

    return buildSubscriptionInfo(
      {
        plan: row.plan ?? row.tier,
        status: row.status,
        starts_at: asOptionalString(row.starts_at) ?? asOptionalString(row.created_at),
        expires_at: asOptionalString(row.expires_at),
      },
      fallbackPlan
    );
  }

  return buildSubscriptionInfo(undefined, fallbackPlan);
}

export async function upsertSubscriptionInfo(
  admin: SupabaseClient,
  input: UpsertSubscriptionInput,
  options: UpsertSubscriptionOptions = {}
): Promise<SubscriptionInfo> {
  const plan = normalizeSubscriptionPlan(input.plan);
  const status = normalizeSubscriptionStatus(input.status);
  const startsAt = asOptionalString(input.starts_at) ?? new Date().toISOString();
  const expiresAt = asOptionalString(input.expires_at);
  const paymentId = asOptionalString(input.payment_id);
  const updatedAt = new Date().toISOString();
  const subscriptionInfo = buildSubscriptionInfo(
    {
      plan,
      status,
      starts_at: startsAt,
      expires_at: expiresAt,
    },
    plan
  );

  const payloadVariants: Record<string, unknown>[] = [
    {
      user_id: input.userId,
      plan,
      status,
      starts_at: startsAt,
      expires_at: expiresAt,
      payment_id: paymentId,
      updated_at: updatedAt,
    },
    {
      user_id: input.userId,
      plan,
      status,
      expires_at: expiresAt,
      payment_id: paymentId,
      updated_at: updatedAt,
    },
    {
      user_id: input.userId,
      plan,
      status,
      starts_at: startsAt,
      expires_at: expiresAt,
      updated_at: updatedAt,
    },
    {
      user_id: input.userId,
      plan,
      status,
      expires_at: expiresAt,
      updated_at: updatedAt,
    },
    {
      user_id: input.userId,
      tier: plan,
      status,
      starts_at: startsAt,
      expires_at: expiresAt,
      payment_id: paymentId,
      updated_at: updatedAt,
    },
    {
      user_id: input.userId,
      tier: plan,
      status,
      expires_at: expiresAt,
      payment_id: paymentId,
      updated_at: updatedAt,
    },
    {
      user_id: input.userId,
      tier: plan,
      status,
      starts_at: startsAt,
      expires_at: expiresAt,
      updated_at: updatedAt,
    },
    {
      user_id: input.userId,
      tier: plan,
      status,
      expires_at: expiresAt,
      updated_at: updatedAt,
    },
  ];

  let lastErrorText = "";

  for (const table of SUBSCRIPTION_TABLES) {
    for (const payload of payloadVariants) {
      const result = await (admin.from(table) as any).upsert(payload, {
        onConflict: "user_id",
        ignoreDuplicates: false,
      });

      if (!result.error) {
        return subscriptionInfo;
      }

      const errorText = formatError(result.error);
      lastErrorText = errorText || lastErrorText;

      if (isMissingUniqueConstraintError(errorText)) {
        const deleteResult = await (admin.from(table) as any).delete().eq("user_id", input.userId);
        if (deleteResult.error) {
          lastErrorText = formatError(deleteResult.error) || lastErrorText;
          continue;
        }

        const insertResult = await (admin.from(table) as any).insert(payload);
        if (!insertResult.error) {
          return subscriptionInfo;
        }

        lastErrorText = formatError(insertResult.error) || lastErrorText;
        continue;
      }

      if (isMissingTableError(errorText) || isMissingColumnError(errorText)) {
        continue;
      }

      if (options.strict) {
        throw new Error(errorText || `subscription_upsert_failed:${table}`);
      }

      console.warn("[subscriptions] Failed to persist subscription", {
        table,
        error: errorText,
      });
      return subscriptionInfo;
    }
  }

  if (options.strict && lastErrorText) {
    throw new Error(lastErrorText);
  }

  if (lastErrorText) {
    console.warn("[subscriptions] Subscription table not available", lastErrorText);
  }

  return subscriptionInfo;
}
