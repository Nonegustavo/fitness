import type { CapacitorConfig } from '@capacitor/cli'

// The Android app wraps the same web build (`npm run build:android`) and adds Health Connect.
const config: CapacitorConfig = {
  appId: 'io.github.nonegustavo.fitness',
  appName: 'Fitness',
  webDir: 'dist',
  plugins: {
    // Habit reminders and the end of the rest timer: the app's line in the status bar, in its teal.
    LocalNotifications: { smallIcon: 'ic_stat_fitness', iconColor: '#0F766E' },
  },
}

export default config
