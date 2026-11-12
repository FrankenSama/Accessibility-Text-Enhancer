// Toast wording shared by commands that report their scope.

import { showToast } from './toast.js';

/**
 * Describe the applied scope in a toast message.
 * @param {{scope?: string}} options
 * @returns {string}
 */
export function scopeSuffix(options) {
    if (options.scope === 'block') {
        return ' (paragraph)';
    }
    if (options.scope === 'selection') {
        return ' (selection)';
    }
    return '';
}

/**
 * Show a toast unless the command is being applied to several targets.
 * @param {{silent?: boolean, scope?: string}} options
 * @param {string} message
 */
export function notify(options, message) {
    if (!options.silent) {
        showToast(message + scopeSuffix(options));
    }
}
