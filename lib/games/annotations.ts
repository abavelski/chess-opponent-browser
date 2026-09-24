export function gameTimeControl(originalPgn: string) {
  const match = originalPgn.match(/^\[TimeControl\s+"([^"\r\n]+)"\]\s*$/im);
  const value = match?.[1].trim();
  return value && value !== "-" && value !== "?" ? value : null;
}

export function isUrlPlace(site: string) {
  return /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b)/i.test(site);
}

export function moveAnnotations(comment: string | null) {
  const clock = comment?.match(/\[%clk\s+([^\]\s]+)\s*\]/i)?.[1] ?? null;
  const evaluation = comment?.match(/\[%eval\s+([+-]?\d+(?:\.\d+)?|#-?\d+)(?:\s*,\s*\d+)?\s*\]/i)?.[1] ?? null;
  return {
    clock,
    evaluation: evaluation && /^\d/.test(evaluation) ? `+${evaluation}` : evaluation,
  };
}
