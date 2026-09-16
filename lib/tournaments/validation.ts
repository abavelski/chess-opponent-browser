export const TOURNAMENT_NAME_MAX_LENGTH = 200;

export type TournamentNameErrorCode = "required" | "too_long";

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
