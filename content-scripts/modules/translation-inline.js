// In-place selection translation: replace the selected text with its
// translation, keep the original for the toggle/Undo/Reset, and show only a
// compact language/progress/error bubble.

import { CONFIG, SHORTCUT_LABELS, STATE } from './core.js';
import {
    buildTextMap,
    closestBlock,
    getBlocksForRange,
    getMountNode
} from './dom.js';
import { pushHistory, setTranslationState } from './history.js';
import { saveSyncedPreferences } from './prefs.js';
import { getPageLanguage } from './reading.js';
import { showToast } from './toast.js';
import {
    createToolbar,
    positionToolbar,
    updateToolbarState
} from './toolbar.js';
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

// The language/progress bubble. Null when it is closed; a translation that is
// already in the page lives in STATE.translations instead.
let bubbleState = null;

/**
 * The translation wrapper containing a range, if any.
 * @param {Range|null} range
 * @returns {HTMLElement|null}
 */
function translationWrapperFor(range) {
    if (!range) {
        return null;
    }

    const node = range.commonAncestorContainer;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return element?.closest?.(`[${CONFIG.translationAttr}]`) || null;
}

/**
 * The nearest declared language for a node, falling back to the page.
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
 * The node whose declared language describes the text being translated.
 * @param {Range} range
 * @param {'block'|'selection'} scope
 * @returns {Node}
 */
function sourceNodeFor(range, scope) {
    if (scope === 'block') {
        const block = closestBlock(range.startContainer);
        if (block && block !== document.body && block !== document.documentElement) {
            return block;
        }
    }
    return range.commonAncestorContainer;
}

/**
 * The range that will actually be replaced, and its text.
 * @param {Range} saved
 * @param {'block'|'selection'} scope
 * @returns {{range: Range, text: string}|null}
 */
