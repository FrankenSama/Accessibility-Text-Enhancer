# Screen-reader smoke test

A short manual pass with a real screen reader before each release. It checks what
the browser's accessibility tree and the screen reader actually announce, which
the automated harness cannot verify.

Run it after any change to the toolbar, the settings dialog, keyboard handling,
or the reading assistant.

## Current coverage

| Platform | Screen reader | Status |
|----------|---------------|--------|
| Windows | NVDA 2026.3 | Verified for v1.3.0 on 2026-11-06 |
| macOS | VoiceOver | Not tested — no macOS hardware available |
| Linux | Orca | Not tested — no Linux environment available |

Only the Windows/NVDA path has been run. The macOS and Linux steps below are
kept so a future tester can complete them, but do not describe the extension as
VoiceOver- or Orca-verified until those rows are updated.

## Setup

1. Load the current build as an unpacked extension:
   - Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**,
     and select the repository root.
   - Confirm the popup footer shows the version you are testing.
2. Open a page with several paragraphs and at least one form control. The
   repository's `index.html` served locally, or any article page, is enough.
3. Use a real screen reader:
   - **Windows:** NVDA with Chrome.
   - **macOS:** VoiceOver with Chrome (`Cmd+F5` to start).
   - **Linux:** Orca with Chrome.
4. Start with default settings. Repeat the settings and reading sections after
   changing voice, speed, and pitch if those changes are part of the release.

The extension's reading feature uses the browser's `speechSynthesis`, which is
independent of the screen reader. Both can speak at once. Treat overlapping
speech as a known limitation, but note it in the results if it makes the feature
unusable.

## Automated pre-checks

These should already be green before the manual pass:

- `node --check content-scripts/content.js`
- The module files in `content-scripts/` are ES modules; the release browser
  harness parses and exercises them.
- `node --check background.js`
- `node --check popup/popup.js`
- `node --check options/options.js`
- The release browser harness and its reading, popup, options, shortcut,
  tooltip, and popup-layout checks.

## Toolbar

| # | Step | Expected |
|---|------|----------|
| T1 | Select a word. | The toolbar appears. It does not steal focus from the page or interrupt the screen reader. |
| T2 | Press `Ctrl+Shift+F` (`Cmd+Shift+F` on macOS). | Focus moves to the toolbar. The screen reader announces the toolbar and the focused button. |
| T3 | Press `Right` / `Left` / `Home` / `End`. | Each button is announced as it receives focus. There is one tab stop; `Tab` leaves the toolbar. |
| T4 | Activate Bold and Highlight. | Each button announces its pressed state. Repeating the command updates the announcement. |
| T5 | Activate Undo and Redo. | The announced disabled state matches the button state, and each message names the command, for example “Undone: Bold” or “Redone: Highlight”. Undo is disabled when there is nothing to undo. |
| T6 | Press `Escape` while the toolbar has focus. | The toolbar closes and focus returns to the page sensibly. |

## Settings dialog

| # | Step | Expected |
|---|------|----------|
| S1 | Open Settings from the toolbar. | Focus moves into the dialog. The dialog name is announced. |
| S2 | Tab through the controls. | Voice is announced as a combobox or popup button with its current value. Speed and Pitch are announced as sliders with their values. |
| S3 | Change Speed and Pitch. | The new numeric value is announced. |
| S4 | Change Voice. | The selected voice and language are announced. |
| S5 | Press `Escape`, or activate Close. | The dialog closes and focus returns to the Settings button. |
| S6 | Activate Preview voice. | A short sample is spoken with the current voice, speed, and pitch. No reading session starts. |
| S7 | Activate Reset to defaults. | Voice returns to Automatic, Speed to 0.9, and Pitch to 1.0. A reset confirmation is announced. |

## Reading settings page

| # | Step | Expected |
|---|------|----------|
| O1 | Open **Reading settings** from the popup. | The settings page opens in a tab. Voice, Speed, and Pitch are announced with their current values. |
| O2 | Change Voice, Speed, and Pitch, then activate Preview voice. | The sample uses the new settings, and the status message is announced. |
| O3 | Activate Reset to defaults. | Controls return to Automatic, 0.9, and 1.0, and the reset confirmation is announced. |

## Notifications

| # | Step | Expected |
|---|------|----------|
| N1 | Trigger a notification, for example by selecting text and pressing Bold. | The message is announced once and fades after about two seconds. |
| N2 | Trigger the same notification again. | The message is announced again rather than being treated as unchanged text. |
| N3 | Trigger an error, for example by activating Read Aloud where speech synthesis is unavailable. | The message is announced and stays visible noticeably longer than a regular notification. |

## Reading assistant

