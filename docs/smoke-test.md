# Screen-reader smoke test

A short manual pass with a real screen reader before each release. It checks what
the browser's accessibility tree and the screen reader actually announce, which
the automated harness cannot verify.

Run it after any change to the toolbar, the settings dialog, keyboard handling,
or the reading assistant.

## Current coverage

| Platform | Screen reader | Status |
|----------|---------------|--------|
| Windows | NVDA 2026.3 | Verified for v1.3.0 on 2026-11-06; v1.6.0 Speech Viewer pass on 2026-11-24 (37/37); v1.7.0 in-place translation Speech Viewer pass on 2026-11-26 (13/13); v1.8.0 reading-flow Speech Viewer pass on 2026-11-26 (17/17) |
| macOS | VoiceOver | Not tested — no macOS hardware available |
| Linux | Orca | Not tested — no Linux environment available |

Only the Windows/NVDA path has been run. The macOS and Linux steps below are
kept so a future tester can complete them, but do not describe the extension as
VoiceOver- or Orca-verified until those rows are updated.

v1.5.1 brings the full settings suite into the toolbar dialog: **Text styling** (font, spacing preset or four custom sliders, highlight colour and style, a live preview, and reset) and **Site rules** (the list, per-rule removal, and a two-step clear-all) now match the options page. v1.5.0 added those controls to the options page and made the font, spacing, and highlight commands apply the saved defaults. v1.4.1 turned the options page into the settings hub and shared the settings file logic with the in-page dialog. v1.4.0 moved the theme and reading preferences to synced storage, added per-site on/off rules, Reset page, and a schema 2 settings export, on top of the v1.3.2 toolbar placement, dismiss button, and High Contrast styling. v1.6.0 adds focus mode and the reading ruler as transient overlays. v1.7.0 adds in-place selection translation. v1.8.0 adds continuous reading from the caret or a shift-click, sentence navigation, auto-scroll, built-in reading presets, a caret-following ruler, and adjustable focus dim. The v1.6.0 NVDA pass captured the toolbar, settings, reading, focus mode, and ruler through the Speech Viewer (37/37); the v1.7.0 pass covered translation (13/13); the v1.8.0 pass covered continuous reading and the reading presets (17/17); a live listening pass has not been repeated since v1.3.0.

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
| T7 | Move to the last toolbar button with `End` and activate it, or click the ✕ button. | The toolbar closes, “Toolbar dismissed” is announced, and the page selection is left in place. Pressing `Ctrl+Shift+F` (`Cmd+Shift+F`) brings the toolbar back for the same selection. |
| T8 | Select text near the top of the page, then text in the middle of the viewport, then text at the bottom. | The toolbar appears below the selection when there is no room above, and above it otherwise. It stays fully inside the viewport at both edges and never covers the selected text. |
| T9 | Place the caret in a paragraph and press `Alt+Shift+Up`. | The paragraph is selected, "Paragraph selected" is announced, and the toolbar follows the new range. |
| T10 | Place the caret in a sentence and press `Alt+Shift+Down`; repeat inside a text field. | The sentence is selected and announced. Inside a text field the shortcut keeps the page's native behaviour. |

## Reading aids

| # | Step | Expected |
|---|------|----------|
| A1 | Select a paragraph and activate **Focus mode**. | Everything except the paragraph dims, the button reports pressed, and “Focus mode on” is announced. The page text and the paragraph's own styling are unchanged. |
| A2 | Click into another paragraph, then scroll and resize the window. | The spotlight follows the caret or selection and stays aligned with the block. Moving to a block that has scrolled completely out of view hides the spotlight rather than dimming an unrelated page. |
| A3 | Activate **Reading ruler**. | A translucent band appears and follows the pointer, the button reports pressed, and “Reading ruler on” is announced. The band ignores clicks. |
| A4 | Press `Escape` with both aids on. | Both aids turn off, “Reading aids off” is announced, and the toolbar stays open. A second `Escape` closes the toolbar. |
| A5 | Turn both aids on, then activate the toolbar's ✕ button. | Both aids and the toolbar are removed, and “Reading aids off” is announced once. |
| A6 | Turn both aids on, open Settings, then close it. | The dialog sits above the aids; closing it leaves the aids and the toolbar in place. |
| A7 | Toggle focus mode and the ruler with `Alt+Shift+D` and `Alt+Shift+L` (`Option+Shift` on macOS), then repeat inside a text field. | The shortcuts toggle the aids and are ignored in inputs, text areas, and editable regions. |
| A8 | Turn both aids on, then disable the extension from the popup. | Both overlays and the toolbar disappear. |
| A9 | With a screen reader running, turn both aids on. | The buttons announce their names and pressed state; the overlays add no stop, no name, and no page text to the accessibility tree. |
| A10 | Turn on Windows High Contrast and repeat A1, A3, and A6. | The spotlight becomes a visible system-colour outline, the ruler uses system-colour rules, and the settings dialog remains above both. |

