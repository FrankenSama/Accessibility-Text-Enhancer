# Development guide

This is the deeper companion to [CONTRIBUTING.md](../CONTRIBUTING.md): architecture, testing, packaging, and release work. The short version is all most pull requests need.

## Prerequisites

- Chrome or another Chromium browser (91+; translation needs 138+ on desktop)
- Git
- A text editor; VS Code is convenient but not required
- Node.js only for `node --check` and the maintainer's browser harness; the extension itself has no build step and no runtime dependencies

## Load the extension

1. Open `chrome://extensions/`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the repository root.
4. After editing a content script, module, or the manifest, use the reload icon on the extension card and refresh the test page.

`content-scripts/content.js` is a classic content-script loader. It dynamically imports `app.js`, which imports the rest of the module graph. Chrome does not support static imports in content scripts, so keep the loader as the entry point.

## Repository layout

```text
manifest.json                  Extension manifest
background.js                  Service worker and commands
content-scripts/
  content.js                   Classic loader; dynamic imports
  app.js                       Startup, selection handling, shortcuts, storage
  content.css                  Toolbar, dialog, overlays, translated text
  modules/
    core.js                    STATE, CONFIG, command and shortcut constants
    dom.js                     Ranges, blocks, text maps, skip rules
    text.js                    Sentence splitting, chunking, clamping
    toolbar.js                 Toolbar rendering, placement, roving focus
    commands.js                Command dispatch and text effects
    scope.js                   Which elements a command affects
    contrast.js                WCAG colour math
    fonts.js                   Bundled OpenDyslexic FontFace loader
    history.js                 Snapshots, translation records, undo/redo/reset
    prefs.js                   Synced preferences and per-site rules
    style-defaults.js          Font, spacing, and highlight defaults
    text-styling-ui.js         Shared styling controls
    site-rules-ui.js           Shared site-rule controls
    settings-io.js             Versioned settings file build/parse
    settings.js                In-page settings dialog
    reading.js                 Speech session, chunks, highlight, continuous read
    reading-aids.js            DOM-free ruler/spotlight geometry
    reading-aids-ui.js         Focus mode and reading-ruler overlays
    reading-profiles.js        Built-in reading presets
    translation.js             DOM-free Translator service and languages
    translation-inline.js      In-place wrapper, bubble, toggle, history
    toast.js                   Single polite live region
    feedback.js                Shared toast wording
options/                       Options page
popup/                         Toolbar popup
fonts/                         OpenDyslexic WOFF2 and SIL OFL text
icons/                         Extension icons
docs/                          Plans, smoke test, and this guide
index.html, styles.css, script.js   GitHub Pages landing page
.github/                       Issue and pull-request templates
ACCESSIBILITY.md               Supported environments and barriers
ROADMAP.md                     Planned work
SECURITY.md                    Private reporting
```

## Architecture

- **State and configuration** live in `core.js`: `STATE`, `CONFIG`, command sets, shortcut labels, and schema version. Session state (selection, history, speech, translations, aids) is deliberately in memory; preferences live in `chrome.storage.sync`.
- **Wiring** lives in `app.js`: it loads preferences, attaches selection/click/scroll/keyboard listeners, owns the selection guard and Escape order, and forwards storage changes to the UI.
- **Toolbar** is rendered by `toolbar.js`. Commands are injected through `configureToolbar` to avoid a circular import. The toolbar uses a roving tab stop and keeps focus on a usable button after state changes.
- **Commands** resolve a scope (`scope.js`), capture before/after element state, apply the effect (`commands.js`), and push one history entry (`history.js`). Reset page restores snapshots, unwraps exact-selection spans, and clears translations.
- **Text styling** defaults are normalized in `style-defaults.js`; `settings-io.js` builds and parses the versioned settings file; `prefs.js` owns storage keys, legacy migration, and site rules.
- **Reading** (`reading.js`) turns a range into a text map, splits it into sentences and speech chunks, queues utterances, paints the follow-along highlight with the CSS Custom Highlight API, and scrolls the spoken sentence into view. Continuous reading keeps the full map for sentence navigation while the active speech range starts at the target sentence.
- **Reading aids** (`reading-aids.js`, `reading-aids-ui.js`) are DOM-free geometry plus transient overlays. They are `aria-hidden`, never enter the tab order, and read `rulerSource`/`focusDim` from state. Focus mode follows the selection or the spoken sentence.
- **Reading presets** (`reading-profiles.js`) are code constants that write the existing text-default keys; they do not store a separate profile object.
- **Translation** (`translation.js`, `translation-inline.js`) uses Chrome's on-device Translator API. The service handles language normalization, the 5,000-character cap, caching, signals, and error mapping. The in-place module replaces the range with a `span[data-atx-translation]`, records the original nodes for the toggle and history, and shows the compact language/progress/error bubble.
- **Settings** (`settings.js`, `options/options.js`) share the same defaults and settings file shapes. The in-page dialog also owns the transient reading aids and translation target; the options page mirrors the persisted preferences.

### Invariants

