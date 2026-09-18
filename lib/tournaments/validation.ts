export const TOURNAMENT_NAME_MAX_LENGTH = 200;
export const TOURNAMENT_NICKNAME_MAX_LENGTH = 80;
export const TOURNAMENT_GROUP_MAX_LENGTH = 120;
export const TOURNAMENT_URL_MAX_LENGTH = 1000;

export type TournamentNameErrorCode = "required" | "too_long";
export type TournamentDetailsErrorCode =
  | TournamentNameErrorCode
  | "nickname_required"
  | "nickname_too_long"
  | "nickname_format"
  | "url_required"
  | "url_too_long"
  | "url_invalid"
  | "group_too_long";

export type TournamentNameValidationResult =
  | { success: true; name: string }
  | { success: false; error: TournamentNameErrorCode };

export function validateTournamentName(
  input: unknown,
): TournamentNameValidationResult {
  if (typeof input !== "string") {
    return { success: false, error: "required" };
  }

  const name = input.trim();

  if (!name) {
    return { success: false, error: "required" };
  }

  if (name.length > TOURNAMENT_NAME_MAX_LENGTH) {
    return { success: false, error: "too_long" };
  }

  return { success: true, name };
}

export type TournamentDetailsValidationResult =
  | {
      success: true;
      details: {
        name: string;
        nickname: string;
        sourceUrl: string;
        participantGroup: string | null;
      };
    }
  | { success: false; error: TournamentDetailsErrorCode };

export function validateTournamentDetails(input: {
  name: unknown;
  nickname: unknown;
  sourceUrl: unknown;
  participantGroup: unknown;
}): TournamentDetailsValidationResult {
  const name = validateTournamentName(input.name);
  if (!name.success) return name;

  if (typeof input.nickname !== "string" || !input.nickname.trim()) {
    return { success: false, error: "nickname_required" };
  }
  const nickname = input.nickname.trim().toLowerCase();
  if (nickname.length > TOURNAMENT_NICKNAME_MAX_LENGTH) {
    return { success: false, error: "nickname_too_long" };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nickname)) {
    return { success: false, error: "nickname_format" };
  }

  if (typeof input.sourceUrl !== "string" || !input.sourceUrl.trim()) {
    return { success: false, error: "url_required" };
  }
  const sourceUrl = input.sourceUrl.trim();
  if (sourceUrl.length > TOURNAMENT_URL_MAX_LENGTH) {
    return { success: false, error: "url_too_long" };
  }
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { success: false, error: "url_invalid" };
    }
  } catch {
    return { success: false, error: "url_invalid" };
  }

  const participantGroup =
    typeof input.participantGroup === "string" && input.participantGroup.trim()
      ? input.participantGroup.trim()
      : null;
  if (participantGroup && participantGroup.length > TOURNAMENT_GROUP_MAX_LENGTH) {
    return { success: false, error: "group_too_long" };
  }

  return {
    success: true,
    details: { name: name.name, nickname, sourceUrl, participantGroup },
  };
}

export function parseTournamentId(input: unknown) {
  if (typeof input !== "string" || !/^[1-9]\d*$/.test(input)) {
    return null;
  }

  const id = Number(input);
  return Number.isSafeInteger(id) ? id : null;
}
