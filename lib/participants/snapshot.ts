export type ParticipantSnapshotPlayer = {
  name: string;
  dsuId: string | null;
  fideId: string | null;
  club: string | null;
  group: string | null;
  tournamentDsuRating: number | null;
  tournamentFideRating: number | null;
  actualDsuRating: number | null;
  actualFideRating: number | null;
  registeredAt: string | null;
  dsuProfileUrl: string | null;
  fideProfileUrl: string | null;
};

export type ParticipantSnapshot = {
  tournamentNickname: string | null;
  participantGroup: string | null;
  sourceUrl: string | null;
  extractedAt: string | null;
  ratingsUpdatedAt: string | null;
  players: ParticipantSnapshotPlayer[];
};

function optionalText(value: unknown, maxLength: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("Expected text value.");
  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) throw new Error(`Text exceeds ${maxLength} characters.`);
  return text;
}

function participantName(value: unknown) {
  const name = optionalText(value, 200)?.replace(/^\d+\.\s*/, "") ?? null;
  return name || null;
}

function rating(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 4000) {
    throw new Error("Ratings must be whole numbers from 1 to 4000.");
  }
  return Number(value);
}

function timestamp(value: unknown) {
  const text = optionalText(value, 64);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf())) throw new Error("Invalid snapshot timestamp.");
  return parsed.toISOString();
}

function profileUrl(value: unknown) {
  const text = optionalText(value, 1000);
  if (!text) return null;
  const parsed = new URL(text);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Profile URLs must use HTTP or HTTPS.");
  }
  return text;
}

export function parseParticipantSnapshot(value: unknown): ParticipantSnapshot {
  if (!value || typeof value !== "object") throw new Error("Snapshot must be an object.");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.players)) throw new Error("Snapshot players must be an array.");
  if (input.players.length > 1000) throw new Error("Snapshot has too many players.");

  const players = input.players.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`Player ${index + 1} is invalid.`);
    const player = raw as Record<string, unknown>;
    const name = participantName(player.name);
    if (!name) throw new Error(`Player ${index + 1} has no name.`);

    return {
      name,
      dsuId: optionalText(player.dsuId, 32),
      fideId: optionalText(player.fideId, 32),
      club: optionalText(player.club, 200),
      group: optionalText(player.group, 120),
      tournamentDsuRating: rating(player.tournamentDsuRating),
      tournamentFideRating: rating(player.tournamentFideRating),
      actualDsuRating: rating(player.actualDsuRating),
      actualFideRating: rating(player.actualFideRating),
      registeredAt: optionalText(player.registeredAt, 120),
      dsuProfileUrl: profileUrl(player.dsuProfileUrl),
      fideProfileUrl: profileUrl(player.fideProfileUrl),
    };
  });

  const seenDsu = new Set<string>();
  const seenFide = new Set<string>();
  for (const player of players) {
    if (player.dsuId && seenDsu.has(player.dsuId)) throw new Error(`Duplicate DSU ID ${player.dsuId}.`);
    if (player.fideId && seenFide.has(player.fideId)) throw new Error(`Duplicate FIDE ID ${player.fideId}.`);
    if (player.dsuId) seenDsu.add(player.dsuId);
    if (player.fideId) seenFide.add(player.fideId);
  }

  return {
    tournamentNickname: optionalText(input.tournamentNickname, 80),
    participantGroup: optionalText(input.participantGroup, 120),
    sourceUrl: profileUrl(input.sourceUrl),
    extractedAt: timestamp(input.extractedAt),
    ratingsUpdatedAt: timestamp(input.ratingsUpdatedAt),
    players,
  };
}
