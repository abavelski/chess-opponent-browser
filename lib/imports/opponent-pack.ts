import type { PgnPreview } from "./pgn";

export type OpponentPackCandidate = {
  normalizedName: string;
  name: string;
  fideId: string | null;
  gameCount: number;
};

export type OpponentPackAnalysis = {
  candidates: OpponentPackCandidate[];
  suggestedNormalizedName: string | null;
};

export function normalizePackPlayerName(name: string) {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .toLowerCase();
}

export function analyzeOpponentPack(preview: PgnPreview): OpponentPackAnalysis {
  const entries = new Map<
    string,
    { name: string; gameIndexes: Set<number>; fideIds: Set<string> }
  >();

  for (const game of preview.games) {
    for (const side of [
      { name: game.white, fideId: game.whiteFideId },
      { name: game.black, fideId: game.blackFideId },
    ]) {
      const normalizedName = normalizePackPlayerName(side.name);
      if (!normalizedName) continue;

      const current = entries.get(normalizedName) ?? {
        name: side.name.trim(),
        gameIndexes: new Set<number>(),
        fideIds: new Set<string>(),
      };
      current.gameIndexes.add(game.index);
      const fideId = side.fideId?.trim();
      if (fideId) current.fideIds.add(fideId);
      entries.set(normalizedName, current);
    }
  }

  const candidates = [...entries.entries()]
    .map(([normalizedName, entry]) => ({
      normalizedName,
      name: entry.name,
      fideId: entry.fideIds.size === 1 ? [...entry.fideIds][0] : null,
      gameCount: entry.gameIndexes.size,
    }))
    .sort((a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name));

  const everyGame = candidates.filter(
    (candidate) => preview.games.length > 0 && candidate.gameCount === preview.games.length,
  );

  return {
    candidates,
    suggestedNormalizedName:
      everyGame.length === 1 ? everyGame[0].normalizedName : null,
  };
}
