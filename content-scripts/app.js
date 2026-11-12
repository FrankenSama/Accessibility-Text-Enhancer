// Wiring: loads preferences, registers listeners, and starts the extension.

import { CONFIG, STATE } from './modules/core.js';
import { clampNumber } from './modules/text.js';
import { isEditableTarget, rangesMatch } from './modules/dom.js';
import { showToast } from './modules/toast.js';
import {
    applyTheme,
    configureToolbar,
    createToolbar,
    focusToolbarForSelection,
    isClickOutsideExtensionUi,
    positionToolbar,
    removeToolbar,
    scheduleToolbarPosition,
    updateToolbarState
} from './modules/toolbar.js';
import {
    loadVoices,
    populateVoiceSelect,
    setupVoiceListener,
    stopReading,
    toggleReadAloud
} from './modules/reading.js';
import { removeSettingsPanel, syncReadingSettingsControls } from './modules/settings.js';
import {
    enhanceSelection,
    getToggleStates,
    handleCommand
} from './modules/commands.js';
import { getScopeOverride } from './modules/scope.js';
import { redo, undo } from './modules/history.js';

/**
 * Promise wrapper around chrome.storage.local.get for older Chrome versions.
 * @param {string[]} keys
 * @returns {Promise<Object>}
 */
function getStorage(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => {
            if (chrome.runtime.lastError) {
                resolve({});
                return;
            }
            resolve(result || {});
        });
    });
}

// ==================== INITIALIZATION ====================

/**
 * Initialize extension on page load.
 */
async function initialize() {
    try {
        await loadExtensionState();
        setupVoiceListener();
        setupEventListeners();
        setupKeyboardShortcuts();
        setupMessageListener();
        syncShortcutLabels();

        if (!STATE.isExtensionEnabled) {
            return;
        }

        // Show the toolbar if text was already selected when the page loaded.
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            if (range.toString().trim()) {
                STATE.savedRange = range.cloneRange();
                setTimeout(() => {
                    if (!STATE.isExtensionEnabled || !STATE.savedRange) {
                        return;
                    }
                    const toolbar = createToolbar();
                    if (toolbar) {
                        positionToolbar(toolbar, STATE.savedRange);
                    }
                }, CONFIG.selectionDelay);
            }
        }
    } catch (error) {
        console.error('Initialization error:', error);
    }
}

/**
 * Load saved extension state from storage.
 */
async function loadExtensionState() {
    const result = await getStorage([
        'extensionEnabled',
        'darkMode',
        'ttsVoice',
        'ttsRate',
        'ttsPitch'
    ]);
    STATE.isExtensionEnabled = result.extensionEnabled !== false;
    STATE.isDarkMode = result.darkMode !== false;
    STATE.ttsVoice = typeof result.ttsVoice === 'string' ? result.ttsVoice : '';
    STATE.ttsRate = clampNumber(
        result.ttsRate,
        CONFIG.minTtsRate,
        CONFIG.maxTtsRate,
        CONFIG.defaultTtsRate
    );
    STATE.ttsPitch = clampNumber(
        result.ttsPitch,
        CONFIG.minTtsPitch,
        CONFIG.maxTtsPitch,
        CONFIG.defaultTtsPitch
    );
    loadVoices();
}

/**
 * Set up selection, click, scroll, and resize listeners.
 */
function setupEventListeners() {
    document.addEventListener('selectionchange', handleSelectionChange);

    // Dismiss the toolbar when clicking outside the extension UI. Keep it
    // visible while reading so pause and stop stay reachable.
    document.addEventListener('mousedown', (event) => {
        if (isClickOutsideExtensionUi(event)) {
            STATE.savedRange = null;
            if (STATE.speech) {
                updateToolbarState();
            } else {
                removeToolbar();
            }
        }
    });

    window.addEventListener('scroll', scheduleToolbarPosition, { passive: true });
    window.addEventListener('resize', scheduleToolbarPosition);
}

/**
 * Handle commands relayed from the background worker. Manifest commands
 * cannot run inside a content script, so Focus Toolbar arrives as a
 * message.
 */
