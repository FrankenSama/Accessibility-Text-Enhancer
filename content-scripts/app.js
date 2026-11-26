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
    refreshTextCommandLabels,
    removeToolbar,
    scheduleToolbarPosition,
    updateToolbarState
} from './modules/toolbar.js';
import {
    loadVoices,
    nextReadingSentence,
    populateVoiceSelect,
    previousReadingSentence,
    setupVoiceListener,
    stopReading,
    toggleReadAloud
} from './modules/reading.js';
import {
    removeSettingsPanel,
    syncReadingSettingsControls,
    syncSiteRulesControls,
    syncTextStylingControls,
    syncTranslationSettingsControls
} from './modules/settings.js';
import {
    enhanceSelection,
    getToggleStates,
    handleCommand
} from './modules/commands.js';
import { getScopeOverride } from './modules/scope.js';
import { redo, undo } from './modules/history.js';
import {
    disableReadingAids,
    refreshFocusMode,
    toggleFocusMode,
    toggleReadingRuler
} from './modules/reading-aids-ui.js';
import {
    closeTranslationBubble,
    positionTranslationBubble,
    syncTranslationButton
} from './modules/translation-inline.js';
import { normalizeStoredTranslationTarget } from './modules/translation.js';
import {
    isEnabledForOrigin,
    loadSyncedPreferences,
    normalizeSiteRules,
    siteOrigin
} from './modules/prefs.js';
import {
    normalizeTextDefaults,
    TEXT_DEFAULT_KEYS
} from './modules/style-defaults.js';
import { loadOpenDyslexicFonts } from './modules/fonts.js';