- No page text, selection, or translation content leaves the browser. No telemetry, remote code, or extension-originated network request.
- No new permissions or host permissions without an explicit design decision.
- Page content changes only after a user action and must be undoable, except the visual reading-aid overlays.
- Extension UI is a sibling of the page content, never a child of an editable region; page CSS must not be able to hide or restyle it.
- Overlays are `aria-hidden`, pointer-transparent, and hidden in print.
- Labels, roles, `aria-pressed`/`aria-expanded`, focus order, Escape behavior, forced-colors, reduced motion, 320 px width, and 200% zoom are part of the feature, not polish.

## Settings schema

The current schema is **5**. `settings-io.js` builds and parses the file; `CONFIG.settingsSchemaVersion` is the source of truth.

- Schema 5 adds `rulerSource` and `focusDim`.
- Older files import the keys they know and leave the current ruler/dim choices unchanged.
- `translationTarget` participates in export/import; an empty target means “choose a language”.
- Site rules remain a separate top-level object.
- Built-in reading presets are not stored; they write the existing text-default keys.

When adding a preference, update `CONFIG`, `STATE`, `prefs.js` keys, the loader, the in-page controls, the options page, export/import, and the tests. Do not bump the schema unless the file shape changes.

## Testing

### Fast checks

```bash
node --check content-scripts/app.js
node --check content-scripts/modules/<changed-file>.js
```

`node --check` only proves syntax. It does not load the module graph; import errors show up when the extension loads.

### Manual checks

Use [`docs/smoke-test.md`](smoke-test.md) for the release checklist. For a focused pull request:

- Load the unpacked extension and exercise the changed flow on a real page.
- Check the toolbar and settings by keyboard only, including Tab, arrows, Enter/Space, and Escape order.
- Check names, roles, and pressed/expanded state in the accessibility tree or with NVDA.
- Check Windows High Contrast / forced-colors, dark and light themes, 320 px width, and 200% zoom.
- Check undo, redo, and Reset page for any page mutation.
- For reading changes, check speech, sentence highlighting, auto-scroll, pause/resume/stop, and the reading aids.
- For translation changes, use a real Chrome 138+ desktop build with the on-device pack, or the fake Translator used by the harness.

### Automated harness

The maintainer keeps the browser harness outside the public repository. It launches Chrome for Testing, loads the real extension, and runs unit, accessibility-tree, toolbar, settings, options, popup, reading, translation, forced-colors, and package checks. Contributors who do not have it should describe the manual checks they ran; the maintainer runs the full suite before a release.

Tests should be deterministic: fake the speech engine and Translator, avoid arbitrary sleeps where a condition can be awaited, and keep page fixtures small and accessible.

## Code style

- Four spaces, semicolons, single quotes, modern JavaScript.
- Descriptive names and a short JSDoc block when the contract is not obvious.
- Keep pure logic free of DOM and `chrome` APIs so it can be imported by Node tests.
- Do not add runtime dependencies or a build step.
- Avoid `innerHTML` with page-derived text; prefer DOM nodes and `textContent`.
- Scope CSS to the extension's IDs and attributes. Do not restyle page elements except the selection/translation wrappers the user asked for.
- Use the existing toast live region, focus helpers, and history path instead of adding parallel UI or undo systems.
- For CSS, group layout, positioning, and visual properties, and include a forced-colors rule for any new control.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(reading): continue from the caret
fix(translate): restore the original after a page re-render
docs: simplify the contributor guide
```

- One focused change per pull request; no unrelated formatting.
- Do not bump the version in a normal pull request.
- Fill in the pull-request template, including the accessibility impact and what you tested.
- Do not add permissions, host permissions, network requests, telemetry, or remote code.
- By contributing, you agree that your contribution is licensed under GPLv3; you retain copyright to your own work.

## Packaging and release

1. Run the fast checks, the full harness, and the manual NVDA rows for changed UI.
2. Bump the version in `manifest.json`, `popup/popup.html`, and the README badge. The options page reads the manifest version.
3. Update `README.md`, `ACCESSIBILITY.md`, `ROADMAP.md`, and `docs/smoke-test.md` with the release result.
4. Build the zip from `content-scripts/`, `fonts/`, `icons/`, `options/`, `popup/`, `background.js`, `LICENSE`, and `manifest.json`. Do not include repository docs, `.git`, or the harness.
5. Verify the extracted package with a clean Chrome profile: manifest version, content script, toolbar, settings, options, popup, fonts, and no page errors.
6. Record the SHA-256, commit, tag `vX.Y.Z`, and attach the zip and checksum to the GitHub release.
7. Upload the same zip to the Chrome Web Store and record the published version.

The bundled OpenDyslexic font remains under the SIL OFL 1.1 and is not covered by the GPL. Keep `fonts/OFL.txt` with the font files.

## More reading

- [CONTRIBUTING.md](../CONTRIBUTING.md) — quick start and pull-request checklist
- [ACCESSIBILITY.md](../ACCESSIBILITY.md) — supported environments, barriers, and limits
- [docs/smoke-test.md](smoke-test.md) — manual release checklist
- [ROADMAP.md](../ROADMAP.md) — planned releases
- [SECURITY.md](../SECURITY.md) — private reporting
- [LICENSE](../LICENSE) — GNU GPLv3
