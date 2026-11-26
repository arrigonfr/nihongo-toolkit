# NihongoToolkit repository instructions

These instructions apply throughout the repository. Follow the user's requested
scope and existing behavior. For page work, inspect a comparable current page,
its entry module, shared components, and relevant browser tests before coding.
Do not assume that copying a page automatically integrates all shared features.
Use the checklist below for new pages and for changes that affect existing page
integration; apply conditional items where relevant and explain material
exceptions instead of silently omitting them.

## Required workflow

- At the start of page work, read the current version of this file, identify
  the checklist items affected by the request, and inspect the corresponding
  shared implementation and tests. Implement those integrations as part of
  the task, not as optional follow-up work.
- When the user specifies a reusable page structure, layout, shared behavior,
  or verification requirement, update the relevant guidance in this file as
  part of the same task. Record the applicable scope and existing shared
  implementation; revise conflicting or outdated instructions. Do not turn
  a clearly one-off request into a repository-wide rule; clarify scope when
  it is genuinely ambiguous.
- Before finishing, check the applicable checklist items against the changes
  and their actual behavior. Report material exceptions or unverified items
  explicitly rather than assuming an integration is present.

## Project shape

- The frontend is a vanilla JavaScript, CSS, and Vite multi-page application in
  `frontend/`; each top-level tool has an HTML entry and a module in
  `frontend/src/`. The Node backend and Cloudflare Worker live in `backend/`.
  Shared UI and behavior belong in the existing shared modules, not in a
  parallel framework or page-specific copy.
- `README.md` documents the current user-visible behavior and development
  commands. Check the relevant section before changing a flow, and update it
  when behavior or setup changes.
- Keep `.github/copilot-instructions.md` aligned with relevant, durable changes
  to the project's architecture, shared integrations, conventions, or
  verification requirements. Update or remove outdated guidance when those
  change; avoid recording temporary task details or duplicating the README.
- Preserve existing URLs, local-storage keys, data, and intended behavior unless
  the task explicitly changes them. Handle migrations and legacy links when
  changes make them necessary.

## New page integration checklist

1. **Entry and discovery:** Use an appropriate existing page as a starting
   point. Add the page to the relevant Practice, Reference, Games, or Support
   group in `frontend/index.html`, with its name, icon, description, and link
   using existing conventions. Check direct navigation, menu selection,
   dashboard, Back/Forward, and embedded navigation where applicable. Vite
   discovers top-level HTML entries; do not assume generated or nested pages
   follow the same path. Review `frontend/vite.config.js`,
   `frontend/src/routes.js`, and `frontend/page-availability.js` when adding
   routes or changing availability; preserve redirects for renamed pages.
2. **Metadata and deployment:** Add appropriate page title and description to
   the SEO configuration in `frontend/vite.config.js`. Verify the public
   extensionless URL, canonical metadata, sitemap/robots behavior, production
   build, and any disabled-page behavior relevant to the page. Do not duplicate
   navigation, analytics, or other markup that Vite already injects. Treat
   catalogue, embed, preview, and unavailable pages according to their existing
   special handling.
3. **Shared header and appearance:** Match the site's header, brand, navigation,
   support/contribution affordances, and layout using existing markup and
   shared modules. Study intros follow Eawase: bilingual label, two-line headline
   with an accented second line, and a short learner-facing description. Use
   `frontend/src/tool-intro.css` rather than per-page intro styling.
   For study tools, initialize `mountStudyControls` from
   `frontend/src/study-controls.js` after the expected page DOM exists; it
   integrates appearance, support, tool help, and applicable shared controls.
   For pages without study controls, use the appropriate existing
   `mountAppearance`/site-header pattern instead. Avoid mounting either twice.
   Respect the shared palette and light/dark/system preference across pages and
   tabs; use existing CSS variables and components rather than hardcoded colors.
4. **Study controls and content:** Include shared Audio, Furigana, and Romaji
   controls when meaningful; use the existing options to hide irrelevant
   controls, as Kana does. Render Japanese and speech through the helpers in
   `study-controls.js` and shared sentence/example helpers where applicable.
   Quick controls and appearance apply live, including to already rendered
   content; do not create competing per-page versions of shared preferences.
5. **Help and settings:** Register specific tool help in
   `frontend/src/tool-help.js`. Every tool's `#helpDialog` must open with its
   description visible. Put ordered instructions under a collapsed “How to use
   this tool” disclosure: cover setup, the main task, and a useful next step or
   recovery. Maintain them in `frontend/src/help-steps.js` in English, Spanish,
   and Portuguese. On every tool change, check the dialog against the actual flow.
   If controls, labels, modes, grading, availability or results change, update
   the affected steps, detailed help and translations **in the same change**.
   Open the dialog on the clean route and verify its instructions match what a
   learner can do in that edition (including restricted previews). Provide meaningful contextual descriptions
   for applicable setting names and mode choices. Use existing settings,
   `chips.js`, `choice-controls.js`, `jlpt-levels.js`, and
   `japanese-fonts.js` patterns when applicable. Group related settings;
   disable irrelevant dependent controls with an explanation using
   `setSettingAvailability`, without overwriting the user's saved choice.
   Restore valid preferences and synchronize their visual controls and
   dependencies before interaction. Use `rememberControls` or the comparable
   established page-specific persistence for supported settings; validate
   values and report storage errors. Do not persist drafts or active rounds as
   preferences or add a redundant Save button.
