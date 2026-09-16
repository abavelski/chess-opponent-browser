export type GameColorFilter = "all" | "white" | "black";
export type GameDateFilter = "all" | "6m" | "1y" | "2y" | "5y";
export type GameRatingFilter = "all" | "1800" | "2000" | "2200";
export type GameResultFilter = "all" | "win" | "draw" | "loss";
export type GameSort = "newest" | "oldest" | "strongest";

export type GameFilterState = {
  color: GameColorFilter;
  date: GameDateFilter;
  rating: GameRatingFilter;
  result: GameResultFilter;
  source: string;
  sort: GameSort;
};

export type GameFilterQuery = Record<string, string | string[] | undefined>;

export type GameFilterPlan = {
  color: GameColorFilter;
  minPlayedOn: string | null;
  minOpponentRating: number | null;
  whiteResult: "1-0" | "0-1" | "1/2-1/2" | null;
  blackResult: "1-0" | "0-1" | "1/2-1/2" | null;
  sourceKey: string | null;
  sort: GameSort;
};

export const defaultGameFilters: GameFilterState = {
  color: "all",
  date: "all",
  rating: "all",
  result: "all",
  source: "all",
  sort: "newest",
};

const colorValues = new Set<GameColorFilter>(["all", "white", "black"]);
const dateValues = new Set<GameDateFilter>(["all", "6m", "1y", "2y", "5y"]);
const ratingValues = new Set<GameRatingFilter>(["all", "1800", "2000", "2200"]);
const resultValues = new Set<GameResultFilter>(["all", "win", "draw", "loss"]);
const sortValues = new Set<GameSort>(["newest", "oldest", "strongest"]);

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function enumValue<T extends string>(
  value: string | string[] | undefined,
  allowed: Set<T>,
  fallback: T,
) {
  const candidate = firstValue(value);
  return candidate && allowed.has(candidate as T) ? (candidate as T) : fallback;
}

export function parseGameFilters(
  query: GameFilterQuery,
  availableSourceKeys: readonly string[],
): GameFilterState {
  const sourceCandidate = firstValue(query.source);

  return {
    color: enumValue(query.color, colorValues, defaultGameFilters.color),
    date: enumValue(query.date, dateValues, defaultGameFilters.date),
    rating: enumValue(query.rating, ratingValues, defaultGameFilters.rating),
    result: enumValue(query.result, resultValues, defaultGameFilters.result),
    source:
      sourceCandidate && availableSourceKeys.includes(sourceCandidate)
        ? sourceCandidate
        : defaultGameFilters.source,
    sort: enumValue(query.sort, sortValues, defaultGameFilters.sort),
  };
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function subtractUtcMonthsClamped(now: Date, months: number) {
  const sourceYear = now.getUTCFullYear();
  const sourceMonth = now.getUTCMonth();
  const sourceDay = now.getUTCDate();
  const targetIndex = sourceYear * 12 + sourceMonth - months;
  const targetYear = Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const targetDay = Math.min(sourceDay, daysInUtcMonth(targetYear, targetMonth));

  return new Date(Date.UTC(targetYear, targetMonth, targetDay));
}

function subtractUtcYearsClamped(now: Date, years: number) {
  const targetYear = now.getUTCFullYear() - years;
  const targetMonth = now.getUTCMonth();
  const targetDay = Math.min(now.getUTCDate(), daysInUtcMonth(targetYear, targetMonth));

  return new Date(Date.UTC(targetYear, targetMonth, targetDay));
}

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function dateCutoffForFilter(filter: GameDateFilter, now: Date) {
  if (filter === "all") return null;
  if (filter === "6m") return formatUtcDate(subtractUtcMonthsClamped(now, 6));
  if (filter === "1y") return formatUtcDate(subtractUtcYearsClamped(now, 1));
  if (filter === "2y") return formatUtcDate(subtractUtcYearsClamped(now, 2));
  return formatUtcDate(subtractUtcYearsClamped(now, 5));
}

export function resultCodesForFilter(filter: GameResultFilter) {
  if (filter === "all") return { white: null, black: null } as const;
  if (filter === "draw") {
    return { white: "1/2-1/2", black: "1/2-1/2" } as const;
  }
  if (filter === "win") {
    return { white: "1-0", black: "0-1" } as const;
  }
  return { white: "0-1", black: "1-0" } as const;
}

export function buildGameFilterPlan(state: GameFilterState, now = new Date()): GameFilterPlan {
  const resultCodes = resultCodesForFilter(state.result);

  return {
    color: state.color,
    minPlayedOn: dateCutoffForFilter(state.date, now),
    minOpponentRating: state.rating === "all" ? null : Number(state.rating),
    whiteResult: resultCodes.white,
    blackResult: resultCodes.black,
    sourceKey: state.source === "all" ? null : state.source,
    sort: state.sort,
  };
}

export function hasActiveGameFilters(state: GameFilterState) {
  return (
    state.color !== defaultGameFilters.color ||
    state.date !== defaultGameFilters.date ||
    state.rating !== defaultGameFilters.rating ||
    state.result !== defaultGameFilters.result ||
    state.source !== defaultGameFilters.source ||
    state.sort !== defaultGameFilters.sort
  );
}
