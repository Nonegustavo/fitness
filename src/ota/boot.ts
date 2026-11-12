/**
 * The Android app updating itself: a newer version of the web part, downloaded earlier, takes over
 * when the app starts. Nothing to switch to yet.
 */

/** Whether the page is reloading into a newer version: then this one must not start anything. */
export async function switchBundle(): Promise<boolean> {
  return false
}

/** Called once the app is on screen: a version that got this far is kept. */
export function bundleStarted(): void {}
