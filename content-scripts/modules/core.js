// Shared constants and the single mutable STATE object.

import { DEFAULT_TEXT_DEFAULTS } from './style-defaults.js';

// ==================== STATE MANAGEMENT ====================

const IS_MAC = /mac/i.test(
    navigator.userAgentData?.platform || navigator.platform || ''
);

export const STATE = {
    savedRange: null,
    // The on/off switch as the user set it. The effective state for this page
    // also depends on the site rule, so it lives in isExtensionEnabled.
    globalEnabled: true,
    isExtensionEnabled: true,
    origin: null,
    siteRules: {},
    isDarkMode: true,
    history: [],
    historyIndex: -1,
    // First-seen state of every element the extension changed, so Reset page
    // can put the page back even after those entries left the undo history.
    originals: new Map(),
    toolbarTimeout: null,
    positionFrame: null,
    isApplyingCommand: false,
    // Reading preferences. Speech itself lives outside the undo history
    // because it never changes the page.
    ttsVoice: '',
    ttsRate: 0.9,
    ttsPitch: 1,
    // Font, spacing, and highlight choices used by the next command. The
    // options page and the in-page dialog write them through storage.sync.
    textDefaults: { ...DEFAULT_TEXT_DEFAULTS },
    voices: [],
    speech: null,
    // Transient reading aids. They live for this page session only and never
    // touch the undo history.
    focusMode: false,
    readingRuler: false,
    rulerSource: 'both',
    focusDim: 55,
    focusBlock: null,
    // Selection translation. The panel/bubble is transient; translations that
    // are already in the page are undoable records in STATE.translations.
    translationBubbleOpen: false,
    translationTarget: '',
    translations: new Map(),
    // Focus Toolbar is a manifest command. These defaults are replaced with
    // the user's actual binding once the background worker responds.
    focusToolbarShortcut: IS_MAC ? 'Cmd+Shift+F' : 'Ctrl+Shift+F',
    focusToolbarAriaShortcut: IS_MAC ? 'Meta+Shift+F' : 'Control+Shift+F'
};

export const CONFIG = {
    toolbarId: 'accessibility-toolbar',
    settingsPanelId: 'accessibility-settings-panel',
    settingsOverlayId: 'accessibility-settings-overlay',
    translationBubbleId: 'accessibility-translation-bubble',
    translationAttr: 'data-atx-translation',
    focusOverlayId: 'accessibility-focus-overlay',
    readingRulerId: 'accessibility-reading-ruler',
    highlightAttr: 'data-accessibility-highlight',
    fontAttr: 'data-atx-font',
    spacingAttr: 'data-atx-spacing',
    selectionAttr: 'data-atx-selection',
    selectionDelay: 150,
    toastId: 'accessibility-toast',
    toastDuration: 2000,
    // Errors stay on screen longer so they are not missed.
    toastErrorDuration: 6000,
    maxHistorySize: 50,
    maxWrapNodes: 200,
    // Version of the exported settings file. Bump it whenever the shape
    // changes so import can migrate older files.
    settingsSchemaVersion: 5,
    // Cap on stored site rules. storage.sync allows 8 KB per item, and 100
    // origin strings stay comfortably under that even for long hostnames.
    maxSiteRules: 100,
    // Must match the toolbar max-width in content.css.
    toolbarMaxWidth: 520,
    fontSizeMin: 8,
    fontSizeMax: 50,
    // Reading a whole paragraph in one utterance avoids the pause every
    // voice engine inserts between utterances. The limit only exists as a
    // guard for unusually long text; desktop Chrome speaks a thousand
    // characters without truncating.
    maxSpeechChunkLength: 1000,
    // Translation input cap. Longer selections are reported, never truncated.
    translationMaxChars: 5000,
    readingHighlightName: 'atx-reading',
    defaultTtsRate: 0.9,
    defaultTtsPitch: 1,
    minTtsRate: 0.5,
    maxTtsRate: 2,
    minTtsPitch: 0.5,
    maxTtsPitch: 2
};

