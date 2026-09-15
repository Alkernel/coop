// Lightweight chat feedback: short Web Audio blips + device vibration.
// No audio assets and no extra dependencies. Everything fails silently on
// browsers that block AudioContext / vibration, so it can never break the chat.

const MUTE_KEY = 'coop_chat_fx_muted';

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function isChatFxMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setChatFxMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, '1');
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

function vibrate(pattern: number | number[]): void {
  if (isChatFxMuted()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

/** Play a short two-note blip. `notes` are frequencies in Hz. */
function blip(notes: number[], step = 0.075, type: OscillatorType = 'sine', peak = 0.045): void {
  if (isChatFxMuted()) return;
  const ac = audioCtx();
  if (!ac) return;
  try {
    const start = ac.currentTime;
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const t0 = start + i * step;
      const t1 = t0 + step * 1.25;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      // Quick attack, smooth decay — avoids clicks.
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    });
  } catch {
    /* ignore */
  }
}

export const chatFx = {
  /** Outgoing message: rising two-tone pop. */
  sent(): void {
    blip([620, 930]);
    vibrate(12);
  },
  /** Incoming message: soft notify chime. */
  received(): void {
    blip([880, 1180], 0.085);
    vibrate([14, 38, 14]);
  },
  /** Chat ended / rating submitted. */
  ended(): void {
    blip([520, 392], 0.13);
    vibrate(28);
  },
  /** Failure feedback. */
  failed(): void {
    blip([240, 180], 0.11, 'square', 0.03);
    vibrate([30, 50, 30]);
  }
};

export default chatFx;
