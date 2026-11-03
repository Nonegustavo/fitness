interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Shape Detection API: Chrome on Android has it; TypeScript's DOM types don't yet.
interface DetectedBarcode {
  rawValue: string
  format: string
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] })
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
