import { useCallback, useEffect, useState } from 'react';

type Channel = 'message' | 'queue';

const KEYS = {
  master: 'notif_master_enabled',
  message: 'notif_volume_message',
  queue: 'notif_volume_queue',
};

function readNum(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  return raw !== 'false';
}

export function useNotificationSound() {
  const [masterEnabled, setMasterEnabled] = useState(() => readBool(KEYS.master, true));
  const [messageVolume, setMessageVolume] = useState(() => readNum(KEYS.message, 0.8));
  const [queueVolume, setQueueVolume] = useState(() => readNum(KEYS.queue, 1));

  useEffect(() => { localStorage.setItem(KEYS.master, String(masterEnabled)); }, [masterEnabled]);
  useEffect(() => { localStorage.setItem(KEYS.message, String(messageVolume)); }, [messageVolume]);
  useEffect(() => { localStorage.setItem(KEYS.queue, String(queueVolume)); }, [queueVolume]);

  const play = useCallback((channel: Channel) => {
    if (!masterEnabled) return;
    const vol = channel === 'message' ? messageVolume : queueVolume;
    if (vol <= 0) return;

    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const t0 = ctx.currentTime;

      if (channel === 'message') {
        // Bipe curto de 2 tons (sutil)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t0);
        osc.frequency.setValueAtTime(1175, t0 + 0.09);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.35 * vol, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
        osc.start(t0);
        osc.stop(t0 + 0.3);
        setTimeout(() => ctx.close(), 450);
      } else {
        // Sino de 3 tons ascendentes (mais marcante — chamada da fila)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(660, t0);
        osc.frequency.setValueAtTime(880, t0 + 0.18);
        osc.frequency.setValueAtTime(1318, t0 + 0.36);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.45 * vol, t0 + 0.03);
        gain.gain.setValueAtTime(0.45 * vol, t0 + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);
        osc.start(t0);
        osc.stop(t0 + 0.9);
        setTimeout(() => ctx.close(), 1100);
      }
    } catch (e) {
      console.warn('Audio playback not supported:', e);
    }
  }, [masterEnabled, messageVolume, queueVolume]);

  const playMessage = useCallback(() => play('message'), [play]);
  const playQueue = useCallback(() => play('queue'), [play]);

  const anySoundOn = masterEnabled && (messageVolume > 0 || queueVolume > 0);

  return {
    masterEnabled,
    setMasterEnabled,
    messageVolume,
    setMessageVolume,
    queueVolume,
    setQueueVolume,
    playMessage,
    playQueue,
    anySoundOn,
  };
}

export type NotificationSoundControls = ReturnType<typeof useNotificationSound>;
