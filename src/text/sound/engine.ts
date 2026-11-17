/**
 * Short synthesized sounds on native Web Audio nodes. The nodes render on the audio thread; the page only builds a handful per sound
 * and disconnects them when they end, so sound costs the main thread microseconds per event.
 */

import { stored, store } from "../storage.ts"

const MASTER_VOLUME = 0.7
/** Beyond this many sounding voices new ones are dropped, so a burst of events cannot pile up work. */
const MAX_VOICES = 48
/** Pan never reaches a hard side. */
const PAN_WIDTH = 0.85
/** A small dark room: decaying noise whose highs die faster than its lows. */
const REVERB_SECONDS = 0.9
const NOISE_SECONDS = 2
const SILENCE = 1e-4
/** Time constant of the fade when a sound is cut short. */
const CUT_SECONDS = 0.012
const STORAGE_KEY = "text-sound"
/** The bed's clicks are scheduled this far ahead on the audio clock, topped up every tick, so main-thread stalls do not make them stutter. */
const BED_LOOKAHEAD_SECONDS = 0.1
const BED_TICK_MS = 25
/** The bed counts the pointer as resting once its speed has not been updated for this long. */
const BED_SPEED_HOLD_MS = 90

/**
 * One sound: a tone (FM when `index` is set), or filtered white noise when `filter` is set.
 * Times are in seconds from now. The level rises linearly over `attack`, stays for `hold`, then falls exponentially to silence over `decay`.
 */
export type Voice = {
  /** Oscillator frequency, or the noise filter's frequency. */
  f: number
  /** Glides `f` exponentially to this over `glide`, by default the whole voice. */
  to?: number
  glide?: number
  wave?: "sine" | "triangle" | "square"
  filter?: "bandpass" | "lowpass" | "highpass"
  q?: number
  /** FM: a modulator at `f * ratio` with a peak deviation of `index * f * ratio`, decaying to a tenth over the voice. */
  ratio?: number
  index?: number
  /** Square-wave vibrato of ±`lfoDepth` Hz at `lfoRate` Hz. */
  lfoRate?: number
  lfoDepth?: number
  delay?: number
  attack?: number
  hold?: number
  decay: number
  gain: number
  /** -1 left to 1 right. */
  pan?: number
  /** Share sent to the reverb, 0 to 1. */
  wet?: number
}

/** A sound that can be cut short, e.g. a hold sweep the pointer abandons. */
export type Sound = { stop(): void }

/** A continuous click train while a future knob is dragged: its rate follows `strength`, its pitch `position`, its level `speed`; all 0 to 1. */
export type BedState = { position: number; strength: number; speed: number; pan: number }
export type Bed = { set(state: BedState): void; stop(): void }

type Graph = { context: AudioContext; master: GainNode; reverb: ConvolverNode; noise: AudioBuffer }

const SILENT: Sound = { stop() {} }
let graph: Graph | undefined
let isOn = stored(STORAGE_KEY) !== "off"
/** Set from a user gesture until the context resumes, so the sound that gesture triggers is not lost. */
let isUnlocking = false
let voiceCount = 0

/** Builds the audio graph, suspended until the first pointer or key press, as browsers only let a gesture start audio. */
export function startSound() {
  if (graph || typeof AudioContext === "undefined") return
  graph = createGraph()
  for (const type of ["pointerdown", "keydown"]) addEventListener(type, unlock, { capture: true })
}

export const isSoundOn = () => isOn

/** Remembered across visits. Call from a user gesture, so turning sound on may start audio. */
export function setSoundOn(on: boolean) {
  isOn = on
  store(STORAGE_KEY, on ? "on" : "off")
  if (on) unlock()
  else graph?.context.suspend()
}

/** Page x mapped to stereo position. */
export function panAt(pageX: number) {
  return ((pageX - scrollX) / innerWidth) * 2 - 1
}

export function play(voices: Voice[]): Sound {
  if (!isPlayable()) return SILENT
  const started = voices.flatMap((voice) => safely(() => start(voice)) ?? [])
  return { stop: () => started.forEach((sound) => safely(() => sound.stop())) }
}

/** Starts the click train; `set` it as the pointer moves. */
export function startBed(initial: BedState): Bed {
  if (!isPlayable()) return { set() {}, stop() {} }
  const { context } = graph!
  let state = initial
  let setAt = performance.now()
  let nextAt = context.currentTime
  const fill = () => {
    if (!isPlayable()) return
    const now = context.currentTime
    nextAt = Math.max(nextAt, now)
    const speed = performance.now() - setAt > BED_SPEED_HOLD_MS ? 0 : state.speed
    while (nextAt < now + BED_LOOKAHEAD_SECONDS) {
      safely(() =>
        start({ filter: "bandpass", f: 1200 + state.position * 2400, q: 3, decay: 0.003, gain: 0.05 + speed * 0.25, pan: state.pan, delay: nextAt - now }),
      )
      nextAt += 1 / (5 + state.strength * 25)
    }
  }
  fill()
  const timer = setInterval(fill, BED_TICK_MS)
  return {
    set(next) {
      state = next
      setAt = performance.now()
    },
    stop: () => clearInterval(timer),
  }
}