## High contrast

Turn on Windows High Contrast (or emulate `forced-colors: active` in DevTools) and repeat each step.

| # | Step | Expected |
|---|------|----------|
| H1 | Select text and inspect the toolbar. | Every button keeps a visible border and system text colour. Toggle buttons that are on show a highlight border instead of a solid colour block, and disabled Undo/Redo stay readable. |
| H2 | Open Settings, then the popup, then Settings. | Panels, controls, and focus rings keep visible borders and system colours; no text disappears against its background. |
| H3 | Trigger a notification and read aloud. | The notification and the sentence highlight stay legible against the page background. |

## Settings dialog

| # | Step | Expected |
|---|------|----------|
| S1 | Open Settings from the toolbar. | Focus moves into the dialog. The dialog name is announced. |
| S2 | Tab through the controls. | Font, Spacing preset, and Highlight colour are announced as comboboxes or popup buttons with their current values; Highlight style is announced with its choice. Letter spacing, Word spacing, Line height, and Paragraph spacing are announced as sliders with their values and units when Custom is selected. Voice is announced as a combobox or popup button with its current value. Speed and Pitch are announced as sliders with their values. |
| S3 | Change Speed and Pitch. | The new numeric value is announced. |
| S4 | Change Voice. | The selected voice and language are announced. |
| S5 | Press `Escape`, or activate Close. | The dialog closes and focus returns to the Settings button. |
| S6 | Activate Preview voice. | A short sample is spoken with the current voice, speed, and pitch. No reading session starts. |
| S7 | Activate Reset to defaults. | Voice returns to Automatic, Speed to 0.9, and Pitch to 1.0. A reset confirmation is announced. |
| S8 | Apply two changes, open Settings, and activate Reset page changes twice. | The first press arms the button and announces "Press Reset page changes again to confirm"; the second removes both changes, closes the dialog, and the toolbar's Undo button is disabled. |
| S9 | In the popup, set **This site** to Always off, reload, and select text. | No toolbar appears, the badge shows `OFF`, and the global switch stays on. Setting it back to Use global setting restores the toolbar. |
| S10 | Change Font, Spacing preset, Highlight colour, and Highlight style in the dialog. | The sample sentence in Preview takes the new font, spacing, colour, and style. The choices apply to the next command after closing the dialog. |
| S11 | Choose the Custom spacing preset, then move each slider. | The four sliders appear and their output labels announce the value with its unit (`em`, or a unitless line height). The values are saved when each slider is released. |
| S12 | Set Highlight style to Background, then Force background. | Background shows a fill only when the text stays readable, otherwise an underline. Force background paints the fill even at low contrast. |
| S13 | Activate Reset text styling. | Font, spacing, and highlight return to the shipped defaults, the sample updates, and the reset confirmation is announced. |
| S14 | Add two site rules in the popup, then open Settings in the toolbar. | Both rules are listed with their origins and Always on/off, and the count reads 2 of 100. Remove one with its Remove button; the list updates and the removal is announced. |
| S15 | Activate Clear all site rules twice. | The first press arms the button and announces the confirmation prompt; the second removes the remaining rule, announces the result, and disables the button. |
| S16 | With the dialog open, change text styling or a site rule in the options page in another tab. | The dialog's controls and list update to the new values without closing. |
| S17 | Type "voice" in **Search settings**, then press `Escape` and activate **Clear**. | Only Reading aloud stays visible, the Voice row remains, and "1 setting matches" is announced. `Escape` clears the filter without closing the dialog; **Clear** does the same and returns focus to the field. No setting changes. |

