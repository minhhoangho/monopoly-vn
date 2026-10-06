// U8: all sounds are synthesized with the Web Audio API, so there are no audio files to ship or license.
import { load, save } from './util'

let ctx: AudioContext | null = null
let effectsOn = load<'on' | 'off'>('sound', 'on') === 'on'
let musicOn = load<'on' | 'off'>('music', 'off') === 'on'
let musicTimer = 0

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
  } catch {
    return null // no Web Audio: play silently
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

// Browsers only start audio after a user gesture; resume on the first one.
window.addEventListener('pointerdown', () => audio(), { once: true })

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, slideTo?: number) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + at
  const osc = a.createOscillator()
  const env = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + 0.01)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(env).connect(a.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

function noise(at: number, dur: number, gain = 0.25, freq = 2000, q = 1) {
  const a = audio()
  if (!a) return
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const src = a.createBufferSource()
  src.buffer = buffer
  const filter = a.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = q
  const env = a.createGain()
  env.gain.value = gain
  src.connect(filter).connect(env).connect(a.destination)
  src.start(a.currentTime + at)
}

const notes = (freqs: number[], step: number, dur: number, type: OscillatorType, gain: number) =>
  freqs.forEach((f, i) => tone(f, i * step, i === freqs.length - 1 ? dur * 2 : dur, type, gain))

const effects = {
  /** dice rattling in the hand, then two clacks on the board (lands with the 1.1s dice animation) */
  dice: () => {
    for (let i = 0; i < 8; i++) noise(i * 0.07 + Math.random() * 0.02, 0.04, 0.3, 1800 + Math.random() * 1500, 2)
    noise(0.9, 0.05, 0.4, 900, 3)
    noise(1.0, 0.05, 0.35, 800, 3)
  },
  step: () => tone(520, 0, 0.06, 'triangle', 0.06),
  coin: () => {
    tone(1319, 0, 0.1, 'square', 0.04)
    tone(1760, 0.08, 0.35, 'square', 0.04)
  },
  buy: () => {
    noise(0, 0.03, 0.3, 3000)
    tone(1047, 0.03, 0.12, 'triangle', 0.1)
    tone(1568, 0.12, 0.4, 'triangle', 0.1)
  },
  /** "wah wah" when money leaves your pocket */
  pay: () => {
    tone(392, 0, 0.28, 'sawtooth', 0.05, 370)
    tone(330, 0.3, 0.5, 'sawtooth', 0.05, 262)
  },
  card: () => {
    noise(0, 0.18, 0.2, 4000, 0.7)
    tone(660, 0.05, 0.12, 'sine', 0.05, 990)
  },
  jail: () => {
    noise(0, 0.08, 0.3, 600, 2)
    tone(196, 0, 0.6, 'square', 0.04)
    tone(233, 0, 0.6, 'square', 0.03)
  },
  build: () => {
    noise(0, 0.05, 0.5, 300, 3)
    noise(0.15, 0.05, 0.5, 350, 3)
  },
  bankrupt: () => notes([392, 370, 349, 330], 0.35, 0.33, 'sawtooth', 0.05),
  win: () => notes([523, 659, 784, 1047], 0.13, 0.15, 'triangle', 0.1),
  pop: () => tone(700, 0, 0.12, 'sine', 0.1, 1300),
}

export type Effect = keyof typeof effects

export function play(effect: Effect) {
  if (effectsOn) effects[effect]()
}

export const soundOn = () => effectsOn
export const musicIsOn = () => musicOn

export function setSound(on: boolean) {
  effectsOn = on
  save('sound', on ? 'on' : 'off')
}

// Background music: a soft đàn tranh-like pluck wandering over the Vietnamese pentatonic scale
// (ngũ cung Hò–Xự–Xang–Xê–Cống ≈ C D F G A), two octaves.
const PENTATONIC = [261.63, 293.66, 349.23, 392.0, 440.0]
let degree = 4

/** Music plays only during a game: the game screen calls this on mount and stopMusic on unmount. */
export function startMusicIfOn() {
  if (musicOn) startMusic()
}

function startMusic() {
  stopMusic()
  musicTimer = window.setInterval(() => {
    if (ctx?.state !== 'running' || Math.random() < 0.3) return // wait for audio unlock; breathe
    degree = Math.max(0, Math.min(9, degree + Math.floor(Math.random() * 5) - 2))
    const freq = PENTATONIC[degree % 5] * (degree >= 5 ? 2 : 1)
    tone(freq, 0, 1.4, 'triangle', 0.03)
    tone(freq * 2, 0, 0.5, 'sine', 0.01) // bright attack like a plucked string
  }, 620)
}

export function stopMusic() {
  clearInterval(musicTimer)
  musicTimer = 0
}

export function setMusic(on: boolean) {
  musicOn = on
  save('music', on ? 'on' : 'off')
  if (on) startMusic()
  else stopMusic()
}
