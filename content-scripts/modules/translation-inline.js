// In-place selection translation: replace the selected text with its
// translation, keep the original for the toggle/Undo/Reset, and show only a
// compact language/progress/error bubble.

import { CONFIG, SHORTCUT_LABELS, STATE } from './core.js';
import { getMountNode } from './dom.js';
import { showToast } from './toast.js';
import {
    createToolbar,
    positionToolbar
} from './toolbar.js';
import {
    applyTranslationGroup,
    restoreTranslationRecords
} from './translation-apply.js';
import {
    createTranslationService,
    isSameLanguage,
    isTranslationAvailable,
    normalizeTranslationTarget,
    suggestTranslationTarget,
    translationLanguageName,
    translationMessage,
    TRANSLATION_LANGUAGES
} from './translation.js';
import {
    detectSource,
    retranslationTargetsFor,
    sourceNodeFor,
    tooLongMessage,
    totalPrepared,
    translationTargetsFor,
    translationWrappersFor
} from './translation-targets.js';

const service = createTranslationService({
    maxChars: CONFIG.translationMaxChars
});

// The language/progress bubble. Null when it is closed; a translation that is
// already in the page lives in STATE.translations instead.
let bubbleState = null;

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
        // A second activation while the request is in flight must not look
        // like a silent no-op: keep the bubble and its progress, and let
        // Cancel or Escape be the way out.
        if (bubbleState?.busy) {
            return;
        }
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

    const translated = translationWrappersFor(saved);
    if (translated.length > 0) {
        restoreTranslationRecords(translated);
        return;
    }

    if (!ensureToolbar(saved)) {
        return;
    }

    const targets = translationTargetsFor(saved, scope);
    if (!targets) {
        showToast(scope === 'block'
            ? 'Select text within a paragraph to translate.'
            : 'Select text to translate.');
        return;
    }

    const prepared = totalPrepared(targets);
    const detected = detectSource(sourceNodeFor(saved, scope));
    const firstUse = !STATE.translationTarget;
    const target = firstUse
        ? suggestTranslationTarget(detected, navigator.language)
        : normalizeTranslationTarget(STATE.translationTarget);

    if (prepared.tooLong) {
        openBubble({
            mode: 'error',
            targets,
            prepared,
            detected,
            target,
            scope,
            errorMessage: tooLongMessage(prepared, scope)
        });
        return;
    }

    if (!detected) {
        openBubble({
            mode: 'setup',
            targets,
            prepared,
            detected: '',
            target,
            scope
        });
        return;
    }

    if (!firstUse && detected === target) {
        openBubble({
            mode: 'error',
            targets,
            prepared,
            detected,
            target,
            scope,
            errorMessage: translationMessage('same', {
                source: detected,
                target
            })
        });
        return;
    }

    openBubble({
        mode: firstUse ? 'setup' : 'progress',
        targets,
        prepared,
        detected,
        target,
        scope
    });

    if (!firstUse) {
        requestTranslation();
    }
}

/**
 * Open the language bubble for the saved selection without translating. This
 * is the keyboard path for changing the target, and it re-translates an
 * existing wrapper from its stored original.
 */
export function openTranslationLanguage() {
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
        showToast('Select text or a paragraph to set the translation language.');
        return;
    }

    const retranslation = retranslationTargetsFor(saved);
    const targets = retranslation || translationTargetsFor(saved, 'selection');
    if (!targets) {
        showToast('Select text to set the translation language.');
        return;
    }

    if (!ensureToolbar(saved)) {
        return;
    }

    const prepared = totalPrepared(targets);
    const detected = retranslation
        ? retranslation[0].oldRecord.source
        : detectSource(sourceNodeFor(saved, 'selection'));
    const target = STATE.translationTarget
        ? normalizeTranslationTarget(STATE.translationTarget)
        : suggestTranslationTarget(detected, navigator.language);

    openBubble({
        mode: prepared.tooLong ? 'error' : 'setup',
        targets,
        prepared,
        detected,
        target,
        scope: 'selection',
        focusTarget: true,
        errorMessage: prepared.tooLong
            ? tooLongMessage(prepared, 'selection')
            : ''
    });
}

/**
 * Build the compact language/progress/error bubble.
 * @param {{mode: 'setup'|'progress'|'error', targets: Array<Object>,
 *     prepared: Object, detected: string, target: string, scope: string,
 *     focusTarget?: boolean, errorMessage?: string}} options
 */
