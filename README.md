# Accessibility Text Enhancer

<div align="center">

![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Chrome](https://img.shields.io/badge/Chrome-88%2B-yellow.svg)

**Read the web on your terms.**

![Demo Screenshot](docs/images/demo-screenshot.webp)

</div>

## Overview

Accessibility Text Enhancer is a Chrome extension that lets you adjust text while you read it. Select a passage and a small toolbar appears with one-click fixes for common readability problems: bold, highlight, font size, font style, letter and word spacing, contrast, and read aloud.

Unlike audit tools that only report problems, this extension applies the fix immediately, in your browser. There is no account, no build step, and no network request: every change is local, and every text change can be undone.

Originally developed for an MSc dissertation at Solent University, it is now maintained by [Octavio Silva](https://github.com/FrankenSama).

## Features

- **Bold** and **highlight** just the selected words
- **Font size, style, spacing, and contrast** for the nearest paragraph
- **Read aloud** with the browser's built-in speech synthesis
- **Undo/redo** for the last 50 changes
- **Dark/light toolbar**, with JSON export and import
- **Keyboard and screen reader support**: shortcuts, a single tab stop, arrow-key navigation, and `aria-pressed` state
- **Works in** Chrome 88+ and other Chromium-based browsers

## Install

**[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/cgpanifaahogfainpnkebmbgemodgfli)** (recommended)

To load it manually, clone this repository, open `chrome://extensions/`, turn on **Developer mode**, click **Load unpacked**, and select the project folder.

## Usage

1. Select text on any standard web page.
2. Use the toolbar that appears, or one of the shortcuts below.
3. Undo with `Ctrl+Z` / `Cmd+Z` if a change is not right.

Bold and highlight apply to the selected words; font size, style, spacing, and contrast apply to the nearest paragraph. Shift-click flips that scope. If a selection crosses paragraphs, bold and highlight apply paragraph by paragraph and a toast explains the result.

| Action | Windows/Linux | macOS |
|---|---|---|
| Open extension | `Ctrl+Shift+Y` | `Cmd+Shift+Y` |
| Toggle extension | `Ctrl+Shift+E` | `Cmd+Shift+E` |
| Focus toolbar | `Ctrl+Shift+F` | `Cmd+Shift+F` |
| Bold | `Alt+Shift+B` | `Option+Shift+B` |
| Highlight | `Alt+Shift+H` | `Option+Shift+H` |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` | `Cmd+Z` / `Cmd+Y` |

Focus Toolbar can be rebound at `chrome://extensions/shortcuts` (also linked from the popup). Bold and highlight are ignored in inputs, text areas, and editable regions. Undo and redo are only captured while the toolbar is visible and there is a change to undo. On Windows, `Alt+Shift` is also the default layout-switch shortcut; if it conflicts, use the toolbar buttons or rebind Focus Toolbar.

## Privacy

Preferences are stored locally with `chrome.storage.local`. Selections and page content are processed in your browser and never sent to the developer or a third party. See the [privacy policy](privacy-policy.md) for details.

## Contributing

This is a personal project, and forks are welcome under the MIT License. Bug reports and focused pull requests are appreciated; reviews happen at the maintainer's discretion. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and guidelines, and [ROADMAP.md](ROADMAP.md) for planned work.

## License

[MIT](LICENSE) © 2025–2026 Octavio Silva. If you fork or republish this project, keep the license and copyright notice, credit the original author, and make it clear that your version is not official.

---

[GitHub](https://github.com/FrankenSama/accessibility-text-enhancer) · [Project page](https://frankensama.github.io/accessibility-text-enhancer/) · [LinkedIn](https://www.linkedin.com/in/octavio-silva-designer/) · [Report an issue](https://github.com/FrankenSama/accessibility-text-enhancer/issues)
