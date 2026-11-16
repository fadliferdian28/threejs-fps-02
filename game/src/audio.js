// audio.js — every sound in the game, synthesized with WebAudio.
//
// No audio files: the game stays offline and every sound is readable
// source. Each sound is a short envelope over noise or an oscillator —
// a gunshot is a noise burst plus a low thump, a beep is a square blip,
// the explosion is a slow low boom. Sounds are positioned by volume
// only (louder when closer); the game has no 3D audio graph to keep
// the module small. M toggles a master mute.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;
  let resumeTried = false;

  // The AudioContext is created on the first user gesture (browsers
  // refuse to start one before); every play call before that is a no-op.
  function ensure() {
    if (ctx) {
      // Resume is attempted once: before any gesture the browser
      // refuses, and retrying every sound would spam the console.
      if (ctx.state === 'suspended' && !resumeTried) {
        resumeTried = true;
        void ctx.resume();
      }
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return false; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise(dur, { freq = 1000, gain = 0.5, type = 'lowpass', when = 0, decay = null } = {}) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (decay ?? dur));
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, { gain = 0.3, type = 'sine', when = 0, slide = null } = {}) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // Distance falloff: 1 at the listener, fading to ~0.05 at 45 m.
  const vol = (dist) => Math.max(0.05, 1 - (dist ?? 0) / 50);

  return {
    unlock() { ensure(); },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shot(kind, dist = 0) {
      if (!ensure()) return;
      const v = vol(dist);
      if (kind === 'marksman') { noise(0.35, { freq: 900, gain: 0.9 * v }); tone(70, 0.3, { gain: 0.7 * v, slide: 40 }); }
      else if (kind === 'smg') { noise(0.12, { freq: 2400, gain: 0.45 * v }); tone(140, 0.08, { gain: 0.3 * v }); }
      else if (kind === 'pistol') { noise(0.16, { freq: 1800, gain: 0.55 * v }); tone(110, 0.12, { gain: 0.4 * v }); }
      else { noise(0.2, { freq: 1400, gain: 0.65 * v }); tone(95, 0.16, { gain: 0.5 * v, slide: 55 }); }
    },
    dryFire() { if (ensure()) tone(1400, 0.05, { gain: 0.15, type: 'square' }); },
    reload() {
      if (!ensure()) return;
      tone(900, 0.05, { gain: 0.2, type: 'square' });
      tone(700, 0.05, { gain: 0.2, type: 'square', when: 0.25 });
      tone(1100, 0.06, { gain: 0.25, type: 'square', when: 0.5 });
    },
    step(sprint = false, dist = 0) {
      if (!ensure()) return;
      noise(0.06, { freq: 500, gain: (sprint ? 0.22 : 0.1) * vol(dist) });
    },
    hitmarker(head = false) {
      if (!ensure()) return;
      tone(head ? 1900 : 1500, 0.06, { gain: 0.25, type: 'square' });
    },
    kill() { if (ensure()) { tone(660, 0.09, { gain: 0.25 }); tone(990, 0.14, { gain: 0.25, when: 0.09 }); } },
    beep(final = false) {
      if (!ensure()) return;
      tone(final ? 2200 : 1600, final ? 0.3 : 0.12, { gain: 0.3, type: 'square' });
    },
    plant() { if (ensure()) { tone(1200, 0.1, { gain: 0.3, type: 'square' }); tone(1200, 0.1, { gain: 0.3, type: 'square', when: 0.18 }); } },
    explosion() {
      if (!ensure()) return;
      noise(1.4, { freq: 220, gain: 1.0, decay: 1.4 });
      tone(55, 1.1, { gain: 0.9, slide: 28 });
    },
    roundWin() {
      if (!ensure()) return;
      tone(523, 0.12, { gain: 0.25 });
      tone(659, 0.12, { gain: 0.25, when: 0.12 });
      tone(784, 0.24, { gain: 0.3, when: 0.24 });
    },
    radio() { if (ensure()) noise(0.12, { freq: 3200, gain: 0.12, type: 'bandpass' }); },
    buy() { if (ensure()) tone(880, 0.07, { gain: 0.2, type: 'square' }); },
    denied() { if (ensure()) tone(220, 0.15, { gain: 0.25, type: 'square' }); },
  };
}