function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || message.type !== 'focus-toolbar') {
            return false;
        }

        // Leave text entry alone: a global command should not pull focus
        // out of a field the user is typing in.
        if (!STATE.isExtensionEnabled ||
            isEditableTarget(document.activeElement)) {
            sendResponse({ handled: false });
            return false;
        }

        focusToolbarForSelection();
        sendResponse({ handled: true });
        return false;
    });
}

/**
 * Ask the background worker for the user's actual command bindings and
 * mirror the Focus Toolbar shortcut into the toolbar's ARIA hint.
 */
function syncShortcutLabels() {
    try {
        chrome.runtime.sendMessage({ type: 'get-shortcuts' }, (response) => {
            if (chrome.runtime.lastError || !response || !response.shortcuts) {
                return;
            }

            const focus = response.shortcuts['focus-toolbar'];
            if (!focus) {
                return;
            }

            STATE.focusToolbarShortcut = focus.shortcut || '';
            STATE.focusToolbarAriaShortcut = focus.aria || '';

            const toolbar = document.getElementById(CONFIG.toolbarId);
            if (!toolbar) {
                return;
            }

            if (STATE.focusToolbarAriaShortcut) {
                toolbar.setAttribute(
                    'aria-keyshortcuts',
                    STATE.focusToolbarAriaShortcut
                );
            } else {
                toolbar.removeAttribute('aria-keyshortcuts');
            }
        });
    } catch (error) {
        // The extension was reloaded while this page kept the old content
        // script. The default shortcut hint is still usable.
    }
}

/**
 * Handle selection changes.
 */
function handleSelectionChange() {
    if (!STATE.isExtensionEnabled) {
        return;
    }

    // Wrapping a selection splits text nodes and temporarily collapses the
    // live selection. Ignore those changes until the range is restored.
    if (STATE.isApplyingCommand) {
        return;
    }

    // Ignore selection changes caused by interacting with the extension UI.
    const activeElement = document.activeElement;
    if (activeElement && activeElement.closest(`#${CONFIG.toolbarId}, #${CONFIG.settingsPanelId}`)) {
        return;
    }

    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 && !selection.isCollapsed
        ? selection.getRangeAt(0)
        : null;

    // Ignore the echo from restoring the selection after wrapping, so the
    // toolbar is not torn down and re-animated on every command. This runs
    // before the pending-toolbar timer is cleared.
    if (range && STATE.savedRange && rangesMatch(range, STATE.savedRange)) {
        return;
    }

    if (STATE.toolbarTimeout) {
        clearTimeout(STATE.toolbarTimeout);
        STATE.toolbarTimeout = null;
    }

    if (!range || !range.toString().trim()) {
        STATE.savedRange = null;
        if (STATE.speech) {
            updateToolbarState();
        } else {
            removeToolbar();
        }
        return;
    }

    // Keep a snapshot because the live Selection can collapse when the
    // user interacts with the toolbar.
    STATE.savedRange = range.cloneRange();
    const savedRange = STATE.savedRange;

    STATE.toolbarTimeout = setTimeout(() => {
        STATE.toolbarTimeout = null;

        if (!STATE.isExtensionEnabled || !STATE.savedRange) {
            return;
        }

        const toolbar = createToolbar();
        if (toolbar) {
            positionToolbar(toolbar, savedRange);
        }
    }, CONFIG.selectionDelay);
}

