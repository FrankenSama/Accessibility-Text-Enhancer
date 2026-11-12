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
export function restoreElementState(element, state) {
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
    STATE.history = STATE.history.slice(0, STATE.historyIndex + 1);
    STATE.history.push(entry);
    STATE.historyIndex++;

    if (STATE.history.length > CONFIG.maxHistorySize) {
        STATE.history.shift();
        STATE.historyIndex--;
    }
}

/**
 * Restore one side of a history entry.
 * @param {{changes: Array<{element: HTMLElement, before: Object, after: Object}>}} entry
 * @param {'before'|'after'} side
 * @returns {number} Number of targets that were still on the page
 */
export function applyHistoryEntry(entry, side) {
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
