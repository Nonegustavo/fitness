import { useSyncExternalStore } from 'react'

export interface RestTimer {
  endsAt: number
  totalSec: number
  label: string
}

// Kept in localStorage so a reload or a trip to another screen doesn't lose the countdown.
const STORAGE_KEY = 'fitness.restTimer'
const listeners = new Set<() => void>()
let timer: RestTimer | null = load()

function load(): RestTimer | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as RestTimer | null
    return saved && saved.endsAt > Date.now() ? saved : null
  } catch {
    return null
  }
}

function setTimer(next: RestTimer | null) {
  timer = next
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked: the timer still works for this page.
  }
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useRestTimer = (): RestTimer | null => useSyncExternalStore(subscribe, () => timer)

/** The same, outside React: the Android app's notification follows it. */
export const getRestTimer = (): RestTimer | null => timer
export const subscribeRestTimer = subscribe

/** Call from the tap that checks a set: browsers only allow sound after a user gesture. */
export function startRest(totalSec: number, label: string): void {
  unlockAudio()
  setTimer({ endsAt: Date.now() + totalSec * 1000, totalSec, label })
}

export function addRest(deltaSec: number): void {
  if (!timer) return
  setTimer({ ...timer, endsAt: timer.endsAt + deltaSec * 1000, totalSec: Math.max(timer.totalSec + deltaSec, 1) })
}

export const stopRest = (): void => setTimer(null)

let audio: AudioContext | undefined

function unlockAudio() {
  try {
    audio ??= new AudioContext()
    void audio.resume()
  } catch {
    audio = undefined
  }
}

/** Two short beeps and a vibration. */
export function alertRestOver(): void {
  navigator.vibrate?.([200, 100, 200])
  if (!audio) return
  for (const [offset, frequency] of [
    [0, 880],
    [0.3, 1320],
  ]) {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    const start = audio.currentTime + offset
    oscillator.frequency.value = frequency
    oscillator.connect(gain).connect(audio.destination)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2)
    oscillator.start(start)
    oscillator.stop(start + 0.22)
  }
}