## Settings page

| # | Step | Expected |
|---|------|----------|
| O1 | Open **Settings** from the popup. | The settings page opens in a tab. The page name and each section heading are announced, and Voice, Speed, and Pitch are announced with their current values. |
| O2 | Change Voice, Speed, and Pitch, then activate Preview voice. | The sample uses the new settings, and the status message is announced. |
| O3 | Activate Reset reading settings. | Controls return to Automatic, 0.9, and 1.0, and the reset confirmation is announced. |
| O4 | Change Toolbar theme to Light, then select text on a page. | The toolbar and its settings dialog use the light theme. The choice survives a reload and follows the Chrome profile. |
| O5 | Set **This site** to Always off in the popup, then open Settings. | The site rule is listed with its origin and **Always off**, and the count reads 1 of 100. Remove it with its Remove button; the list empties and the removal is announced. |
| O6 | Add two site rules, activate Clear all site rules twice. | The first press arms the button and announces the confirmation prompt; the second removes both rules, announces the result, and disables the button. |
| O7 | Activate Export settings, then Import settings and choose the exported file. | A versioned JSON file downloads, the import is announced, and the controls keep the same values. |
| O8 | Import a settings file written before v1.4.0. | The older file imports its preferences, its missing site rules leave the current rules alone, and the result is announced. |
| O9 | Change Font to OpenDyslexic, then select text on a page and activate Font. | The paragraph uses OpenDyslexic, the announcement names it, and a second press restores the page's own font. |
| O10 | Set Spacing to Custom, adjust letter spacing, then apply Spacing to text. | The paragraph uses the custom values, the announcement names the preset, and a second press removes them. |
| O11 | Set Highlight style to Underline and colour to Blue, then highlight text. | The selection is underlined rather than painted, and the announcement names the style. |
| O12 | Activate Reset text styling. | Font, spacing, and highlight return to the shipped defaults and the reset confirmation is announced. |
| O13 | Import a schema 2 settings file after changing the text defaults. | The current font, spacing, and highlight defaults are preserved, and the import result is announced. |
| O14 | Type "zzz" in **Search settings** on the options page, then press `Escape`. | Every card is hidden and "No settings match" is announced. `Escape` clears the filter, all cards return, and focus stays in the field. |

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

## Translation

