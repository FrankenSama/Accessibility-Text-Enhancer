# Roadmap

This roadmap tracks the accessibility work planned for Accessibility Text Enhancer. It is a living document: items move between phases as the project learns from real use, and nothing here is a commitment to a date.

**Latest GitHub release:** v1.6.0 · **Chrome Web Store:** v1.4.1 · **Last updated:** 2026-11-24

## Guiding principles

1. **User-driven only.** The extension never changes a page on its own. Every style change starts with an explicit selection or command.
2. **Keyboard parity.** Anything reachable with a mouse must be reachable, operable, and understandable with a keyboard and a screen reader.
3. **Reversible by default.** Every visual change goes through the undo history, and resetting a whole page will be a first-class action.
4. **Respect the page.** Form controls, editable regions, the extension's own UI, SVG, and MathML stay untouched.
5. **Local and private.** No telemetry, no analytics, no network requests, no remote code.
6. **Graceful degradation.** A page that fights back should produce a clear message, not a broken layout.

## At a glance

| Phase | Theme | Target | Status |
|-------|-------|--------|--------|
| 1 | Accessibility correctness | v1.2.0 | ✅ Released |
| 2 | Reading assistant | v1.3.0–v1.3.2 | ✅ Released |
| 3 | Persistence and control | v1.4.0 | ✅ Released |
| 4 | Personalization | v1.5.0–v1.5.1 | ✅ Released |
| 5 | Reading aids | v1.6.0 | ✅ Released |
| 6 | Comprehension | v1.7.0 | 📋 Planned |
| 7 | Platform and reach | v2.0.0 | 💡 Exploring |

**Status key:** ✅ Done · 🚧 In progress · 📋 Planned · 💡 Exploring · ⏸️ Deferred

**v1.3.1 (maintenance):** keeps the toolbar on two rows so it covers less page text, fixes the toolbar focus fallback, queues the next speech chunk so reading no longer pauses between chunks, reads a paragraph as one utterance, keeps words apart across line breaks and block boundaries, names the command in undo/redo feedback, reuses a single notification live region, adds a Reading settings page with voice preview, compacts the popup shortcut list, and splits the content script into ES modules. No new permissions or network access.

**v1.3.2 (maintenance):** quality-of-life pass before v1.4.0. Adds Windows High Contrast (`forced-colors`) styling for the toolbar, settings dialog, notifications, popup, and reading settings page; a toolbar ✕ button that dismisses the toolbar the way `Escape` does; near-selection toolbar placement that flips above or below the selection and clamps to the viewport, with tooltips that open away from the text; and a readable export filename (`accessibility-text-enhancer-settings-v<version>-<date>.json`). Also lets Focus Toolbar restore the toolbar for a selection that is still on the page after a dismissal. No new permissions or network access.

**v1.4.0 (persistence and control):** moves the theme and reading preferences to `chrome.storage.sync` so they follow the Chrome profile, with a one-time migration from the old local values; versions the settings export as schema 2 (site rules included) and keeps importing older files; adds per-site **Always on** / **Always off** rules from the popup, keyed on the origin and shown on the badge; and adds **Reset page changes** to the toolbar settings dialog, which restores each element's first-seen state, unwraps every selection span, and clears the undo history. The global on/off switch stays per device. No new permissions or network access.

**v1.4.1 (settings hub):** turns the options page into the settings hub. Adds an **Appearance** section for the toolbar theme, a **Site rules** section that lists every rule with a remove button, a rule count against the 100-rule cap, and a **Clear all site rules** action that asks for a second click; and a **Backup and restore** section for export and import. Shares the schema 2 build and parse logic through a new DOM-free `settings-io.js` module. Also renames the popup gear to **Settings**, hides the **This site** control on non-web pages, trims the popup copy for headroom, and labels the reading reset accurately. No new permissions or network access.

