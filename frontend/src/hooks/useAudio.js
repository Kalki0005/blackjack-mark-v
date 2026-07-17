import { useCallback, useRef } from 'react'

// Synthesized casino SFX (WebAudio, no asset files).
// Design goals: short, soft, "material" sounds — ceramic chips, card felt,
// wood rail knocks — not videogame beeps.

function getAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  return new Ctx()
}

// A single shared white-noise buffer per context (cheap to reuse).
function getNoiseBuffer(ctx) {
  if (!ctx.__noiseBuf) {
    const len = ctx.sampleRate * 0.5
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    ctx.__noiseBuf = buf
  }
  return ctx.__noiseBuf
}

function tone(ctx, { freq, dur, type = 'sine', gain = 0.06, when = 0, slideTo = null }) {
  const t0 = ctx.currentTime + when
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  osc.connect(g); g.connect(ctx.destination)
  osc.start(t0); osc.stop(t0 + dur + 0.05)
}

// Filtered noise burst — the workhorse for card/chip/shuffle textures.
function noise(ctx, { dur, gain = 0.1, when = 0, type = 'lowpass', freq = 1000, freqTo = null, q = 1 }) {
  const t0 = ctx.currentTime + when
  const src = ctx.createBufferSource()
  src.buffer = getNoiseBuffer(ctx)
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, t0)
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur)
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.015, dur * 0.2))
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  src.connect(f); f.connect(g); g.connect(ctx.destination)
  src.start(t0); src.stop(t0 + dur + 0.05)
}

export function useAudio(enabled = true) {
  const ctxRef = useRef(null)

  const getCtx = useCallback(() => {
    if (!enabled) return null
    if (!ctxRef.current) ctxRef.current = getAudioCtx()
    if (ctxRef.current?.state === 'suspended') ctxRef.current.resume()
    return ctxRef.current
  }, [enabled])

  // Ceramic chip clink: bright noise tick + two detuned pings landing together.
  const playChip = useCallback(() => {
    const ctx = getCtx()
    if (!ctx) return
    noise(ctx, { dur: 0.045, gain: 0.09, type: 'bandpass', freq: 3600, q: 4 })
    tone(ctx, { freq: 1860, dur: 0.07, type: 'sine', gain: 0.045 })
    tone(ctx, { freq: 2320, dur: 0.05, type: 'sine', gain: 0.03, when: 0.012 })
    // a second chip settling onto the stack
    noise(ctx, { dur: 0.03, gain: 0.05, type: 'bandpass', freq: 3100, q: 4, when: 0.07 })
    tone(ctx, { freq: 1540, dur: 0.05, type: 'sine', gain: 0.028, when: 0.07 })
  }, [getCtx])

  // Card slide off the shoe: airy noise sweep ending in a soft felt tap.
  const playDeal = useCallback(() => {
    const ctx = getCtx()
    if (!ctx) return
    noise(ctx, { dur: 0.14, gain: 0.075, type: 'lowpass', freq: 2600, freqTo: 500 })
    noise(ctx, { dur: 0.05, gain: 0.06, type: 'lowpass', freq: 320, when: 0.12 })
    tone(ctx, { freq: 190, dur: 0.06, type: 'triangle', gain: 0.04, when: 0.12 })
  }, [getCtx])

  // Stand: a single polite knuckle-knock on the rail.
  const playStand = useCallback(() => {
    const ctx = getCtx()
    if (!ctx) return
    tone(ctx, { freq: 210, dur: 0.09, type: 'triangle', gain: 0.07, slideTo: 150 })
    noise(ctx, { dur: 0.04, gain: 0.05, type: 'lowpass', freq: 900 })
  }, [getCtx])

  // Win: warm ascending major arpeggio with a soft sparkle on top.
  const playWin = useCallback(() => {
    const ctx = getCtx()
    if (!ctx) return
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(ctx, { freq: f, dur: 0.32, type: 'triangle', gain: 0.05, when: i * 0.09 })
      tone(ctx, { freq: f * 2, dur: 0.22, type: 'sine', gain: 0.016, when: i * 0.09 + 0.02 })
    })
    // chips sliding toward the player
    noise(ctx, { dur: 0.3, gain: 0.03, type: 'bandpass', freq: 2800, q: 2, when: 0.32 })
  }, [getCtx])

  // Bust / loss: muted low double-thud, no harsh buzz.
  const playBust = useCallback(() => {
    const ctx = getCtx()
    if (!ctx) return
    tone(ctx, { freq: 150, dur: 0.22, type: 'sine', gain: 0.085, slideTo: 82 })
    noise(ctx, { dur: 0.1, gain: 0.05, type: 'lowpass', freq: 420 })
    tone(ctx, { freq: 110, dur: 0.3, type: 'sine', gain: 0.06, slideTo: 62, when: 0.16 })
  }, [getCtx])

  // Generic soft UI tick.
  const playClick = useCallback(() => {
    const ctx = getCtx()
    if (!ctx) return
    noise(ctx, { dur: 0.025, gain: 0.05, type: 'bandpass', freq: 2400, q: 3 })
    tone(ctx, { freq: 940, dur: 0.035, type: 'sine', gain: 0.025 })
  }, [getCtx])

  // Shuffle: a run of quick riffle ticks, then a deck square-up tap.
  const playShuffle = useCallback(() => {
    const ctx = getCtx()
    if (!ctx) return
    for (let i = 0; i < 10; i++) {
      noise(ctx, {
        dur: 0.03, gain: 0.045 + Math.random() * 0.02,
        type: 'bandpass', freq: 1800 + Math.random() * 1400, q: 2,
        when: i * 0.05 + Math.random() * 0.012,
      })
    }
    noise(ctx, { dur: 0.07, gain: 0.07, type: 'lowpass', freq: 600, when: 0.56 })
    tone(ctx, { freq: 230, dur: 0.06, type: 'triangle', gain: 0.04, when: 0.56 })
  }, [getCtx])

  return { playChip, playDeal, playWin, playBust, playStand, playClick, playShuffle }
}
