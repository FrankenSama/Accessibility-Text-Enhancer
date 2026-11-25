// Selection translation panel: language controls, progress, result, copy,
// read-aloud wiring, focus handling, and viewport placement.

import { CONFIG, STATE } from './core.js';
import { buildTextMap, closestBlock, getMountNode } from './dom.js';
import { saveSyncedPreferences } from './prefs.js';
import { showToast } from './toast.js';
import { createToolbar, positionToolbar } from './toolbar.js';
import {
    getPageLanguage,
    startReadingText,
    stopReading,
    toggleReadAloud
} from './reading.js';
import {
    createTranslationService,
    defaultTranslationTarget,
    isTranslationAvailable,
    normalizeLanguageTag,
    normalizeTranslationTarget,
    prepareTranslationText,
    translationLanguageName,
    translationMessage,
    TRANSLATION_LANGUAGES
} from './translation.js';

const service = createTranslationService({
    maxChars: CONFIG.translationMaxChars
});

// Everything about the open panel lives here. A null value means no panel.
let panelState = null;

/**
 * Find the nearest declared language for a node, falling back to the page
 * language.
 * @param {Node} node
 * @returns {string} A supported tag, or an empty string when unknown.
 */
function detectSource(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE
        ? node
        : node?.parentElement;
    const declared = typeof element?.closest === 'function'
        ? element.closest('[lang]')?.getAttribute('lang') || ''
        : '';

    return normalizeLanguageTag(declared) ||
        normalizeLanguageTag(getPageLanguage());
}

/**
 * The text map to translate. Paragraph scope reads the whole block that
 * contains the saved selection; selection scope reads only the selection.
 * @param {'block'|'selection'} scope
 * @returns {{text: string, entries: Array<Object>}|null}
 */
function resolveTextMap(scope) {
    const saved = STATE.savedRange;
    if (!saved) {
        return null;
    }

    if (scope === 'block') {
        const block = closestBlock(saved.startContainer);
        if (block && block !== document.body && block !== document.documentElement) {
            const range = document.createRange();
            range.selectNodeContents(block);
            return buildTextMap(range);
        }
    }

    return buildTextMap(saved);
}

/**
 * The node whose declared language describes the text being translated.
 * @param {'block'|'selection'} scope
 * @returns {Node|null}
 */
function resolveSourceNode(scope) {
    const saved = STATE.savedRange;
    if (!saved) {
        return null;
    }

    if (scope === 'block') {
        const block = closestBlock(saved.startContainer);
        if (block && block !== document.body && block !== document.documentElement) {
            return block;
        }
    }

    return saved.commonAncestorContainer;
}

/**
 * Open the translation panel for the saved selection, or close it when it is
 * already open.
 * @param {'block'|'selection'} [scope]
 */
export function openTranslationPanel(scope = 'selection') {
    if (panelState) {
        closeTranslationPanel();
        return;
    }

    if (!STATE.isExtensionEnabled) {
        return;
    }

    if (!isTranslationAvailable()) {
        showToast(translationMessage('missing'), { error: true });
        return;
    }

    const saved = STATE.savedRange;
    if (!saved ||
        !saved.commonAncestorContainer.isConnected ||
        saved.collapsed ||
        !saved.toString().trim()) {
        showToast('Select text or a paragraph to translate.');
        return;
    }

    // A shortcut can arrive before the 150 ms toolbar timer fires. Cancel it
    // and create the toolbar now, so the panel has an anchor and the pending
    // timer cannot recreate the toolbar and tear the panel down.
    if (STATE.toolbarTimeout) {
        clearTimeout(STATE.toolbarTimeout);
        STATE.toolbarTimeout = null;
    }

    if (!document.getElementById(CONFIG.toolbarId)) {
        const toolbar = createToolbar();
        if (!toolbar) {
            return;
        }
        positionToolbar(toolbar, saved);
    }

    const map = resolveTextMap(scope);
    const prepared = prepareTranslationText(
        map?.text,
        CONFIG.translationMaxChars
    );
    if (!prepared.text) {
        showToast('Select text or a paragraph to translate.');
        return;
    }

    if (!STATE.translationTarget) {
        STATE.translationTarget = defaultTranslationTarget(navigator.language);
    }

    const detected = detectSource(resolveSourceNode(scope));
    const target = normalizeTranslationTarget(STATE.translationTarget);

    buildPanel({ prepared, detected, target, scope });
}

/**
 * The over-cap message, with a suggestion that matches the chosen scope.
 * @param {{characters: number, maxChars: number}} prepared
 * @param {'block'|'selection'} scope
 * @returns {string}
 */
