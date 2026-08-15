// Presence Engine — dispara "digitando..." / "gravando áudio..." real no WhatsApp
// via Evolution Go (POST /message/presence). Renova o estado a cada 7s (heartbeat)
// porque o Baileys expira o "composing" em ~10s.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

export type PresenceState = "composing" | "recording" | "paused" | "available" | "unavailable";

export interface PresenceTarget {
  organization_id: string;
  instance_id: string;
  phone: string;
}

export interface PresenceHandle {
  stop: () => Promise<void>;
}

interface SendPresenceArgs extends PresenceTarget {
  state: PresenceState;
  isAudio?: boolean;
}

const HEARTBEAT_MS = 7000;

async function callEvolutionSend(
  supabase: SupabaseClient,
  args: SendPresenceArgs,
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${supabaseUrl}/functions/v1/evolution-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        organization_id: args.organization_id,
        instance_id: args.instance_id,
        type: "presence",
        to: args.phone,
        payload: {
          state: args.state,
          isAudio: args.isAudio === true || args.state === "recording",
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(
        `[presence] failed status=${res.status} state=${args.state} phone=${args.phone} body=${body.slice(0, 200)}`,
      );
    } else {
      console.log(`[presence] sent state=${args.state} phone=${args.phone} isAudio=${!!args.isAudio}`);
    }
  } catch (err: any) {
    console.error(`[presence] exception state=${args.state}: ${err?.message || String(err)}`);
  }
}

export async function sendPresence(
  supabase: SupabaseClient,
  args: SendPresenceArgs,
): Promise<void> {
  await callEvolutionSend(supabase, args);
}

/**
 * Inicia "digitando..." (ou "gravando áudio..." se isAudio) com heartbeat.
 * Retorna handle.stop() que dispara "paused" e cancela o heartbeat.
 *
 * Uso:
 *   const h = await startTyping(supabase, { ...target, isAudio: false });
 *   await sleep(typingMs);
 *   await sendChunk(...);
 *   await h.stop();
 */
export async function startTyping(
  supabase: SupabaseClient,
  args: PresenceTarget & { isAudio?: boolean; enabled?: boolean },
): Promise<PresenceHandle> {
  if (args.enabled === false) {
    return { stop: async () => {} };
  }
  const state: PresenceState = args.isAudio ? "recording" : "composing";
  await sendPresence(supabase, { ...args, state });

  let stopped = false;
  const tick = () => {
    if (stopped) return;
    sendPresence(supabase, { ...args, state }).catch(() => {});
  };
  const interval = setInterval(tick, HEARTBEAT_MS);

  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      clearInterval(interval);
      await sendPresence(supabase, { ...args, state: "paused" });
    },
  };
}

export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function humanTypingMs(
  chars: number,
  opts: { charsPerSec?: number; minMs?: number; maxMs?: number; jitterPct?: number } = {},
): number {
  const cps = Math.max(5, opts.charsPerSec ?? 28);
  const minMs = opts.minMs ?? 1500;
  const maxMs = opts.maxMs ?? 7000;
  const jitter = Math.max(0, Math.min(60, opts.jitterPct ?? 15)) / 100;
  const base = (Math.max(0, chars) / cps) * 1000;
  const jitterFactor = 1 + (Math.random() * 2 - 1) * jitter;
  return clamp(base * jitterFactor, minMs, maxMs);
}
