// Text commands: dispatch, enhancement effects, and toggle state.
//
// Scope resolution lives in scope.js, contrast math in contrast.js, and
// undo history in history.js, so this module stays focused on applying a
// command to the elements the scope module picked.

import {
    CONFIG,
    HIGHLIGHT_COLOR,
    STATE,
    TOGGLE_COMMANDS
} from './core.js';
import {
    getBlocksForRange,
    getSelectedTextNodes,
    selectedSlice
} from './dom.js';
import { showToast } from './toast.js';
import { updateToolbarState } from './toolbar.js';
import { stopReading, toggleReadAloud } from './reading.js';
import { showSettingsPanel, toggleToolbarTheme } from './settings.js';
import { notify } from './feedback.js';
import { contrastRatio, fixTextContrast, parseColor } from './contrast.js';
import { captureElementState, pushHistory, redo, undo } from './history.js';
import {
    clearWrapperOverride,
    commandLabel,
    defaultScopeFor,
    describeScope,
    isCommandApplied,
    resolveScope
} from './scope.js';

// ==================== COMMAND HANDLING ====================

/**
 * Handle toolbar command execution.
 * @param {string} command - The command to execute
 * @param {{scope?: 'block'|'selection'}} options - Scope override
 */
export function handleCommand(command, options = {}) {
    switch (command) {
        case 'settings':
            showSettingsPanel();
            return;
        case 'toggleTheme':
            toggleToolbarTheme();
            return;
        case 'undo':
            undo();
            return;
        case 'redo':
            redo();
            return;
        case 'readAloud':
            toggleReadAloud();
            return;
        case 'stopReading':
            stopReading();
            return;
        default:
            enhanceSelection(command, options);
    }
}

/**
 * Apply an enhancement to the saved selection.
 * @param {string} command - The enhancement command
 * @param {{scope?: 'block'|'selection'}} options - Scope override
 */
export function enhanceSelection(command, options = {}) {
    if (!STATE.isExtensionEnabled || !STATE.savedRange) {
        return;
    }

    const range = STATE.savedRange;
    if (range.collapsed || !range.toString().trim()) {
        return;
    }

    const anchor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;

    if (!anchor || anchor.closest(`#${CONFIG.toolbarId}, #${CONFIG.settingsPanelId}`)) {
        return;
    }

    const resolved = resolveScope(range, command, options);
    if (resolved.targets.length === 0) {
        showToast('Nothing to change');
        return;
    }

    const commandOptions = {
        // Only mention the scope when it differs from the command default,
        // so the common case stays quiet.
        scope: resolved.scope === defaultScopeFor(command) ? undefined : resolved.scope,
        // One grouped change gets a single summary toast.
        silent: resolved.targets.length > 1,
        // Toggle every target the same way: if the effect is already
        // present on all of them, turn it off everywhere; otherwise turn it
        // on everywhere. This avoids inverting mixed styles.
        toggleOff: TOGGLE_COMMANDS.has(command)
            ? resolved.targets.every((target) => isCommandApplied(target, command))
            : undefined
    };

    const changes = [];
    const nestedWrappers = new Set();

    const applyToTarget = (target) => {
        const before = captureElementState(target);
        applyCommand(target, command, commandOptions);
        const after = captureElementState(target);

        if (before.style !== after.style || before.highlight !== after.highlight) {
            changes.push({ element: target, before, after });
            return true;
        }

        return false;
    };

    let changedTargets = 0;

    for (const target of resolved.targets) {
        if (!target.isConnected) {
            continue;
        }

        // Any exact-selection wrapper inside a target must follow the
        // target's new value for the same property. This also covers the
        // case where selecting a whole paragraph resolves to the paragraph
        // itself rather than to a block command.
        target.querySelectorAll(`[${CONFIG.selectionAttr}]`).forEach((wrapper) => {
            nestedWrappers.add(wrapper);
        });

        if (applyToTarget(target)) {
            changedTargets++;
        }
    }

    // A change on a target supersedes exact-selection styling for the same
    // property inside it, so clear those overrides. Doing this only after
    // the target changed keeps a rejected command (such as a size limit)
    // from wiping a selection's own styling.
    if (changedTargets > 0) {
        for (const wrapper of nestedWrappers) {
            if (!wrapper.isConnected) {
                continue;
            }

            const before = captureElementState(wrapper);
            clearWrapperOverride(wrapper, command);
            const after = captureElementState(wrapper);

            if (before.style !== after.style || before.highlight !== after.highlight) {
                changes.push({ element: wrapper, before, after });
            }
        }
    }

    if (changes.length === 0) {
        // A grouped command that changed nothing (for example, every
        // target is already at the size limit) would otherwise be silent.
        if (commandOptions.silent) {
            showToast('Nothing to change');
        }
        return;
    }

    pushHistory({ changes, label: commandLabel(command) });

    if (commandOptions.silent) {
        showToast(describeScope(command, resolved));
    }

    updateToolbarState();
}

