# Contributing to Accessibility Text Enhancer

Thanks for helping. This is a personal, accessibility-first project: changes should make reading easier without taking control away from the reader. It is free software under the GNU GPLv3, and forks are welcome under the same license. Reviews happen at the maintainer's discretion.

For architecture, the browser harness, and packaging, see **[docs/development.md](docs/development.md)**. This file is the short version.

## Quick start

1. **Fork and clone**

   ```bash
   git clone https://github.com/YOUR-USERNAME/accessibility-text-enhancer.git
   cd accessibility-text-enhancer
   git checkout -b fix/short-description
   ```

2. **Load the extension**
   - Open `chrome://extensions/`
   - Turn on **Developer mode**
   - Choose **Load unpacked** and select the project folder
   - After changing a content script or the manifest, reload the extension card, then refresh the test page

3. **Make one focused change**
   - Keep unrelated formatting and refactors out of the same pull request.
   - Reuse the existing modules and helpers before adding new ones.
   - Do not add permissions, host permissions, dependencies, remote code, or network requests.

4. **Test it**
   - Exercise the changed flow on at least one real page.
   - Check keyboard-only use, focus order, labels/roles/state, forced-colors, and a narrow window.
   - If the change affects announcements, follow the relevant rows in [`docs/smoke-test.md`](docs/smoke-test.md) with NVDA.
   - Include the checks you ran in the pull request.

5. **Open a pull request**
   - Use the pull request template, including the accessibility impact.
   - Describe what changed, why, and what you tested.
   - Do not bump the version unless the pull request is a release.

## Ways to help

- **Bug reports:** search the existing issues, then use the bug template. Include the extension version, Chrome version, operating system, steps, and a public URL or minimal reproduction.
- **Accessibility barriers:** use the [accessibility barrier template](https://github.com/FrankenSama/accessibility-text-enhancer/issues/new?template=accessibility_barrier.yml). Barriers are treated as bugs. Read [`ACCESSIBILITY.md`](ACCESSIBILITY.md) first for supported environments and known limits.
- **Feature ideas:** open a focused issue describing the reader problem and why it matters. Large features should be discussed before implementation.
- **Documentation:** fixing unclear setup, limitations, or examples is as useful as code.
- **Security:** report privately using [`SECURITY.md`](SECURITY.md), never in a public issue.

## Pull request checklist

- [ ] The change is focused and does not include unrelated rewrites.
- [ ] No new permissions, host permissions, network requests, telemetry, or remote code.
- [ ] The page is not modified without a user action.
- [ ] Keyboard and screen-reader paths still work; labels, roles, and pressed/expanded state are correct.
- [ ] Forced-colors, dark/light, 320 px width, and 200% zoom do not hide controls or text.
- [ ] Existing selection, undo/redo, Reset page, and site-rule behavior still work.
- [ ] Docs are updated when behavior, settings, or limitations change.
- [ ] The pull request says what you tested and on which browser.

## Code style

- Modern JavaScript, four-space indentation, semicolons, and single quotes.
- Prefer small functions with descriptive names and a short JSDoc block when the purpose is not obvious.
- Keep pure logic (text, language, contrast, defaults) free of DOM and `chrome` APIs so it stays testable.
- Reuse the current state, command, history, and preference helpers instead of adding parallel paths.
- CSS is scoped to the extension's own IDs/attributes; the page must keep its own layout, fonts, and reading order.
- Do not paste code, fonts, or assets with a license that conflicts with the GPLv3.

Commit subjects follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(reading): continue from the caret
fix(translate): restore the original after a page re-render
docs: simplify the contributor guide
```

## Community

This project follows the [Contributor Covenant, version 2.1](CODE_OF_CONDUCT.md). Be respectful, assume good faith, and keep discussion focused on the reader impact. Report unacceptable behavior privately through the contact details on the maintainer's GitHub profile rather than in a public issue.

## License

By contributing, you agree that your contribution is licensed under the [GNU General Public License v3.0 (only)](LICENSE). You retain copyright to your own work. There is no copyright assignment and no sign-off requirement. If you reuse code from elsewhere, make sure its license is compatible and say where it came from.
