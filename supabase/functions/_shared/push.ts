// Helper to send Web Push notifications to one or more users.
// VAPID keys live in platform_settings (private encrypted via meta-crypto).
// Configure/rotate in Super Admin → Identidade Visual → Push Notifications.

import webpush from "npm:web-push@3.6.7";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { decryptSecret } from "./meta-crypto.ts";

let vapidLoaded = false;
let vapidLoadPromise: Promise<boolean> | null = null;

async function doLoadVapid(): Promise<boolean> {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin
      .from("platform_settings")
      .select("vapid_public_key, vapid_private_key_encrypted, vapid_subject")
      .limit(1)
      .maybeSingle();
    if (!data?.vapid_public_key || !data?.vapid_private_key_encrypted) {
      console.warn("[push] VAPID not configured in platform_settings — push disabled");
      return false;
    }
    const priv = await decryptSecret(data.vapid_private_key_encrypted);
    const subject = data.vapid_subject || "mailto:noreply@vendus.com.br";
    webpush.setVapidDetails(subject, data.vapid_public_key, priv);
    vapidLoaded = true;
    return true;
  } catch (err) {
    console.error("[push] loadVapid failed:", err);
    return false;
  }
}

async function ensureVapid(): Promise<boolean> {
  if (vapidLoaded) return true;
  if (!vapidLoadPromise) vapidLoadPromise = doLoadVapid();
  const ok = await vapidLoadPromise;
  if (!ok) vapidLoadPromise = null; // allow retry next call
  return ok;
}

export type PushPreferenceKey =
  | "push_new_message"
  | "push_queue_lead"
  | "push_assigned_lead"
  | "push_booking_reminder"
  | "push_sale_won"
  | "push_new_booking";


export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
}

interface SupabaseLike {
  from: (t: string) => any;
  rpc?: (n: string, p?: any) => any;
}

/**
 * Send a push notification to all active subscriptions of the given users,
 * respecting their `push_enabled` and the granular preference key.
 * Fire-and-forget safe: errors are swallowed and logged.
 */
export async function sendPushToUsers(
  supabase: SupabaseLike,
  userIds: string[],
  payload: PushPayload,
  preferenceKey: PushPreferenceKey,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const result = { sent: 0, failed: 0, skipped: 0 };
  if (!(await ensureVapid())) return result;
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return result;

  try {
    // 1. Filter users by preference (push_enabled + specific key)
    const { data: prefs } = await supabase
      .from("user_notification_settings")
      .select(`user_id, push_enabled, ${preferenceKey}`)
      .in("user_id", uniqueIds);

    const allowedUsers = new Set<string>(uniqueIds);
    if (prefs && Array.isArray(prefs)) {
      for (const p of prefs) {
        if (p.push_enabled === false || p[preferenceKey] === false) {
          allowedUsers.delete(p.user_id);
        }
      }
    }
    if (allowedUsers.size === 0) {
      result.skipped = uniqueIds.length;
      return result;
    }

    // 2. Fetch active subscriptions
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_id")
      .in("user_id", [...allowedUsers])
      .is("revoked_at", null);

    if (!subs || subs.length === 0) return result;

    const body = JSON.stringify(payload);
    const details: Array<{ endpoint: string; user_id: string; ok: boolean; status: number; error?: string }> = [];

    const tasks = subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24 },
        );
        result.sent++;
        details.push({ endpoint: s.endpoint, user_id: s.user_id, ok: true, status: 201 });
        supabase
          .from("push_subscriptions")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", s.id)
          .then?.(() => {});
      } catch (err: any) {
        result.failed++;
        const status = err?.statusCode || err?.status || 0;
        const msg = err?.body || err?.message || String(err);
        details.push({ endpoint: s.endpoint, user_id: s.user_id, ok: false, status, error: String(msg).slice(0, 500) });
        if (status === 404 || status === 410) {
          await supabase
            .from("push_subscriptions")
            .update({ revoked_at: new Date().toISOString() })
            .eq("id", s.id);
        } else {
          console.warn(`[push] send failed status=${status} user=${s.user_id}`, msg);
        }
      }
    });

    await Promise.allSettled(tasks);
    (result as any).details = details;
    return result;
  } catch (err) {
    console.error("[push] sendPushToUsers exception:", err);
    return result;
  }
}