**v1.5.0 (personalization):** adds a **Text styling** section to the settings page. Choose a font (Sans, Serif, Monospace, or the bundled OpenDyslexic), a spacing preset (Comfortable, WCAG 1.4.12, or four custom sliders), and a highlight colour and style (background, underline, or automatic). The choices save to `chrome.storage.sync`, define the ON state for the Font, Text spacing, and Highlight commands, and update the toolbar labels. Settings exports move to schema 3, while schema 2 and older files still import without resetting the current text defaults. The contrast guard keeps every highlight readable. OpenDyslexic regular and bold ship under the SIL OFL 1.1, load through FontFace only when selected, and fall back to Arial if the resource is blocked. No new permissions or network access.

**v1.5.1 (settings parity):** brings the full settings suite into the toolbar's in-page dialog, so changing text styling or a site rule no longer means opening the Chrome popup and its options page. The panel now repeats the options page's **Text styling** card — font, spacing preset or four custom sliders, highlight colour and style, a live preview, and reset — and its **Site rules** list with per-rule removal and a two-step clear-all, while keeping reading preferences, page reset, and backup. Both surfaces share new `text-styling-ui.js` and `site-rules-ui.js` controllers, so a control never drifts between them, and a failed storage write rolls the controls back. The preview re-renders when the theme changes so its contrast fallback matches the panel. The options page stays as the fallback: it still owns the **Appearance** theme control and is reachable without a selection or on `chrome://` pages. The popup keeps the global switch and the current-site rule, since turning the extension off from its own toolbar would close the panel. No new permissions or network access.

**v1.6.0 (reading aids):** keeps toolbar buttons centred on pages that restyle `<button>` with their own `display`, `align-items`, `line-height`, margins, or font. Each button is now a self-contained centred flex box with its line height, vertical alignment, and text metrics reset, instead of relying on the host page's button defaults; this fixes the bottom-aligned icons seen on Reddit and similar sites. Also completes the High Contrast pass in the settings dialog: the live preview and the per-rule **Remove** button use system colours with a real border. v1.6.0 adds the Phase 5 reading aids: **focus mode** dims everything except the block under the selection or caret, and the **reading ruler** follows the pointer. Both are transient overlays with no page mutation, no history entries, and no new storage keys; they are hidden from assistive technology, follow forced-colors, and exit with `Escape`. No new permissions or network access.

**Distribution:** v1.6.0 is the latest GitHub release with a packaged zip and SHA-256 checksum. v1.4.1 remains the Chrome Web Store version until a package is submitted and published; no new permissions or privacy disclosures are required.

**Next:** v1.6.0 is released. v1.7.0 adds selection translation in a read-only panel; the [plan](docs/v1.7.0-plan.md) is drafted and no translation code has shipped yet.

---

## Phase 1 — Accessibility correctness (v1.2.0) ✅

The toolbar already declares `role="toolbar"`, but it was not operable or understandable the way an ARIA toolbar should be. This phase closed that gap before adding more features on top of it.

### 1.1 Expose toggle state ✅

**Problem:** `Bold`, `Highlight`, `Font Style`, and `Text Spacing` are toggle buttons, but they never report whether they are on. A screen reader hears the same thing before and after a change.

**Work:**

- Add `aria-pressed="true|false|mixed"` to every toggle button.
- Recompute it after every command, undo, and redo, not just when the toolbar is created.
- Report `mixed` when the selected text disagrees, instead of guessing one side.
- Mirror the state visually in CSS for sighted keyboard users.

**Acceptance:** a screen reader announces the state change after a command; a mixed selection reports "mixed"; undo restores the previous announcement.

**Effort:** small · **Impact:** high

### 1.2 Roving tab stop and arrow-key navigation ✅

**Problem:** every toolbar button is a separate tab stop, and there is no arrow-key navigation inside the toolbar.

**Work:**

- Keep exactly one enabled button in the tab order.
- `ArrowLeft` / `ArrowRight` move between enabled buttons and wrap around.
- `Home` / `End` jump to the first and last enabled button.
- Skip disabled buttons (undo/redo when there is no history).
- Move focus to a valid button if the focused one becomes disabled.

**Acceptance:** `Tab` enters the toolbar once; arrows and Home/End traverse it; `Tab` leaves it; disabled buttons are never focused.

