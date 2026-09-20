const namedEntities = new Map([
  ["amp", "&"],
  ["quot", '"'],
  ["apos", "'"],
  ["lt", "<"],
  ["gt", ">"],
  ["nbsp", " "],
  ["aelig", "æ"],
  ["oslash", "ø"],
  ["aring", "å"],
  ["AElig", "Æ"],
  ["Oslash", "Ø"],
  ["Aring", "Å"],
]);

export function decodeHtml(value) {
  return String(value ?? "").replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return namedEntities.get(entity) ?? match;
  });
}

export function htmlText(value) {
  return decodeHtml(String(value ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

export function ratingFromText(value) {
  const text = htmlText(value);
  if (/not rated|ikke ratet|urated/i.test(text)) return null;
  const digits = text.replace(/[^\d]/g, "");
  const rating = digits ? Number(digits) : null;
  return rating && rating >= 1 && rating <= 4000 ? rating : null;
}