/** Sound is feedback, never control: a failure is logged and the interaction that triggered it carries on. */
function safely<T>(run: () => T): T | undefined {
  try {
    return run()
  } catch (error) {
    console.error(error)
  }
}

function isPlayable() {
  return graph !== undefined && isOn && (graph.context.state === "running" || isUnlocking) && voiceCount < MAX_VOICES
}

function unlock() {
  if (!graph || !isOn || graph.context.state === "running") return
  isUnlocking = true
  graph.context.resume().finally(() => (isUnlocking = false))
}

function start(voice: Voice): Sound | undefined {
  if (voiceCount >= MAX_VOICES) return
  const { context, master, reverb, noise } = graph!
  const { f, to, filter, delay = 0, attack = filter ? 0.001 : 0.002, hold = 0, decay, gain, pan = 0, wet = 0 } = voice
  const t0 = context.currentTime + delay
  const end = t0 + attack + hold + decay
  const nodes: AudioNode[] = []
  const sources: AudioScheduledSourceNode[] = []
  const add = <T extends AudioNode>(node: T) => (nodes.push(node), node)
  /** Where a noise voice starts reading the shared buffer, so repeated clicks do not sound identical. */
  const offset = Math.random() * (NOISE_SECONDS - 0.5)

  let head: AudioNode
  if (filter) {
    const source = add(new AudioBufferSourceNode(context, { buffer: noise }))
    const shaper = add(new BiquadFilterNode(context, { type: filter, Q: voice.q ?? 2 }))
    shaper.frequency.setValueAtTime(f, t0)
    if (to) shaper.frequency.exponentialRampToValueAtTime(to, t0 + (voice.glide ?? end - t0))
    source.connect(shaper)
    sources.push(source)
    head = shaper
  } else {
    const carrier = add(new OscillatorNode(context, { type: voice.wave ?? "sine" }))
    carrier.frequency.setValueAtTime(f, t0)
    const glideEnd = t0 + (voice.glide ?? end - t0)
    if (to) carrier.frequency.exponentialRampToValueAtTime(to, glideEnd)
    if (voice.index) {
      const ratio = voice.ratio ?? 3.01
      const deviation = voice.index * f * ratio
      const modulator = add(new OscillatorNode(context, { frequency: f * ratio }))
      const depth = add(new GainNode(context))
      depth.gain.setValueAtTime(deviation, t0)
      depth.gain.exponentialRampToValueAtTime(deviation * 0.1 + 1, end)
      if (to) modulator.frequency.exponentialRampToValueAtTime(to * ratio, glideEnd)
      modulator.connect(depth).connect(carrier.frequency)
      sources.push(modulator)
    }
    if (voice.lfoRate && voice.lfoDepth) {
      const lfo = add(new OscillatorNode(context, { type: "square", frequency: voice.lfoRate }))
      lfo.connect(add(new GainNode(context, { gain: voice.lfoDepth }))).connect(carrier.frequency)
      sources.push(lfo)
    }
    sources.push(carrier)
    head = carrier
  }

  const level = add(new GainNode(context, { gain: 0 }))
  level.gain.setValueAtTime(0, t0)
  level.gain.linearRampToValueAtTime(gain, t0 + attack)
  if (hold) level.gain.setValueAtTime(gain, t0 + attack + hold)
  level.gain.exponentialRampToValueAtTime(SILENCE, end)
  const panner = add(new StereoPannerNode(context, { pan: Math.max(-1, Math.min(1, pan)) * PAN_WIDTH }))
  head.connect(level).connect(panner).connect(master)
  if (wet > 0) panner.connect(add(new GainNode(context, { gain: wet }))).connect(reverb)

  for (const source of sources) {
    if (source instanceof AudioBufferSourceNode) source.start(t0, offset)
    else source.start(t0)
    source.stop(end + 0.02)
  }
  voiceCount++
  sources.at(-1)!.onended = () => {
    voiceCount--
    for (const node of nodes) node.disconnect()
  }

  return {
    stop() {
      const now = context.currentTime
      level.gain.cancelAndHoldAtTime(now)
      level.gain.setTargetAtTime(0, now, CUT_SECONDS)
      for (const source of sources) source.stop(Math.max(now, t0) + CUT_SECONDS * 6)
    },
  }
}

function createGraph(): Graph {
  const context = new AudioContext({ latencyHint: "interactive" })
  const master = new GainNode(context, { gain: MASTER_VOLUME })
  const limiter = new DynamicsCompressorNode(context, { threshold: -14, knee: 6, ratio: 6, attack: 0.001, release: 0.08 })
  const reverb = new ConvolverNode(context, { buffer: roomOf(context) })
  master.connect(limiter).connect(context.destination)
  reverb.connect(master)
  return { context, master, reverb, noise: noiseOf(context) }
}

function noiseOf(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate * NOISE_SECONDS, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
  return buffer
}

function roomOf(context: AudioContext) {
  const length = Math.floor(context.sampleRate * REVERB_SECONDS)
  const buffer = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel)
    let smoothed = 0
    for (let i = 0; i < length; i++) {
      const progress = i / length
      smoothed += (Math.random() * 2 - 1 - smoothed) * (0.9 - 0.75 * progress)
      samples[i] = smoothed * (1 - progress) ** 3
    }
  }
  return buffer
}
