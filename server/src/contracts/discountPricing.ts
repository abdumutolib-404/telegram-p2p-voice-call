// Apply the reduction independently to each currency, keeping whole monetary units.
export function discountedPrice(original: number, percent: number): number {
  if (!Number.isSafeInteger(original) || original < 0 || !Number.isFinite(percent) || percent <= 0 || percent > 100) throw new Error('Invalid discount price.');
  return Math.ceil(original * (10000 - Math.round(percent * 100)) / 10000);
}
