// All sound is synthesised with WebAudio: zero asset bytes, no licences.
export class Sfx {
  constructor() {
    this.enabled = false
    this.voice = false
    this.ctx = null
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      const len = this.ctx.sampleRate
      this.noise = this.ctx.createBuffer(1, len, len)
      const d = this.noise.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.7
      this.master.connect(this.ctx.destination)
    }
    this.ctx.resume?.()
  }
  _noise(dur, freq, q, gain, attack = 0.005) {
    if (!this.enabled || !this.ctx) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 0.8 + Math.random() * 0.4
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.setValueAtTime(freq, t)
    f.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur)
    f.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.master)
    src.start(t, Math.random() * 0.5, dur + 0.05)
  }
  _ping(freq, dur, gain, delay = 0) {
    if (!this.enabled || !this.ctx) return
    const t = this.ctx.currentTime + delay
    const o = this.ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = freq
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }
  cardSlide() { this._noise(0.16, 3200, 0.8, 0.22, 0.03) }
  cardLand() { this._noise(0.05, 1500, 1.2, 0.3) }
  cardFlip() { this._noise(0.07, 2400, 1.5, 0.35) }
  chips(n = 3) {
    for (let i = 0; i < Math.min(n, 6); i++) {
      this._ping(2600 + Math.random() * 1800, 0.06, 0.12, i * 0.035 + Math.random() * 0.02)
      this._ping(5200 + Math.random() * 1500, 0.03, 0.05, i * 0.035)
    }
  }
  knock() { this._noise(0.07, 260, 2, 0.6) }
  say(text) {
    if (!this.enabled || !this.voice || !window.speechSynthesis) return
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.05
    u.pitch = 0.9
    u.volume = 0.9
    const en = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'))
    const pick = en.find((v) => /david|george|daniel|guy|male/i.test(v.name)) || en[0]
    if (pick) u.voice = pick
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  }
}