function openBubble(options) {
    const {
        mode,
        targets,
        prepared,
        detected,
        target,
        scope,
        focusTarget = false,
        errorMessage = ''
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
            <button type="button" class="translation-swap" aria-label="Swap languages"
                data-tooltip="Swap languages">⇄</button>
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
        targets,
        prepared,
        detectedSource: detected,
        sourceMode: 'auto',
        scope,
        busy: false,
        creating: false,
        createController: null,
        requestController: null,
        returnFocus,
        languages: bubble.querySelector('.translation-languages'),
        sourceSelect: bubble.querySelector('#atx-translate-source'),
        targetSelect: bubble.querySelector('#atx-translate-target'),
        swap: bubble.querySelector('.translation-swap'),
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
        showBubbleError(errorMessage, false);
    }

    STATE.translationBubbleOpen = true;
    getMountNode().appendChild(bubble);
    positionTranslationBubble();
    syncTranslationButton();

    if (mode === 'progress') {
        bubbleState.cancel.focus({ preventScroll: true });
    } else if (mode === 'error') {
        bubbleState.close.focus({ preventScroll: true });
    } else if (focusTarget) {
        bubbleState.targetSelect.focus({ preventScroll: true });
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
    bubbleState.swap.addEventListener('click', swapLanguages);
    bubbleState.sourceSelect.addEventListener('change', () => {
        bubbleState.sourceMode = bubbleState.sourceSelect.value;
    });

    bubble.addEventListener('mousedown', (event) => {
        if (event.target.closest?.('button')) {
            event.preventDefault();
            event.stopPropagation();
        }
    });
}

/**
 * Swap the From and To languages without starting a translation. With Auto
 * selected, the detected source becomes the new target.
 */
function swapLanguages() {
    if (!bubbleState || bubbleState.busy) {
        return;
    }

    const state = bubbleState;
    const source = state.sourceMode === 'auto'
        ? state.detectedSource
        : state.sourceMode;
    const target = normalizeTranslationTarget(state.targetSelect.value);

    if (!source) {
        showBubbleError('Choose the source language before swapping.', false);
        return;
    }

    if (isSameLanguage(source, target)) {
        showBubbleError(translationMessage('same', { source, target }), false);
        return;
    }

    hideBubbleError();
    state.sourceMode = target;
    state.sourceSelect.value = target;
    state.targetSelect.value = source;
    setStatus(
        `Swapped to ${translationLanguageName(target)} from ` +
        `${translationLanguageName(source)}.`
    );
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

    hideBubbleError();
    state.submit.textContent = 'Translate';

    if (!source) {
        showBubbleError('Choose the source language to translate.', false);
        return;
    }

    if (isSameLanguage(source, target)) {
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

    translateGroup(state, source, target, createController, requestController)
        .then((result) => {
            if (bubbleState !== state ||
                state.requestController !== requestController) {
                return;
            }
            finishRequest(result);
        })
        .catch(() => {
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
 * Translate every target before touching the page. A failure or a cancel
 * returns without applying anything.
 * @param {Object} state
 * @param {string} source
 * @param {string} target
 * @param {AbortController} createController
 * @param {AbortController} requestController
 * @returns {Promise<Object>}
 */
async function translateGroup(
    state,
    source,
    target,
    createController,
    requestController
) {
    const results = [];
    const total = state.targets.length;
    let lastProgressBucket = -1;

    for (let index = 0; index < total; index++) {
        if (bubbleState !== state ||
            state.requestController !== requestController) {
            return {
                ok: false,
                code: 'cancelled',
                message: '',
                retry: false
            };
        }

        if (total > 1) {
            setStatus(`Translating paragraph ${index + 1} of ${total}…`);
        }

        const result = await service.translate({
            text: state.targets[index].prepared.text,
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
                if (total === 1) {
                    setStatus('Translating…');
                }
            }
        });

        if (!result.ok) {
            return {
                ...result,
                message: total > 1 && result.message
                    ? `Paragraph ${index + 1} of ${total}: ${result.message}`
                    : result.message
            };
        }

        results.push(result);
    }

    return { ok: true, results };
}

/**
 * Abort the in-flight creation and translation, if any.
 * @param {Object} state
 */
function abortState(state) {
    if (!state) {
        return;
    }

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
 * Abort the request in flight. A finished creation keeps its translator, so
 * only an in-progress creation aborts the create signal.
 */
function abortCurrent() {
    abortState(bubbleState);
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
    setStatus('');
    state.cancel.hidden = true;
    state.languages.hidden = false;

    if (result.ok) {
        const applied = applyTranslationGroup(
            state.targets,
            result.results
        );
        closeTranslationBubble();
        if (applied > 0) {
            const name = translationLanguageName(result.results[0].target);
            showToast(
                applied > 1
                    ? `Translated ${applied} paragraphs to ${name}. ` +
                        'Undo restores them together.'
                    : `Translated to ${name}. ` +
                        'Press Alt+Shift+G again or Undo to restore.'
            );
        }
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
    abortState(state);

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

    const wrappers = translationWrappersFor(STATE.savedRange);
    const translated = wrappers.length > 0;
    const target = STATE.translationTarget
        ? normalizeTranslationTarget(STATE.translationTarget)
        : '';

    if (translated) {
        button.textContent = '↺';
        button.dataset.tooltip = wrappers.length > 1
            ? `Restore ${wrappers.length} translations (${SHORTCUT_LABELS.translate})`
            : `Show original (${SHORTCUT_LABELS.translate})`;
        button.setAttribute(
            'aria-label',
            wrappers.length > 1
                ? `Restore ${wrappers.length} translations`
                : 'Show original'
        );
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
