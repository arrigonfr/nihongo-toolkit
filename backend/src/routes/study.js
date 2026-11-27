import { CACHE_STATIC } from "../http.js";
import { studyDeck } from "../study-decks.js";
import { studyDrawing } from "../study-drawing.js";
import { studyGuide } from "../study-guide.js";

export async function handleStudyRoutes({ path, url, db, send }) {
  if (path === "/api/study/guide") {
    await send(200, await studyGuide(db, url), CACHE_STATIC);
    return true;
  }
  if (path === "/api/study/drawing") {
    await send(200, await studyDrawing(db, url), CACHE_STATIC);
    return true;
  }
  const deckRoute = /^\/api\/study\/deck\/(crossroads|train|karuta|particle|counter)$/.exec(path);
  if (deckRoute) {
    await send(200, await studyDeck(db, deckRoute[1]), CACHE_STATIC);
    return true;
  }
  return false;
}
