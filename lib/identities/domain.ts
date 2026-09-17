import { normalizeImportedPlayerName } from "@/lib/imports/persist";

export type IdentityEvidence = {
  normalizedName: string;
  sourceFideId: string | null;
};

export function normalizeAliasKey(value: string) {
  return normalizeImportedPlayerName(value);
}

export function normalizeSourceFideId(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

export function hasDirectFideConflict(
  sourceFideId: string | null | undefined,
  targetFideId: string | null | undefined,
) {
  const source = normalizeSourceFideId(sourceFideId);
  const target = normalizeSourceFideId(targetFideId);
  return Boolean(source && target && source !== target);
}

export function aliasCanBelongToPlayer(existingPlayerIds: number[], targetPlayerId: number) {
  return existingPlayerIds.length === 0 || existingPlayerIds.every((id) => id === targetPlayerId);
}

export function sameIdentityEvidence(
  left: IdentityEvidence,
  right: IdentityEvidence,
) {
  return (
    left.normalizedName === right.normalizedName &&
    normalizeSourceFideId(left.sourceFideId) === normalizeSourceFideId(right.sourceFideId)
  );
}
