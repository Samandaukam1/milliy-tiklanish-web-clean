import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearSupabaseAuth } from "@/lib/googleAuth";
import { supabase, loadSupabaseProfile } from "@/lib/supabase";
import type { SubscriptionInfo, SubscriptionPlan, UserProfile } from "@/lib/types";

const SAVED_KEY = "mt.saved.v1";
const READ_KEY = "mt.read.v1";
const SUB_KEY = "mt.subscription.v1";
const DEVICE_ID_KEY = "mt.device.id.v1";
const USER_KEY = "mt.user.v2";

export type Subscription = SubscriptionPlan;

function normalizeSubscription(value: unknown): Subscription {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "premium") {
    return "premium";
  }

  if (normalized === "pro" || normalized === "vip") {
    return "pro";
  }

  return "free";
}

function normalizeSubscriptionInfo(value: Subscription | SubscriptionInfo): SubscriptionInfo {
  if (typeof value === "string") {
    return {
      plan: normalizeSubscription(value),
      status: "active",
      starts_at: null,
      expires_at: null,
    };
  }

  return {
    plan: normalizeSubscription(value.plan),
    status: value.status === "expired" || value.status === "cancelled" ? value.status : "active",
    starts_at: value.starts_at ?? null,
    expires_at: value.expires_at ?? null,
  };
}

function normalizeUserProfile(user: UserProfile | null): UserProfile | null {
  if (!user) {
    return null;
  }

  const subscriptionInfo = normalizeSubscriptionInfo(user.subscription_info ?? normalizeSubscription(user.subscription));

  return {
    ...user,
    subscription: subscriptionInfo.plan,
    subscription_info: subscriptionInfo,
  };
}

