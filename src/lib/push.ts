import { supabase } from "@/integrations/supabase/client";

// Chave VAPID pública é buscada em runtime via edge function `vapid-public`.
// Ela é gerada/rotacionada pelo Super Admin em Identidade Visual → Push Notifications.
let cachedVapidPublic: string | null = null;
async function fetchVapidPublic(): Promise<string | null> {
  if (cachedVapidPublic) return cachedVapidPublic;
  try {
    const { data, error } = await supabase.functions.invoke("vapid-public", { method: "GET" });
    if (error) return null;
    if (data?.configured && typeof data.public_key === "string") {
      cachedVapidPublic = data.public_key;
      return cachedVapidPublic;
    }
  } catch (e) {
    console.warn("[push] fetch vapid-public failed", e);
  }
  return null;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

export function isIOS(): boolean {
  return detectPlatform() === "ios";
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return buffer;
}

export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js");
  } catch (e) {
    console.error("[push] SW register failed", e);
    return null;
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration();
  if (!reg) return null;
  return await reg.pushManager.getSubscription();
}

export async function isCurrentSubscriptionRegistered(): Promise<boolean> {
  const sub = await getCurrentSubscription();
  if (!sub) return false;

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", sub.endpoint)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    console.warn("[push] backend subscription status check failed", error);
    return false;
  }

  return !!data?.id;
}

export async function subscribeUser(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  // iOS only allows push when installed as standalone PWA.
  if (isIOS() && !isStandalone()) {
    return { ok: false, reason: "ios_needs_install" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const reg = await getRegistration();
  if (!reg) return { ok: false, reason: "no_sw" };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const vapidPub = await fetchVapidPublic();
    if (!vapidPub) return { ok: false, reason: "vapid_unavailable" };
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPub),
      });
    } catch (e: any) {
      console.error("[push] subscribe failed", e);
      return { ok: false, reason: e?.message || "subscribe_failed" };
    }
  }

  const json = sub.toJSON();
  const { error } = await supabase.functions.invoke("push-subscribe", {
    body: {
      endpoint: json.endpoint,
      keys: json.keys,
      user_agent: navigator.userAgent,
      platform: detectPlatform(),
      is_standalone: isStandalone(),
    },
  });
  if (error) {
    console.error("[push] backend register failed", error);
    return { ok: false, reason: error.message || "backend_failed" };
  }
  return { ok: true };
}

export async function unsubscribeUser(): Promise<boolean> {
  const sub = await getCurrentSubscription();
  if (!sub) return true;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch (e) {
    console.warn("[push] browser unsubscribe failed", e);
  }
  try {
    await supabase.functions.invoke("push-unsubscribe", { body: { endpoint } });
  } catch (e) {
    console.warn("[push] backend unsubscribe failed", e);
  }
  return true;
}
