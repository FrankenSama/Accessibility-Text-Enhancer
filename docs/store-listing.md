# Chrome Web Store listing copy

Working copy of the store text. Keep it in step with the README when features
change.

Last updated: 2026-11-27 (v1.8.1).

## Short description (manifest, 132 characters)

This comes from `manifest.json` and appears under the extension name in the
store and on `chrome://extensions`. It cannot be edited in the dashboard: a new
package must be uploaded for a change to take effect.

> Read the web on your terms: bold, highlight, spacing, dyslexia-friendly fonts,
> translation, and read aloud. Private and local.

126 characters. Suitable for the v1.9.0 package.

## Detailed description (dashboard)

Paste into the store listing's description field. Plain text, no HTML.

```text
Accessibility Text Enhancer helps you read web pages more comfortably. Select text and a small toolbar appears with one-click fixes for common readability problems. Everything happens in your browser, and every change can be undone.

WHAT YOU CAN DO

- Make text clearer: bold, highlight, larger font size, and readable contrast for a selection or a whole paragraph.
- Choose a typeface: Sans, Serif, Monospace, or the bundled OpenDyslexic font.
- Adjust spacing: Comfortable, the WCAG 1.4.12 text-spacing preset, or custom line height, letter, word, and paragraph spacing.
- Highlight your way: background colour, underline, or an automatic contrast-aware style.
- Translate in place: translate a selection or paragraph with Chrome's built-in Translator API, then press Translate again to restore the original.
- Read aloud: choose a voice, speed, and pitch, with sentence highlighting, auto-scroll, sentence skip, and pause/resume. Continue from a caret or from a selection.
- Stay on track: Focus mode dims everything except the paragraph you are reading, and the reading ruler keeps your place under the pointer or caret.
- Start from a preset: Comfortable, Dyslexia-friendly, Low vision, or Focus.
- Undo anything: 50-step undo and redo, plus Reset page to remove every change in one action.

PRIVACY

No account, no ads, and no analytics or tracking. Selections and page text are processed in your browser and never sent to the developer or a third party.

Translation uses Chrome's built-in Translator API, which runs on your device. The first use of a language pair downloads a language pack from Chrome; the extension itself sends no page text anywhere.

Preferences and per-site rules sync with your Chrome profile. The on/off switch stays on your device. Privacy policy: https://frankensama.github.io/Accessibility-Text-Enhancer/privacy-policy.html

BUILT FOR KEYBOARD AND SCREEN READER USERS

Shortcuts for every main action, a single tab stop, arrow-key navigation, and announced button states. The toolbar, popup, and settings pages support Windows High Contrast and forced colours. Screen-reader announcements are verified with NVDA on Windows.

SITE CONTROL

Keep the extension always on or always off for a site, switch it off globally, and see an OFF badge on sites you turned off. Settings lists every site rule with a remove button and a clear-all action.

COMPATIBILITY

Chrome 91+ and other Chromium-based browsers. In-place translation needs Chrome 138+ on desktop and an HTTPS page. Browser-internal pages such as chrome:// and the Chrome Web Store cannot be modified.

GOOD TO KNOW

Enhancements are applied to the selected text and its surrounding container so they survive page updates. Formatting may therefore reach nearby text in the same paragraph or element, not only the exact words you selected.

OPEN SOURCE

Free software under the GNU GPLv3. Source, issues, and documentation: https://github.com/FrankenSama/Accessibility-Text-Enhancer
```

## Notes

- The dashboard's detailed description can be updated without a new package.
- The short summary under the extension name is read from the manifest, so a
  new upload (and a version bump) is required for it to change.
- Screenshots and the promotional tile are updated separately in the dashboard.
- Store policy: keep the copy accurate about data handling. The claims above
  match `privacy-policy.md`; revisit both together.