export const [AppProvider, useApp] = createContextHook(() => {
  const [saved, setSaved] = useState<string[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const [subscription, setSubscription] = useState<Subscription>("free");
  const [deviceUserId, setDeviceUserId] = useState<string>("");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [pendingPhoneLinkPassword, setPendingPhoneLinkPassword] = useState<string | null>(null);

  const storageQuery = useQuery({
    queryKey: ["mt.storage"],
    queryFn: async () => {
      const [s, r, sub, u] = await Promise.all([
        AsyncStorage.getItem(SAVED_KEY),
        AsyncStorage.getItem(READ_KEY),
        AsyncStorage.getItem(SUB_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);

      const parsedUser = u ? normalizeUserProfile(JSON.parse(u) as UserProfile) : null;

      return {
        saved: s ? (JSON.parse(s) as string[]) : [],
        read: r ? (JSON.parse(r) as string[]) : [],
        subscription: normalizeSubscription(sub ?? parsedUser?.subscription),
        user: parsedUser,
      };
    },
  });

  useEffect(() => {
    if (storageQuery.data) {
      setSaved(storageQuery.data.saved);
      setRead(storageQuery.data.read);
      setUser(storageQuery.data.user ?? null);
      setSubscription(storageQuery.data.user?.subscription_info?.plan ?? storageQuery.data.subscription);
    }
  }, [storageQuery.data]);

  // ─── Supabase session listener ────────────────────────────────────────────
  // On web, Supabase persists the session in localStorage. When the user
  // reloads the page (or arrives after a Google OAuth redirect), Supabase
  // fires INITIAL_SESSION / SIGNED_IN so we can restore the profile WITHOUT
  // hitting any /api/... endpoint (which doesn't exist in static export).
  useEffect(() => {
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (
        (event === "INITIAL_SESSION" || event === "SIGNED_IN") &&
        session?.user
      ) {
        const profile = await loadSupabaseProfile(session.user.id);
        if (profile) {
          login(profile);
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setSubscription("free");
        persistUser.mutate(null);
        persistSub.mutate("free");
      }
    });

    return () => authSub.unsubscribe();
    // login, persistUser and persistSub are stable references
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistent device user ID — used for payment tracking
  useEffect(() => {
    AsyncStorage.getItem(DEVICE_ID_KEY).then((existing) => {
      if (existing) {
        setDeviceUserId(existing);
      } else {
        const id =
          "u-" +
          Date.now().toString(36) +
          "-" +
          Math.random().toString(36).slice(2, 9);
        AsyncStorage.setItem(DEVICE_ID_KEY, id).catch(() => {});
        setDeviceUserId(id);
      }
    }).catch(() => {});
  }, []);

  const persistSaved = useMutation({
    mutationFn: async (list: string[]) => {
      await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(list));
      return list;
    },
  });
  const persistRead = useMutation({
    mutationFn: async (list: string[]) => {
      await AsyncStorage.setItem(READ_KEY, JSON.stringify(list));
      return list;
    },
  });
  const persistSub = useMutation({
    mutationFn: async (s: Subscription) => {
      await AsyncStorage.setItem(SUB_KEY, s);
      return s;
    },
  });

  const persistUser = useMutation({
    mutationFn: async (u: UserProfile | null) => {
      if (u) {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
      } else {
        await AsyncStorage.removeItem(USER_KEY);
      }
      return u;
    },
  });

  const login = useCallback(
    (profile: UserProfile) => {
      const normalizedProfile = normalizeUserProfile(profile);
      const nextSubscription = normalizedProfile?.subscription_info?.plan ?? normalizeSubscription(normalizedProfile?.subscription);

      setUser(normalizedProfile);
      persistUser.mutate(normalizedProfile);
      setSubscription(nextSubscription);
      persistSub.mutate(nextSubscription);
    },
    [persistUser, persistSub]
  );

  const logout = useCallback(() => {
    setUser(null);
    setSubscription("free");
    setPendingPhoneLinkPassword(null);
    persistUser.mutate(null);
    persistSub.mutate("free");
    clearSupabaseAuth().catch(() => {});
  }, [persistSub, persistUser]);

  const stagePhoneLinkPassword = useCallback((password: string | null) => {
    setPendingPhoneLinkPassword(password?.trim() ? password : null);
  }, []);

  const clearPhoneLinkPassword = useCallback(() => {
    setPendingPhoneLinkPassword(null);
  }, []);

  const toggleSaved = useCallback(
    (id: string) => {
      setSaved((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        persistSaved.mutate(next);
        return next;
      });
    },
    [persistSaved]
  );

  const markRead = useCallback(
    (id: string) => {
      setRead((prev) => {
        if (prev.includes(id)) return prev;
        const next = [id, ...prev].slice(0, 50);
        persistRead.mutate(next);
        return next;
      });
    },
    [persistRead]
  );

  const updateSubscription = useCallback(
    (value: Subscription | SubscriptionInfo) => {
      const subscriptionInfo = normalizeSubscriptionInfo(value);
      const nextUser = user
        ? {
            ...user,
            subscription: subscriptionInfo.plan,
            subscription_info: subscriptionInfo,
          }
        : user;

      setSubscription(subscriptionInfo.plan);
      persistSub.mutate(subscriptionInfo.plan);

      if (nextUser) {
        setUser(nextUser);
        persistUser.mutate(nextUser);
      }
    },
    [persistSub, persistUser, user]
  );

  return useMemo(
    () => ({
      saved,
      read,
      subscription,
      deviceUserId,
      user,
      toggleSaved,
      markRead,
      updateSubscription,
      login,
      logout,
      pendingPhoneLinkPassword,
      stagePhoneLinkPassword,
      clearPhoneLinkPassword,
      isSaved: (id: string) => saved.includes(id),
      isReady: !storageQuery.isLoading,
    }),
    [
      saved,
      read,
      subscription,
      deviceUserId,
      user,
      toggleSaved,
      markRead,
      updateSubscription,
      login,
      logout,
      pendingPhoneLinkPassword,
      stagePhoneLinkPassword,
      clearPhoneLinkPassword,
      storageQuery.isLoading,
    ]
  );
});