6. **Session behavior:** For games and practice pages, follow the shared
   setup/play/results flow in `frontend/src/session-view.js` when suitable:
   settings start expanded, starting hides setup, finishing or stopping shows
   results, and Practice again returns to setup without starting a session.
   Keep the start action accessible in the settings footer where the existing
   flow calls for it. Snapshot session-specific settings at start; changes
   apply to the next session unless a control is explicitly live. Shared
   reading, audio, and appearance controls remain live. Preserve relevant
   results, sidebars, timers, and review behavior for the page's actual flow.
7. **Language and accessibility:** Follow
   `frontend/src/interface-i18n.js`, `interface-messages.js`, and
   `content-language.js` for interface text, dynamic content, and labeled
   translation fallbacks. Preserve Japanese/study content when translating
   interface text. Language selection is feature-gated; do not enable it
   implicitly. Use semantic headings, labels, buttons, dialogs, keyboard
   operation, visible focus, appropriate `lang`, and accessible loading,
   status, and error messages. Setting-name help must work with keyboard,
   pointer, and touch without activating the underlying control.
8. **Responsive layout and input consistency:** Reuse `study-controls.css`,
   `settings-panel.css`, `select-controls.css`, `chips.css`, `ui-kit.css`, and
   existing page patterns instead of independently restyling shared controls.
   Keep a consistent visual standard for every input type (`<select>`,
   text/search/number `<input>`, checkboxes/radios, chips, and buttons) across
   all pages — matching `ui-kit.css` (`38px` control height, `10px` radius,
   `1px solid var(--line)`, `var(--card)` background, `13px`/`500` control text,
   `12.5px`/`650` plum labels, and the shared focus ring) even when controls
   live outside `<details>` or `.ui-panel`. Check usable layout at mobile and
   desktop widths, including narrow screens, long labels, dialogs, menus,
   keyboard focus, touch targets, and horizontal overflow. Check light and dark
   modes and more than one palette; preserve contrast and the shared header and
   button alignment.
9. **Data and failure states:** Reuse the existing API, loading, example, and
   confirmation helpers where applicable. Provide meaningful empty, loading,
   unavailable, and retryable error states; prevent stale asynchronous results
   from replacing a newer state or an ended session. Do not fabricate
   dictionary entries, quiz questions, or sentence examples as fallbacks.
   Place general source credits and licenses below the workspace, outside
   settings; keep item-specific attribution with its example. Escape untrusted content when
   constructing HTML. External calls and storage failures must not appear
   successful when they fail.

Translation sync writes are disabled pending a reviewed repair plan and preflight
protection for conflicting machine updates. Preserve remote human translations,
keep per-destination deletion history, report remote-only rows rather than pruning
them automatically, and compare full contents before planning production changes.
Machine translations require a current hash-bound human approval before they are
eligible for sync. Track AI assessments separately; they remain pending human
review and must never be treated as production approval.

## Verification before finishing

- Test the actual changed behavior, not just page rendering. For a new page,
  exercise direct entry and navigation; shared header and relevant controls;
  theme changes and persistence across reloads/pages; settings, dependencies
  and restoration; help; keyboard and mobile layout; and, where applicable,
  setup/start/stop/results/replay, live controls, loading and failures.
  Include relevant production-build and disabled-page checks.
- Add focused coverage to existing tests, and extend explicit page lists in
  shared browser tests where appropriate; a new page is not covered merely
  because an existing cross-page test passes.
- Choose the smallest relevant existing checks from `package.json`. Useful
  starting points include `npm run build`, `npm run test:e2e`,
  `npm run test:tool-fixes`, `npm run test:settings`,
  `npm run test:language`, and `npm run test:session-flow`; use the relevant
  tool-specific `test:*` command for page behavior. `npm test` runs Node unit
  tests; some database tests require an imported local SQLite database. Browser
  checks use Playwright. Run additional backend/Cloudflare checks when those
  paths change.
- Report checks actually run and any blocked verification. Do not claim an
  untested page or unsupported feature is complete.
- Track servers and other listening processes started for a task, including
  their ports and process or session IDs. Once they are no longer needed, stop
  those processes and verify their ports are no longer listening before
  finishing, including after failed checks. Leave pre-existing or unrelated
  processes alone. If the user explicitly needs a server left running, report
  its port and stop it when the dependent work is complete.