/**
 * Dispatch a style command to its enhancement function.
 * @param {HTMLElement} element - Element to modify
 * @param {string} command - The enhancement command
 * @param {{silent?: boolean, scope?: string}} options
 */
export function applyCommand(element, command, options = {}) {
    switch (command) {
        case 'bold':
            toggleBold(element, options);
            break;
        case 'highlight':
            toggleHighlight(element, options);
            break;
        case 'sizeDown':
            adjustFontSize(element, -2, options);
            break;
        case 'sizeUp':
            adjustFontSize(element, 2, options);
            break;
        case 'fontStyle':
            toggleFontStyle(element, options);
            break;
        case 'spacing':
            adjustTextSpacing(element, options);
            break;
        case 'contrast':
            fixTextContrast(element, options);
            break;
    }
}

// ==================== ENHANCEMENT FUNCTIONS ====================

/**
 * Toggle bold styling.
 * @param {HTMLElement} element - Element to modify
 * @param {{silent?: boolean, scope?: string, toggleOff?: boolean}} options
 */
export function toggleBold(element, options = {}) {
    const isBold = options.toggleOff ?? isCommandApplied(element, 'bold');
    element.style.setProperty('font-weight', isBold ? 'normal' : 'bold', 'important');
    notify(options, isBold ? 'Text unbolded' : 'Text bolded');
}

/**
 * Toggle highlight background or outline.
 * @param {HTMLElement} element - Element to modify
 * @param {{silent?: boolean, scope?: string, toggleOff?: boolean}} options
 */
export function toggleHighlight(element, options = {}) {
    const mode = element.getAttribute(CONFIG.highlightAttr);
    const shouldRemove = options.toggleOff ?? (mode === 'background' || mode === 'outline');

    if (shouldRemove) {
        if (mode === 'background') {
            element.style.removeProperty('background-color');
            notify(options, 'Highlight removed');
        } else {
            element.style.removeProperty('outline');
            notify(options, 'Outline removed');
        }

        element.removeAttribute(CONFIG.highlightAttr);
        return;
    }

    // Part of a mixed selection that is being highlighted: keep the mode
    // it already has instead of stacking a background and an outline.
    if (mode) {
        notify(options, mode === 'background' ? 'Text highlighted' : 'Outline applied');
        return;
    }

    const style = getComputedStyle(element);
    const background = parseColor(style.backgroundColor);
    const clipsBackgroundToText = style.backgroundClip === 'text' ||
        style.webkitBackgroundClip === 'text';
    const textColor = parseColor(style.color) || { r: 0, g: 0, b: 0 };

    // A yellow background only works when the text is dark enough to stay
    // readable on it. On dark sites (or after a contrast fix made the text
    // white) outline the element instead of hiding the text behind yellow.
    const backgroundIsReadable = contrastRatio(textColor, HIGHLIGHT_COLOR) >= 4.5;

    if (background || clipsBackgroundToText || !backgroundIsReadable) {
        element.style.setProperty('outline', '2px solid #ffeb3b', 'important');
        element.setAttribute(CONFIG.highlightAttr, 'outline');
        notify(options, 'Outline applied');
    } else {
        element.style.setProperty('background-color', '#ffeb3b', 'important');
        element.setAttribute(CONFIG.highlightAttr, 'background');
        notify(options, 'Text highlighted');
    }
}

