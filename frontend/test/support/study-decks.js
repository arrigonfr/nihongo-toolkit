import { DatabaseSync } from "node:sqlite";
import { seedStudyDecks } from "../../../backend/scripts/seed-study-decks.js";
import { studyDeck } from "../../../backend/src/study-decks.js";

const db = new DatabaseSync(":memory:");
seedStudyDecks(db);
export const loadDeck = async key => (await studyDeck(db, key)).items;
