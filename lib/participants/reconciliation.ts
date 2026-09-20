export const DEFAULT_MAX_REMOVAL_PERCENT = 25;

export function calculateRemovalSafety(
  currentCount: number,
  removedCount: number,
  maximumPercent = DEFAULT_MAX_REMOVAL_PERCENT,
) {
  const removalPercent = currentCount === 0
    ? 0
    : Math.round((removedCount / currentCount) * 1000) / 10;

  return {
    currentCount,
    removedCount,
    removalPercent,
    maximumPercent,
    requiresForce: removedCount > 0 && removalPercent > maximumPercent,
  };
}

export function ratingChanged(
  currentDsuRating: number | null,
  currentFideRating: number | null,
  nextDsuRating: number | null,
  nextFideRating: number | null,
) {
  return currentDsuRating !== nextDsuRating || currentFideRating !== nextFideRating;
}
