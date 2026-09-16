export type StoredGameListRow = {
  id: number;
  whitePlayerId: number | null;
  blackPlayerId: number | null;
  whiteName: string;
  blackName: string;
  whiteRating: number | null;
  blackRating: number | null;
  playedOn: string | null;
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  event: string | null;
  eco: string | null;
  opening: string | null;
  sourceLabel: string;
};

export type PlayerGameListItem = {
  id: number;
  date: string | null;
  color: "White" | "Black";
  opponentName: string;
  opponentRating: number | null;
  result: "Win" | "Draw" | "Loss" | "—";
  event: string | null;
  eco: string | null;
  opening: string | null;
  sourceLabel: string;
};

export function perspectiveResult(
  result: StoredGameListRow["result"],
  color: PlayerGameListItem["color"],
): PlayerGameListItem["result"] {
  if (result === "1/2-1/2") {
    return "Draw";
  }

  if (result === "*") {
    return "—";
  }

  if (color === "White") {
    return result === "1-0" ? "Win" : "Loss";
  }

  return result === "0-1" ? "Win" : "Loss";
}

export function mapGameForPlayer(
  playerId: number,
  row: StoredGameListRow,
): PlayerGameListItem {
  const isWhite = row.whitePlayerId === playerId;
  const isBlack = row.blackPlayerId === playerId;

  if (isWhite === isBlack) {
    throw new Error("Game row does not identify exactly one side for the selected player.");
  }

  const color = isWhite ? "White" : "Black";

  return {
    id: row.id,
    date: row.playedOn,
    color,
    opponentName: isWhite ? row.blackName : row.whiteName,
    opponentRating: isWhite ? row.blackRating : row.whiteRating,
    result: perspectiveResult(row.result, color),
    event: row.event,
    eco: row.eco,
    opening: row.opening,
    sourceLabel: row.sourceLabel,
  };
}

export function openingLabel(eco: string | null, opening: string | null) {
  const parts = [eco, opening].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" · ") : "—";
}