| # | Step | Expected |
|---|------|----------|
| TR1 | Select text and activate **Translate** (or press `Alt+Shift+G`). | On first use, the language bubble opens, focus moves into it, and the source/target pair is announced. Once a target is saved, Translate starts directly. |
| TR2 | Choose a target and activate **Translate**. | "Preparing language pack." is announced; percentage progress follows when Chrome reports it; **Cancel** stops the request. |
| TR3 | Wait for the replacement. | The selected text is replaced in place by the translation. The translated text is selected, carries the target language and direction, has a dotted underline, and "Translated to…" is announced. |
| TR4 | Press **Translate** again (now **Show original**). | The original text returns, the button becomes Translate, and "Original text restored" is announced. |
| TR5 | Undo, Redo, then Reset page. | Undo restores the original; Redo re-applies the translation; Reset page restores it and closes the settings dialog. |
| TR6 | Shift-click Translate, then select across two paragraphs and translate. | Shift-click replaces the whole paragraph; a cross-block selection translates every block and applies as one undoable change. |
| TR7 | Change the target in Settings or the options page, then translate. | The toolbar tooltip names the new target, and the next translation uses it. |
| TR8 | Force a download failure or choose an unsupported pair. | The failure is announced and **Try again** is offered when retrying can help. |
| TR9 | Select more than 5,000 characters across one or more blocks. | The bubble reports the total character count, suggests a smaller selection or Shift-click, and translates nothing. |
| TR10 | Select text inside a link or emphasis, then translate and restore. | The link target or emphasis stays around the translation; restoring brings the original markup back. |
| TR11 | Translate into a right-to-left language. | The translated text follows `dir="auto"`; the page flow may reflow, but the direction is correct. |
| TR12 | Read the translated text with Read Aloud. | It is spoken with the target language and a matching voice. |
| TR13 | Open a plain `http://` page. | The Translate button is absent; the shortcut explains that Chrome 138+ on desktop, on an HTTPS page, is required. |
| TR14 | Turn on Windows High Contrast and translate. | The bubble uses system colours; the translation mark uses the system Highlight colour and stays inline. |
| TR15 | Select two paragraphs and translate. | "Translating paragraph 1 of 2" is announced, both blocks are replaced, and the result names the count and target. One Undo restores both; one Redo re-applies both. |
| TR16 | Select across paragraphs, a list, a quote, and table cells. | Every block is translated, list items and cells keep their structure, and one Undo restores the whole group. |
| TR17 | Make the second block fail during a group translation. | The error names paragraph 2, the page is unchanged, and **Try again** applies the whole group. |
| TR18 | Cancel a group translation while it is in progress. | The request stops, the page is unchanged, and "Translation cancelled" is announced. |
| TR19 | Open the language bubble and activate **Swap languages**. | From and To exchange, the detected source becomes the new target, and the swap is announced without translating. |
| TR20 | With text selected, press `Alt+Shift+S`, change the target, then translate; repeat on a translated block. | The bubble opens without translating, keeps the saved target, and the second use re-translates the block from its original text. |
| TR21 | Translate two blocks, select both wrappers, and press Translate. | Both wrappers are restored in one action, and one Undo re-applies both translations. |

The translation rows were added with v1.7.0; the 2026-11-26 in-place pass covered them (13/13).

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
| v1.6.0 (Speech Viewer) | Windows 11 Home 26200 | 156.0.8078.47 | NVDA 2026.3 (Portuguese UI) | Maintainer | 2026-11-24 | Pass | Pass | Pass | Not run | 37/37 captured announcements covering the toolbar, settings, reading, focus mode, ruler, shortcuts, and Escape order. Page integrity was covered by the automated harness, not by NVDA. |
| v1.7.0 in-place translation (Speech Viewer) | Windows 11 Home 26200 | 156.0.8078.47 | NVDA 2026.3 (Portuguese UI) | Maintainer | 2026-11-26 | Pass | Not run | Not run | Not run | 13/13 captured announcements covering the Translate button, first-use language bubble (`From`/`To`), language-pack progress, in-place replacement and Show original, restore, Undo/Redo, cross-block rejection, the 5,001-character error, and Escape. Toolbar, settings, and reading were covered by the v1.6.0 pass; page integrity by the automated harness. |
| v1.8.0 reading flow (Speech Viewer) | Windows 11 Home 26200 | 156.0.8078.47 | NVDA 2026.3 (Portuguese UI) | Maintainer | 2026-11-26 | Pass | Not run | Not run | Not run | 17/17 captured announcements covering the Read Aloud button, caret and shift-click continuation, Space pause/resume, Stop, the settings dialog, the Comfortable preset, ruler follows, focus dim, Escape, and the focus-mode/ruler shortcuts. Continuous speech and auto-scroll were covered by the automated reading-flow suite; a live listening pass was not run. |

Use **Pass**, **Pass with notes**, or **Fail** for each section.

## Latest run