| # | Step | Expected |
|---|------|----------|
| R1 | Select a sentence and press `Alt+Shift+R` (`Option+Shift+R` on macOS). | Reading starts. The read button is now announced as Pause Reading, and a Stop Reading control is available. |
| R2 | Tab to the read button and activate it. | Reading pauses. The button is announced as Resume Reading. Activate it again to resume. |
| R3 | Navigate to Stop Reading and activate it. | Reading stops. The read button returns to Read Aloud and the stop control is no longer announced. |
| R4 | Repeat R1, then press `Escape` on the page. | Reading stops without disturbing the page's own Escape handling when focus is in an editable region. |
| R5 | Place the caret inside a paragraph with nothing selected and press `Alt+Shift+R`. | The paragraph is read, and the transport controls are reachable without a prior selection. |
| R6 | While reading, inspect the current sentence. | The sentence is visually highlighted. The screen reader still reads the same page text and the virtual cursor does not move unexpectedly. |
| R7 | Stop reading, then inspect the page. | The reading highlight is gone. The page DOM is otherwise unchanged. |
| R8 | Start a reading, then check Undo. | Reading creates no undo entry; Undo remains disabled or unchanged. |
| R9 | Start a reading in a long section. | Speech continues through the section instead of cutting off after the first sentence. A paragraph is read as one continuous utterance, and the highlight follows each sentence as it is spoken. |

## Page integrity

| # | Step | Expected |
|---|------|----------|
| P1 | Select text inside an input, textarea, or `contenteditable` region and press the Bold, Highlight, or Read shortcut. | The page's native behaviour is preserved; the extension does not modify the editable content. |
| P2 | Use the page's own keyboard shortcuts while the toolbar is closed. | They still work. The extension only captures its own shortcuts. |
| P3 | Toggle the extension off, then select text. | No toolbar appears, and no extension UI remains on the page. |

## Results

Record one row per run. Keep the announced text for any failure; it is usually
what identifies the defect.

| Build | OS | Chrome | Screen reader | Tester | Date | Toolbar | Settings | Reading | Page | Notes |
|-------|----|--------|---------------|--------|------|---------|----------|---------|------|-------|
| v1.3.0 | Windows 11 Home 26200 | 156.0.8078.47 | NVDA 2026.3 (Portuguese UI) | Maintainer | 2026-11-06 | Pass with notes | Pass | Pass with notes | Not run | NVDA covered T1–T4, S1–S5, and R1–R5. Page integrity was covered by the automated harness, not by NVDA. |

Use **Pass**, **Pass with notes**, or **Fail** for each section.

## Latest run

| Check | Date | Environment | Result |
|-------|------|-------------|--------|
| Automated accessibility-tree snapshot | 2026-11-06 | Chrome 156 headless on Windows, real extension build | 21/21 checks pass |
| NVDA manual pass | 2026-11-06 | Windows 11 Home 26200, Chrome for Testing 156.0.8078.47 headed with `--force-renderer-accessibility`, NVDA 2026.3 (Portuguese UI) | Pass with notes |
| VoiceOver manual pass | — | macOS | Not tested — no macOS hardware available |
| Orca manual pass | — | Linux | Not tested — no Linux environment available |

The automated snapshot verifies that the toolbar, settings dialog, sliders, voice
combobox, and reading controls expose their roles, names, pressed states, and
values, and that the hidden stop button is absent from the tree while idle. It
does not replace hearing the announcements with a real screen reader.

The NVDA pass used the unpacked extension on a local test page with the Speech
Viewer transcript captured. It confirmed:

- `T1`–`T4`: the toolbar appears on selection without taking focus; its name,
  the focused button, and arrow-key traversal are announced; Bold reports
  **not pressed**, then **pressed**, then **not pressed** after Undo.
- `S1`–`S5`: the dialog is announced as a window, Close receives focus, and
  Voice, Speed, and Pitch are announced as a combobox and sliders with their
  values. Changing Speed, Pitch, and Voice announces the new value. `Escape`
  closes the dialog and returns focus to Settings.
- `R1`–`R4`: reading start announces **Pause Reading** and exposes **Stop
  Reading**; pause and resume announce **Resume Reading** and **Pause
  Reading**; Stop returns the button to **Read Aloud** and removes the stop
  control; `Escape` stops an active reading.
- `R5`: caret reading starts and creates the transport controls and sentence
  highlight. Focus stays on the page, so the label change is not announced
  automatically; this matches `T1` and is expected.

Not exercised separately with NVDA: `T5`–`T6`, `P1`–`P3`, and `R6`–`R9`.
Those paths are covered by the browser harness, which also passed 33 reading
checks, 75 page checks, and the popup, shortcut, tooltip, and layout checks.

Only the Windows/NVDA path is verified for v1.3.0. VoiceOver and Orca remain
open, and no macOS or Linux environment is currently available to the
maintainer. Run the same checklist on those platforms before claiming support;
results, including a VoiceOver caption-panel transcript (`VO-Fn-Command-F10`),
are welcome in an issue.

## Reporting failures

Include:

- Extension version, OS, Chrome version, and screen-reader name/version.
- The checklist ID (for example `R2`).
- What was announced, and what you expected instead.
- Whether the page had any console errors.
- Whether the problem reproduces with the screen reader's browse mode on and off.