function tooLongMessage(prepared, scope) {
    const suggestion = scope === 'block'
        ? 'Select less text and try again.'
        : 'Select less text, or Shift-click to translate one paragraph.';

    return `That selection is ${prepared.characters} characters; the limit is ` +
        `${prepared.maxChars}. ${suggestion}`;
}

/**
 * Build the panel markup and wire its controls.
 * @param {{prepared: Object, detected: string, target: string,
 *     scope: 'block'|'selection'}} options
 */
function buildPanel({ prepared, detected, target, scope }) {
    const returnFocus = document.getElementById(CONFIG.toolbarId)
        ?.querySelector('[data-command="translate"]') || document.activeElement;

    const panel = document.createElement('div');
    panel.id = CONFIG.translationPanelId;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-labelledby', 'accessibility-translation-title');
    panel.setAttribute('lang', 'en');
    panel.setAttribute('dir', 'ltr');
    panel.tabIndex = -1;

    if (!STATE.isDarkMode) {
        panel.classList.add('light-mode');
    }

    panel.innerHTML = `
        <h3 id="accessibility-translation-title">Translation</h3>
        <p class="translation-note">
            Machine translation by Chrome. The text is not uploaded.
        </p>

        <div class="translation-languages">
            <div class="translation-field">
                <label for="atx-translation-source">From</label>
                <select id="atx-translation-source" class="translation-select"></select>
            </div>
            <div class="translation-field">
                <label for="atx-translation-target">To</label>
                <select id="atx-translation-target" class="translation-select"></select>
            </div>
        </div>

        <div class="translation-status" role="status" aria-live="polite"></div>
        <button type="button" class="translation-cancel" hidden>Cancel</button>
        <div class="translation-error" role="alert" hidden></div>

        <div class="translation-result" tabindex="0" hidden></div>

        <details class="translation-original" hidden>
            <summary>Original text</summary>
            <div class="translation-original-text"></div>
        </details>

        <div class="translation-actions">
            <button type="button" class="translation-action translation-copy"
                aria-disabled="true">Copy</button>
            <button type="button" class="translation-action translation-read"
                aria-disabled="true" aria-pressed="false">Read aloud</button>
            <button type="button" class="translation-action translation-retry"
                hidden>Try again</button>
        </div>

        <button type="button" class="translation-close"
            aria-label="Close translation">✕</button>
    `;

    panelState = {
        panel,
        prepared,
        scope,
        detectedSource: detected,
        sourceMode: 'auto',
        target,
        resultText: '',
        resultTarget: '',
        busy: false,
        creating: false,
        createController: null,
        requestController: null,
        returnFocus,
        sourceSelect: panel.querySelector('#atx-translation-source'),
        targetSelect: panel.querySelector('#atx-translation-target'),
        status: panel.querySelector('.translation-status'),
        error: panel.querySelector('.translation-error'),
        cancel: panel.querySelector('.translation-cancel'),
        result: panel.querySelector('.translation-result'),
        original: panel.querySelector('.translation-original'),
        originalText: panel.querySelector('.translation-original-text'),
        copy: panel.querySelector('.translation-copy'),
        read: panel.querySelector('.translation-read'),
        retry: panel.querySelector('.translation-retry'),
        close: panel.querySelector('.translation-close')
    };

    fillSourceSelect(panelState.sourceSelect, detected);
    fillTargetSelect(panelState.targetSelect, target);
    bindPanelEvents(panel);

    STATE.translationOpen = true;
    updateTranslateExpanded(true);

    getMountNode().appendChild(panel);
    positionTranslationPanel();
    panel.focus({ preventScroll: true });

    if (prepared.tooLong) {
        setStatus('');
        showPanelError(tooLongMessage(prepared, scope), false);
        return;
    }

    requestTranslation();
}

/**
 * Fill the source select with an Auto option plus every supported language.
 * @param {HTMLSelectElement} select
 * @param {string} detected
 */
function fillSourceSelect(select, detected) {
    select.textContent = '';

    const auto = document.createElement('option');
    auto.value = 'auto';
    auto.textContent = detected
        ? `Auto (${translationLanguageName(detected)})`
        : 'Choose the source language';
    select.appendChild(auto);

    TRANSLATION_LANGUAGES.forEach(({ code, name }) => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        select.appendChild(option);
    });

    select.value = 'auto';
}

/**
 * Fill the target select with every supported language.
 * @param {HTMLSelectElement} select
 * @param {string} target
 */
