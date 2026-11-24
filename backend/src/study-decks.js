export async function studyDeck(db, key) {
  const row = await db.prepare("SELECT items FROM study_decks WHERE deck_key = ?").get(key);
  if (!row) throw new Error("Study deck unavailable.");
  return { items: JSON.parse(row.items) };
}