/**
 * Set up keyboard shortcuts.
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            // Close the dialog first and leave the toolbar in place.
            if (document.getElementById(CONFIG.settingsPanelId)) {
                removeSettingsPanel();
                event.preventDefault();
                return;
            }

            // Let Escape reach the page while the user is editing text.
            if (STATE.speech && !isEditableTarget(event.target)) {
                stopReading();
                event.preventDefault();
                return;
            }

            if (document.getElementById(CONFIG.toolbarId) &&
                !isEditableTarget(event.target)) {
                STATE.savedRange = null;
                removeToolbar();
                event.preventDefault();
            }
            return;
        }

        // While the settings dialog is open, only Escape should affect the
        // extension.
        if (document.getElementById(CONFIG.settingsPanelId)) {
            return;
        }

        if (!STATE.isExtensionEnabled) {
            return;
        }

        const key = event.key.toLowerCase();
        const modifier = event.ctrlKey || event.metaKey;
        const editable = isEditableTarget(event.target);

        // Ctrl/Cmd + Z = Undo (only while the toolbar is visible, and only
        // when the extension has something to undo). This leaves native
        // text editing and page-level undo alone.
        if (modifier && !event.shiftKey && key === 'z') {
            if (!editable && STATE.historyIndex >= 0 &&
                document.getElementById(CONFIG.toolbarId)) {
                event.preventDefault();
                undo();
            }
            return;
        }

        // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z = Redo.
        if (modifier && (key === 'y' || (event.shiftKey && key === 'z'))) {
            const canRedo = STATE.historyIndex < STATE.history.length - 1;

            if (!editable && canRedo &&
                document.getElementById(CONFIG.toolbarId)) {
                event.preventDefault();
                redo();
            }
            return;
        }

        // Ctrl/Cmd + Shift + B is Chrome's bookmarks bar and Ctrl/Cmd +
        // Shift + H opens the home page on macOS, so those combinations
        // never reach the page. Use Alt/Option + Shift instead and match
        // the physical key so Option-modified characters on macOS still
        // work. Focus Toolbar is a manifest command handled by the
        // background worker, so it is not part of this handler.
        const altShift = event.altKey && event.shiftKey &&
            !event.ctrlKey && !event.metaKey;

        // Alt/Option + Shift + B = Bold.
        if (altShift && !editable &&
            (event.code === 'KeyB' || key === 'b') && STATE.savedRange) {
            event.preventDefault();
            enhanceSelection('bold');
            return;
        }

        // Alt/Option + Shift + H = Highlight.
        if (altShift && !editable &&
            (event.code === 'KeyH' || key === 'h') && STATE.savedRange) {
            event.preventDefault();
            enhanceSelection('highlight');
            return;
        }

        // Alt/Option + Shift + R = read the selection, or the paragraph at
        // the caret. While reading it pauses or resumes.
        if (altShift && !editable &&
            (event.code === 'KeyR' || key === 'r')) {
            event.preventDefault();
            toggleReadAloud();
        }
    });
}

// ==================== STORAGE SYNC ====================

function handleStorageChange(changes, areaName) {
    if (areaName !== 'local') {
        return;
    }

    if (changes.extensionEnabled) {
        const isEnabled = changes.extensionEnabled.newValue !== false;
        if (isEnabled !== STATE.isExtensionEnabled) {
            STATE.isExtensionEnabled = isEnabled;

            if (!isEnabled) {
                STATE.savedRange = null;
                stopReading({ silent: true });
                removeToolbar();
                removeSettingsPanel();
            }

            showToast(isEnabled ? 'Extension enabled' : 'Extension disabled');
        }
    }

    if (changes.darkMode) {
        STATE.isDarkMode = changes.darkMode.newValue !== false;
        applyTheme();
    }

    if (changes.ttsVoice) {
        const nextVoice = typeof changes.ttsVoice.newValue === 'string'
            ? changes.ttsVoice.newValue
            : '';

        // The voice dropdown is the only writer, so this is normally the
        // same value and the list does not need rebuilding.
        if (nextVoice !== STATE.ttsVoice) {
            STATE.ttsVoice = nextVoice;
            populateVoiceSelect();
        }
    }
    if (changes.ttsRate) {
        STATE.ttsRate = clampNumber(
            changes.ttsRate.newValue,
            CONFIG.minTtsRate,
            CONFIG.maxTtsRate,
            CONFIG.defaultTtsRate
        );
    }
    if (changes.ttsPitch) {
        STATE.ttsPitch = clampNumber(
            changes.ttsPitch.newValue,
            CONFIG.minTtsPitch,
            CONFIG.maxTtsPitch,
            CONFIG.defaultTtsPitch
        );
    }
    if (changes.ttsRate || changes.ttsPitch) {
        syncReadingSettingsControls();
    }
}

/**
 * Register the toolbar callbacks, start listening for preference changes, and
 * initialize the extension. Called once by the loader content script.
 */
export function start() {
    configureToolbar({
        runCommand: handleCommand,
        getScopeOverride,
        getToggleStates
    });

    chrome.storage.onChanged.addListener(handleStorageChange);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
}
