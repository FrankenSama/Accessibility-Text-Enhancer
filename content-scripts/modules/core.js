// Shared constants and the single mutable STATE object.

// ==================== STATE MANAGEMENT ====================

const IS_MAC = /mac/i.test(
    navigator.userAgentData?.platform || navigator.platform || ''
);

export const STATE = {
    savedRange: null,
    isExtensionEnabled: true,
    isDarkMode: true,
    history: [],
    historyIndex: -1,
    toolbarTimeout: null,
    positionFrame: null,
    isApplyingCommand: false,
    // Reading preferences. Speech itself lives outside the undo history
    // because it never changes the page.
    ttsVoice: '',
    ttsRate: 0.9,
    ttsPitch: 1,
    voices: [],
    speech: null,
    // Focus Toolbar is a manifest command. These defaults are replaced with
    // the user's actual binding once the background worker responds.
    focusToolbarShortcut: IS_MAC ? 'Cmd+Shift+F' : 'Ctrl+Shift+F',
    focusToolbarAriaShortcut: IS_MAC ? 'Meta+Shift+F' : 'Control+Shift+F'
};

export const CONFIG = {
    toolbarId: 'accessibility-toolbar',
    settingsPanelId: 'accessibility-settings-panel',
    settingsOverlayId: 'accessibility-settings-overlay',
    highlightAttr: 'data-accessibility-highlight',
    selectionAttr: 'data-atx-selection',
    selectionDelay: 150,
    toastId: 'accessibility-toast',
    toastDuration: 2000,
    // Errors stay on screen longer so they are not missed.
    toastErrorDuration: 6000,
    maxHistorySize: 50,
    maxWrapNodes: 200,
    // Must match the toolbar max-width in content.css.
    toolbarMaxWidth: 480,
    fontSizeMin: 8,
    fontSizeMax: 50,
    // Reading a whole paragraph in one utterance avoids the pause every
    // voice engine inserts between utterances. The limit only exists as a
    // guard for unusually long text; desktop Chrome speaks a thousand
    // characters without truncating.
    maxSpeechChunkLength: 1000,
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
    read: IS_MAC ? 'Option+Shift+R' : 'Alt+Shift+R'
};

// A chunk that has to be split should end after punctuation rather than
// after an arbitrary word. Stopping mid-phrase is what makes the voice

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
    highlight: ['background-color', 'outline'],
    sizeDown: ['font-size'],
    sizeUp: ['font-size'],
    fontStyle: ['font-family'],
    spacing: ['letter-spacing', 'word-spacing'],
    contrast: ['color']
};

// Names used when describing commands in toasts and undo/redo feedback.
export const COMMAND_LABELS = {
    bold: 'Bold',
    highlight: 'Highlight',
    sizeDown: 'Font size decrease',
    sizeUp: 'Font size increase',
    fontStyle: 'Font style',
    spacing: 'Text spacing',
    contrast: 'Contrast fix'
};

// Yellow used by the highlight feature. Highlight only paints a background
// when the current text colour stays readable against it.
export const HIGHLIGHT_COLOR = { r: 255, g: 235, b: 59 };

// Wrappers are HTML spans, so they can only be inserted around HTML text.
export const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

// Content that commands must never style: the extension's own UI, scripts,
// styles, form controls, and editable regions.
// An empty or "plaintext-only" contenteditable is still editable, so only
// an explicit "false" opts an element out.
export const SKIP_SELECTOR = `#${CONFIG.toolbarId}, #${CONFIG.settingsPanelId}, ` +
    'script, style, textarea, input, select, ' +
    '[contenteditable]:not([contenteditable="false"])';
