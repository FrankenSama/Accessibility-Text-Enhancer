// Text commands: dispatch, enhancement effects, and toggle state.
//
// Scope resolution lives in scope.js, contrast math in contrast.js, and
// undo history in history.js, so this module stays focused on applying a
// command to the elements the scope module picked.

import { CONFIG, COMMAND_PROPERTIES, STATE, TOGGLE_COMMANDS } from './core.js';
import {
    getBlocksForRange,
    getSelectedTextNodes,
    selectedSlice
} from './dom.js';
import { showToast } from './toast.js';
import { removeToolbar, updateToolbarState } from './toolbar.js';
import { stopReading, toggleReadAloud } from './reading.js';
import {
    disableReadingAids,
    toggleFocusMode,
    toggleReadingRuler
} from './reading-aids-ui.js';
import { showSettingsPanel, toggleToolbarTheme } from './settings.js';
import { translateSelection } from './translation-inline.js';
import { notify } from './feedback.js';
import {
    contrastRatio,
    fixTextContrast,
    forcedColorsActive,
    parseColor,
    parseHexColor,
    readableLineColor
} from './contrast.js';
import {
    FONT_LABELS,
    fontStackFor,
    highlightValuesFor,
    SPACING_PRESETS,
    spacingValuesFor
} from './style-defaults.js';
import { loadOpenDyslexicFonts } from './fonts.js';
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
            toggleReadAloud({ continuous: Boolean(options.continuous) });
            return;
        case 'translate':
            translateSelection(options.scope || 'selection');
            return;
        case 'stopReading':
            stopReading();
            return;
        case 'focusMode':
            toggleFocusMode();
            return;
        case 'readingRuler':
            toggleReadingRuler();
            return;
        case 'close':
            closeToolbar();
            return;
        default:
            enhanceSelection(command, options);
    }
}

/**
 * Dismiss the toolbar the way Escape does: stop reading silently, forget the
 * saved selection, and remove the toolbar. The page's own selection is left
 * alone, so Focus Toolbar can bring the toolbar back for it.
 */