**Effort:** small · **Impact:** high

### 1.3 Keyboard access to the toolbar ✅

**Problem:** the toolbar appears after a selection but there is no keyboard command to focus it. Keyboard-only users can trigger Bold and Highlight, but cannot reach the other commands.

**Work:**

- Add a `focus-toolbar` manifest command on `Ctrl/Cmd + Shift + F`, rebindable at `chrome://extensions/shortcuts`.
- Relay the command from the background worker to the content script, which creates the toolbar immediately if the 150 ms selection delay has not fired yet.
- Keep Bold and Highlight as scoped in-page `Alt/Option + Shift + B/H` commands that only fire when a non-editable selection exists.
- Ignore the in-page commands inside inputs, text areas, selects, and editable regions so native text entry is not hijacked.
- Let native `Ctrl+Z` / `Ctrl+Y` through when the user is editing text or the extension has nothing to undo or redo.
- Announce the shortcuts in the popup and README, and link to the browser's shortcut manager from the popup.
- Note: `Alt + Shift + A` is Chrome's "focus inactive dialogs" shortcut on Windows/Linux, and `Alt + Shift + T` focuses the browser toolbar, so neither can be used for the in-page commands.

**Acceptance:** after selecting text with `Shift + Arrow`, `Ctrl/Cmd + Shift + F` moves focus into the toolbar; arrow keys then reach every command; rebinding the command at `chrome://extensions/shortcuts` is reflected in the popup immediately and in the toolbar hint on the next page load; pressing Bold or Highlight inside a text field types normally.

**Effort:** small · **Impact:** high

### 1.4 Settings export version ✅

**Problem:** exported settings report `"version": "1.0.0"` regardless of the installed build.

**Work:** read the version from `chrome.runtime.getManifest()`.

**Acceptance:** the exported JSON matches the version shown in the popup.

**Effort:** tiny · **Impact:** low (correctness)

**Out of scope for this phase:** configurable shortcuts, context-menu commands, and per-site rules.

---

## Phase 2 — Reading assistant (v1.3.0–v1.3.2) ✅

**Problem:** `readTextAloud()` is a single fixed-rate utterance. It is the only feature aimed at blind and low-vision users, and it is the least developed one.

**Work:**

- [x] **Voice selection.** Populate a voice list from `speechSynthesis.getVoices()` and refresh on `voiceschanged`; prefer a voice matching the page language.
- [x] **Controls.** Rate and pitch in the settings panel, persisted between sessions.
- [x] **Transport.** Pause, resume, and stop; the toolbar button reflects the current reading state instead of firing a toast.
- [x] **Follow along.** Highlight the current sentence while it is spoken, and resume from the paused sentence.
- [x] **Read without selecting.** Read the paragraph at the caret with `Alt+Shift+R` / `Option+Shift+R`, and show transport controls even without a selection.
- [x] **Long text.** Chunk long selections into sentence-sized utterances so Chrome does not silently truncate them.

**Acceptance:** a user can start, pause, resume, and stop a reading; the current sentence is visible; rate and voice survive a reload; reading never creates an undo entry.

**Risks:** the voice list is asynchronous and inconsistent across platforms; sentence highlighting needs the CSS Custom Highlight API, so older browsers read without visual follow-along; very long single sentences can still be truncated even though v1.3.2 chunks and queues speech.

**Effort:** medium · **Impact:** very high

---

## Phase 3 — Persistence and control (v1.4.0) ✅

**Problem:** preferences do not follow the user across Chrome profiles. Theme, reading voice, speed, and pitch are stored in `chrome.storage.local`; font size, spacing, and highlight colour have no saved defaults at all. There are no per-site rules and no one-action reset.

**Work:**

