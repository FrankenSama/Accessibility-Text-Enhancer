// Undo and redo history for page changes.

import { CONFIG, STATE } from './core.js';
import { showToast } from './toast.js';
import { updateToolbarState } from './toolbar.js';

// ==================== HISTORY MANAGEMENT ====================

/**
 * Capture the inline style and extension marker for an element.
 * @param {HTMLElement} element
 * @returns {{style: string|null, highlight: string|null}}
 */
export function captureElementState(element) {
    return {
        style: element.getAttribute('style'),
        highlight: element.getAttribute(CONFIG.highlightAttr)
    };
}

/**
 * Restore a previously captured element state.
 * @param {HTMLElement} element
 * @param {{style: string|null, highlight: string|null}} state
 */
function restoreElementState(element, state) {
    if (state.style === null) {
        element.removeAttribute('style');
    } else {
        element.setAttribute('style', state.style);
    }

    if (state.highlight === null) {
        element.removeAttribute(CONFIG.highlightAttr);
    } else {
        element.setAttribute(CONFIG.highlightAttr, state.highlight);
    }
}

/**
 * Add an entry to the undo history.
 * @param {{changes: Array<{element: HTMLElement, before: Object, after: Object}>, label?: string}} entry
 */
export function pushHistory(entry) {
    // Remember the first state each element was seen in. Reset page uses
    // this instead of replaying the (capped) undo history, so changes that
    // scrolled out of history are still reversible.
    for (const change of entry.changes) {
        if (!STATE.originals.has(change.element)) {
            STATE.originals.set(change.element, change.before);
        }
    }
    pruneOriginals();

    STATE.history = STATE.history.slice(0, STATE.historyIndex + 1);
    STATE.history.push(entry);
    STATE.historyIndex++;

    if (STATE.history.length > CONFIG.maxHistorySize) {
        STATE.history.shift();
        STATE.historyIndex--;
    }
}

/**
 * Drop snapshots for elements a re-render detached, so a long-lived SPA
 * session does not keep them alive.
 */
function pruneOriginals() {
    if (STATE.originals.size <= CONFIG.maxHistorySize * 4) {
        return;
    }

    for (const element of STATE.originals.keys()) {
        if (!element.isConnected) {
            STATE.originals.delete(element);
        }
    }
}

/**
 * Restore one side of a history entry.
 * @param {{changes: Array<{element: HTMLElement, before: Object, after: Object}>}} entry
 * @param {'before'|'after'} side
 * @returns {number} Number of targets that were still on the page
 */
function applyHistoryEntry(entry, side) {
    let applied = 0;

    for (const change of entry.changes) {
        // Pages that re-render can detach an element a change was applied
        // to. Restoring it would silently do nothing, so skip it.
        if (!change.element.isConnected) {
            continue;
        }

        restoreElementState(change.element, change[side]);
        applied++;
    }

    return applied;
}

/**
 * Undo the last action.
 */
export function undo() {
    if (STATE.historyIndex < 0) {
        showToast('Nothing to undo');
        return;
    }

    const entry = STATE.history[STATE.historyIndex];
    const label = entry.label || 'change';
    STATE.historyIndex--;

    const applied = applyHistoryEntry(entry, 'before');
    updateToolbarState();

    if (applied === 0) {
        showToast(`Could not undo ${label} — the change is no longer on the page`,
            { error: true });
    } else if (applied < entry.changes.length) {
        showToast(`Undone: ${label} (some targets were no longer on the page)`);
    } else {
        showToast(`Undone: ${label}`);
    }
}

/**
 * Redo the last undone action.
 */
export function redo() {
    if (STATE.historyIndex >= STATE.history.length - 1) {
        showToast('Nothing to redo');
        return;
    }

    STATE.historyIndex++;
    const entry = STATE.history[STATE.historyIndex];
    const label = entry.label || 'change';

    const applied = applyHistoryEntry(entry, 'after');
    updateToolbarState();

    if (applied === 0) {
        showToast(`Could not redo ${label} — the change is no longer on the page`,
            { error: true });
    } else if (applied < entry.changes.length) {
        showToast(`Redone: ${label} (some targets were no longer on the page)`);
    } else {
        showToast(`Redone: ${label}`);
    }
}

// ==================== PAGE RESET ====================

/**
 * Remove a selection wrapper while keeping its content in place.
 * @param {HTMLElement} wrapper
 */
function unwrapElement(wrapper) {
    const parent = wrapper.parentNode;
    if (!parent) {
        return;
    }

    while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
    }
    parent.removeChild(wrapper);
    // Re-joining the split text nodes restores the original text nodes, so
    // the page's own markup and any page listeners keep working.
    parent.normalize();
}

/**
 * Whether this page has anything for Reset page to remove.
 * @returns {boolean}
 */
export function hasPageChanges() {
    return STATE.history.length > 0 ||
        document.querySelector(`[${CONFIG.selectionAttr}]`) !== null;
}

/**
 * Remove every change the extension made to this page and empty the undo
 * history. The page is left as it was found, including markup that predates
 * any selection wrapper.
 */
export function resetPageChanges() {
    if (!hasPageChanges()) {
        showToast('Nothing to reset');
        return false;
    }

    for (const [element, snapshot] of STATE.originals) {
        if (element.isConnected) {
            restoreElementState(element, snapshot);
        }
    }
    STATE.originals.clear();

    // Restoring a wrapper's snapshot only clears its inline style; the span
    // itself still splits the page's text nodes, so unwrap it too.
    document.querySelectorAll(`[${CONFIG.selectionAttr}]`).forEach((wrapper) => {
        if (!wrapper.closest(`#${CONFIG.toolbarId}, #${CONFIG.settingsPanelId}`)) {
            unwrapElement(wrapper);
        }
    });

    STATE.history = [];
    STATE.historyIndex = -1;
    STATE.savedRange = null;

    updateToolbarState();
    showToast('Page reset — all changes removed');
    return true;
}
