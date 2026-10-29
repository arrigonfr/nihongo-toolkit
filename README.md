# Nihon

NihonTools is a browser-based collection of Japanese learning tools: practice
hiragana, katakana, kanji, vocabulary and conjugation; look up words and sentence
breakdowns; and learn through memory, word-search, crossword and shiritori games.
The project lives at [arrigonfr/nihon-tools](https://github.com/arrigonfr/nihon-tools).

Node.js 24 backend (`backend/`, Vercel) and Vite multi-page frontend
(`frontend/`, Netlify). The existing helper pages, filenames, and local preferences
are preserved. Dictionary data is served from SQLite. Sentence lookups use SQLite
first, with an optional server-side Tatoeba API fallback when no local examples exist
or when you request another random example.

## Getting started

Install **Node.js 24** with npm, then run:

```sh
git clone https://github.com/arrigonfr/nihon-tools.git
cd nihon-tools
npm ci
cp frontend/.env.example frontend/.env.local
npm run db:import
npm run dev
```

The first data import needs internet access and creates a 200+ MiB SQLite
database; downloads are cached for later imports. Open http://localhost:5173
with the backend running at http://localhost:3000. Use the top-center menu to
choose a practice tool, reference tool or game, and the `?` beside its heading
for instructions. Choose settings and start a session where applicable.
Audio requires a Japanese speech voice on your device. Settings and supported
progress are stored in your browser, not in an account or across devices.

Jump to [local development](#local-development), [data sources](#importing-data),
[automatic deployment](#deploy), or [checks](#checks) for technical details.

## Support

[![Buy me a coffee with PayPal](https://img.shields.io/badge/PayPal-Buy%20me%20a%20coffee-FFD140?logo=paypal&logoColor=003087)](https://www.paypal.com/ncp/payment/BGUN4RBRVZKKJ)

The button uses the same PayPal payment destination as the tools:
[Buy me a coffee](https://www.paypal.com/ncp/payment/BGUN4RBRVZKKJ).
GitHub READMEs do not support payment forms, so this is a linked image rather
than an embedded form. Payments are handled by PayPal, not by this application.

## Contributing

Suggestions, bug reports and pull requests are welcome at
[arrigonfr/nihon-tools](https://github.com/arrigonfr/nihon-tools).

### Reporting bugs and suggesting improvements

Search [existing issues](https://github.com/arrigonfr/nihon-tools/issues) first.
If there is no matching report, [open an issue](https://github.com/arrigonfr/nihon-tools/issues/new)
with the tool name, steps to reproduce, expected and actual behavior, browser
and device details, and relevant screenshots or console errors. For Japanese
data problems, include the exact word, reading or sentence and a reliable source
when possible. Remove private text, credentials and other sensitive information.
For suggestions, explain the learning goal and proposed behavior; discuss large
changes in an issue before implementing them.

### Sending a pull request

1. Fork the repository, clone your fork, and create a focused branch such as
   `git switch -c fix/kana-feedback`.
2. Follow [Getting started](#getting-started) to install dependencies and import
   the database. Use `backend/` for the Node API and import scripts, `frontend/`
   for Vite pages and shared UI, and `scripts/` for browser checks.
3. Follow the existing ES-module style and reuse shared controls, appearance,
   navigation and API helpers. Preserve Japanese filenames and browser storage
   keys unless a deliberate migration is included.
4. Add or update relevant tests and documentation. Run `npm test` and
   `npm run build`; for UI changes, install Chromium with
   `npx playwright install chromium` and run the relevant browser checks listed
   under [Checks](#checks). Record any checks you could not run.
5. Keep generated databases, download caches, `node_modules`, build output and
   private environment files out of the commit. Review [DATA-LICENSES.md](DATA-LICENSES.md)
   before changing imported data, and preserve source attribution and licenses.
6. Push your branch to your fork and
   [open a pull request](https://github.com/arrigonfr/nihon-tools/compare) against
   the repository's default branch. Explain the change, link related issues,
   describe verification and include screenshots for visible changes.

## Using the tools

Each tool's intro includes links to report suggestions or bugs and send pull
requests on GitHub, alongside the PayPal support button.

### Discoverable tools and shared navigation

Open the site at `/`. `index.html` is the launcher, but its filename is removed
from the address bar. Each tool also opens directly at its own HTML URL with the
same top-center navigation menu linking to all thirteen tools. Direct visits stay
on that URL after refresh, so tools can be bookmarked, shared and indexed.
The menu uses real HTML links, included by Vite in development and production;
the homepage retains its embedded launcher and hides the duplicate menu inside frames.
Click or tap outside an open menu to close it, including inside an embedded tool.
Clicks within the menu keep it open until you choose a tool; Escape also closes it.
Data-source credits remain independently accessible.
Links between Katsuyō and Katsuyō Renshuu switch the launcher frame without changing
the address bar. Command/Ctrl-click opens the selected tool directly in a new tab.
On standalone pages, links and browser Back/Forward navigate normally.
Legacy `/#helper=...` launcher links and the old `文字.html` entry remain supported.

`frontend/public/robots.txt` permits crawling and points to
`https://nihon-tools.netlify.app/sitemap.xml`. The sitemap includes the homepage,
all thirteen tools and data-source credits, excluding the legacy redirect and API.
Every current page has an absolute canonical URL. If the production domain changes,
update `site` in `frontend/vite.config.js` and both public crawler files.
When adding a tool, update the launcher menu and sitemap together.
`npm run test:tool-fixes` checks direct pages, navigation, canonical URLs and
crawler files in development and the production build.

### Shared appearance and help

Every tool uses the same header, brand sizing, centered button content and study
controls. The palette selector beside the light/dark toggle offers Matcha, Sakura,
Ocean, Wisteria, Amber and Sumi, each with light and dark styles. Sumi combines a
nearly-black dark palette with a paper-like light palette; Sakura has pinker accents.
Preferences are stored
under `nihon:appearance-v1` and synchronized across the tool launcher, embedded
tools and other open tabs on the same origin. Appearance follows the system by
default; the top-bar toggle chooses light or dark mode.

All thirteen tools automatically save valid settings to `localStorage`, including
quiz modes, directions, levels, fonts, session lengths, review/stat toggles,
dictionary Kanji mode, sentence translation, game rules and hint type.
Kana, Imi and Yomi keep independent preferences; Audio, Furigana, Romaji and
appearance remain shared. Atlas has only these shared settings.
JLPT filters use checkboxes with All/Clear actions, accepting disjoint selections
as well as individual levels. APIs accept comma-separated levels (for example
`5,3`), and existing saved single-level and range preferences remain supported.
Run `npm run test:study-improvements` for the cross-tool interaction checks.

Pazuru, Eawase, Kotoba Sagashi, Katsuyo and Katsuyo Renshuu group settings by
purpose. Dependent controls are disabled when unused, with an explanation beside
the control (for example, hint budgets require limited hints and challenge limits
require the corresponding mode). Mode overrides do not replace saved preferences:
switching back makes those preferences available again. Puzzle and practice
settings still apply to the next round; Katsuyo's display and form filters stay live.
Kotoba Sagashi, Eawase, Shiritori and Katsuyō Renshuu offer a Japanese font
selector: system default, Noto Sans JP, Sawarabi Mincho, M PLUS Rounded 1c and
Zen Kurenaido, plus Rotate fonts and a preview. Rotation chooses a font per game
or practice session (per question in Kana, Yomi, Imi and Goi).
Like their other game preferences, fonts are saved independently
and take effect in the next session. Web fonts use the same Google Fonts source
as Kana and Goi, with local fallback fonts when unavailable.
There are no redundant **Save settings** buttons. Games snapshot their settings
when you start a session or puzzle; edits are saved for the next one without
changing questions, rules, timers, display settings or progress mid-session.
Marathon boards keep the session's original rules. Dictionary and reference
settings apply live. The shared top-bar Audio, Furigana, Romaji and appearance
controls always apply live without restarting games.
Restoration updates controls and their dependent display without starting a quiz.
Answers, search drafts and ordinary active rounds are not restored as preferences;
existing history, progress and Daily resume behavior are unchanged.
Invalid or unfinished values do not replace valid preferences. Storage failures
are reported. Preferences survive reloads and new tabs on the same browser/origin,
but do not sync between devices and may disappear if browser storage is cleared
or private browsing ends.

Use the `?` beside each tool heading for its description and instructions. Hover,
keyboard-focus or tap a setting name for contextual help, without extra help icons.
Tooltips use a dark speech bubble and never open from the input itself. Tapping a
title shows help without toggling its checkbox or opening its select. Clicking
elsewhere (including the input), moving off a hovered title, leaving title focus,
scrolling or pressing Escape dismisses the bubble.
The color theme selector and Audio, Furigana and Romaji quick toggles have no tooltips.
At widths up to 850px, browsers supporting `appearance: base-select` render
select menus in the page, anchored beside their controls with scrollable options
and viewport-aware placement. This avoids relying on macOS-native popup placement
in Chrome's mobile emulator. Other browsers retain their native select pickers.
The launcher groups tools into Practice, Reference and Games, progressing from
kana and kanji drills to vocabulary, conjugation and word games. The renamed
tools retain their original file paths and storage keys, so saved settings,
progress and existing launcher links continue to work.
Sentence panels share translations, available furigana, audio and source credits.
**Another example** requests a randomized local/online example and avoids the
currently displayed sentences when alternatives exist. Missing examples, including
those in the crossword inspector, automatically use the backend fallback. A failed
online refresh preserves available examples and displays a retryable message.
Goi cloze questions randomly select matching sentences and request the fallback
when none are available locally; if unavailable, the existing meaning-clue mode is
explicitly labeled rather than presented as a real example sentence.

Non-daily Shiritori games now sample opening candidates across the common-word
dictionary rather than the same first 60 entries. The last 12 successful starters
are avoided in the current tab (unless a narrow filter exhausts the choices).
Opening words still require a legal continuation; Daily Challenge remains
date-seeded and deterministic.

## Practice tools

Moji has been split into three launcher tools with one shared
quiz engine and stylesheet:

| Tool | Internal page | Practice |
| --- | --- | --- |
| Kana · 仮名 | `仮名.html` | Script-specific or mixed kana/romaji directions |
| Imi · 意味 | `意味.html` | Kanji meanings; kanji/English directions |
| Yomi · 読み | `読み.html` | Kanji readings; romaji, hiragana, katakana, or either kana script |

The index migrates the old stored `文字.html` “last helper” choice to Kana.
The legacy Moji URL returns to the launcher. Each tool has one quiz panel containing its relevant settings.
Practice-set checkboxes are removed. Imi and Yomi retain “Pause to review kanji
details” outside the collapsible settings, above the question, so it remains
accessible during practice. All three tools use a fixed question display size
without a Large display checkbox. Imi and Yomi offer JLPT checkboxes for any
combination of N5–N1 and Non-JLPT, with All/Clear actions.
Kana direction uses pills. Yomi converts typed romaji to the selected kana script
(hiragana for either-kana mode). In Imi's reverse direction, submitting a reading
or romaji offers matching Kanji candidates without meanings or pronunciations;
selecting a candidate submits the actual answer.
Non-JLPT means **unrated**, not necessarily “never tested”. Quiz batches require a
unified ideograph with Japanese readings and a non-radical meaning, excluding
component-only glyphs. Real kanji that also serve as radicals (such as 木 and 一)
remain eligible; radical-index glosses are not used as quiz answers. Changing
level uses a separate batch queue and invalidates any pending previous question.

Kana supports hiragana-only, katakana-only, or mixed questions to romaji, and
romaji questions with hiragana-only, katakana-only, script-tagged mixed, or
untagged either-script answers. The last option accepts both scripts and does not
show a type tag. Same-sound kana within the selected script are accepted.
Standalone small kana and IME shortcuts (`xa`, `xtsu`, etc.) are not quiz terms.
Romaji answers match taught syllables strictly, ignoring only case and surrounding
whitespace; punctuation, extra text, and mixed-script answers are not accepted.
Kana and Goi play the correct pronunciation after an answer or reveal, respecting
the shared Audio toggle, without a separate prompt playback button.
Kana reserves the same glyph height for kana and romaji prompts at each viewport
size. Imi and Yomi playback buttons appear only in review details, not below the glyph.

Practice length, Start, and Stop are in Session Stats for all three tools and Goi.
Kana, Imi, and Yomi wait for Start session in every mode, hide the question until
started, and automatically collapse Quiz settings on start. Their mobile stats use
a compact four-column summary. Kana reserves a 36px feedback slot above the term:
only wrong answers show a brief correction there, without shifting the question.
Explicitly revealing a Kana answer replaces its prompt instead of showing a banner.
Stopping a free, question-count, or timed session shows results without claiming
the target was completed, cancels advancement/timers, and ignores late question
responses. Session controls remain visible when numerical stats are hidden.
The main menu includes all thirteen tools, centered icon separators, and short descriptions.

## Eawase · Japanese Memory

Open **Eawase · 絵合わせ** in the launcher. Flip two cards to
match representations of the same Japanese word or kana. Words supports all
kanji/kana/romaji directions, identical Katakana → Katakana, Hiragana → Hiragana
and Kanji → Kanji pairs, and mixed pairs. Syllabaries includes the two identical
kana modes but hides kanji directions.
Words use the existing JLPT N5–N1 vocabulary endpoint with single-level/range
and category filters. Kana works without dictionary requests, including basic,
voiced, yōon, small kana, and optional long-vowel/special patterns.
The voiced, yōon, and long-vowel/special-pattern tooltips include kana examples.

Choose any of the 4×3 through 8×6 presets or 1–48 custom pairs. Generation
produces exactly the requested count or explains why the selected pool is too
small. Visible clues cannot be shared by different pairs; identical-script modes
deliberately show the same text on both cards of a pair.
Filters are never silently broadened. New boards prioritize fresh items.
Katakana loanwords are not given invented kanji or forced hiragana forms.
Explicit katakana conversion of kanji-word readings is a script exercise,
not an assertion that katakana is the normal spelling.

Classic, Timed, Move, Sudden Death, Daily, Mistake Review, Listening, Meaning,
Reverse, and Marathon modes are included. Move limits count **card flips**;
one move normally contains two flips. Timers include background tabs and open
dialogs. Marathon adds two pairs per board up to 48. Reverse requires a
romaji/English Recall card before its Japanese match. Local two-player games
award one point per unassisted pair: matching keeps the turn; mismatching
passes it after the cards turn back.
**Shuffle remaining cards**, before **Hide matched cards**, offers **Never**,
**After match**, **After mismatch**, and **All** (after both). Only unmatched
cards move; mismatches shuffle after their preview ends. Existing shuffle
preferences migrate to Never (off) or After mismatch (on).

Daily uses eight date-seeded basic hiragana/katakana pairs, solo play, three
hints, and no reveals, time/flip limits, shuffle, or correction previews. It
persists card selection, matches, statistics, and elapsed time across reloads.
Opening it again resumes rather than resets it. Streaks count completed local
calendar days; ordinary restarts reset the same board's statistics.

Card displays include text, furigana, romaji, English supplements, English-only,
audio-only, and exact-word emoji clues. English/audio/picture clues replace one
side and pair with the natural written form, overriding the script direction.
Emoji mode uses a small curated word-to-picture mapping and may require fewer
pairs or wider filters. Kana English clues describe sounds/usage, not invented
word meanings; small kana have no standalone pronunciation and are excluded
from listening cards. Audio uses device Japanese voices and requires the
shared Audio toggle. Every newly flipped audio card plays its clue, including
the second card of a mismatch. Face-up audio cards can be tapped to replay,
including matched cards and hint/correction previews, without adding a flip.
Selecting furigana/romaji display enables the corresponding
shared top control; those controls can still be switched off during play.

Hints briefly show a pair, its meaning, or reading; reveals match a pair.
Each has independent limited/unlimited/disabled availability. Assistance and
correction previews exclude those pairs from unassisted accuracy/player points.
Mismatch explanations, correct-partner previews, post-match details, meanings,
and real dictionary/Tatoeba example sentences are configurable. Matched pairs
remain accessible in Your connections even when hidden on the board.

Puzzle settings appear in an expandable panel directly below the intro, open
initially. Valid settings save automatically for your next board; clicking Save
settings or successfully starting a
board collapses the panel. Reopen it with **Puzzle settings**.
The shared Audio, Furigana, Romaji, palette, and light/dark controls remain in
the top bar, without a duplicate appearance selector in settings. Adjustable Japanese font size,
high contrast, reduced-motion support, tap targets, and arrow/Enter/Space
keyboard controls are included. Large boards scroll within their panel rather
than shrinking the characters.

Settings, daily state/history, completed count, recent pairs, and up to 5,000
missed/assisted/unfinished/saved review items are stored locally under
`nihon:memory-v1`. Mistake Review respects the current content, level, category,
and kana filters. Export/import validates and merges Memory notebook JSON.
Reset requires confirmation and affects only Memory progress, not other tools.
Imported vocabulary is personal study data rather than dictionary verification.

Run `npm run test:memory` for engine invariants and browser interaction coverage.

## Kotoba Sagashi · Japanese word search

Open **Kotoba Sagashi · 言葉探し** in the launcher.
Puzzle settings appear in an expandable panel directly below the intro, open
initially. Rules save automatically for the next game; starting a puzzle successfully
collapses the panel. Reopen it at any time with **Puzzle settings**.
Drag from a word's first character to its last, or tap both endpoints. Keyboard
users can move with the arrow keys, set endpoints with Enter/Space, and cancel
with Escape. Select the same cell twice for a single-kanji word. Large grids
scroll within their panel instead of shrinking Japanese text to unreadable sizes.

Choose kana, kanji (retaining necessary okurigana), or mixed script; any combination
of JLPT levels using checkboxes; category; 8/10/12/15/20-square grids or custom 5–20; and
5/8/10/15/20 targets. Each cell contains one character, including small kana and
the katakana long-vowel mark. Directions are right/down, right/down/up, or all
eight (the default); shared characters allow words to intersect at matching letters
and can be disabled. Word count controls density independently of grid dimensions.
Older saved settings
migrate once to all eight directions without losing progress. Direction choices
saved after this migration are preserved. Generation places **exactly** the
requested number of distinct targets or reports why the filters cannot fit.
Any occurrence of a target in a permitted straight direction is accepted, not
just its original placement. Incidental non-target words do not count.

The game reads the complete matching JLPT study pool through
`GET /api/word-search/vocabulary?level=5-4`, without adding out-of-level dictionary
words. Themes use approximate English-gloss/part-of-speech filters. Non-daily
puzzles shuffle vocabulary and prioritize words outside the last 160 targets.
Narrow filters may require repeats; they are never silently widened.

Classic, Timed, Quick, Daily, Marathon, Sudden Death, Clue, Kana, Kanji, Reverse,
No List, and Mixed Review modes are included. Settings describe their overrides.
Daily fixes the N5 kana rules and seed for the local calendar date, saves the
current puzzle and progress across reloads, and counts completed days only.
Marathon increases grid size, word count, and available directions between rounds;
each round shows its own results. Countdown time includes background tabs and
open dialogs. Ending or abandoning a round offers Cancel, Save & continue, and
Discard & continue for unfinished words; already recorded history is retained.

Clue styles include Japanese, furigana, English meanings, English gloss/POS clues,
Japanese category clues, category icons, first kana, and
hidden-list memory mode. Japanese clues use a limited bank of original,
word-specific teaching clues, so narrow filters may have insufficient coverage.
Japanese category and icon clues remain broad hints, not dictionary definitions.
Explicit furigana-list style always shows the reading;
other Japanese text follows the shared Furigana toggle. Furigana, romaji, audio,
and appearance use the shared top bar, without duplicate controls in puzzle
settings. System appearance preferences from the shared tools are respected. Font size, contrast, and
confirmation animation are configurable, and reduced-motion preferences are
respected.

Found words expose their reading, spelling, meaning, part of speech, device
pronunciation, and dictionary/Tatoeba sentence examples with translations and
credits. Hover, focus, or tap a kanji for meanings, readings, and compounds.
Unavailable network examples or details show an explicit retryable message.
Hints offer first character, direction, length, meaning, or a temporary area
outline. Hints and reveals have separate unlimited/limited/disabled settings.
Reveals are distinguished from manual finds and never earn accuracy credit.

Settings, the last 5,000 found words, up to 5,000 review words, recent targets,
completed count, and daily history are local to this browser under
`nihon:word-search-v1`. Mixed Review draws from found, missed, revealed, and
manually saved words, respecting the current vocabulary filters. Notebook JSON
exports can be validated and merged on import; reset requires confirmation.
Review imports are user-provided study data, not dictionary verification.

Run `npm run test:word-search` for generator invariants, vocabulary endpoint,
and browser interaction coverage.

## Shiryō resources (cheatsheets)

Open **Shiryō · 資料** (`frontend/資料.html`) for three single-page A4 cheatsheets:
Hiragana & Katakana, Verb conjugation and Adjective conjugation. Everything is
generated in the browser (no backend): preview, then download as PNG, PDF (image
based), SVG, standalone HTML, Markdown, plain text or CSV, or use **Print / Save as
PDF** for vector text. Content lives in `src/cheatsheet-data.js`, page layout in
`src/cheatsheet-layout.js`, exporters in `src/cheatsheet-export.js`; unit tests are
in `frontend/test/cheatsheets.test.js`.

## Katsuyō Japanese conjugator

Open **Katsuyō · 活用** in the launcher. Audio, Furigana and Romaji use only
the shared top-bar controls, not duplicate display-setting checkboxes. Romaji input
converts to kana as you type. `/api/conjugator?q=...` resolves modern verb and
adjective classes from the local JMdict data, preserving spelling/reading and
sense restrictions. Ambiguous entries require a selection. Unrecognized words
can be used only after explicitly confirming their dictionary spelling, reading,
and class; definitions and JLPT levels are not invented. Common auxiliaries
`だ`, `です`, `ない`, and `たい` have explanatory reference entries.

The table includes plain/polite basic paradigms, te/ta/nai/tari, progressive and
resulting states, desire, potential/passive/causative/causative-passive paradigms,
conditionals, volitional, commands and requests. Adjectives use their own
i-/na-adjective rules. Exceptions include 行く, 来る, する, ある, くれる, いい,
honorific u-verbs and 問う-style endings. Advanced sections include contracted
causative-passives, formal connectives and supported lexical honorific/humble
alternatives. These are **grammatical references**: naturalness, transitivity,
register and sense can limit use; archaic classes and arbitrary grammar phrases
are not treated as regular modern verbs. Connectives with no independent tense
or politeness remain visible with either filter.

Display settings support kana/kanji/both, shared romaji/furigana/audio,
plain/polite, polarity, tense, form groups, compact mode, examples, kanji details,
Japanese font size, high contrast, and shared light/dark/system appearance.
Usage notes explain the exact ending change for the selected word and form,
including relevant irregularities and the extra steps for inflected voice,
progressive and desire forms, rather than repeating a class-wide rule.
I-adjective conditionals use their own endings; polite `です` is not followed
by `ら`. Exact-form examples use original teaching templates for supported study
words and forms, including separate potential and passive contexts even when the
conjugated spelling is identical. Unsupported combinations show an explicit
unavailable message instead of an unrelated sentence. Base-word dictionary
examples retain their English translations and source credits.
Desire glosses use natural English such as “wanted to eat”; ないで is “without
eating”, while なくて remains a negative connection/reason rather than an interchangeable
“without doing” form.
Word information includes available related terms and expandable kanji readings,
meanings and examples. Copy a single form or the currently filtered table as
tab-separated text.

Settings, 30 recent words, up to 500 saved words and the last 80 random readings
are stored under `nihon:conjugator-v1`. Saved-word exports are versioned JSON;
imports validate before merging without replacing existing words. Random words
sample the common dictionary with optional JLPT and verb/adjective filters,
excluding recent random readings until the available sampled pool is exhausted.
JLPT assignments are spelling/reading-specific study-list estimates.

Run `npm run test:conjugator` for the engine, dictionary and browser checks.

## Katsuyō conjugation practice

Open **Katsuyō Renshuu · 活用練習** in the launcher.
The trainer reuses the conjugator engine with an original, bounded study bank
of 49 verbs, adjectives and auxiliary patterns. Practice generation, grading,
rules and original teaching examples need no dictionary requests. Kanji details
and example compounds use the existing dictionary API; speech uses your
device's Japanese voices.

Choose N5–N1 individually, select several levels for a range, or select All.
Question difficulty combines the estimated word level with the form's suggested
introduction level: N2 honorific practice can use a familiar N5 verb. These are
study estimates, not official JLPT assignments. Multi-select word types and
forms combine with plain/polite, polarity and tense filters. Neutral connectives
remain available under either tense/register filter. Unsupported combinations
show an explicit message rather than silently ignoring the settings.

Modes include Classic (5–100 questions in increments of five), Quick (five), Marathon (zero
means unlimited mistakes), Timed Challenge, Sudden Death, Daily (five), Weak
Form Focus, Mixed Review, Form Comparison, Sentence and Reverse. Irregular
Verbs Focus covers する, 来る, 行く, ある, いい and difficult 帰る. Mixed Review
requires previously practiced questions; Weak Form Focus uses only missed or
explicitly saved unfinished questions. Comparison accepts multiple valid analyses of homographs such as
食べられる. Reverse can ask for the base word, form, polarity, tense or
politeness. Sentence prompts have an original contextual example, translation
and explicit grammatical constraints so the intended answer is not a guess.
Question language selects Japanese, English, or both for prompts and grammatical
traits; general interface and feedback text remain English.
Politeness has its own prominent, labeled line, including unmarked connectives.
“Requested form shown as” offers form names, usage descriptions, sentence blanks,
or **Mixed**, which randomly chooses a presentation for each new question and
keeps it unchanged during hints and retries. The conjugation-form selector
expands to show every option without a nested scrolling area.

Type kana, kanji or romaji and press Enter (or Check answer). Romaji converts
automatically, including pasted answers; native Japanese IME composition does
not submit prematurely. “Both” requires `spelling / reading`; “Either” accepts
either spelling or reading and supported mixed-script spellings. Full-width
Latin letters, katakana, spacing and terminal punctuation are normalized.
Equivalent negative variants are accepted within the requested politeness and
tense: for example, 静かではありません / 静かじゃありません /
静かではないです / 静かじゃないです. This also covers past negatives,
conversational verb negatives such as 食べないです, and polite たい negatives,
alongside applicable command, ている contraction,
and causative-passive alternatives. A specifically requested formal adjective
negative still requires くありません, and colloquial ら抜き potential forms
are not taught.

Checking an incorrect answer reports incorrect/nearly correct **without
revealing the solution** and keeps the answer editable. Focus moves to the
feedback instead of the input; mobile layouts also scroll the feedback into view.
Correct the answer and check again directly, move on, or explicitly Reveal answer to see
the correct spelling, reading, explanation and translated example. Correct
answers show these details immediately. The answer label follows Question language,
and solution readings appear underneath the written form. Empty-answer notices
appear beside the answer input. Reverse uses answer buttons; on desktop, 1–9 select
the first nine options and H/R/C/N operate hints, reveal, check and next outside text inputs.
Finished challenges still stop input at their time or
mistake limit. Hints progress through type, initial
kana, kana-character count, rule and a partially hidden answer. Hint and reveal
availability are independently unlimited, limited per session, or disabled.
Only the first unassisted correct answer earns credit; retries do not inflate
scores, and assisted answers are included in the “Incorrect / assisted” count.
Missed questions are reinserted after an intervening question when space remains
within the chosen session length, and weighted more heavily in future sessions.

Results show accuracy, correct/incorrect-or-assisted counts, time, forms and
words to revisit. Daily streaks use local calendar dates and are saved as soon
as the fifth answer is recorded, at most once per day. Settings and cumulative
per-word/form progress persist in `nihon:conjugation-practice-v1`; reloading ends
an in-progress session but retains recorded answers. Reset affects only this
trainer's progress and requires confirmation. A persistent missed-word log supports
Weak Form Focus. Ending an unanswered question can save it for review without
counting an attempt, or discard that pending addition; Cancel/backdrop returns to practice.
Appearance, furigana, romaji and
audio use only the shared header controls. A panel above both setup and practice
stays first when starting, ending or restarting a session. It holds Japanese font
and size settings for the next session. Base-word readings follow the shared
Furigana toggle rather than a duplicate display setting. JLPT choices disable
conjugation families above the selected proficiency range.
Kanji information is always enabled. Meanings, word types and examples remain
configurable in the practice settings.

Run `npm run test:conjugation-practice` for engine and browser checks.

## Kotoba kanji details

Kanji mode displays all imported on/kun readings and name readings (nanori).
Radical classifications come from the existing `kanjis.radicals` JSON column:
classical numbers are displayed as Kangxi glyphs and numbers; Nelson numbers are
labeled separately, not incorrectly converted using the Kangxi numbering system.
Source-provided radical names are also shown when present.

Compound examples preserve every applicable spelling/reading pair returned by
JMdict, rather than only the first reading. Shared header buttons control Audio,
Furigana (on by default), and Romaji across tools, with preferences saved locally.
Kana practice only shows Audio because revealing romaji would give away answers.
The toolbar is defined once in `frontend/src/study-controls.js` and mounted in each
tool so it works both inside the index iframe and at standalone URLs. Theme icons
are consistent, and controls wrap onto a second header row on narrow screens.
Furigana aligns readings above kanji runs, leaving surrounding kana unannotated.
Contiguous compounds retain a combined reading; ambiguous readings are not split
into invented per-character pronunciations. A separate Meaning toggle controls
compound definitions. Display toggles use loaded data without more requests.

Each compound shows available example sentences with English translations and
attribution, using examples already included in the batched response first.
Missing examples in both word and kanji-compound cards use `/api/sentences`,
which falls back to Tatoeba. Two client workers load missing examples progressively,
deduplicate terms, cache successful results, and ignore cancelled/stale searches.
Only sentences containing an applicable compound spelling are displayed.
Sentences use source-provided furigana annotations for ruby and romaji when available;
readings are not invented for unannotated sentences. Their translations remain visible
when compound meanings are hidden. Empty results and provider failures have
distinct messages. Kotoba no longer offers JSON export.

Audio buttons use the browser's Japanese speech synthesis and respect Audio On/Off.
Playback uses play icons and prefers enhanced/natural Japanese voices when exposed
by the device, at a slightly slower study pace. No paid speech service or API key
is required. Installing an enhanced Japanese system voice can improve quality;
availability and quality still depend on the browser and device. Reading quizzes
and reverse vocabulary prompts do not expose pronunciation before the answer is revealed.
Each kana reading, its optional romaji, and its play button are grouped together.

No hosted AI fallback has been enabled. The reviewed providers do not establish
a reliable free, registration-free production service:
[Pollinations](https://gen.pollinations.ai/docs) uses API keys and account credits;
[Puter](https://docs.puter.com/user-pays-model/) uses authenticated users with a
free allowance followed by paid usage. Puter supports temporary-user onboarding,
but that is not a guaranteed anonymous backend allowance.

## Fumitoki analysis and puzzle controls

Fumitoki's `/api/analyze` uses the bundled Kuromoji/IPADIC morphological dictionary
instead of `Intl.Segmenter` plus guessed suffix lists. It groups noun suffixes and
verb/adjective inflections using part-of-speech information, preserves particles
as separate tokens, and uses dictionary lemmas for lookup while retaining the
surface pronunciation for furigana and romaji. Text is preserved exactly.
It no longer displays a guessed split when analysis fails. Tokenization runs
locally on the server with no API subscription or external text transfer.
The existing optional sentence-translation service is separate and still sends
the sentence to translation providers; `TRANSLATION_API_FALLBACK=false` disables it.
The tokenizer is not infallible, especially with names, new slang, and ambiguous
sentences. Yahoo's morphological API was considered but requires a Client ID;
the bundled dictionary avoids credentials and provider quotas.

Pazuru opens without generating a crossword. Choose settings, then click **New
puzzle** below the settings panel; this button remains visible when settings are
collapsed. Pazuru's Check button sits beside the clue textbox or inside the cell popover,
not in the status bar. Enter saves textbox answers. Textboxes start empty, without
prefilled crossing letters or gap spaces; enter the complete answer normally.
Backspace/Delete edits the typed answer, while solved intersections remain protected
when answers are submitted or grid cells are edited.
In-square input keeps unfinished romaji and Kanji-word readings visible in the
active input and clue card, using normal text selection and deletion rather
than a hidden buffer. Complete readings resolve to the word's written form;
native Japanese IME commits remain supported. Enter submits pending text,
Escape clears it, and moving to another cell or starting a puzzle clears the draft.
Mobile deletion also works when the keyboard sends input events without keydown.
An unfinished word remains typeable from a locked crossing: after solving 渡す,
selecting 渡る accepts the complete word/reading or just its remaining る, without
changing the shared 渡. In-square clue cards sit below the grid so they cannot
cover the remaining cells.
Save/Clear and duplicate Close buttons are removed. Direction buttons appear only
at across/down intersections. Check/reveal availability and hint limits still apply.
Kotoba rejects word searches longer than the API's 100-character limit before
making a request, with guidance to shorten the query or use Fumitoki. Server
validation errors display their actual message rather than a connection error.
Recent searches stay within their panel, with ellipsis and the full query on hover.

Goi has a single Start quiz control. All shortcut labels, including S, Space and Enter / N,
are visible only in desktop multiple-choice mode.
Goi's vocabulary metadata sits below the word's romaji line, and Next question
appears above feedback. Press Enter or N after reviewing an answer to continue.
Shortcuts ignore held keys, text editing, composition and open dialogs.
Multiple-choice distractors use 100-word batches and a rolling 300-word pool,
avoiding the last 120 displayed meanings (up to 30 questions) when possible.
When a pool is exhausted, the least recently shown choices are reused first;
equally fresh choices and answer positions are randomized.
Pazuru's study and timer checkboxes use the single labels **Use Kanji meanings &
readings as clues** and **Show timer**, with larger checkbox targets.
Every crossword is one connected group of intersecting words. The target word
count is approximate: the generator uses fewer words rather than adding detached
groups. If it cannot connect at least two words, it shows an error and keeps any
existing puzzle.
**Kanji** answer mode and **Kanji Challenge** use only written forms containing
kanji, preserving kana endings such as 食べる. Kana-only words and single-character
spellings are excluded rather than replaced with readings. Kana and mixed modes
still allow kana-only words. These settings apply when starting a new puzzle.
Pazuru clue cards label Selected, Solved, and Unanswered states explicitly; a
dashed outline marks the selected clue independently of its solved status.
Run `npm run test:crossword` for connectivity and answer-script regressions,
plus desktop/mobile label, reveal and error-recovery checks using fixture data.

Every tool's intro includes the supplied PayPal support form. Payment submission
opens PayPal in a new tab; the app does not process payment details.
On screens up to 600px wide, support appears as a compact gray-and-yellow
PayPal / Buy me a coffee badge with a 44px touch target. Card logos and the
powered-by line are hidden on mobile; the desktop support layout is unchanged.

The kanji-words endpoint considers all linked candidates before selecting its
bounded result set, prioritizing variety across on/kun readings. Matching uses
reading stems and word boundaries as a heuristic, not verified pronunciation
annotations. For example, 本 can now include 本木 (もとき) alongside ホン/ポン
examples. Some readings have no matching words; irregular readings and a limited
result size mean complete reading coverage cannot be guaranteed.

**Radical-table assessment:** a dedicated `radicals` table and a many-to-many
`kanji_radicals` table would be useful for a component explorer with radical
meanings, variants, and indexed reverse lookups. They are not needed for this
display fix: KANJIDIC supplies dictionary classifications, not a complete list of
graphical components. Keep the existing source-faithful JSON for now rather than
implying a decomposition we do not have. A future join must record classification
system, relationship type (dictionary radical vs component), and source; it should
not treat Nelson numbers as Kangxi IDs. No schema migration or reimport is needed.

## Shiritori · しりとり

Choose **Shiritori** in the Nihon menu. Start a game
against the computer or with one to six local players. The main card shows the
previous word, its reading and the exact required beginning. Played words can
be explored by hover, keyboard focus or tap; the notebook includes kanji detail
buttons, a random translated example when available, pronunciation and Save to
review. The title's **?** opens instructions; dialogs close with Escape or ×.

Settings include Kana / Kanji / Both, every contiguous JLPT range, thematic
categories, parts of speech, dictionary names, a maximum mora length and all chain rules.
They appear in an expandable **Game settings** panel directly below the intro,
open initially. Saving settings or successfully starting a new game collapses
the panel; select its heading to reopen it at any time.
Beginner, Relaxed, Sudden Death and Daily highlights appear in separate labeled
cards, stacking on small screens.
Each option has a focusable/tappable explanation. Rules are fixed during a
round. Audio, furigana, romaji and appearance are controlled only from the shared
top bar, without duplicate settings in the panel. Font size and high contrast
remain in the panel; these display controls can change while playing. Roman-letter input
uses WanaKana's IME conversion without interfering with Japanese composition.
Kanji entry allows a typed reading to be converted by confirming a dictionary
spelling. Ambiguous entries require an explicit selection before Play.

Rule defaults are **exact**, not the common relaxed classroom variants:

- The next word starts with the last syllable of the previous one, or more of
  it (`けいこ` → `こ…`, `いこ…`); it must be longer than the overlap, so it
  never starts with the whole previous word. Extra overlap earns +5 per syllable.
  The last kanji or kanji compound of the spelling also works.
- Small kana stay attached (`しょ` requires `しょ`; `しょう` is fine).
- With **Kana** or **Kanji** word entry, and in **Kanji Shiritori**, the
  pronunciation must not end in `ん` / `ン`, `を` / `ヲ`, or `ー`. Dictionary
  readings are checked even when the submitted spelling uses kanji, such as
  `校門` (`こうもん`). This applies to players, opening words, hints, reveals
  and computer moves. An internal long-vowel mark is allowed (`ケーキ`).
  Outside Kanji Shiritori, **Both** retains final long vowels, so `コーヒー`
  requires `ヒー`.
- Conjugated verbs and adjectives (`のみました`) are accepted via their base entry.
- Hiragana/katakana are equivalent, including half-width katakana.
  `を` / `ヲ` are prohibited, and words ending in `ん` / `ン` are rejected.
  Voiced/unvoiced equivalence is off.
- All spellings/readings of the same dictionary entry count as repeats.
- Words ending in ん / ン are never accepted, and repeats are never allowed. In Kanji mode the repeater 々 cannot end a word, and candidates must start with the previous word's trailing kanji.
- Dictionary lookups fall back to Jisho, then Jotoba, when a spelling is missing locally.
- Kanji Shiritori mode only accepts kanji / kanji-compound overlaps.

Classic retries rejected submissions; Sudden Death loses on a rejected Play.
Relaxed has unlimited hints and no timer; an invalid connection loses the round,
while vocabulary-rule violations can be retried. Timed counts wall-clock
time, including dialogs and dictionary requests, and ignores responses arriving
after a timeout or new game. Beginner caps words at four morae, supplies automatic
hints and enables furigana. Category, Kanji and Katakana modes apply their named
filters. Marathon adds five points per valid word. No available legal
dictionary continuation is reported explicitly: the computer loses on its
turn, while an exhausted human chain ends neutrally. Filters are never silently
widened.

Daily uses a local-calendar-date-seeded computer match with fixed rules, no
assistance, and a target of ten valid human words (or a computer unable to move).
Only the first started attempt per day affects the locally stored streak;
additional attempts are practice. Consecutive successful dates extend the streak.
It is local progress, not a server-verified leaderboard, and the same installed
dictionary version is needed to reproduce a daily match.

N5–N1 earn 10/20/30/40/50 points; unrated entries earn 10 and are available only
in All. Levels are matched to spelling/reading metadata, never guessed from
kanji difficulty. Every third move can carry a +15 bonus kana. Additional
suffix/prefix overlap earns +5 per extra matching character. Rejected words do
not enter the chain or earn points. Statistics reset for each new game; discoveries, daily progress and the
optional review list remain local. Settings can export/import validated JSON
review lists or reset progress. Imported words do not enter the game dictionary.

`GET /api/shiritori/words` uses JMdict spellings, reading restrictions, senses
and linked vocabulary levels. Pass `rules` as JSON, `start` and a JSON `used`
array of dictionary IDs for computer/hint candidates; `q` performs an exact
submission lookup. Candidate queries exclude rule violations, including forbidden endings;
exact lookups retain these so Check/Play can explain them. A miss optionally
queries Jisho (`WORD_API_FALLBACK=false` disables this). Remote lookups have a
timeout, bounded concurrency and a bounded cache; failures are reported, never
converted into a word rejection or a computer loss. Existing Tatoeba fallback
and KANJIDIC endpoints provide learning details. No migration or data reimport
is needed.

**Coverage:** thematic categories are approximate English-gloss filters, not
human-curated classifications; names depend on dictionary coverage and do not
establish whether a person is famous. Not every word has a JLPT level, a
translated example or an available device voice. Strict endings can legitimately
have no continuation in the installed vocabulary. Opening words are checked for
at least one legal continuation before a round starts.

Run `npm run test:shiritori` for rules/API checks and Chromium gameplay coverage,
including a live-dictionary round, local/computer turns, conversion, safe checks,
terminal rules, timeouts, assistance, review import/export and mobile layouts.

## Local development

```sh
npm ci
npm run db:import
npm run dev
```

Open http://localhost:5173. The backend runs at http://localhost:3000.
An imported database is already present at `backend/data/nihon.sqlite`, so importing
is only needed after a fresh checkout or to regenerate it.

Copy `frontend/.env.example` to `frontend/.env.local` for the local API URL,
or set a build environment variable. Vite exposes this public URL
to browsers; never put secrets in `VITE_*` variables. Restart Vite after changes.
Backend optional settings are documented in `backend/.env.example`; copy to
`backend/.env` when needed. `DATABASE_PATH` can override the database location.

On a corporate network whose certificate authority is in the macOS trust store,
use `NODE_USE_SYSTEM_CA=1 npm run db:import`. Alternatively configure Node's
`NODE_EXTRA_CA_CERTS` with your organization's CA file. Do not disable TLS verification.
The backend's `dev` and `start` commands already enable Node's system CA trust
for live sentence requests, while still verifying HTTPS certificates.

### Transport and example settings

Production uses **HTTPS for encryption and gzip for smaller payloads**, not RSA
application encryption (RSA would increase response size). Browsers decompress
gzip transparently, so developer tools still show readable JSON. No private key
is shipped to the browser. The backend sets `Vary: Origin, Accept-Encoding` and
only compresses responses of at least 1 KiB when the client accepts gzip and the
result is smaller. JSON and SVG responses are both supported.

`API_COMPRESSION=true` enables compression locally; `false` disables application
compression. The default is on in production and off locally. A hosting CDN may
also compress responses independently. Set it in `backend/.env` or Vercel's
environment settings. `SENTENCE_API_FALLBACK=false` disables all live sentence
requests; it defaults to enabled. Only the searched Japanese term is sent to
Tatoeba, not quiz answers or full pasted text. The fallback has a six-second timeout,
four concurrent upstream requests per function instance, request deduplication,
and a bounded cache. Provider failures are surfaced instead of shown as “no results.”

## Importing data

`npm run db:init` creates an empty schema without downloads. `npm run db:import`
downloads pinned, openly licensed datasets and performs **all** database inserts:

| Source | Imported information |
| --- | --- |
| KANJIDIC2 via jmdict-simplified | 13,108 characters; multilingual meanings; on/kun/name readings; code points; radicals; strokes; grades; frequency; variants; dictionary/query references |
| JMdict English via jmdict-simplified | 218,930 entries, all spellings/readings and their restrictions, senses, parts of speech, usage notes, cross-references |
| OpenJLPT | 7,811 N5–N1 vocabulary study records, romanization, examples, and estimated modern kanji levels |
| KanjiVG | 6,670 locally stored stroke-order SVGs, where available |

Counts describe the currently pinned snapshots. See `backend/scripts/sources.js`
for revisions. To update, change the pins there, rerun the importer, and redeploy.
Dictionary downloads are cached in `backend/.cache/`. Import/build scripts need
network access, as does the optional runtime sentence fallback. Each downloaded
dictionary file's URL, SHA-256, and size are recorded in SQLite metadata.
The importer is repeatable: it builds a new database, checks constraints and integrity,
and atomically replaces the live file. Failure leaves the previous database untouched.
An exclusive import lock prevents concurrent writers. If a process is forcibly killed,
remove only its stale `backend/data/nihon.sqlite.import-lock` after confirming no import
is running. Restart a running backend after replacing its database.

### Schema and data caveats

- `kanjis`: character, `U+` Unicode notation and numeric code point; full reading arrays;
  multilingual meanings; stroke count and known miscounts; nullable modern `jlpt`
  (1–5, `NULL` means unrated), separate pre-2010 `jlpt_old`; grade; overlapping
  categories; frequency; radicals; nanori; variants; original reading/meaning groups
  and lookup references. Multi-value columns are validated JSON.
- `words`: one entry per stable JMdict ID. Kana-only words are retained too.
  All forms and sense restrictions are preserved, not flattened into invalid
  spelling/reading combinations.
- `kanji_words`: indexed many-to-many relation covering **every** written form,
  not only a headword. The current import creates 504,891 unique links.
- `vocabulary`: form-specific OpenJLPT practice records linked to `words`.
  A word's JLPT level must not be assigned to every alternate spelling/reading/sense.
  Eleven source records lack a matching JMdict ID; they are retained with a null
  relation and explicitly reported by the importer.
- `strokes`: original KanjiVG SVGs, with license notices intact.
- `metadata`: source provenance, revisions, import date, licenses, JMdict tag labels.

Categories are `Joyo`, `Jinmeiyo`, `Kyoiku`, and `Kokuji` (ASCII API spellings).
Kyōiku is a subset of Jōyō, not an exclusive category. Kokuji is recognized from
KANJIDIC2's explicit marker; absence is **unknown**, not false. These classifications
are not exhaustive etymology data. Modern JLPT levels are community estimates,
including OpenJLPT's explicitly identified supplementary estimates. Old JLPT levels
are never relabeled as modern N levels.

The original root `kanjidb.sqlite` is **untouched and unused**. Its provenance/license
was not supplied, so it is not merged into or bundled with the new backend.

### Seeding more vocabulary and example sentences

`npm run seed:vocab` (after `npm run db:import`) adds tables to the local SQLite
database without touching existing ones: `vocabulary_words` (word, reading, meaning,
JLPT level, parts of speech, tags, common flag, source, licence), `sentences`
(Japanese, English, source, licence, attribution), `word_sentences` (links to
`words.id`) and `seed_runs` (what was imported, checksum, counts).

```bash
npm run seed:vocab -- --dry-run                 # download, parse, report; write nothing
npm run seed:vocab -- --levels N5,N4 --limit 200
npm run seed:vocab -- --force                   # re-run steps already recorded
```

Downloads are cached in `backend/.cache/seed/` (gitignored, 1 s delay between
requests) and re-runs are idempotent (`INSERT OR IGNORE`, one transaction per step).
Sources: JLPT N5–N1 lists from
[open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks)
(Jonathan Waller / tanos.co.uk, CC BY), matched to JMdict entries; common JMdict
words (EDRDG, CC BY-SA 4.0); and Tatoeba example sentences from
[jmdict-examples](https://github.com/scriptin/jmdict-simplified/releases)
(CC BY 2.0 FR, Tatoeba contributors). The generated database is not committed;
`db:import` rebuilds a fresh file, so re-run the seed afterwards.

## Batching and endpoints

Imi, Yomi, and Goi request 40 practice records at a time, keep per-filter queues, and
prefetch when 10 remain. Concurrent consumers share one request. Recent/queued IDs
are excluded on refill. Quiz advancement uses memory, not a request per question.
Buffered questions remain available during a refill failure; exhausted queues show
an error and support retry instead of substituting hardcoded data. Changing a Goi
level uses a separate queue; Random samples all available study levels.

Kanji batch/detail records include all Japanese on/kun/name readings, meanings,
stroke count, level, categories, and up to six example words with readings/meanings.
Imi and Yomi render these as labeled sections rather than repeating meanings.
The atlas also shows related compounds and example sentences. Japanese readings
are not truncated; missing on/kun readings are explicitly marked as unlisted.
For example, KANJIDIC2 lists only an on-reading for 複. We do not invent missing readings.

Unused `variants`, `dictionary_references`, `query_codes`, original multilingual
reading groups, and encoding metadata are no longer serialized in API responses.
They remain in SQLite for provenance. Dictionary word responses use `japanese`
and `senses` rather than duplicate `variants`/`meanings` representations, and include
local sentences linked by JMdict ID. This preserves examples for inflected words.
Goi displays real examples inside feedback, respecting its existing example-review
preference. Fumitoki and Kotoba retain dictionary results while sentence fallbacks load.

| GET endpoint | Response |
| --- | --- |
| `/api/health` | Readiness and table counts; 503 if not imported |
| `/api/kanji/batch?limit=40&mode=both` | `{ items: [...] }`; mode `meaning`, `reading`, or `both` |
| `/api/kanji/candidates?reading=...` | `{ items: [{ kanji }] }`; exact reading candidates, without answer-revealing meanings/readings |
| `/api/words/batch?level=N5&limit=40` | `{ items: [...] }` with readings, meanings, examples, and source IDs |
| `/api/kanji?level=5&q=day&limit=100&offset=0` | `{ items, total, nextOffset }` summaries |
| `/api/kanji/日` | Lean kanji record with all Japanese readings, example words and local sentences |
| `/api/kanji/日/words?limit=20` | `{ items: [...] }` via the relation table |
| `/api/kanji/日/strokes` | Local SVG, or 404 when not present |
| `/api/words?keyword=日本` | `{ data: [...] }` dictionary results; Japanese, kana, English, or exact study-list romaji |
| `/api/sentences?q=日本` | `{ data: [...] }` randomized local examples, or optional Tatoeba fallback |
| `/api/sentences?q=日本&random=1` | One random example from local and online pools; optional JSON `exclude` list skips displayed Japanese sentences; `warning` reports degraded online availability |
| `/api/analyze?text=日本語を読みます` | `{ tokens, translation, translationSource }`; up to 500 characters |

Batch sizes are capped at 100. Batch `level` accepts `1`–`5`, `N1`–`N5`, `all`,
or `unrated` (vocabulary study records are all rated). Repeated `exclude` parameters
accept at most 100 IDs. Word-search matching is literal, not regex/SQL. Database
queries are parameterized. All runtime database access is read-only.


See [DATA-LICENSES.md](DATA-LICENSES.md) and the frontend's Data sources page for
attribution and redistribution obligations.
