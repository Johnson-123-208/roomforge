let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new Ctx();
  }
  return sharedCtx;
}

async function ensureRunning(ctx: AudioContext) {
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Autoplay policies may block until a gesture; join already had one.
    }
  }
}

function tone(
  ctx: AudioContext,
  {
    frequency,
    start,
    duration,
    gain = 0.08,
    type = 'sine',
  }: {
    frequency: number;
    start: number;
    duration: number;
    gain?: number;
    type?: OscillatorType;
  },
) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.03);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Soft two-note chime for guests waiting to be admitted. */
export async function playWaitingChime(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  await ensureRunning(ctx);
  const t = ctx.currentTime;
  tone(ctx, { frequency: 523.25, start: t, duration: 0.22, gain: 0.06 }); // C5
  tone(ctx, { frequency: 659.25, start: t + 0.18, duration: 0.28, gain: 0.05 }); // E5
}

/** Clearer alert when a new guest appears in the host waiting list. */
export async function playHostWaitingAlert(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  await ensureRunning(ctx);
  const t = ctx.currentTime;
  tone(ctx, { frequency: 784.0, start: t, duration: 0.14, gain: 0.09, type: 'triangle' }); // G5
  tone(ctx, { frequency: 988.0, start: t + 0.14, duration: 0.18, gain: 0.08, type: 'triangle' }); // B5
  tone(ctx, { frequency: 1174.7, start: t + 0.3, duration: 0.22, gain: 0.07, type: 'triangle' }); // D6
}