- ✅ **Synced preferences.** Theme and TTS voice, rate, and pitch moved to `chrome.storage.sync`, with a lazy migration from the old local values. The extension on/off switch intentionally stays in `chrome.storage.local`.
- ✅ **Settings schema v2.** Versioned export/import that includes site rules and still imports the pre-1.4.0 file shape.
- ✅ **Per-site rules.** "Always on" and "always off" per origin, controlled from the popup and reflected on the toolbar badge. The rule wins over the global switch; reapplying text-level changes stays in the backlog.
- ✅ **Reset page.** One action in the toolbar settings dialog that restores every element's first-seen state, unwraps the selection spans, and clears the undo history. It asks for a second click before acting.

**Acceptance:** preferences follow the user to another Chrome profile; a site can be excluded permanently; Reset page leaves the page as it was found; exported settings round-trip across versions.

**Risks:** `storage.sync` quotas and conflict resolution; site rules must key on origin, not full URL; reset must not touch styles the extension did not set.

**Effort:** medium · **Impact:** high

---

## Phase 4 — Personalization (v1.5.0–v1.5.1) ✅

**Plan:** [docs/v1.5.0-plan.md](docs/v1.5.0-plan.md), approved 2026-11-18.

**Problem:** every command uses one fixed value: one highlight colour, two font families, and a single spacing toggle.

**Work:**

- **Font picker.** Sans, serif, monospace, and a bundled OpenDyslexic face (regular and bold, SIL OFL 1.1).
- **Spacing presets.** A WCAG 1.4.12 preset (line height 1.5, paragraph spacing 2em, letter spacing 0.12em, word spacing 0.16em), plus four custom sliders for line height, letter spacing, word spacing, and paragraph spacing.
- **Highlight options.** Yellow, green, blue, pink, and orange, with an underline-only mode for users who cannot rely on a background colour.
- **Saved defaults.** Persist and sync the chosen font, spacing preset, and highlight style through the v1.4.0 storage layer. A saved default defines the command's ON state; a second press removes the override.

**Acceptance:** a user can choose a font, spacing preset, and highlight style; the choices apply to new commands, survive a reload, and follow the profile; export/import round-trips them.

**Risks:** a bundled font increases package size; page CSS can override the chosen values; highlight colours and underlines need contrast guards against the page background; the font button stops cycling serif/sans and applies the saved font instead, which is a documented behaviour change.

**Effort:** medium · **Impact:** high

---

## Phase 5 — Reading aids (v1.6.0) ✅

**Plan:** [docs/v1.6.0-plan.md](docs/v1.6.0-plan.md), implemented, packaged, and released.

**Problem:** the extension can restyle text, but it cannot reduce visual noise or help a reader keep their place.

**Work:**

- **Focus mode.** Dim every block except the one under the caret or selection, resolving the block with `closestBlock()`. One fixed overlay, not per-element styles.
- **Reading ruler.** A translucent horizontal band that follows the pointer.
- **Spacing note.** Independent line-height and paragraph-spacing controls shipped in v1.5.0 as separate values under the **Custom** spacing preset. v1.6.0 verifies them rather than adding a second spacing model.
- Both aids are overlays: no DOM mutation, no history entries, `Escape` exits, and they keep working after the toolbar is dismissed.

**Acceptance:** focus mode and the ruler toggle independently; neither changes page content, page styles, or undo history; focus follows the selection or caret and repositions on scroll/resize; the ruler follows the pointer without stealing clicks; both work with the toolbar hidden; dark, light, forced-colors, keyboard-only, 200% zoom, and a 320 px viewport pass; the full harness is green.

**Effort:** small–medium · **Impact:** high for dyslexia, ADHD, and low vision

---

## Phase 6 — Comprehension (v1.7.0) 📋

**Plan:** [docs/v1.7.0-plan.md](docs/v1.7.0-plan.md), draft for review.

**Problem:** Chrome's page translation is page-level, prompts automatically, and replaces the original. That is awkward when the reader only needs a word, sentence, or paragraph, and it hides the source text they are trying to understand.

**Work:**

