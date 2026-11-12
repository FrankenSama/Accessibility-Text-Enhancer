// Scope resolution: decide which elements a command should affect.

import { BLOCK_COMMANDS, COMMAND_LABELS, COMMAND_PROPERTIES, CONFIG } from './core.js';
import {
    getBlocksForRange,
    getContainingWrapper,
    getExactElement,
    wrapRange
} from './dom.js';

/**
 * The scope a command uses when the user does not override it.
 * @param {string} command
 * @returns {'block'|'selection'}
 */
export function defaultScopeFor(command) {
    return BLOCK_COMMANDS.has(command) ? 'block' : 'selection';
}

/**
 * Shift-click flips the default scope: paragraph commands apply to the
 * selection, and selection commands apply to the whole paragraph.
 * @param {string} command
 * @param {boolean} shiftKey
 * @returns {'block'|'selection'|undefined}
 */
export function getScopeOverride(command, shiftKey) {
    if (!shiftKey) {
        return undefined;
    }

    if (BLOCK_COMMANDS.has(command)) {
        return 'selection';
    }

    if (command === 'bold' || command === 'highlight') {
        return 'block';
    }

    return undefined;
}

/**
 * Resolve which elements a command should modify.
 * @param {Range} range
 * @param {string} command
 * @param {{scope?: 'block'|'selection'}} options
 * @returns {{targets: HTMLElement[], scope: 'block'|'selection', fallback: boolean}}
 */
export function resolveScope(range, command, options = {}) {
    const scope = options.scope || defaultScopeFor(command);
    const blocks = getBlocksForRange(range);

    if (scope === 'block') {
        return { targets: blocks, scope: 'block', fallback: false };
    }

    // A selection that covers several blocks is applied to each of them
    // rather than wrapping across block boundaries.
    if (blocks.length > 1) {
        return { targets: blocks, scope: 'block', fallback: true };
    }

    const wrapper = getContainingWrapper(range);
    if (wrapper) {
        return { targets: [wrapper], scope: 'selection', fallback: false };
    }

    const exact = getExactElement(range);
    if (exact) {
        return { targets: [exact], scope: 'selection', fallback: false };
    }

    const wrappers = wrapRange(range);
    if (wrappers) {
        return { targets: wrappers, scope: 'selection', fallback: false };
    }

    return { targets: blocks, scope: 'block', fallback: true };
}

/**
 * Friendly name for a command, used in toasts and history feedback.
 * @param {string} command
 * @returns {string}
 */
export function commandLabel(command) {
    return COMMAND_LABELS[command] || 'Change';
}

/**
 * Describe a grouped change for the single summary toast.
 * @param {string} command
 * @param {{scope: string, fallback: boolean, targets: HTMLElement[]}} resolved
 * @returns {string}
 */
export function describeScope(command, resolved) {
    const label = commandLabel(command);

    if (resolved.scope === 'selection') {
        return `${label} applied to selection`;
    }

    const count = resolved.targets.length;
    const paragraphs = `${count} paragraph${count === 1 ? '' : 's'}`;

    if (resolved.fallback) {
        return `Selection spans blocks — ${label.toLowerCase()} applied to ${paragraphs}`;
    }

    return `${label} applied to ${paragraphs}`;
}

/**
 * Whether a toggle command's effect is already applied to an element.
 * @param {HTMLElement} element
 * @param {string} command
 * @returns {boolean}
 */
export function isCommandApplied(element, command) {
    switch (command) {
        case 'bold': {
            const weight = getComputedStyle(element).fontWeight;
            return weight === 'bold' || parseInt(weight, 10) >= 700;
        }
        case 'highlight':
            return element.hasAttribute(CONFIG.highlightAttr);
        case 'fontStyle': {
            const family = getComputedStyle(element).fontFamily.toLowerCase();
            return family.includes('georgia') ||
                (family.includes('serif') && !family.includes('sans-serif'));
        }
        case 'spacing':
            return element.style.getPropertyValue('letter-spacing') === '2px' &&
                   element.style.getPropertyValue('word-spacing') === '4px';
        default:
            return false;
    }
}

/**
 * Remove a command's exact-selection overrides so the wrapper inherits the
 * block-level style instead.
 * @param {HTMLElement} wrapper
 * @param {string} command
 */
export function clearWrapperOverride(wrapper, command) {
    (COMMAND_PROPERTIES[command] || []).forEach((property) => {
        wrapper.style.removeProperty(property);
    });

    if (command === 'highlight') {
        wrapper.removeAttribute(CONFIG.highlightAttr);
    }
}