function replacementFor(saved, scope) {
    if (scope === 'block') {
        const block = closestBlock(saved.startContainer);
        if (!block || block === document.body || block === document.documentElement) {
            return null;
        }
        const range = document.createRange();
        range.selectNodeContents(block);
        return { range, text: buildTextMap(range).text };
    }

    if (getBlocksForRange(saved).length > 1) {
        return null;
    }

    return { range: saved.cloneRange(), text: buildTextMap(saved).text };
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
 * Ensure the toolbar exists and is positioned for the saved range. A shortcut
 * can arrive before the 150 ms selection delay.
 * @param {Range} range
 * @returns {boolean}
 */
function ensureToolbar(range) {
    if (STATE.toolbarTimeout) {
        clearTimeout(STATE.toolbarTimeout);
        STATE.toolbarTimeout = null;
    }

    if (document.getElementById(CONFIG.toolbarId)) {
        return true;
    }

    const toolbar = createToolbar();
    if (!toolbar) {
        return false;
    }
    positionToolbar(toolbar, range);
    return true;
}

/**
 * Translate the saved selection in place, restore an existing translation,
 * or open the language bubble.
 * @param {'block'|'selection'} [scope]
 */
export function translateSelection(scope = 'selection') {
    if (!STATE.isExtensionEnabled) {
        return;
    }

    if (STATE.translationBubbleOpen) {
        closeTranslationBubble();
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

    const wrapper = translationWrapperFor(saved);
    if (wrapper) {
        const record = STATE.translations.get(wrapper);
        if (record) {
            restoreTranslation(record);
            return;
        }
    }

    if (!ensureToolbar(saved)) {
        return;
    }

    const replacement = replacementFor(saved, scope);
    if (!replacement) {
        showToast(
            'Select text within one paragraph, or Shift-click to translate the paragraph.'
        );
        return;
    }

    const prepared = prepareTranslationText(
        replacement.text,
        CONFIG.translationMaxChars
    );
    if (!prepared.text) {
        showToast('Select text or a paragraph to translate.');
        return;
    }

    const detected = detectSource(sourceNodeFor(saved, scope));
    const target = STATE.translationTarget
        ? normalizeTranslationTarget(STATE.translationTarget)
        : defaultTranslationTarget(navigator.language);
    const firstUse = !STATE.translationTarget;

    if (prepared.tooLong) {
        openBubble({
            mode: 'error',
            prepared,
            detected,
            target,
            range: replacement.range,
            scope,
            firstUse: false,
            errorMessage: tooLongMessage(prepared, scope),
            retry: false
        });
        return;
    }

    if (!detected) {
        openBubble({
            mode: 'setup',
            prepared,
            detected: '',
            target,
            range: replacement.range,
            scope,
            firstUse
        });
        return;
    }

    if (!firstUse && detected === target) {
        openBubble({
            mode: 'error',
            prepared,
            detected,
            target,
            range: replacement.range,
            scope,
            firstUse: false,
            errorMessage: translationMessage('same', {
                source: detected,
                target
            }),
            retry: false
        });
        return;
    }

    openBubble({
        mode: firstUse ? 'setup' : 'progress',
        prepared,
        detected,
        target,
        range: replacement.range,
        scope,
        firstUse
    });

    if (!firstUse) {
        requestTranslation();
    }
}

/**
 * Build the compact language/progress/error bubble.
 * @param {{mode: 'setup'|'progress'|'error', prepared: Object,
 *     detected: string, target: string, range: Range, scope: string,
 *     firstUse: boolean, errorMessage?: string, retry?: boolean}} options
 */
function openBubble(options) {
    if (bubbleState) {
        closeTranslationBubble({ restoreFocus: false });
    }

    const {
        mode,
        prepared,
        detected,
        target,
        range,
        scope,
        firstUse,
        errorMessage = '',
        retry = false
    } = options;
    const returnFocus = document.getElementById(CONFIG.toolbarId)
        ?.querySelector('[data-command="translate"]') || document.activeElement;

    const bubble = document.createElement('div');
    bubble.id = CONFIG.translationBubbleId;
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-modal', 'false');
    bubble.setAttribute('aria-labelledby', 'accessibility-translate-title');
    bubble.setAttribute('lang', 'en');
    bubble.setAttribute('dir', 'ltr');
    bubble.tabIndex = -1;

    if (!STATE.isDarkMode) {
        bubble.classList.add('light-mode');
    }

    bubble.innerHTML = `
        <h3 id="accessibility-translate-title">Translate</h3>
        <p class="translation-note">
            Machine translation by Chrome. The text is not uploaded.
        </p>
        <div class="translation-languages">
            <div class="translation-field">
                <label for="atx-translate-source">From</label>
                <select id="atx-translate-source" class="translation-select"></select>
            </div>
            <div class="translation-field">
                <label for="atx-translate-target">To</label>
                <select id="atx-translate-target" class="translation-select"></select>
            </div>
        </div>
        <div class="translation-status" role="status" aria-live="polite"></div>
        <div class="translation-error" role="alert" hidden></div>
        <div class="translation-actions">
            <button type="button" class="translation-submit">Translate</button>
            <button type="button" class="translation-cancel" hidden>Cancel</button>
        </div>
        <button type="button" class="translation-close"
            aria-label="Close translation">✕</button>
    `;

    bubbleState = {
        bubble,
        mode,
        prepared,
        detectedSource: detected,
        sourceMode: 'auto',
        target,
        range,
        scope,
        firstUse,
        busy: false,
        creating: false,
        createController: null,
        requestController: null,
        returnFocus,
        languages: bubble.querySelector('.translation-languages'),
        sourceSelect: bubble.querySelector('#atx-translate-source'),
        targetSelect: bubble.querySelector('#atx-translate-target'),
        status: bubble.querySelector('.translation-status'),
        error: bubble.querySelector('.translation-error'),
        submit: bubble.querySelector('.translation-submit'),
        cancel: bubble.querySelector('.translation-cancel'),
        close: bubble.querySelector('.translation-close')
    };

    fillSourceSelect(bubbleState.sourceSelect, detected);
    fillTargetSelect(bubbleState.targetSelect, target);
    bindBubbleEvents(bubble);

    if (mode === 'progress') {
        bubbleState.languages.hidden = true;
        bubbleState.submit.hidden = true;
        bubbleState.cancel.hidden = false;
    } else if (mode === 'error') {
        showBubbleError(errorMessage, retry);
    }

    STATE.translationBubbleOpen = true;
    getMountNode().appendChild(bubble);
    positionTranslationBubble();
    syncTranslationButton();

    if (mode === 'progress') {
        bubbleState.cancel.focus({ preventScroll: true });
    } else if (retry) {
        bubbleState.submit.focus({ preventScroll: true });
    } else if (mode === 'error') {
        bubbleState.close.focus({ preventScroll: true });
    } else {
        bubbleState.sourceSelect.focus({ preventScroll: true });
    }
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

    select.value = normalizeTranslationTarget(target);
}

/**
 * Wire the bubble's controls. Buttons keep the page selection; the selects
 * keep their native keyboard behaviour.
 * @param {HTMLElement} bubble
 */
function bindBubbleEvents(bubble) {
    if (!bubbleState) {
        return;
    }

    bubbleState.close.addEventListener('click', () => closeTranslationBubble());
    bubbleState.submit.addEventListener('click', requestTranslation);
    bubbleState.cancel.addEventListener('click', cancelTranslation);
    bubbleState.sourceSelect.addEventListener('change', () => {
        bubbleState.sourceMode = bubbleState.sourceSelect.value;
    });
    bubbleState.targetSelect.addEventListener('change', () => {
        bubbleState.target = bubbleState.targetSelect.value;
    });

    bubble.addEventListener('mousedown', (event) => {
        if (event.target.closest?.('button')) {
            event.preventDefault();
            event.stopPropagation();
        }
    });
}

/**
 * Start the translation with the picks in the bubble.
 */
function requestTranslation() {
    if (!bubbleState) {
        return;
    }

    if (bubbleState.busy) {
        abortCurrent();
    }

    const state = bubbleState;
    const source = state.sourceMode === 'auto'
        ? state.detectedSource
        : state.sourceMode;
    const target = normalizeTranslationTarget(state.targetSelect.value);
    state.target = target;

    hideBubbleError();
    state.submit.textContent = 'Translate';

    if (!source) {
        showBubbleError('Choose the source language to translate.', false);
        return;
    }

    if (source === target) {
        showBubbleError(
            translationMessage('same', { source, target }),
            false
        );
        return;
    }

    if (state.prepared.tooLong) {
        showBubbleError(
            tooLongMessage(state.prepared, state.scope),
            false
        );
        return;
    }

    const createController = new AbortController();
    const requestController = new AbortController();
    let lastProgressBucket = -1;
    state.createController = createController;
    state.requestController = requestController;
    state.creating = true;
    state.languages.hidden = true;
    state.submit.hidden = true;
    state.cancel.hidden = false;
    setBusy(true);
    setStatus('Preparing language pack…');
    positionTranslationBubble();

    service.translate({
        text: state.prepared.text,
        source,
        target,
        createSignal: createController.signal,
        signal: requestController.signal,
        onProgress(loaded) {
            if (bubbleState !== state ||
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
            if (bubbleState !== state ||
                state.requestController !== requestController) {
                return;
            }
            state.creating = false;
            setStatus('Translating…');
        }
    }).then((result) => {
        if (bubbleState !== state ||
            state.requestController !== requestController) {
            return;
        }
        finishRequest(result);
    }).catch(() => {
        if (bubbleState !== state ||
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
 * Abort the request in flight. A finished creation keeps its translator, so
 * only an in-progress creation aborts the create signal.
 */
function abortCurrent() {
    if (!bubbleState) {
        return;
    }

    const state = bubbleState;
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
    if (!bubbleState) {
        return;
    }

    const state = bubbleState;
    state.creating = false;
    state.createController = null;
    state.requestController = null;
    setBusy(false);
    state.cancel.hidden = true;
    state.languages.hidden = false;

    if (result.ok) {
        applyTranslation(
            state.range,
            result.text,
            result.source,
            result.target,
            state.firstUse
        );
        closeTranslationBubble();
        return;
    }

    if (result.code === 'cancelled') {
        closeTranslationBubble();
        return;
    }

    state.submit.hidden = false;
    state.submit.textContent = result.retry ? 'Try again' : 'Translate';
    showBubbleError(result.message, Boolean(result.retry));
    positionTranslationBubble();
}

/**
 * Replace the range with the translated wrapper and record it.
 * @param {Range} range
 * @param {string} text
 * @param {string} source
 * @param {string} target
 * @param {boolean} firstUse
 */
function applyTranslation(range, text, source, target, firstUse) {
    if (!range || !range.commonAncestorContainer.isConnected) {
        showToast('The selection is no longer on the page.', { error: true });
        return;
    }

    STATE.isApplyingCommand = true;
    try {
        const fragment = range.extractContents();
        const originalNodes = Array.from(fragment.childNodes);
        if (originalNodes.length === 0) {
            throw new Error('empty selection');
        }

        const wrapper = document.createElement('span');
        wrapper.setAttribute(CONFIG.translationAttr, target);
        wrapper.setAttribute('lang', target);
        wrapper.setAttribute('dir', 'auto');
        wrapper.textContent = text;
        range.insertNode(wrapper);

        const record = {
            wrapper,
            originalNodes,
            parent: wrapper.parentNode,
            next: wrapper.nextSibling,
            source,
            target,
            translated: true
        };
        STATE.translations.set(wrapper, record);

        const selection = window.getSelection();
        if (selection) {
            const selected = document.createRange();
            selected.selectNodeContents(wrapper);
            selection.removeAllRanges();
            selection.addRange(selected);
            STATE.savedRange = selected.cloneRange();
        }

        pushHistory({
            type: 'translation',
            label: 'Translate',
            changes: [],
            record,
            before: 'original',
            after: 'translated'
        });

        STATE.translationTarget = target;
        saveSyncedPreferences({ translationTarget: target });
        updateToolbarState();
        showToast(
            `Translated to ${translationLanguageName(target)}. ` +
            'Press Alt+Shift+G again or Undo to restore.'
        );
    } catch (error) {
        console.error('Translation could not be applied:', error);
        showToast('The translation could not be applied to the page.',
            { error: true });
    } finally {
        STATE.isApplyingCommand = false;
    }
}

/**
 * Restore a translation's original text and add the restore to history.
 * @param {Object} record
 */
function restoreTranslation(record) {
    if (!setTranslationState(record, 'original')) {
        showToast('The original text is no longer on the page.', { error: true });
        return;
    }

    pushHistory({
        type: 'translation',
        label: 'Restore original',
        changes: [],
        record,
        before: 'translated',
        after: 'original'
    });
    updateToolbarState();
    showToast('Original text restored');
}

/**
 * Abort the current request and close the bubble.
 */
function cancelTranslation() {
    if (!bubbleState) {
        return;
    }

    abortCurrent();
    closeTranslationBubble();
    showToast('Translation cancelled');
}

/**
 * @param {string} message
 */
function setStatus(message) {
    if (bubbleState) {
        bubbleState.status.textContent = message;
    }
}

/**
 * @param {string} message
 * @param {boolean} retry
 */
function showBubbleError(message, retry) {
    if (!bubbleState) {
        return;
    }

    bubbleState.error.textContent = message;
    bubbleState.error.hidden = false;
    bubbleState.languages.hidden = false;
    bubbleState.submit.hidden = false;
    bubbleState.submit.textContent = retry ? 'Try again' : 'Translate';
    if (retry) {
        bubbleState.submit.focus({ preventScroll: true });
    }
}

function hideBubbleError() {
    if (bubbleState) {
        bubbleState.error.textContent = '';
        bubbleState.error.hidden = true;
    }
}

/**
 * Mirror the busy state on the bubble and the toolbar button.
 * @param {boolean} busy
 */
function setBusy(busy) {
    if (!bubbleState) {
        return;
    }

    bubbleState.busy = busy;
    bubbleState.bubble.setAttribute('aria-busy', String(busy));
    setToolbarBusy(busy);
}

/**
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
 * Place the bubble beside the toolbar, choosing the side with room and
 * clamping it to the viewport.
 */
export function positionTranslationBubble() {
    if (!bubbleState) {
        return;
    }

    const margin = 15;
    const gap = 10;
    const bubble = bubbleState.bubble;
    const toolbar = document.getElementById(CONFIG.toolbarId);
    const anchor = toolbar
        ? toolbar.getBoundingClientRect()
        : STATE.savedRange?.getBoundingClientRect();

    if (!anchor) {
        return;
    }

    const width = bubble.offsetWidth || 340;
    const height = bubble.offsetHeight || 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left;
    let top;

    if (width <= viewportWidth - anchor.right - gap - margin) {
        left = anchor.right + gap;
        top = anchor.top;
    } else if (anchor.left - gap - margin >= width) {
        left = anchor.left - gap - width;
        top = anchor.top;
    } else {
        left = anchor.left + anchor.width / 2 - width / 2;

        if (height <= viewportHeight - anchor.bottom - gap - margin) {
            top = anchor.bottom + gap;
        } else if (height <= anchor.top - gap - margin) {
            top = anchor.top - gap - height;
        } else {
            top = margin;
        }
    }

    left = Math.max(margin, Math.min(left, viewportWidth - width - margin));
    top = Math.max(margin, Math.min(top, viewportHeight - height - margin));

    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
}

/**
 * Close the bubble and restore focus to Translate. A translation already in
 * the page is untouched.
 * @param {{restoreFocus?: boolean}} [options]
 */
export function closeTranslationBubble(options = {}) {
    const { restoreFocus = true } = options;

    if (!bubbleState) {
        const stray = document.getElementById(CONFIG.translationBubbleId);
        if (stray) {
            stray.remove();
        }
        STATE.translationBubbleOpen = false;
        setToolbarBusy(false);
        syncTranslationButton();
        return;
    }

    const state = bubbleState;
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

    state.bubble.remove();
    bubbleState = null;
    STATE.translationBubbleOpen = false;
    setToolbarBusy(false);
    syncTranslationButton();

    if (restoreFocus && state.returnFocus && state.returnFocus.isConnected) {
        state.returnFocus.focus({ preventScroll: true });
    }
}

/**
 * Keep the toolbar's Translate button in sync with the selection and target.
 */
export function syncTranslationButton() {
    const button = document.getElementById(CONFIG.toolbarId)
        ?.querySelector('[data-command="translate"]');
    if (!button) {
        return;
    }

    const wrapper = translationWrapperFor(STATE.savedRange);
    const record = wrapper ? STATE.translations.get(wrapper) : null;
    const translated = Boolean(record && record.translated);
    const target = STATE.translationTarget
        ? normalizeTranslationTarget(STATE.translationTarget)
        : '';

    if (translated) {
        button.textContent = '↺';
        button.dataset.tooltip = `Show original (${SHORTCUT_LABELS.translate})`;
        button.setAttribute('aria-label', 'Show original');
        button.setAttribute('aria-pressed', 'true');
        button.removeAttribute('aria-haspopup');
        button.removeAttribute('aria-expanded');
        return;
    }

    button.textContent = '文A';
    button.setAttribute('aria-label', 'Translate');
    button.setAttribute('aria-pressed', 'false');

    if (target) {
        const name = translationLanguageName(target);
        button.dataset.tooltip =
            `Translate to ${name} (${SHORTCUT_LABELS.translate}) · ` +
            'Shift-click: paragraph';
        button.removeAttribute('aria-haspopup');
        button.removeAttribute('aria-expanded');
    } else {
        button.dataset.tooltip =
            `Translate (${SHORTCUT_LABELS.translate}) · Choose a language`;
        button.setAttribute('aria-haspopup', 'dialog');
        if (bubbleState) {
            button.setAttribute('aria-expanded', 'true');
        } else {
            button.setAttribute('aria-expanded', 'false');
        }
    }
}
