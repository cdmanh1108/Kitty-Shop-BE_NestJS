export function calculateRentalDurationDays(start: Date, end: Date): number {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error('Invalid rental interval');
  }
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}
