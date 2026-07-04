// Som ambiente GENERATIVO para o modo Foco — sintetizado em WebAudio, sem
// nenhum asset de áudio: zero licenciamento, zero bytes no bundle, funciona
// offline e nunca se repete (música gerada por matemática, no espírito da
// casa). Três cenas:
//   "chuva" — ruído filtrado com respiração lenta (LFO);
//   "vinil" — superfície de ruído grave + estalos esparsos aleatórios;
//   "lofi"  — pads de acordes de sétima (passeio aleatório numa progressão
//             quente em Fá), baixo senoidal e camada de vinil por baixo.
// Tudo em volumes conservadores (fundo, não protagonista). O AudioContext é
// criado só em gesto do usuário (clique em "Começar") — política de autoplay.

export type AmbienceScene = "chuva" | "vinil" | "lofi";

const FADE_S = 1.6;

// ---- utilidades ----

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Progressão quente em Fá maior (graus com sétima; MIDI). O passeio aleatório
// nunca repete o acorde atual e favorece resoluções suaves.
const CHORDS: number[][] = [
  [53, 57, 60, 64], // Fmaj7  (F3 A3 C4 E4)
  [50, 53, 57, 60], // Dm7    (D3 F3 A3 C4)
  [55, 58, 62, 65], // Gm7    (G3 Bb3 D4 F4)
  [48, 52, 55, 58], // C7     (C3 E3 G3 Bb3)
  [57, 60, 64, 67], // Am7    (A3 C4 E4 G4)
  [58, 62, 65, 69], // Bbmaj7 (Bb3 D4 F4 A4)
];

function noiseBuffer(ctx: AudioContext, seconds: number, brown = false): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buf;
}

// ---- motor ----

class AmbienceEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private stopFns: (() => void)[] = [];
  private currentChord = 0;
  scene: AmbienceScene | null = null;

  get playing(): boolean {
    return this.ctx !== null;
  }

  start(scene: AmbienceScene): void {
    this.stop(0.05);
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(1, ctx.currentTime + FADE_S);
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.scene = scene;

    if (scene === "chuva") this.buildRain(ctx, master);
    if (scene === "vinil") this.buildVinyl(ctx, master, 1);
    if (scene === "lofi") {
      this.buildVinyl(ctx, master, 0.55);
      this.buildPads(ctx, master);
    }
  }

  stop(fade = FADE_S): void {
    const ctx = this.ctx;
    const master = this.master;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.stopFns.forEach((f) => f());
    this.stopFns = [];
    this.ctx = null;
    this.master = null;
    this.scene = null;
    if (!ctx || !master) return;
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + fade);
      setTimeout(() => ctx.close().catch(() => {}), (fade + 0.2) * 1000);
    } catch {
      ctx.close().catch(() => {});
    }
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  // ---- chuva: ruído em banda com respiração lenta ----
  private buildRain(ctx: AudioContext, out: GainNode): void {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 4);
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 320;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1500;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    // respiração: LFO bem lento no volume (±20%)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.011;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(hp).connect(lp).connect(gain).connect(out);
    src.start();
    lfo.start();
    this.stopFns.push(() => {
      try {
        src.stop();
        lfo.stop();
      } catch {
        /* já parado */
      }
    });
  }

  // ---- vinil: superfície contínua + estalos esparsos ----
  private buildVinyl(ctx: AudioContext, out: GainNode, level: number): void {
    const surf = ctx.createBufferSource();
    surf.buffer = noiseBuffer(ctx, 3, true);
    surf.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3800;
    const surfGain = ctx.createGain();
    surfGain.gain.value = 0.014 * level;
    surf.connect(lp).connect(surfGain).connect(out);
    surf.start();
    this.stopFns.push(() => {
      try {
        surf.stop();
      } catch {
        /* já parado */
      }
    });

    // estalos: cliques curtos filtrados, em intervalos aleatórios
    const clickBuf = noiseBuffer(ctx, 0.012);
    const pop = () => {
      if (!this.ctx) return;
      const s = ctx.createBufferSource();
      s.buffer = clickBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 900 + Math.random() * 2200;
      const g = ctx.createGain();
      g.gain.value = (0.004 + Math.random() * 0.018) * level;
      s.connect(hp).connect(g).connect(out);
      s.start();
      this.later(90 + Math.random() * 550, pop);
    };
    this.later(300, pop);
  }

  // ---- lofi: pads de sétima + baixo, mudando a cada ~9-14 s ----
  private buildPads(ctx: AudioContext, out: GainNode): void {
    const padBus = ctx.createGain();
    padBus.gain.value = 1;
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 1050;
    warm.Q.value = 0.4;
    padBus.connect(warm).connect(out);

    const playChord = () => {
      if (!this.ctx) return;
      // próximo acorde: nunca o atual; favorece vizinhos da progressão
      let next = this.currentChord;
      while (next === this.currentChord) next = Math.floor(Math.random() * CHORDS.length);
      this.currentChord = next;
      const notes = CHORDS[next];
      const hold = 9 + Math.random() * 5; // segundos de acorde
      const t0 = ctx.currentTime;

      for (const m of notes) {
        // duas vozes levemente desafinadas por nota (calor analógico)
        for (const cents of [-4, 3]) {
          const osc = ctx.createOscillator();
          osc.type = "triangle";
          osc.frequency.value = midiToFreq(m) * Math.pow(2, cents / 1200);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.016, t0 + 2.4 + Math.random());
          g.gain.setValueAtTime(0.016, t0 + hold - 4);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + hold);
          osc.connect(g).connect(padBus);
          osc.start(t0);
          osc.stop(t0 + hold + 0.2);
        }
      }
      // baixo: fundamental duas oitavas abaixo, seno puro
      const bass = ctx.createOscillator();
      bass.type = "sine";
      bass.frequency.value = midiToFreq(notes[0] - 24);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.exponentialRampToValueAtTime(0.045, t0 + 2.8);
      bg.gain.setValueAtTime(0.045, t0 + hold - 4);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + hold);
      bass.connect(bg).connect(out);
      bass.start(t0);
      bass.stop(t0 + hold + 0.2);

      // agenda o próximo acorde com leve sobreposição (crossfade natural)
      this.later((hold - 3.2) * 1000, playChord);
    };
    playChord();
  }
}

// Singleton do app (client-only).
let engine: AmbienceEngine | null = null;

export function ambience(): AmbienceEngine {
  if (!engine) engine = new AmbienceEngine();
  return engine;
}

export const AMBIENCE_SCENES: { id: AmbienceScene; label: string }[] = [
  { id: "lofi", label: "Lo-fi" },
  { id: "chuva", label: "Chuva" },
  { id: "vinil", label: "Vinil" },
];