// Keep shortcut hints in sync with the platform, so macOS users are not
// told to press Windows modifiers.
export const SHORTCUT_LABELS = {
    undo: IS_MAC ? 'Cmd+Z' : 'Ctrl+Z',
    redo: IS_MAC ? 'Cmd+Y' : 'Ctrl+Y',
    bold: IS_MAC ? 'Option+Shift+B' : 'Alt+Shift+B',
    highlight: IS_MAC ? 'Option+Shift+H' : 'Alt+Shift+H',
    read: IS_MAC ? 'Option+Shift+R' : 'Alt+Shift+R',
    continueReading: IS_MAC ? 'Option+Shift+C' : 'Alt+Shift+C',
    focusMode: IS_MAC ? 'Option+Shift+D' : 'Alt+Shift+D',
    readingRuler: IS_MAC ? 'Option+Shift+L' : 'Alt+Shift+L',
    translate: IS_MAC ? 'Option+Shift+G' : 'Alt+Shift+G',
    // The reading ruler already owns L, so language setup uses S.
    language: IS_MAC ? 'Option+Shift+S' : 'Alt+Shift+S',
    selectParagraph: IS_MAC ? 'Option+Shift+Up' : 'Alt+Shift+Up',
    selectSentence: IS_MAC ? 'Option+Shift+Down' : 'Alt+Shift+Down'
};

// ARIA keyshortcuts use the platform-neutral Alt name; on macOS the Option
// key is the Alt key.
export const SHORTCUT_ARIA = {
    read: 'Alt+Shift+R',
    continueReading: 'Alt+Shift+C',
    focusMode: 'Alt+Shift+D',
    readingRuler: 'Alt+Shift+L',
    translate: 'Alt+Shift+G',
    language: 'Alt+Shift+S'
};

// Commands that change readability, so they apply to the nearest block
// rather than only the selected words.
export const BLOCK_COMMANDS = new Set([
    'sizeDown',
    'sizeUp',
    'fontStyle',
    'spacing',
    'contrast'
]);

// Commands whose effect is a binary toggle. When a selection covers several
// targets, they all move in the same direction instead of inverting mixed
// styles element by element.
export const TOGGLE_COMMANDS = new Set([
    'bold',
    'highlight',
    'fontStyle',
    'spacing'
]);

// Inline properties each command controls. When a command is applied to a
// whole block, matching overrides on exact-selection wrappers inside that
// block are cleared so the wrappers inherit the block-level result.
export const COMMAND_PROPERTIES = {
    bold: ['font-weight'],
    highlight: [
        'background-color',
        'outline',
        'text-decoration-line',
        'text-decoration-thickness',
        'text-decoration-color',
        'text-underline-offset'
    ],
    sizeDown: ['font-size'],
    sizeUp: ['font-size'],
    fontStyle: ['font-family'],
    spacing: ['letter-spacing', 'word-spacing', 'line-height', 'margin-bottom'],
    contrast: ['color']
};

// Names used when describing commands in toasts and undo/redo feedback.
export const COMMAND_LABELS = {
    bold: 'Bold',
    highlight: 'Highlight',
    sizeDown: 'Font size decrease',
    sizeUp: 'Font size increase',
    fontStyle: 'Font',
    spacing: 'Text spacing',
    contrast: 'Contrast fix'
};

// Wrappers are HTML spans, so they can only be inserted around HTML text.
export const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

// Content that commands must never style: the extension's own UI, scripts,
// styles, form controls, and editable regions.
// An empty or "plaintext-only" contenteditable is still editable, so only
// an explicit "false" opts an element out.
export const SKIP_SELECTOR = `#${CONFIG.toolbarId}, #${CONFIG.settingsPanelId}, ` +
    `#${CONFIG.translationBubbleId}, ` +
    'script, style, textarea, input, select, ' +
    '[contenteditable]:not([contenteditable="false"])';
