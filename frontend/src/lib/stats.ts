/** Small, exact statistics for small samples: the séance has 8 personas per concept. */

/** 95% Wilson score interval for k successes out of n, as counts (rounded) and shares. */
export function wilson(k: number, n: number, z = 1.96) {
  if (n <= 0) return { lo: 0, hi: 0, loN: 0, hiN: 0 }
  const p = k / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  const lo = Math.max(0, (c - m) / d)
  const hi = Math.min(1, (c + m) / d)
  return { lo, hi, loN: Math.round(lo * n), hiN: Math.round(hi * n) }
}

function logFact(n: number) {
  let s = 0
  for (let i = 2; i <= n; i++) s += Math.log(i)
  return s
}

/**
 * One-sided Fisher exact test: is "a of n1" really more than "c of n2"?
 * Returns the probability of a split at least this lopsided by chance.
 */
export function fisherGreater(a: number, n1: number, c: number, n2: number) {
  const k = a + c
  const n = n1 + n2
  const hyper = (x: number) =>
    Math.exp(logFact(k) + logFact(n - k) + logFact(n1) + logFact(n2) - logFact(x) - logFact(k - x) - logFact(n1 - x) - logFact(n2 - k + x) - logFact(n))
  let p = 0
  for (let x = a; x <= Math.min(k, n1); x++) if (k - x <= n2) p += hyper(x)
  return Math.min(1, p)
}

/** A p-value said plainly. */
export function pText(p: number) {
  if (p < 0.001) return 'p < 0.001'
  if (p < 0.01) return `p = ${p.toFixed(3)}`
  return `p = ${p.toFixed(2)}`
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, error under 1.5e-7). */
function phi(z: number) {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2)
  const y = 1 - ((((1.061405429 * t - 1.453152012) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

/** Two-sided two-proportion z test: is "a of n1" different from "b of n2"? For A/B readouts with real traffic. */
export function twoProportion(a: number, n1: number, b: number, n2: number) {
  if (n1 <= 0 || n2 <= 0) return { p: 1, lift: 0 }
  const p1 = a / n1
  const p2 = b / n2
  const pool = (a + b) / (n1 + n2)
  const se = Math.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2))
  const z = se > 0 ? (p1 - p2) / se : 0
  return { p: Math.min(1, 2 * (1 - phi(Math.abs(z)))), lift: p2 > 0 ? p1 / p2 - 1 : 0 }
}
