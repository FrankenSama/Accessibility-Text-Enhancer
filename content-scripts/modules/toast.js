// The single live-region notification used by every user-facing message.

import { CONFIG } from './core.js';
import { getMountNode } from './dom.js';

let toastElement = null;
let toastShowTimer = null;
let toastHideTimer = null;
let toastClearTimer = null;

/**
 * Return the single live region used for notifications, creating it on
 * first use. Reusing one element keeps announcements reliable: replacing
 * a live region for every message can make screen readers miss them.
 * @returns {HTMLElement}
 */
function getToastElement() {
    if (toastElement && toastElement.isConnected) {
        return toastElement;
    }

    // Build the element directly instead of looking up the id: a page is
    // free to use the same id, and mutating its element would be wrong.
    toastElement = document.createElement('div');
    toastElement.id = CONFIG.toastId;
    toastElement.className = 'accessibility-toast';
    toastElement.setAttribute('role', 'status');
    toastElement.setAttribute('aria-live', 'polite');
    toastElement.setAttribute('aria-atomic', 'true');
    getMountNode().appendChild(toastElement);

    return toastElement;
}

/**
 * Show a temporary notification toast.
 * @param {string} message - Message to display
 * @param {object} [options]
 * @param {boolean} [options.error] - Keep the message on screen longer
 */
export function showToast(message, options = {}) {
    const toast = getToastElement();
    const duration = options.error
        ? CONFIG.toastErrorDuration
        : CONFIG.toastDuration;

    clearTimeout(toastShowTimer);
    clearTimeout(toastHideTimer);
    clearTimeout(toastClearTimer);

    // Clear the old message first so repeating the same text is announced
    // again instead of being treated as an unchanged live region.
    toast.textContent = '';
    toast.classList.remove('visible');
    toast.classList.toggle('error', Boolean(options.error));

    toastShowTimer = setTimeout(() => {
        toast.textContent = message;
        toast.classList.add('visible');

        toastHideTimer = setTimeout(() => {
            toast.classList.remove('visible');
            toastClearTimer = setTimeout(() => {
                // Keep the live region in the document, but empty it so
                // stale text is not re-announced the next time it is used.
                toast.textContent = '';
            }, 300);
        }, duration);
    }, 0);
}
