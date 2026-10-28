# Roadmap

This roadmap tracks the accessibility work planned for Accessibility Text Enhancer. It is a living document: items move between phases as the project learns from real use, and nothing here is a commitment to a date.

**Current build:** v1.2.0 (Phase 1 implemented, pending release) · **Last updated:** 2026-10-27

## Guiding principles

1. **User-driven only.** The extension never changes a page on its own. Every style change starts with an explicit selection or command.
2. **Keyboard parity.** Anything reachable with a mouse must be reachable, operable, and understandable with a keyboard and a screen reader.
3. **Reversible by default.** Every visual change goes through the undo history, and every session can be reset.
4. **Respect the page.** Form controls, editable regions, the extension's own UI, SVG, and MathML stay untouched.
5. **Local and private.** No telemetry, no analytics, no network requests, no remote code.
6. **Graceful degradation.** A page that fights back should produce a clear message, not a broken layout.

## At a glance

| Phase | Theme | Target | Status |
|-------|-------|--------|--------|
| 1 | Accessibility correctness | v1.2.0 | ✅ Done |
| 2 | Reading assistant | v1.3.0 | 📋 Planned |
| 3 | Personalization and persistence | v1.4.0 | 📋 Planned |
| 4 | Reading aids | v1.5.0 | 📋 Planned |
| 5 | Platform and reach | v2.0.0 | 💡 Exploring |

**Status key:** ✅ Done · 🚧 In progress · 📋 Planned · 💡 Exploring · ⏸️ Deferred

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

## Phase 2 — Reading assistant (v1.3.0) 📋

**Problem:** `readTextAloud()` is a single fixed-rate utterance. It is the only feature aimed at blind and low-vision users, and it is the least developed one.

**Work:**

- **Voice selection.** Populate a voice list from `speechSynthesis.getVoices()` and refresh on `voiceschanged`; prefer a voice matching the page language.
- **Controls.** Rate and pitch in the settings panel, persisted between sessions.
- **Transport.** Pause, resume, and stop; the toolbar button reflects the current reading state instead of firing a toast.
- **Follow along.** Highlight the current sentence using the `boundary` event, and let the user resume from a sentence.
- **Read without selecting.** Read the paragraph at the caret, with a shortcut.
- **Long text.** Chunk long selections so Chrome does not silently truncate them.

**Acceptance:** a user can start, pause, resume, and stop a reading; the current sentence is visible; rate and voice survive a reload; reading never creates an undo entry.

**Risks:** the voice list is asynchronous and inconsistent across platforms; sentence detection from `boundary` events needs a fallback; Chrome may cut off very long utterances.

**Effort:** medium · **Impact:** very high

---

## Phase 3 — Personalization and persistence (v1.4.0) 📋

**Problem:** only `darkMode` is stored, only locally. The settings panel has two buttons, and every command has one fixed value.

**Work:**

- **Synced defaults.** Move preferences to `chrome.storage.sync`: font-size step, TTS voice/rate, highlight colour, spacing preset, theme.
- **Per-site rules.** "Always on", "always off", and "remember my styles here", with a control in the popup (which already knows the hostname).
- **Reset page.** One action that removes every wrapper, override, and history entry.
- **Font picker.** Sans, serif, monospace, and a bundled OpenDyslexic face.
- **Spacing presets.** A WCAG 1.4.12 preset (line height 1.5, paragraph spacing 2em, letter spacing 0.12em, word spacing 0.16em) plus a slider.
- **Highlight options.** Several colours and an underline-only mode for users who cannot rely on a background colour.
- **Settings schema v2.** Versioned export/import with migration from the current file.

**Acceptance:** preferences follow the user to another Chrome profile; a site can be excluded permanently; reset leaves the page as it was found; exported settings round-trip across versions.

**Risks:** `storage.sync` quotas; site rules must key on origin, not full URL; reset must not touch styles the extension did not set.

**Effort:** medium · **Impact:** high

---

## Phase 4 — Reading aids (v1.5.0) 📋

**Problem:** the extension can restyle text, but it cannot reduce visual noise or help a reader keep their place.

**Work:**

- **Focus mode.** Dim every block except the one under the caret or selection, reusing `closestBlock()`.
- **Reading ruler.** A translucent horizontal band that follows the pointer.
- **Line and paragraph spacing.** Independent controls from the existing letter/word spacing.
- Both aids are overlays: no DOM mutation, no history entries, `Escape` exits.

**Acceptance:** focus mode and the ruler can be toggled independently; neither changes the page DOM or appears in undo history; both work with the toolbar hidden.

**Effort:** small–medium · **Impact:** high for dyslexia, ADHD, and low vision

---

## Phase 5 — Platform and reach (v2.0.0) 💡

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
- **Persistent enhancements.** Reapply a user's changes when they revisit a page. Text anchors are more stable than selectors, but still fragile on dynamic sites.
- **Reading progress and word count.** Useful for long articles, but outside the current "enhance what you select" model.
- **Automated accessibility audit.** Explicitly not planned: this is an enhancement tool, not a checker.

## Non-goals

- Modifying a page without a user action.
- Telemetry, analytics, or any network request.
- Replacing a screen reader, browser zoom, or OS-level accessibility settings.
- Bypassing a site's CSP, permissions, or paywall.
- Shipping remote code or eval.

## Release checklist

- [x] Browser harness green (75 page checks; command relay, shortcut conflicts, popup, and tooltip stacking verified separately)
- [ ] Keyboard-only pass: select, open toolbar, traverse, apply, undo
- [ ] Screen-reader smoke test (NVDA on Windows, VoiceOver on macOS)
- [x] Dark and light toolbar themes
- [x] Version bumped in `manifest.json`, `popup/popup.html`, and the README badge
- [x] `README.md` and `CONTRIBUTING.md` updated
- [ ] `vX.Y.Z` tag created after the release commit

## How to contribute

Pick an item, open an issue describing the approach, and keep the browser harness green. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, style, and commit conventions.
