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

/** Parses user input that may use a comma as the decimal separator ("82,5"). */
export function parseDecimal(input: string): number | undefined {
  const text = input.trim().replace(',', '.')
  if (text === '') return undefined
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}