function fillTargetSelect(select, target) {
    select.textContent = '';

    TRANSLATION_LANGUAGES.forEach(({ code, name }) => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        select.appendChild(option);
    });

    select.value = target;
}

/**
 * Wire the panel's controls. Buttons keep the page selection intact; the
 * selects keep their native keyboard behaviour.
 * @param {HTMLElement} panel
 */
function bindPanelEvents(panel) {
    if (!panelState) {
        return;
    }

    panelState.close.addEventListener('click', () => closeTranslationPanel());
    panelState.cancel.addEventListener('click', cancelTranslation);
    panelState.retry.addEventListener('click', requestTranslation);
    panelState.copy.addEventListener('click', copyResult);
    panelState.read.addEventListener('click', togglePanelReading);
    panelState.sourceSelect.addEventListener('change', handleLanguageChange);
    panelState.targetSelect.addEventListener('change', handleLanguageChange);

    panel.addEventListener('mousedown', (event) => {
        if (event.target.closest?.('button')) {
            event.preventDefault();
            event.stopPropagation();
        }
    });
}

/**
 * Read the picks and translate again. Changing either language cancels the
 * request in flight, as the plan requires.
 */
function handleLanguageChange() {
    if (!panelState) {
        return;
    }

    const previousTarget = panelState.target;
    const nextTarget = normalizeTranslationTarget(panelState.targetSelect.value);

    panelState.sourceMode = panelState.sourceSelect.value;
    panelState.target = nextTarget;

    if (nextTarget !== previousTarget) {
        STATE.translationTarget = nextTarget;
        saveSyncedPreferences({ translationTarget: nextTarget });
    }

    requestTranslation();
}

/**
 * Translate the prepared text with the current picks.
 */
function requestTranslation() {
    if (!panelState) {
        return;
    }

    if (panelState.busy) {
        abortCurrent();
    }

    const state = panelState;
    const source = state.sourceMode === 'auto'
        ? state.detectedSource
        : state.sourceMode;
    const target = state.target;

    if (STATE.speech?.origin === 'translation') {
        stopReading({ silent: true });
    }

    clearResult();
    hidePanelError();
    hideRetry();

    if (state.prepared.tooLong) {
        setStatus('');
        showPanelError(tooLongMessage(state.prepared, state.scope), false);
        setBusy(false);
        return;
    }

    if (!source) {
        setStatus('Choose the source language to translate.');
        setBusy(false);
        return;
    }

    if (source === target) {
        setStatus('');
        showPanelError(translationMessage('same', { source, target }), false);
        setBusy(false);
        return;
    }

    const createController = new AbortController();
    const requestController = new AbortController();
    let lastProgressBucket = -1;
    state.createController = createController;
    state.requestController = requestController;
    state.creating = true;
    setBusy(true);
    setStatus('Preparing language pack…');

    service.translate({
        text: state.prepared.text,
        source,
        target,
        createSignal: createController.signal,
        signal: requestController.signal,
        onProgress(loaded) {
            if (panelState !== state ||
                state.requestController !== requestController) {
                return;
            }

            const percent = Math.round(loaded * 100);
            const bucket = Math.floor(percent / 25) * 25;
            if (bucket === lastProgressBucket) {
                return;
            }
            lastProgressBucket = bucket;
            setStatus(`Preparing language pack… ${percent}%`);
        },
        onReady() {
            if (panelState !== state ||
                state.requestController !== requestController) {
                return;
            }
            state.creating = false;
            setStatus('Translating…');
        }
    }).then((result) => {
        if (panelState !== state ||
            state.requestController !== requestController) {
            return;
        }
        finishRequest(result);
    }).catch(() => {
        if (panelState !== state ||
            state.requestController !== requestController) {
            return;
        }
        finishRequest({
            ok: false,
            code: 'failed',
            message: translationMessage('failed'),
            retry: true
        });
    });
}

/**
 * Abort whatever is in flight. A finished creation keeps its translator, so
 * only an in-progress creation aborts the create signal.
 */
function abortCurrent() {
    if (!panelState) {
        return;
    }

    const state = panelState;

    if (state.creating && state.createController) {
        try {
            state.createController.abort();
        } catch (error) {
            // The controller is already aborted.
        }
    }
    if (state.requestController) {
        try {
            state.requestController.abort();
        } catch (error) {
            // The controller is already aborted.
        }
    }

    state.createController = null;
    state.requestController = null;
    state.creating = false;
}

/**
 * Apply a finished translation or a mapped failure.
 * @param {Object} result
 */