/**
 * Promise wrapper around chrome.storage.local.get for older Chrome versions.
 * Only the per-device on/off switch lives here; synced preferences and site
 * rules go through prefs.js.
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
    const [local, synced] = await Promise.all([
        getStorage(['extensionEnabled']),
        loadSyncedPreferences()
    ]);

    STATE.globalEnabled = local.extensionEnabled !== false;
    STATE.siteRules = normalizeSiteRules(synced.siteRules);
    STATE.origin = siteOrigin();
    STATE.isExtensionEnabled = isEnabledForOrigin(
        STATE.globalEnabled,
        STATE.siteRules,
        STATE.origin
    );

    STATE.isDarkMode = synced.darkMode !== false;
    STATE.ttsVoice = typeof synced.ttsVoice === 'string' ? synced.ttsVoice : '';
    STATE.ttsRate = clampNumber(
        synced.ttsRate,
        CONFIG.minTtsRate,
        CONFIG.maxTtsRate,
        CONFIG.defaultTtsRate
    );
    STATE.ttsPitch = clampNumber(
        synced.ttsPitch,
        CONFIG.minTtsPitch,
        CONFIG.maxTtsPitch,
        CONFIG.defaultTtsPitch
    );
    STATE.textDefaults = normalizeTextDefaults(synced);
    STATE.translationTarget = normalizeStoredTranslationTarget(
        synced.translationTarget
    );
    if (STATE.textDefaults.fontFamily === 'opendyslexic') {
        loadOpenDyslexicFonts();
    }
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
            if (STATE.translationBubbleOpen) {
                closeTranslationBubble({ restoreFocus: false });
            }
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

    const activeElement = document.activeElement;

    // The language/progress bubble belongs to one selection. A new page
    // selection dismisses it; a collapsed selection (clicking the bubble's own
    // note, status, or error text) leaves it open. The toolbar then follows
    // the new range.
    if (STATE.translationBubbleOpen) {
        const bubble = document.getElementById(CONFIG.translationBubbleId);
        const insideBubble = Boolean(
            bubble && range && bubble.contains(range.commonAncestorContainer)
        );

        if (range && !insideBubble) {
            closeTranslationBubble({ restoreFocus: false });
        }
        if (!range || insideBubble) {
            return;
        }
    }

    // Ignore selection changes caused by interacting with the toolbar or the
    // settings dialog when they do not carry a real page range. A programmatic
    // page selection still updates the toolbar while focus is in the toolbar.
    const activeInChrome = Boolean(activeElement && activeElement.closest(
        `#${CONFIG.toolbarId}, #${CONFIG.settingsPanelId}`
    ));
    const rangeInChrome = Boolean(range && [
        document.getElementById(CONFIG.toolbarId),
        document.getElementById(CONFIG.settingsPanelId)
    ].some((element) => element && element.contains(range.commonAncestorContainer)));

    if (rangeInChrome || (activeInChrome && !range)) {
        return;
    }

    // Focus mode follows the caret even when the toolbar is about to be
    // removed for an empty selection, so update it before that teardown.
    refreshFocusMode();

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

        if (!STATE.isExtensionEnabled || !STATE.savedRange ||
            STATE.translationBubbleOpen) {
            return;
        }

        const toolbar = createToolbar();
        if (toolbar) {
            positionToolbar(toolbar, savedRange);
        }
    }, CONFIG.selectionDelay);
}

/**
 * Whether a target is a control that uses Space itself, so the reading
 * pause shortcut must not take the key away from it.
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isInteractiveTarget(target) {
    return Boolean(target?.closest?.(
        'button, a[href], summary, [role="button"], [role="link"], ' +
        '[role="menuitem"]'
    ));
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

            // The translation bubble closes before reading so Escape does not
            // stop speech the user may still be listening to. A <select>
            // counts as editable, so this branch must not check for that.
            if (STATE.translationBubbleOpen) {
                closeTranslationBubble();
                event.preventDefault();
                return;
            }

            // Let Escape reach the page while the user is editing text.
            if (STATE.speech && !isEditableTarget(event.target)) {
                stopReading();
                event.preventDefault();
                return;
            }

            // Reading aids are page-level, so they exit before the toolbar.
            if ((STATE.focusMode || STATE.readingRuler) &&
                !isEditableTarget(event.target)) {
                disableReadingAids();
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

        // Space pauses or resumes a reading, unless focus is on a control
        // that uses Space itself.
        if (event.code === 'Space' && STATE.speech && !editable &&
            !isInteractiveTarget(event.target)) {
            event.preventDefault();
            toggleReadAloud();
            return;
        }

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
        // the caret. A caret continues to the end of the article; while
        // reading it pauses or resumes.
        if (altShift && !editable &&
            (event.code === 'KeyR' || key === 'r')) {
            event.preventDefault();
            toggleReadAloud();
            return;
        }

        // Alt/Option + Shift + C = read from here to the end of the article.
        if (altShift && !editable &&
            (event.code === 'KeyC' || key === 'c')) {
            event.preventDefault();
            toggleReadAloud({ continuous: true });
            return;
        }

        // Alt/Option + Shift + Left/Right = previous/next sentence while
        // reading. Outside a reading, leave the browser's selection alone.
        if (altShift && !editable && STATE.speech &&
            (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) {
            event.preventDefault();
            if (event.code === 'ArrowRight') {
                nextReadingSentence();
            } else {
                previousReadingSentence();
            }
            return;
        }

        // Alt/Option + Shift + G = translate the selection. The shortcut
        // always uses selection scope; Shift-click uses paragraph scope.
        if (altShift && !editable &&
            (event.code === 'KeyG' || key === 'g') && STATE.savedRange) {
            event.preventDefault();
            handleCommand('translate', { scope: 'selection' });
            return;
        }

        // Alt/Option + Shift + D = dim everything but the focused block.
        if (altShift && !editable &&
            (event.code === 'KeyD' || key === 'd')) {
            event.preventDefault();
            toggleFocusMode();
            return;
        }

        // Alt/Option + Shift + L = line ruler under the pointer.
        if (altShift && !editable &&
            (event.code === 'KeyL' || key === 'l')) {
            event.preventDefault();
            toggleReadingRuler();
        }
    });
}

// ==================== STORAGE SYNC ====================

function handleStorageChange(changes, areaName) {
    // The on/off switch is per device and lives in storage.local.
    if (areaName === 'local') {
        if (changes.extensionEnabled) {
            STATE.globalEnabled = changes.extensionEnabled.newValue !== false;
            applyEnabledState();
        }
        return;
    }

    if (areaName !== 'sync') {
        return;
    }

    // A site rule for this origin can turn the extension on or off without
    // touching the global switch.
    if (changes.siteRules) {
        STATE.siteRules = normalizeSiteRules(changes.siteRules.newValue);
        applyEnabledState();
        syncSiteRulesControls();
    }

    if (changes.darkMode) {
        STATE.isDarkMode = changes.darkMode.newValue !== false;
        applyTheme();
        syncTextStylingControls();
    }

    if (TEXT_DEFAULT_KEYS.some((key) => changes[key])) {
        const next = { ...STATE.textDefaults };
        for (const key of TEXT_DEFAULT_KEYS) {
            if (changes[key]) {
                next[key] = changes[key].newValue;
            }
        }
        STATE.textDefaults = normalizeTextDefaults(next);
        if (changes.fontFamily &&
            changes.fontFamily.newValue === 'opendyslexic') {
            loadOpenDyslexicFonts();
        }
        refreshTextCommandLabels();
        syncTextStylingControls();
    }

    if (changes.translationTarget) {
        STATE.translationTarget = normalizeStoredTranslationTarget(
            changes.translationTarget.newValue
        );
        syncTranslationSettingsControls();
        syncTranslationButton();
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
 * Recompute the effective on/off state for this page and tear down the UI
 * when it turns off.
 */
function applyEnabledState() {
    const next = isEnabledForOrigin(
        STATE.globalEnabled,
        STATE.siteRules,
        STATE.origin
    );

    if (next === STATE.isExtensionEnabled) {
        return;
    }

    STATE.isExtensionEnabled = next;

    if (!next) {
        STATE.savedRange = null;
        disableReadingAids({ silent: true });
        stopReading({ silent: true });
        removeToolbar();
        removeSettingsPanel();
    }

    showToast(next ? 'Extension enabled' : 'Extension disabled');
}

/**
 * Register the toolbar callbacks, start listening for preference changes, and
 * initialize the extension. Called once by the loader content script.
 */
export function start() {
    configureToolbar({
        runCommand: handleCommand,
        getScopeOverride,
        getToggleStates,
        positionTranslationBubble,
        onToolbarRemoved: () => closeTranslationBubble({ restoreFocus: false }),
        onTranslationStateChanged: syncTranslationButton
    });

    chrome.storage.onChanged.addListener(handleStorageChange);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
}
