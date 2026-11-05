import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

const native = () => Capacitor.isNativePlatform()

/** A light tap under the finger for a small action done (a habit checked, a glass of water, a set). */
export function tapFeedback(): void {
  if (native()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined)
}

/** A firmer tap when something starts (a workout). */
export function startFeedback(): void {
  if (native()) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined)
}

/** The "done!" pattern for a goal met or a record. */
export function successFeedback(): void {
  if (native()) void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined)
  else navigator.vibrate?.([30, 40, 30])
}
