// Tiny promise-based tween clock, advanced from the render loop so that
// animation speed, pause and replay are all under the director's control.
export const ease = {
  linear: (k) => k,
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  out: (k) => 1 - Math.pow(1 - k, 3),
  in: (k) => k * k,
}

export class Timeline {
  constructor() {
    this.items = new Set()
    this.speed = 1
  }
  tween(dur, onUpdate, easing = ease.inOut) {
    return new Promise((resolve) => {
      this.items.add({ t: 0, dur: Math.max(dur, 1e-4), onUpdate, easing, resolve })
    })
  }
  wait(dur) {
    return this.tween(dur, () => {}, ease.linear)
  }
  update(dt) {
    dt *= this.speed
    for (const it of [...this.items]) {
      it.t += dt
      const k = Math.min(1, it.t / it.dur)
      it.onUpdate(it.easing(k), k)
      if (k >= 1) {
        this.items.delete(it)
        it.resolve()
      }
    }
  }
  // Drop everything without resolving: awaiting code simply never resumes.
  clear() {
    this.items.clear()
  }
}
