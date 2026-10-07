export const fmt = (n: number, digits = 2) =>
  Math.abs(n) < 1e-9 ? '0' : n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const fmtSigned = (n: number, digits = 2) => (n > 1e-9 ? '+' : '') + fmt(n, digits);

/** Sign class for a balance value, with a small dead band for float noise. */
export const signClass = (n: number, eps = 1e-4) => (n < -eps ? 'neg' : n > eps ? 'pos' : 'zero');
