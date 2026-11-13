interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** The commit this build came from (short sha), or 'dev' without git. Set in vite.config.ts. */
declare const __BUILD__: string
/** That commit's time, in seconds since 1970 (0 when unknown): newer versions have a larger one. */
declare const __BUILD_TIME__: number

// Shape Detection API: Chrome on Android has it; TypeScript's DOM types don't yet.
interface DetectedBarcode {
  rawValue: string
  format: string
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] })
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
