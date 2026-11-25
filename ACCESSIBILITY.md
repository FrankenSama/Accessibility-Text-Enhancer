# Accessibility

Accessibility is the product here, not a compliance afterthought. This page
states what the extension targets, what has actually been tested, where it falls
short, and how to report a barrier.

## Conformance target

The extension's own interface - the toolbar, the in-page settings dialog, the
options page, the popup, and the reading-aid overlays - targets **WCAG 2.2 Level
AA**.

That is a target, not a certification:

- No third-party accessibility audit has been performed, and there is no
  published conformance report.
- It is **not** a claim about the pages you use the extension on. The extension
  changes styles at your request; the accessibility of the underlying page
  remains the site owner's responsibility. Some pages are inaccessible in ways
  this tool cannot repair.
- Read aloud is a reading aid. It does not replace a screen reader, and it does
  not describe images, structure, or interactive controls.

## Supported environments

| Environment | Status |
|---|---|
| Chrome 91+ on Windows, macOS, and Linux | Supported. Translation needs Chrome 138+ on desktop and an HTTPS page |
| Chromium-based browsers (Edge, Brave, Opera) | Best effort; not part of the release checks |
| Chrome on Android or iOS | Not supported; mobile Chrome does not run extensions |
| Keyboard-only use | Supported: shortcuts, a single toolbar tab stop, arrow-key navigation, and `aria-pressed` state |
| Windows High Contrast / forced-colors | Supported for the toolbar, dialog, translation panel, popup, options page, and reading aids |
| NVDA on Windows | Verified for v1.3.0 on 2026-11-06. A v1.6.0 Speech Viewer pass on 2026-11-24 covered the toolbar, settings, reading, focus mode, and ruler (37/37). The v1.7.0 translation pass is pending; a live listening pass has not been repeated since v1.3.0 |
| VoiceOver on macOS | Not tested - no macOS hardware available |
| Orca on Linux | Not tested - no Linux environment available |
| Browser zoom and reflow | The toolbar is repositioned to stay inside the viewport, but 400% reflow has not been formally tested |
| Right-to-left layouts | Translation result direction follows `dir="auto"` and the panel chrome stays left-to-right. Page-level RTL layouts are not formally tested |
| Interface language | English only |

[`docs/smoke-test.md`](docs/smoke-test.md) holds the manual screen-reader
checklist and the current coverage table. Do not describe the extension as
VoiceOver- or Orca-verified until those rows change.

## Known limitations

### Pages the extension cannot run on

Chrome blocks content scripts on browser-internal and protected pages, so the
toolbar never appears on `chrome://` pages, the Chrome Web Store, `devtools://`,
`view-source:`, or the built-in PDF viewer. Local `file://` pages work only
after **Allow access to file URLs** is enabled for the extension.

### Frames and shadow DOM

The content script runs in the top-level document only. Text inside an iframe
has no toolbar, and open shadow roots are not traversed, so text inside web
components may not be reachable or may resolve to the wrong block.

### Page CSS and dynamic content

Enhancements are applied as inline styles with `!important`, which wins over
normal page CSS. They can still lose to:

- a user stylesheet with `!important` rules;
- text that is part of an image, canvas, video, or SVG;
- backgrounds built from images or gradients, which cannot be measured
  reliably for the contrast command.

Single-page apps that re-render can discard an enhancement. Undo skips elements
that are no longer in the document, and changes are not re-applied after a
navigation or reload.

### Bundled OpenDyslexic

The OpenDyslexic font ships with the extension and loads from the package
through the FontFace API. It has been checked on ordinary pages, pages whose
CSP sets `font-src 'self'`, and local `file://` pages with file access enabled.
If a browser refuses the resource, the fallback stack keeps the text in Arial;
the command still applies and is not blocked. Regular and bold ship; the
browser synthesizes italic.

### Commands are text-focused

Bold and highlight target selected text nodes; font size, font style, spacing,
and contrast target the containing block. Form fields, text areas, and editable
regions are deliberately left alone. Text rendered through pseudo-elements is
not targeted.

