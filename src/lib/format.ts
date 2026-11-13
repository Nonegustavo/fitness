const formatters = new Map<string, Intl.NumberFormat>()

function numberFormat(minDigits: number, maxDigits: number): Intl.NumberFormat {
  const key = `${minDigits}:${maxDigits}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
    })
    formatters.set(key, formatter)
  }
  return formatter
}

/** 82.5 -> "82,5", dropping trailing zeros. */
export const formatNumber = (value: number, maxDigits = 1): string =>
  numberFormat(0, maxDigits).format(value)

/** 82 -> "82,0", always with `digits` decimals. */
export const formatFixed = (value: number, digits = 1): string =>
  numberFormat(digits, digits).format(value)

/** -0.4 -> "−0,4", 0.4 -> "+0,4". */
export function formatSigned(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits))
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  return `${sign}${formatFixed(Math.abs(rounded), digits)}`
}

export const formatMl = (ml: number): string =>
  ml >= 1000 ? `${formatNumber(ml / 1000, 2)} L` : `${Math.round(ml)} ml`

/** 90 -> "1:30", 3725 -> "1:02:05". */
export function formatClock(totalSec: number): string {
  const seconds = Math.max(0, Math.round(totalSec))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const ss = String(seconds % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`
}

/**
 * "1:30" -> 90, "45" -> 45 seconds, "1:02:05" -> 3725. A comma, a dot or a space stands for the colon
 * ("1,30", "1.30", "1 30"), as Android's numeric keypad has no colon. After a separator, one or two
 * digits below 60, as on a clock.
 */
export function parseClock(input: string): number | undefined {
  const parts = input.trim().split(/\s*[:,.]\s*|\s+/)
  if (parts.length > 3 || !/^\d+$/.test(parts[0])) return undefined
  if (parts.slice(1).some((part) => !/^\d{1,2}$/.test(part) || Number(part) >= 60)) return undefined
  return parts.reduce((total, part) => total * 60 + Number(part), 0)
}

/** 45 minutes -> "45 min", 65 minutes -> "1h05". */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

/** Parses user input that may use a comma as the decimal separator ("82,5"). */
export function parseDecimal(input: string): number | undefined {
  const text = input.trim().replace(',', '.')
  if (text === '') return undefined
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}