- **Translate selection.** A toolbar button translates the current selection into a read-only panel; Shift translates the containing paragraph.
- **On-device translation.** Use Chrome's built-in Translator API (Chrome 138+ desktop). No cloud service, API key, or extension-originated network request; show language-pack progress and cancellation.
- **Accessible result.** Set `lang` and `dir` on the result, announce progress and errors, and offer copy plus read-aloud in the target language.
- **No page mutation.** The original stays intact, so there is no undo entry, layout change, or RTL risk.

**Acceptance:** selection and paragraph scopes work; the target language is saved and synced; unsupported pairs, download failures, and the character cap are explained; the panel is keyboard-operable, forced-colors ready, and announced correctly; the page DOM and undo history are unchanged; the full harness is green.

**Risks:** Chrome 138+ only; incomplete language-pair coverage; first-use model download; machine-translation quality; toolbar crowding.

**Effort:** small–medium · **Impact:** high for multilingual readers and anyone reading outside their first language

---

## Phase 7 — Platform and reach (v2.0.0) 💡

- **Context-menu commands.** A `chrome.contextMenus` submenu for Bold, Highlight, Read Aloud, Contrast, and Spacing, available on a selection or a right-clicked paragraph. Gives discoverability and a keyboard path through the context-menu key.
- **Frame support.** Enable `all_frames`, keep the UI in the top frame, and coordinate commands with `chrome.runtime` messaging.
- **Internationalization.** Move UI strings into `_locales` and ship the first translations.
- **SPA resilience.** A `MutationObserver` that prunes history entries whose targets were detached by a re-render.
- **Configurable in-page shortcuts.** A shortcut editor that validates against Chrome-reserved combinations.
- **Browser port.** Evaluate Firefox (MV3 differences in `chrome.*`, `browser.*`, and speech synthesis).

**Effort:** large · **Impact:** broadens reach

---

## Backlog and exploration ⏸️

These are worth investigating but are not scheduled:

- **Background-image contrast.** Sample the dominant colour behind text so `Fix Contrast` works on hero images and gradients. Cross-origin canvas restrictions may make this unreliable; a text-shadow fallback is the safer first step.
- **Page-wide high-contrast theme.** A reversible dark/high-contrast overlay for the whole document. High impact, high risk of breaking layouts.
- **Persistent enhancements.** Reapply a user's text-level changes when they revisit a page, beyond the per-site on/off rules in Phase 3. Text anchors are more stable than selectors, but still fragile on dynamic sites.
- **Reading progress and word count.** Useful for long articles, but outside the current "enhance what you select" model.
- **Automated accessibility audit.** Explicitly not planned: this is an enhancement tool, not a checker.

## Non-goals

- Modifying a page without a user action.
- Telemetry, analytics, or any network request.
- Replacing a screen reader, browser zoom, or OS-level accessibility settings.
- Bypassing a site's CSP, permissions, or paywall.
- Shipping remote code or eval.

## Release checklist

Use this list for every release. The v1.4.0, v1.4.1, v1.5.0, and v1.5.1 runs are recorded in the release notes and [`docs/smoke-test.md`](docs/smoke-test.md). The store step was last completed for v1.4.1 on 2026-11-18; the checklist stays unchecked as a template for the next release.

- [ ] Browser harness green (all suites, including real-extension load and command smoke tests)
- [ ] Keyboard-only harness checks: focus, traversal, apply, undo
- [ ] NVDA smoke test on Windows when the toolbar, settings, or reading changes — see [`docs/smoke-test.md`](docs/smoke-test.md). Last full pass: v1.3.0
- [ ] VoiceOver (macOS) and Orca (Linux) smoke tests — not blocking, but still untested; no macOS or Linux hardware available
- [ ] Dark and light toolbar themes
- [ ] Version bumped in `manifest.json`, `popup/popup.html`, and the README badge
- [ ] `README.md` and `CONTRIBUTING.md` updated
- [ ] Packaged extension zip attached to the GitHub release, with a SHA-256 checksum
- [ ] Chrome Web Store package submitted and published, and the store version recorded here
- [ ] `vX.Y.Z` tag created after the release commit

## How to contribute

Pick an item, open an issue describing the approach, and keep the browser harness green. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, style, and commit conventions.
