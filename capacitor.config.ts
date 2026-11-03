import type { CapacitorConfig } from '@capacitor/cli'

// The Android app wraps the same web build (`npm run build:android`) and adds Health Connect.
const config: CapacitorConfig = {
  appId: 'io.github.nonegustavo.fitness',
  appName: 'Fitness',
  webDir: 'dist',
}

export default config
