// Small statistics toolkit for one person's daily data: tens to hundreds of points.

export const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length

/** Sample variance (n − 1). */
export function variance(values: number[]): number {
  const m = mean(values)
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1)
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** ln Γ(z), Lanczos approximation (g = 7). */
function logGamma(z: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
  z -= 1
  let x = c[0]
  for (let i = 1; i < 9; i++) x += c[i] / (z + i)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

/** Continued fraction for the incomplete beta (Numerical Recipes' betacf, modified Lentz). */
function betaFraction(x: number, a: number, b: number): number {
  const tiny = 1e-30
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const step = d * c
    h *= step
    if (Math.abs(step - 1) < 1e-12) break
  }
  return h
}

/** Regularized incomplete beta function I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - (logGamma(a) + logGamma(b) - logGamma(a + b)))
  return x < (a + 1) / (a + b + 2)
    ? (front * betaFraction(x, a, b)) / a
    : 1 - (front * betaFraction(1 - x, b, a)) / b
}

/** Two-sided p-value of Student's t with `df` degrees of freedom. */
export function tTestP(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0
  return incompleteBeta(df / (df + t * t), df / 2, 0.5)
}

export interface GroupComparison {
  /** Mean of `a` minus mean of `b`. */
  diff: number
  p: number
  /** Cohen's d: the difference in pooled standard deviations. */
  d: number
}

/** Welch's t-test: do two groups of days differ more than chance would? */
export function welch(a: number[], b: number[]): GroupComparison {
  const ma = mean(a)
  const mb = mean(b)
  const va = variance(a)
  const vb = variance(b)
  const se2 = va / a.length + vb / b.length
  const pooled = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2))
  // Both groups constant: nothing to tell chance apart from a real difference. "Constant" up to the
  // rounding of the means (70 times 1,6 averages to a hair off 1,6), which would otherwise read as huge.
  if (se2 <= 1e-12 * Math.max(1, ma * ma, mb * mb)) return { diff: ma - mb, p: 1, d: 0 }
  const t = (ma - mb) / Math.sqrt(se2)
  const df = se2 ** 2 / ((va / a.length) ** 2 / (a.length - 1) + (vb / b.length) ** 2 / (b.length - 1))
  return { diff: ma - mb, p: tTestP(t, df), d: pooled > 0 ? (ma - mb) / pooled : 0 }
}

export function pearson(x: number[], y: number[]): number {
  const mx = mean(x)
  const my = mean(y)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
    syy += (y[i] - my) ** 2
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy)
}

/** Ranks from 1, ties sharing their average rank. */
export function ranks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  const result = new Array<number>(values.length)
  for (let i = 0; i < order.length; ) {
    let j = i
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j++
    const rank = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) result[order[k].index] = rank
    i = j + 1
  }
  return result
}

/** Spearman's rank correlation, which a few extreme days can't drive on their own. */
export function spearman(x: number[], y: number[]): { rho: number; p: number } {
  const rho = pearson(ranks(x), ranks(y))
  const n = x.length
  if (Math.abs(rho) >= 1) return { rho, p: 0 }
  return { rho, p: tTestP(rho * Math.sqrt((n - 2) / (1 - rho * rho)), n - 2) }
}

/** Least-squares line, for drawing the trend in a scatter plot. */
export function linearFit(x: number[], y: number[]): { slope: number; intercept: number } {
  const mx = mean(x)
  const my = mean(y)
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
  }
  const slope = sxx === 0 ? 0 : sxy / sxx
  return { slope, intercept: my - slope * mx }
}

/**
 * Benjamini–Hochberg q-values. Testing dozens of pairs at once, some look related by chance;
 * keeping q ≤ 0.1 means about one in ten highlights could still be a fluke.
 */
export function benjaminiHochberg(pValues: number[]): number[] {
  const n = pValues.length
  const order = pValues.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p)
  const q = new Array<number>(n)
  let running = 1
  for (let rank = n; rank >= 1; rank--) {
    const { p, index } = order[rank - 1]
    running = Math.min(running, (p * n) / rank)
    q[index] = running
  }
  return q
}