| Check | Date | Environment | Result |
|-------|------|-------------|--------|
| Automated accessibility-tree snapshot | 2026-11-16 | Chrome 156 headless on Windows, real extension build | 23/23 checks pass |
| Automated forced-colors and QoL checks | 2026-11-16 | Chrome 156 headless on Windows, real extension build, emulated `forced-colors: active` | 28/28 QoL checks pass; toolbar, settings, popup, and settings page use system colours |
| Automated v1.4.0 checks | 2026-11-16 | Chrome 156 headless on Windows, real extension build | 27/27 sync, site-rule, reset, and export checks pass |
| Automated v1.4.1 checks | 2026-11-17 | Chrome 156 headless on Windows, real extension build | 37/37 settings-hub, site-rule, backup/restore, and popup checks pass; options suite 46/46 |
| Automated v1.5.0 checks | 2026-11-19 | Chrome 156 headless on Windows, real extension build | 57 style-default unit checks; 64 text-default browser checks; 20 font-loading checks over ordinary, strict-CSP, file://, and blocked-font pages; options suite 89/89 |
| Automated v1.5.1 checks | 2026-11-23 | Chrome 156 headless on Windows, real extension build | 36 in-page settings checks covering text styling, preview, persistence, reset, and site rules; options suite 91/91; full harness 615 pass with only the known bogus `check-coverage` line |
| Automated v1.6.0 checks | 2026-11-24 | Chrome 156 headless on Windows, real extension build | 105 focus-mode, ruler, toolbar, accessibility-tree, forced-colors, and regression checks pass; full harness 815 pass, 0 fail |
| Automated v1.7.0 checks | 2026-11-25 | Chrome 156 headless on Windows, script-tag build with a fake Translator plus the real-extension regressions | 165 translation unit checks and 65 in-place translation browser checks pass (first-use bubble, wrapper `lang`/`dir`, dotted mark, toggle/undo/redo/reset, reset after a nested translation, Shift paragraph, cross-block rejection, link context, same-language proposal, cleared target, second activation, clicking the bubble text, cap, network retry, cancel, target settings, hostile CSS, print, forced colours, Read Aloud language, and reload); full harness 1,058 pass, 0 fail |
| Automated v1.8.0 checks | 2026-11-26 | Chrome 156 headless on Windows, script-tag build plus the real-extension settings regressions | 17 continuous-reading checks (caret and shift-click continuation, article boundary, sentence navigation, auto-scroll, Space pause/resume, focus follow), 56 in-page settings checks (presets, ruler source, focus dim, reset), and 104 options checks; full harness 1,109 pass, 0 fail |
| Packaged v1.7.0 verification | 2026-11-25 | Chrome 156 headless on Windows, extracted package | 28/28 package checks pass: manifest 1.7.0, in-place translation modules, Translate button, target settings, options and popup versions, fonts, reading aids, and no page errors |
| Packaged v1.8.0 verification | 2026-11-26 | Chrome 156 headless on Windows, extracted package | 30/30 package checks pass: manifest 1.8.0, reading-profile module, reading presets, ruler source and focus dim in both settings surfaces, in-place translation, fonts, popup, and no page errors |
| Packaged v1.8.1 verification | 2026-11-26 | Chrome 156 headless on Windows, extracted package | 31/31 package checks pass: manifest 1.8.1, GPLv3 LICENSE, reading presets, ruler source and focus dim, in-place translation, fonts, popup, and no page errors |
| NVDA pass (Speech Viewer) | 2026-11-24 | Windows 11 Home 26200, Chrome for Testing 156.0.8078.47 headed with `--force-renderer-accessibility`, NVDA 2026.3 (Portuguese UI) | 37/37 captured announcements pass; toolbar, settings, reading, focus mode, ruler, shortcuts, and Escape order |
| NVDA v1.8.0 reading flow (Speech Viewer) | 2026-11-26 | Windows 11 Home 26200, Chrome for Testing 156.0.8078.47 headed with `--force-renderer-accessibility`, NVDA 2026.3 (Portuguese UI) | 17/17 captured announcements pass; continuous reading, Space, presets, ruler source, focus dim, and aid shortcuts |
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

Only the Windows/NVDA path is verified, and the latest full manual pass was
v1.3.0. VoiceOver and Orca remain open, and no macOS or Linux environment is
currently available to the maintainer. Run the same checklist on those
platforms before claiming support; results, including a VoiceOver caption-panel
transcript (`VO-Fn-Command-F10`), are welcome in an issue.

## Reporting failures

Include:

- Extension version, OS, Chrome version, and screen-reader name/version.
- The checklist ID (for example `R2`).
- What was announced, and what you expected instead.
- Whether the page had any console errors.
- Whether the problem reproduces with the screen reader's browse mode on and off.
