// Короткие звуки на WebAudio (без файлов). Работают после первого нажатия пользователя.
// Включаются и выключаются кнопкой 🔊 / 🔇, выбор запоминается.

const KEY = 'neyronych_sound'

let enabled = (() => {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
})()

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (!enabled) return null
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.07) {
  const c = getCtx()
  if (!c) return
  try {
    const t0 = c.currentTime + start
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  } catch { /* звук — не критично */ }
}

export function isSoundOn(): boolean { return enabled }

export function setSoundOn(on: boolean): void {
  enabled = on
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* ignore */ }
  if (on) tone(660, 0, 0.09, 'triangle', 0.05)
}

const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 987.77, 1046.5] // до-ре-ми-соль-ля-си-до

export const sfx = {
  // чем длиннее серия правильных, тем выше нота
  correct(combo: number) {
    const i = Math.min(Math.max(combo - 1, 0), NOTES.length - 1)
    tone(NOTES[i], 0, 0.11, 'triangle', 0.075)
    tone(NOTES[i] * 1.5, 0.07, 0.16, 'triangle', 0.06)
  },
  wrong() {
    tone(196, 0, 0.16, 'sawtooth', 0.05)
    tone(147, 0.11, 0.22, 'sawtooth', 0.05)
  },
  tap() { tone(740, 0, 0.04, 'sine', 0.035) },
  step(i: number) { tone(NOTES[i % NOTES.length], 0, 0.14, 'sine', 0.07) },
  unlock() {
    tone(523.25, 0, 0.12, 'triangle', 0.07)
    tone(659.25, 0.1, 0.12, 'triangle', 0.07)
    tone(783.99, 0.2, 0.12, 'triangle', 0.07)
    tone(1046.5, 0.3, 0.28, 'triangle', 0.07)
  },
  rankUp() {
    ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.09, 0.16, 'triangle', 0.07))
  },
}