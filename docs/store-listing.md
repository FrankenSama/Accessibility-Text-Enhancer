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
Accessibility Text Enhancer gives you control over how text looks and sounds on any web page, in real time.

How it works:
Select text and a toolbar appears with one-click options to:
• Bold text or highlight important content
• Increase or decrease font size (8-50px)
• Switch between serif, sans-serif, monospace, and OpenDyslexic fonts
• Adjust letter, word, line, and paragraph spacing
• Fix low-contrast text for better visibility
• Translate a selection in place with Chrome's built-in Translator API (Chrome 138+ on desktop)
• Read aloud with sentence highlighting, auto-scroll, and pause/resume
• Stay focused with Focus mode and a reading ruler
• Apply a preset: Comfortable, Dyslexia-friendly, Low vision, or Focus

What to expect:
Changes apply to the selected text and its surrounding container so they stick. Formatting may affect nearby text in the same paragraph or element, not just the exact words you selected. Every change can be undone.

Privacy first:
• Works only when you actively use it (click the icon or press a shortcut)
• No account, ads, analytics, or browsing-history collection
• Translation and text-to-speech stay in your browser; page text is never sent to the developer or a third party
• Preferences sync through your Chrome profile; the on/off switch stays on your device
• Per-site Always on / Always off rules and a one-action Reset page

Perfect for people with visual impairments, reading difficulties such as dyslexia, or anyone who wants more control over how they read online.
```

## Notes

- The dashboard's detailed description can be updated without a new package.
- The short summary under the extension name is read from the manifest, so a
  new upload (and a version bump) is required for it to change.
- Screenshots and the promotional tile are updated separately in the dashboard.
- Store policy: keep the copy accurate about data handling. The claims above
  match `privacy-policy.md`; revisit both together.