function finishRequest(result) {
    if (!panelState) {
        return;
    }

    const state = panelState;
    state.creating = false;
    state.createController = null;
    state.requestController = null;
    setBusy(false);

    if (result.ok) {
        state.resultText = result.text;
        state.resultTarget = result.target;
        renderResult(result);
        setStatus('Translation ready.');
        hidePanelError();
        hideRetry();
    } else if (result.code === 'cancelled') {
        clearResult();
        setStatus('Translation cancelled.');
        hidePanelError();
        showRetry(true);
    } else {
        clearResult();
        setStatus('');
        showPanelError(result.message, Boolean(result.retry));
    }

    positionTranslationPanel();
}

/**
 * Show the translated text and the original.
 * @param {{text: string, source: string, target: string}} result
 */
function renderResult(result) {
    const state = panelState;

    state.result.textContent = result.text;
    state.result.setAttribute('lang', result.target);
    state.result.setAttribute('dir', 'auto');
    state.result.hidden = false;

    state.original.hidden = false;
    state.originalText.textContent = state.prepared.text;
    if (result.source) {
        state.originalText.setAttribute('lang', result.source);
    } else {
        state.originalText.removeAttribute('lang');
    }
    state.originalText.setAttribute('dir', 'auto');

    setActionDisabled(state.copy, false);
    setActionDisabled(state.read, false);
    syncTranslationReadingState();
}

/**
 * Clear the result and make Copy and Read aloud unavailable but focusable.
 */
function clearResult() {
    if (!panelState) {
        return;
    }

    const state = panelState;
    state.resultText = '';
    state.resultTarget = '';
    state.result.hidden = true;
    state.result.textContent = '';
    state.original.hidden = true;
    state.originalText.textContent = '';
    setActionDisabled(state.copy, true);
    setActionDisabled(state.read, true);
    syncTranslationReadingState();
}

/**
 * Toggle an action with aria-disabled so it stays in the keyboard order and
 * its unavailable state is announced.
 * @param {HTMLButtonElement} button
 * @param {boolean} disabled
 */
function setActionDisabled(button, disabled) {
    button.setAttribute('aria-disabled', String(disabled));
}

/**
 * @param {string} message
 */
function setStatus(message) {
    if (panelState) {
        panelState.status.textContent = message;
    }
}

/**
 * @param {string} message
 * @param {boolean} retry
 */
function showPanelError(message, retry) {
    if (!panelState) {
        return;
    }

    panelState.error.textContent = message;
    panelState.error.hidden = false;
    showRetry(retry);

    if (retry) {
        panelState.retry.focus({ preventScroll: true });
    }
}

function hidePanelError() {
    if (panelState) {
        panelState.error.textContent = '';
        panelState.error.hidden = true;
    }
}

/**
 * @param {boolean} visible
 */
function showRetry(visible) {
    if (panelState) {
        panelState.retry.hidden = !visible;
    }
}

function hideRetry() {
    if (!panelState) {
        return;
    }

    const hadFocus = document.activeElement === panelState.retry;
    showRetry(false);
    if (hadFocus) {
        panelState.panel.focus({ preventScroll: true });
    }
}

/**
 * Mirror the busy state onto the toolbar button. Kept separate so closing the
 * panel can clear it even after the panel state is gone.
 * @param {boolean} busy
 */
function setToolbarBusy(busy) {
    const button = document.getElementById(CONFIG.toolbarId)
        ?.querySelector('[data-command="translate"]');
    if (button) {
        button.setAttribute('aria-busy', String(busy));
    }
}

/**
 * Mirror the busy state without changing the Translate glyph.
 * @param {boolean} busy
 */
function setBusy(busy) {
    if (!panelState) {
        return;
    }

    const cancelHadFocus = !busy && document.activeElement === panelState.cancel;
    panelState.busy = busy;
    panelState.panel.setAttribute('aria-busy', String(busy));
    panelState.cancel.hidden = !busy;
    setToolbarBusy(busy);

    if (cancelHadFocus) {
        panelState.panel.focus({ preventScroll: true });
    }
}

/**
 * Cancel the current request from the panel.
 */
function cancelTranslation() {
    if (!panelState) {
        return;
    }

    abortCurrent();
    setBusy(false);
    clearResult();
    setStatus('Translation cancelled.');
    hidePanelError();
    showRetry(true);
    // The Cancel button is mouse-down protected and may not hold focus, so
    // move focus to the next useful action explicitly.
    panelState.retry.focus({ preventScroll: true });
    positionTranslationPanel();
}

/**
 * Copy the result, or select it and explain the manual shortcut when the
 * clipboard is unavailable.
 */