### Reading aloud

Read aloud uses the browser's Web Speech API. The available voices come from the
browser and operating system, and some voices synthesize speech through a
network service - see the [privacy policy](privacy-policy.md). Speech can
overlap your screen reader. Sentence highlighting requires the CSS Custom
Highlight API (Chrome 105+); on Chrome 91-104 the text is still read without the
highlight.

### Reading aids

Focus mode and the reading ruler are visual overlays. They are `aria-hidden`,
ignore the pointer, and never change page content, page styles, the tab order, or
reading order. Focus mode follows the selection or caret and spotlights one
block; a selection that spans blocks uses the block where it starts. The ruler
follows the pointer, is hidden on touch input and when the pointer leaves the
page, and sits behind the toolbar and settings dialog. Both aids are
session-only, `Escape` exits them, and the toolbar's ✕ button clears them with
the toolbar. In forced-colors the spotlight becomes a system-colour outline and
the ruler uses system-colour rules rather than a translucent fill. Because the
aids are visual, they do not replace a screen reader or describe the page's
structure.

### Translation

The **Translate** button uses Chrome's built-in Translator API. It needs Chrome
138 or newer on desktop and a secure context, so it is absent on `http://` pages
(and on mobile, where extensions do not run). The extension sends no page text;
Chrome downloads an on-device language pack the first time a pair is used, and a
page's `Permissions-Policy` can block the API.

The result opens in a non-modal dialog beside the toolbar. Focus moves into the
panel, `Escape` closes it and returns focus to **Translate**, and a `<select>`
does not swallow `Escape`. Progress is a polite status; errors are assertive and
offer **Try again**. The translated text carries the target `lang` and
`dir="auto"`, and the original text keeps its own `lang` and direction, so a
screen reader can switch pronunciation and direction. The panel chrome stays
English and left-to-right.

The panel is a snapshot: a new page selection closes it so the toolbar can
follow the new range, while collapsing the selection or selecting inside the
panel keeps it open. The page DOM is never changed, so translation creates no
undo entry and no Reset page work. Machine translation can be wrong or awkward;
the original is one click away in the **Original text** disclosure. Input is
capped at 5,000 characters.

### Limits

- 50 undo steps per page.
- 100 per-site rules.
- 5,000 characters per translation.
- Keyboard shortcuts can conflict with the Windows `Alt+Shift` layout switch;
  use the toolbar buttons or rebind **Focus Toolbar** at
  `chrome://extensions/shortcuts`.

## How accessibility is tested

Every release is checked with an automated browser harness before packaging. It
exercises accessible names, roles, and states; keyboard paths; forced-colors
rendering; the toolbar, popup, options page, settings dialog, and translation
panel; the focus-mode and reading-ruler overlays; translation cache, progress,
cancel, and error paths with a fake translator; settings import and export; and
undo, redo, and Reset page.

The harness cannot hear what a screen reader announces. A manual NVDA pass
against `docs/smoke-test.md` is required after any change to the toolbar, the
settings dialog, keyboard handling, the reading assistant, or the translation
panel. That pass is the reason the NVDA row above is dated rather than assumed.

## Reporting a barrier

Use the [accessibility barrier issue template](https://github.com/FrankenSama/accessibility-text-enhancer/issues/new?template=accessibility_barrier.yml).
Barriers are treated as bugs, not feature requests.

Please include:

- the extension version (shown in the popup footer) and browser version;
- operating system and assistive technology, including versions;
- what you did, what happened, and what you expected;
- a public page URL, or a minimal test case if the page is private.

Issues are public. Do not paste private page content, account details, or
personal information. If the problem could expose data or cross a privilege
boundary, follow [SECURITY.md](SECURITY.md) instead.

## Maintaining this page

This page is reviewed with each minor release. Update the coverage table when a
manual pass is completed, and add a limitation here before shipping a feature
that has one.
