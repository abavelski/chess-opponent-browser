export const PLAYER_NAME_MAX_LENGTH = 200;
export const FIDE_ID_MAX_LENGTH = 32;

export type OpponentFormValues = {
  name: string;
  fideId: string;
  federation: string;
  rating: string;
};

export type ValidOpponentInput = {
  name: string;
  fideId: string | null;
  federation: string | null;
  rating: number | null;
};

export type OpponentFieldErrors = Partial<Record<keyof OpponentFormValues, string>>;

type ValidationResult =
  | { ok: true; data: ValidOpponentInput }
  | { ok: false; errors: OpponentFieldErrors };

export function validateOpponentInput(values: OpponentFormValues): ValidationResult {
  const name = values.name.trim();
  const fideId = values.fideId.trim();
  const federation = values.federation.trim().toUpperCase();
  const rating = values.rating.trim();
  const errors: OpponentFieldErrors = {};

  if (!name) {
    errors.name = "Player name is required.";
  } else if (name.length > PLAYER_NAME_MAX_LENGTH) {
    errors.name = `Player name must be ${PLAYER_NAME_MAX_LENGTH} characters or fewer.`;
  }

  if (fideId) {
    if (fideId.length > FIDE_ID_MAX_LENGTH || !/^\d+$/.test(fideId)) {
      errors.fideId = "FIDE ID must contain digits only.";
    }
  }

  if (federation && !/^[A-Z]{3}$/.test(federation)) {
    errors.federation = "Federation must be a three-letter code, for example POL.";
  }

  let parsedRating: number | null = null;
  if (rating) {
    if (!/^\d+$/.test(rating)) {
      errors.rating = "Rating must be a whole number between 1 and 4000.";
    } else {
      parsedRating = Number(rating);
      if (!Number.isSafeInteger(parsedRating) || parsedRating < 1 || parsedRating > 4000) {
        errors.rating = "Rating must be a whole number between 1 and 4000.";
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      name,
      fideId: fideId || null,
      federation: federation || null,
      rating: parsedRating,
    },
  };
}

export function normalizeRosterSearch(value: string | undefined) {
  return value?.trim() ?? "";
}