/**
 * Adjust font size.
 * @param {HTMLElement} element - Element to modify
 * @param {number} change - Size change amount
 * @param {{silent?: boolean, scope?: string}} options
 */
export function adjustFontSize(element, change, options = {}) {
    const currentSize = parseFloat(getComputedStyle(element).fontSize);
    const newSize = currentSize + change;

    if (newSize >= CONFIG.fontSizeMin && newSize <= CONFIG.fontSizeMax) {
        element.style.setProperty('font-size', `${newSize}px`, 'important');
        notify(options, `Font size: ${newSize}px`);
    } else {
        notify(options, `Size limit reached (${CONFIG.fontSizeMin}-${CONFIG.fontSizeMax}px)`);
    }
}

/**
 * Toggle font family.
 * @param {HTMLElement} element - Element to modify
 * @param {{silent?: boolean, scope?: string, toggleOff?: boolean}} options
 */
export function toggleFontStyle(element, options = {}) {
    const isSerif = options.toggleOff ?? isCommandApplied(element, 'fontStyle');

    if (isSerif) {
        element.style.setProperty('font-family', 'Arial, sans-serif', 'important');
        notify(options, 'Font: Sans-serif');
    } else {
        element.style.setProperty('font-family', 'Georgia, serif', 'important');
        notify(options, 'Font: Serif');
    }
}

/**
 * Toggle text spacing.
 * @param {HTMLElement} element - Element to modify
 * @param {{silent?: boolean, scope?: string, toggleOff?: boolean}} options
 */
export function adjustTextSpacing(element, options = {}) {
    const isSpaced = options.toggleOff ?? isCommandApplied(element, 'spacing');

    if (isSpaced) {
        element.style.removeProperty('letter-spacing');
        element.style.removeProperty('word-spacing');
        notify(options, 'Spacing reset');
    } else {
        element.style.setProperty('letter-spacing', '2px', 'important');
        element.style.setProperty('word-spacing', '4px', 'important');
        notify(options, 'Spacing increased');
    }
}

/**
 * Read the current on/off state of every toggle command for the saved
 * selection. "mixed" means the selected text disagrees.
 * @returns {Record<string, boolean|'mixed'>}
 */
export function getToggleStates() {
    const range = STATE.savedRange;
    if (!range || !range.commonAncestorContainer.isConnected) {
        return {};
    }

    const textNodes = getSelectedTextNodes(range).filter(
        (node) => selectedSlice(range, node).trim()
    );
    const blocks = getBlocksForRange(range, textNodes);
    const states = {};

    for (const command of TOGGLE_COMMANDS) {
        if (command === 'bold') {
            const selected = textNodes.map((node) => {
                const element = node.parentElement;
                if (!element) {
                    return false;
                }
                const weight = getComputedStyle(element).fontWeight;
                return weight === 'bold' || parseInt(weight, 10) >= 700;
            });
            states.bold = combineStates(
                selected.length > 0
                    ? selected
                    : blocks.map((block) => isCommandApplied(block, command))
            );
        } else if (command === 'highlight') {
            const selected = textNodes.map((node) => Boolean(
                node.parentElement &&
                node.parentElement.closest(`[${CONFIG.highlightAttr}]`)
            ));
            states.highlight = combineStates(
                selected.length > 0
                    ? selected
                    : blocks.map((block) => isCommandApplied(block, command))
            );
        } else {
            states[command] = combineStates(
                blocks.map((block) => isCommandApplied(block, command))
            );
        }
    }

    return states;
}

/**
 * Collapse per-target toggle states into one aria-pressed value.
 * @param {boolean[]} states
 * @returns {boolean|'mixed'|undefined}
 */
export function combineStates(states) {
    if (states.length === 0) {
        return undefined;
    }
    if (states.every(Boolean)) {
        return true;
    }
    if (states.every((state) => !state)) {
        return false;
    }
    return 'mixed';
}
