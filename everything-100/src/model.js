export const CATEGORIES = ["Places", "Food & Drink", "Travel", "Education", "Companies", "Products", "Entertainment", "Sports", "Technology", "Other"];

export function parseScore(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 100 ? number : null;
}

export function average(item) {
  return item.ratings.length ? item.ratings.reduce((sum, rating) => sum + rating.score, 0) / item.ratings.length : null;
}

export function compareItems(a, b, mode = "rank") {
  if (mode === "newest") return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.name.localeCompare(b.name);
  if (mode === "name") return a.name.localeCompare(b.name);
  if (mode === "votes" && a.ratings.length !== b.ratings.length) return b.ratings.length - a.ratings.length;
  const aScore = average(a);
  const bScore = average(b);
  if (aScore === null && bScore !== null) return 1;
  if (aScore !== null && bScore === null) return -1;
  return (bScore ?? 0) - (aScore ?? 0) || b.ratings.length - a.ratings.length || a.name.localeCompare(b.name);
}

const isText = (value, max, required = false) => typeof value === "string" && value.length <= max && (!required || value.trim().length > 0);
const normalize = (value) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function itemIdentity(item) {
  return [item.name, item.category, item.scope, item.countryCode, item.region].map(normalize).join("\u001f");
}

// Return valid records for recovery, but never treat a partially damaged file as safe to overwrite.
export function validateItems(value) {
  if (!Array.isArray(value)) return { items: [], errors: ["Items must be a list."] };
  const items = [];
  const errors = [];
  const ids = new Set();
  for (const [index, source] of value.entries()) {
    const valid = source && typeof source === "object" &&
      isText(source.id, 200, true) && !ids.has(source.id) &&
      isText(source.name, 100, true) && isText(source.description, 1000) &&
      CATEGORIES.includes(source.category) && ["global", "country", "region"].includes(source.scope) &&
      isText(source.countryCode, 2) && isText(source.region, 100) &&
      (source.scope === "global" ? source.countryCode === "" && source.region === "" : /^[A-Z]{2}$/.test(source.countryCode)) &&
      (source.scope === "region" ? source.region.trim().length > 0 : source.region === "") &&
      isText(source.createdAt, 100, true) && Number.isFinite(Date.parse(source.createdAt)) &&
      Array.isArray(source.ratings);
    if (!valid) {
      errors.push(`Item ${index + 1} has invalid fields or a duplicate ID.`);
      continue;
    }
    const raterIds = new Set();
    if (!source.ratings.every((rating) => {
      const validRating = rating && isText(rating.raterId, 200, true) && !raterIds.has(rating.raterId) && typeof rating.score === "number" && parseScore(rating.score) !== null;
      if (validRating) raterIds.add(rating.raterId);
      return validRating;
    })) {
      errors.push(`Item ${index + 1} has invalid or repeated ratings.`);
      continue;
    }
    ids.add(source.id);
    items.push({
      id: source.id, name: source.name, description: source.description,
      category: source.category, scope: source.scope, countryCode: source.countryCode,
      region: source.region, createdAt: source.createdAt,
      ratings: source.ratings.map(({ raterId, score }) => ({ raterId, score })),
    });
  }
  return { items, errors };
}

export function parseBackup(value) {
  if (!value || value.version !== 1 || !isText(value.browserId, 200, true)) throw new Error("Choose an Everything 100 version 1 backup.");
  const checked = validateItems(value.items);
  if (checked.errors.length) throw new Error(`This backup has invalid data. ${checked.errors[0]}`);
  return { version: 1, browserId: value.browserId, items: checked.items };
}

// Keep current names, descriptions and scores when the backup disagrees. Import is additive.
export function mergeBackup(existingItems, backup, browserId) {
  const items = structuredClone(existingItems);
  let addedItems = 0;
  let addedRatings = 0;
  let conflicts = 0;
  for (const source of backup.items) {
    const incoming = structuredClone(source);
    incoming.ratings = incoming.ratings.map((rating) => ({ ...rating, raterId: rating.raterId === backup.browserId ? browserId : rating.raterId }));
    // A backup can contain both this browser's old and current IDs. Keep its own score first.
    const ownScore = source.ratings.find((rating) => rating.raterId === backup.browserId);
    if (ownScore) incoming.ratings = incoming.ratings.filter((rating) => rating.raterId !== browserId).concat({ raterId: browserId, score: ownScore.score });
    let current = items.find((item) => item.id === incoming.id);
    if (current && itemIdentity(current) !== itemIdentity(incoming)) {
      conflicts += 1;
      continue;
    }
    current ??= items.find((item) => itemIdentity(item) === itemIdentity(incoming));
    if (!current) {
      items.push(incoming);
      addedItems += 1;
      addedRatings += incoming.ratings.length;
      continue;
    }
    if (current.description !== incoming.description) conflicts += 1;
    for (const rating of incoming.ratings) {
      const saved = current.ratings.find((candidate) => candidate.raterId === rating.raterId);
      if (!saved) {
        current.ratings.push(rating);
        addedRatings += 1;
      } else if (saved.score !== rating.score) conflicts += 1;
    }
  }
  return { items, addedItems, addedRatings, conflicts };
}