function closeToolbar() {
    const hadAids = STATE.focusMode || STATE.readingRuler;

    if (STATE.speech) {
        stopReading({ silent: true });
    }

    disableReadingAids({ silent: true });
    STATE.savedRange = null;
    removeToolbar();
    showToast(hadAids ? 'Reading aids off' : 'Toolbar dismissed');
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

        if (statesDiffer(before, after)) {
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

            if (statesDiffer(before, after)) {
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
function applyCommand(element, command, options = {}) {
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
function toggleBold(element, options = {}) {
    const isBold = options.toggleOff ?? isCommandApplied(element, 'bold');
    element.style.setProperty('font-weight', isBold ? 'normal' : 'bold', 'important');
    notify(options, isBold ? 'Text unbolded' : 'Text bolded');
}

const HIGHLIGHT_PROPERTIES = COMMAND_PROPERTIES.highlight;

/**
 * Whether two captured element states differ in style or in any marker.
 * @param {Object} before
 * @param {Object} after
 * @returns {boolean}
 */
function statesDiffer(before, after) {
    return before.style !== after.style ||
        before.highlight !== after.highlight ||
        before.font !== after.font ||
        before.spacing !== after.spacing;
}

/**
 * Remove every property and marker the highlight command can set.
 * @param {HTMLElement} element
 */
function removeHighlightStyles(element) {
    HIGHLIGHT_PROPERTIES.forEach((property) => {
        element.style.removeProperty(property);
    });
    element.removeAttribute(CONFIG.highlightAttr);
}

/**
 * @param {HTMLElement} element
 * @param {string} color
 */
function applyBackgroundHighlight(element, color) {
    element.style.setProperty('background-color', color, 'important');
    element.setAttribute(CONFIG.highlightAttr, 'background');
}

/**
 * @param {HTMLElement} element
 * @param {string} color
 */
function applyOutlineHighlight(element, color) {
    element.style.setProperty('outline', `2px solid ${color}`, 'important');
    element.setAttribute(CONFIG.highlightAttr, 'outline');
}

/**
 * @param {HTMLElement} element
 * @param {string} color
 */
function applyUnderlineHighlight(element, color) {
    element.style.setProperty('text-decoration-line', 'underline', 'important');
    element.style.setProperty('text-decoration-thickness', '2px', 'important');
    element.style.setProperty('text-decoration-color', color, 'important');
    element.style.setProperty('text-underline-offset', '2px', 'important');
    element.setAttribute(CONFIG.highlightAttr, 'underline');
}

/**
 * Toggle the saved highlight mode: a background, an outline, or an underline.
 * @param {HTMLElement} element - Element to modify
 * @param {{silent?: boolean, scope?: string, toggleOff?: boolean}} options
 */
function toggleHighlight(element, options = {}) {
    const mode = element.getAttribute(CONFIG.highlightAttr);
    const shouldRemove = options.toggleOff ?? Boolean(mode);

    if (shouldRemove) {
        const message = mode === 'outline'
            ? 'Outline removed'
            : mode === 'underline'
                ? 'Underline removed'
                : 'Highlight removed';

        removeHighlightStyles(element);
        notify(options, message);
        return;
    }

    // Part of a mixed selection that is being highlighted: keep the mode
    // it already has instead of stacking a background and an outline.
    if (mode) {
        notify(options,
            mode === 'background'
                ? 'Text highlighted'
                : mode === 'outline' ? 'Outline applied' : 'Underlined');
        return;
    }

    const values = highlightValuesFor(STATE.textDefaults);
    const forceBackground = values.style === 'force-background';

    if (forcedColorsActive()) {
        if (values.style === 'underline') {
            applyUnderlineHighlight(element, 'Highlight');
            notify(options, 'Underlined (system highlight)');
        } else {
            applyOutlineHighlight(element, 'Highlight');
            notify(options, 'Outline applied (system highlight)');
        }
        return;
    }

    const style = getComputedStyle(element);
    const hasBackgroundImage = style.backgroundImage !== 'none';
    const clipsBackgroundToText = style.backgroundClip === 'text' ||
        style.webkitBackgroundClip === 'text';
    const textColor = parseColor(style.color) || { r: 0, g: 0, b: 0 };
    const highlightColor = parseHexColor(values.background);

    // A background only works when the text stays readable on it. An element
    // that paints its own colour is fine to override, but a background image
    // or gradient sits on top of the colour, so painting underneath would
    // leave the text on the image. In both cases use a line instead. Force
    // background skips the contrast check, not the image check.
    const backgroundIsReadable = Boolean(highlightColor) &&
        contrastRatio(textColor, highlightColor) >= 4.5;
    const canPaintBackground = !hasBackgroundImage && !clipsBackgroundToText &&
        (forceBackground || backgroundIsReadable);

    if (values.style === 'underline') {
        applyUnderlineHighlight(element, readableLineColor(element, values.line));
        notify(options, 'Underlined');
        return;
    }

    if (forceBackground) {
        if (canPaintBackground) {
            applyBackgroundHighlight(element, values.background);
            notify(options, 'Text highlighted');
        } else {
            applyUnderlineHighlight(element, readableLineColor(element, values.line));
            notify(options, 'Underlined: the page background hides a fill');
        }
        return;
    }

    if (values.style === 'background') {
        if (canPaintBackground) {
            applyBackgroundHighlight(element, values.background);
            notify(options, 'Text highlighted');
        } else {
            applyUnderlineHighlight(element, readableLineColor(element, values.line));
            notify(options, 'Underlined: background would hide the text');
        }
        return;
    }

    if (canPaintBackground) {
        applyBackgroundHighlight(element, values.background);
        notify(options, 'Text highlighted');
    } else {
        applyOutlineHighlight(element, readableLineColor(element, values.line));
        notify(options, 'Outline applied');
    }
}

/**
 * Adjust font size.
 * @param {HTMLElement} element - Element to modify
 * @param {number} change - Size change amount
 * @param {{silent?: boolean, scope?: string}} options
 */
function adjustFontSize(element, change, options = {}) {
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
 * Apply the saved font choice, or remove it and reveal the page's own font.
 * @param {HTMLElement} element - Element to modify
 * @param {{silent?: boolean, scope?: string, toggleOff?: boolean}} options
 */
function toggleFontStyle(element, options = {}) {
    const isApplied = options.toggleOff ?? isCommandApplied(element, 'fontStyle');

    if (isApplied) {
        element.style.removeProperty('font-family');
        element.removeAttribute(CONFIG.fontAttr);
        notify(options, 'Font reset');
        return;
    }

    const fontFamily = STATE.textDefaults.fontFamily;
    if (fontFamily === 'opendyslexic') {
        loadOpenDyslexicFonts();
    }
    element.style.setProperty('font-family', fontStackFor(fontFamily), 'important');
    element.setAttribute(CONFIG.fontAttr, fontFamily);
    notify(options, `Font: ${FONT_LABELS[fontFamily] || FONT_LABELS.sans}`);
}

/**
 * Whether an element can take a bottom margin without breaking the layout.
 * Inline selection targets cannot, so paragraph spacing skips them.
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isBlockTarget(element) {
    const display = getComputedStyle(element).display;
    return display === 'block' || display === 'flow-root' ||
        display === 'list-item' || display === 'table' ||
        display === 'table-caption' || display === 'flex' ||
        display === 'grid';
}

const SPACING_PROPERTIES = COMMAND_PROPERTIES.spacing;

/**
 * Apply the saved spacing preset, or remove every spacing property again.
 * @param {HTMLElement} element - Element to modify
 * @param {{silent?: boolean, scope?: string, toggleOff?: boolean}} options
 */
function adjustTextSpacing(element, options = {}) {
    const isApplied = options.toggleOff ?? isCommandApplied(element, 'spacing');

    if (isApplied) {
        SPACING_PROPERTIES.forEach((property) => {
            element.style.removeProperty(property);
        });
        element.removeAttribute(CONFIG.spacingAttr);
        notify(options, 'Spacing reset');
        return;
    }

    const values = spacingValuesFor(STATE.textDefaults);
    element.style.setProperty('letter-spacing', `${values.letterSpacing}em`, 'important');
    element.style.setProperty('word-spacing', `${values.wordSpacing}em`, 'important');

    if (values.lineHeight !== null) {
        element.style.setProperty('line-height', String(values.lineHeight), 'important');
    } else {
        element.style.removeProperty('line-height');
    }

    if (values.paragraphSpacing !== null && isBlockTarget(element)) {
        element.style.setProperty('margin-bottom', `${values.paragraphSpacing}em`, 'important');
    } else {
        element.style.removeProperty('margin-bottom');
    }

    const preset = STATE.textDefaults.spacingPreset;
    element.setAttribute(CONFIG.spacingAttr, preset);
    notify(options, `Text spacing: ${SPACING_PRESETS[preset].label}`);
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
function combineStates(states) {
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