function copyResult() {
    if (!panelState || !panelState.resultText) {
        return;
    }

    const text = panelState.resultText;
    const fallback = () => {
        if (!panelState) {
            return;
        }

        const selection = window.getSelection();
        if (selection) {
            const range = document.createRange();
            range.selectNodeContents(panelState.result);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        panelState.result.focus({ preventScroll: true });
        setStatus('Press Ctrl/Cmd+C to copy.');
    };

    if (navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function') {
        try {
            navigator.clipboard.writeText(text)
                .then(() => setStatus('Copied to clipboard.'))
                .catch(fallback);
        } catch (error) {
            fallback();
        }
        return;
    }

    fallback();
}

/**
 * Read the translated text aloud, or pause/resume the panel's own session.
 */
function togglePanelReading() {
    if (!panelState || !panelState.resultText) {
        return;
    }

    if (STATE.speech?.origin === 'translation') {
        toggleReadAloud();
        return;
    }

    if (STATE.speech) {
        stopReading({ silent: true });
    }

    startReadingText(
        panelState.resultText,
        panelState.resultTarget || panelState.target
    );
    syncTranslationReadingState();
}

/**
 * Update the panel's read control from the shared speech state. Called by the
 * toolbar whenever a reading session changes.
 */
export function syncTranslationReadingState() {
    if (!panelState) {
        return;
    }

    const state = panelState;
    const active = Boolean(STATE.speech && STATE.speech.origin === 'translation');
    const paused = Boolean(active && STATE.speech.paused);

    state.read.textContent = active
        ? (paused ? 'Resume reading' : 'Pause reading')
        : 'Read aloud';
    state.read.setAttribute('aria-pressed', String(active));
    state.read.setAttribute('aria-disabled', String(!state.resultText));
}

/**
 * Place the panel beside the toolbar, choosing the side with room and
 * clamping it to the viewport.
 */
export function positionTranslationPanel() {
    if (!panelState) {
        return;
    }

    const margin = 15;
    const gap = 10;
    const panel = panelState.panel;
    const toolbar = document.getElementById(CONFIG.toolbarId);
    const toolbarRect = toolbar
        ? toolbar.getBoundingClientRect()
        : STATE.savedRange?.getBoundingClientRect();

    if (!toolbarRect) {
        return;
    }

    const width = panel.offsetWidth || 360;
    const height = panel.offsetHeight || 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left;
    let top;

    if (width <= viewportWidth - toolbarRect.right - gap - margin) {
        left = toolbarRect.right + gap;
        top = toolbarRect.top;
    } else if (toolbarRect.left - gap - margin >= width) {
        left = toolbarRect.left - gap - width;
        top = toolbarRect.top;
    } else {
        left = toolbarRect.left + toolbarRect.width / 2 - width / 2;

        if (height <= viewportHeight - toolbarRect.bottom - gap - margin) {
            top = toolbarRect.bottom + gap;
        } else if (height <= toolbarRect.top - gap - margin) {
            top = toolbarRect.top - gap - height;
        } else {
            top = margin;
        }
    }

    left = Math.max(margin, Math.min(left, viewportWidth - width - margin));
    top = Math.max(margin, Math.min(top, viewportHeight - height - margin));

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
}

/**
 * Close the panel and restore focus to Translate. Speech keeps playing; the
 * toolbar's Stop Reading control stays available.
 * @param {{restoreFocus?: boolean}} [options]
 */
export function closeTranslationPanel(options = {}) {
    const { restoreFocus = true } = options;

    if (!panelState) {
        const stray = document.getElementById(CONFIG.translationPanelId);
        if (stray) {
            stray.remove();
        }
        STATE.translationOpen = false;
        setToolbarBusy(false);
        updateTranslateExpanded(false);
        return;
    }

    const state = panelState;

    if (state.creating && state.createController) {
        try {
            state.createController.abort();
        } catch (error) {
            // The controller is already aborted.
        }
    }
    if (state.requestController) {
        try {
            state.requestController.abort();
        } catch (error) {
            // The controller is already aborted.
        }
    }

    state.panel.remove();
    panelState = null;
    STATE.translationOpen = false;
    setToolbarBusy(false);
    updateTranslateExpanded(false);

    if (restoreFocus && state.returnFocus && state.returnFocus.isConnected) {
        state.returnFocus.focus({ preventScroll: true });
    }
}

/**
 * @param {boolean} expanded
 */
function updateTranslateExpanded(expanded) {
    const button = document.getElementById(CONFIG.toolbarId)
        ?.querySelector('[data-command="translate"]');
    if (button) {
        button.setAttribute('aria-expanded', String(expanded));
    }
}
