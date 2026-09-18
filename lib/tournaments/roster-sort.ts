export const ROSTER_SORT_KEYS = ["name", "club", "group", "dsu", "fide", "games"] as const;

export type RosterSortKey = (typeof ROSTER_SORT_KEYS)[number];
export type RosterSortOrder = "asc" | "desc";

export function parseRosterSort(sort: unknown, order: unknown): {
  sort: RosterSortKey;
  order: RosterSortOrder;
} {
  const parsedSort =
    typeof sort === "string" && ROSTER_SORT_KEYS.includes(sort as RosterSortKey)
      ? (sort as RosterSortKey)
      : "dsu";
  const parsedOrder = order === "asc" || order === "desc" ? order : "desc";
  return { sort: parsedSort, order: parsedOrder };
}

export function nextRosterSortOrder(
  target: RosterSortKey,
  currentSort: RosterSortKey,
  currentOrder: RosterSortOrder,
): RosterSortOrder {
  if (target === currentSort) return currentOrder === "asc" ? "desc" : "asc";
  return target === "name" || target === "club" || target === "group" ? "asc" : "desc";
}
