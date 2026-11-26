## What changed

<!-- A short description of the change and the user-visible effect. -->

## Why

<!-- The problem being fixed, or the reason for the change. Link the issue if there is one. -->

## Type of change

- [ ] Bug fix
- [ ] Accessibility fix
- [ ] New feature
- [ ] Refactor or internal change
- [ ] Documentation or release work

## Accessibility impact

- [ ] Keyboard path checked, including focus order and Escape
- [ ] Accessible names, roles, and `aria-pressed` state checked
- [ ] Announcements checked; no duplicate or missed live-region output
- [ ] Windows High Contrast / forced-colors checked
- [ ] Undo, redo, and Reset page still restore the page exactly
- [ ] Not applicable - no UI or command changes

If UI or keyboard handling changed, note the manual screen-reader result here,
or say that it is still pending:

## Testing

<!-- What you ran and what you tested by hand. Include pages or a test case. -->

- [ ] `node --check` passes for the changed scripts
- [ ] Manual checks described, or the maintainer harness pass count if available
- [ ] Tested in Chrome at the minimum supported version or reason it was not
- [ ] Tested on more than one site, including one with unusual layout or CSS

## Checklist

- [ ] No new permissions, host permissions, or network requests
- [ ] Docs updated where behaviour, settings, or limitations changed
- [ ] Version number left alone (release pull requests only)
- [ ] Code and assets are GPLv3-compatible; bundled fonts keep their own licence
- [ ] I have read [CONTRIBUTING.md](CONTRIBUTING.md), the [development guide](docs/development.md), and the [Code of Conduct](CODE_OF_CONDUCT.md)
