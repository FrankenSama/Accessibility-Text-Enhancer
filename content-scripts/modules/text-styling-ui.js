// Font, spacing, and highlight controls shared by the options page and the
// in-page settings dialog. The markup lives with each surface, so the
// controller only needs a root element and an optional id prefix.

import { COMMAND_PROPERTIES } from './core.js';
import {
    contrastRatio,
    forcedColorsActive,
    parseColor,
    parseHexColor,
    readableLineColor
} from './contrast.js';
import { loadOpenDyslexicFonts } from './fonts.js';
import {
    FONT_LABELS,
    fontStackFor,
    HIGHLIGHT_COLORS,
    HIGHLIGHT_STYLE_LABELS,
    HIGHLIGHT_STYLES,
    highlightValuesFor,
    normalizeTextDefaults,
    SPACING_LIMITS,
    SPACING_PRESETS,
    spacingValuesFor
} from './style-defaults.js';

const SPACING_KEYS = [
    'letterSpacing',
    'wordSpacing',
    'lineHeight',
    'paragraphSpacing'
];

/**
 * Append one option to a select.
 * @param {HTMLSelectElement} select
 * @param {string} value
 * @param {string} label
 */
function addOption(select, value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
}

/**
 * Clamp a custom spacing value to its shared range.
 * @param {string} key
 * @param {number|string} raw
 * @returns {number}
 */
function clampSpacing(key, raw) {
    const limit = SPACING_LIMITS[key];
    const number = typeof raw === 'number' ? raw : parseFloat(raw);

    if (!Number.isFinite(number)) {
        return limit.min;
    }

    return Math.round(Math.min(limit.max, Math.max(limit.min, number)) * 1000) / 1000;
}

/**
 * Human-readable slider value, with the unit the command applies.
 * @param {string} key
 * @param {number} value
 * @returns {string}
 */
function formatSpacingValue(key, value) {
    if (key === 'lineHeight') {
        return value.toFixed(1);
    }
    return `${Number(value.toFixed(3))}em`;
}

/**
 * Wire the text-styling controls under a root element.
 *
 * The controller owns a draft copy for live previews. It calls `save(values)`
 * when a change should persist; the caller updates its own defaults and may
 * call `sync()` to roll the controls back if the write fails.
 *
 * @param {Object} options
 * @param {HTMLElement|Document} options.root
 * @param {string} [options.prefix] ID prefix used by the surface's markup.
 * @param {() => Object} options.getDefaults
 * @param {(values: Object) => void} options.save
 * @param {(message: string) => void} [options.announce]
 * @returns {{sync: (defaults?: Object) => void}}
 */
export function initTextStylingControls({
    root,
    prefix = '',
    getDefaults,
    save,
    announce = () => {}
}) {
    const byId = (name) => root.querySelector(`#${prefix}${name}`);
    const fontSelect = byId('text-font');
    const presetSelect = byId('text-spacing-preset');
    const customSpacing = byId('custom-spacing');
    const colorSelect = byId('text-highlight-color');
    const colorSwatch = byId('text-highlight-swatch');
    const styleSelect = byId('text-highlight-style');
    const previewEl = byId('text-preview');
    const resetButton = byId('reset-text-styling');

    if (!fontSelect || !presetSelect || !customSpacing || !colorSelect ||
        !colorSwatch || !styleSelect || !previewEl || !resetButton) {
        throw new Error('Text styling controls are incomplete');
    }

    const inputs = {
        letterSpacing: byId('text-letter-spacing'),
        wordSpacing: byId('text-word-spacing'),
        lineHeight: byId('text-line-height'),
        paragraphSpacing: byId('text-paragraph-spacing')
    };
    const outputs = {
        letterSpacing: byId('text-letter-spacing-value'),
        wordSpacing: byId('text-word-spacing-value'),
        lineHeight: byId('text-line-height-value'),
        paragraphSpacing: byId('text-paragraph-spacing-value')
    };

    Object.entries(FONT_LABELS).forEach(([value, label]) => {
        addOption(fontSelect, value, label);
    });
    Object.entries(SPACING_PRESETS).forEach(([value, preset]) => {
        addOption(presetSelect, value, preset.label);
    });
    Object.entries(HIGHLIGHT_COLORS).forEach(([value, color]) => {
        addOption(colorSelect, value, color.label);
    });
    HIGHLIGHT_STYLES.forEach((value) => {
        addOption(styleSelect, value, HIGHLIGHT_STYLE_LABELS[value]);
    });

    SPACING_KEYS.forEach((key) => {
        const limit = SPACING_LIMITS[key];
        inputs[key].min = String(limit.min);
        inputs[key].max = String(limit.max);
        inputs[key].step = String(limit.step);
    });

    let draft = normalizeTextDefaults(getDefaults());

    /**
     * Draw an underline fallback in the preview.
     * @param {string} lineColor
     */
    function applyPreviewLine(lineColor) {
        previewEl.style.textDecorationLine = 'underline';
        previewEl.style.textDecorationThickness = '2px';
        previewEl.style.textDecorationColor = readableLineColor(previewEl, lineColor);
        previewEl.style.textUnderlineOffset = '2px';
    }

    /**
     * Show the saved font, spacing, and highlight on the sample sentence.
     */
    function updatePreview() {
        const spacing = spacingValuesFor(draft);
        const highlight = highlightValuesFor(draft);
        const forced = forcedColorsActive();
        const style = previewEl.style;

        style.fontFamily = fontStackFor(draft.fontFamily);
        style.letterSpacing = `${spacing.letterSpacing}em`;
        style.wordSpacing = `${spacing.wordSpacing}em`;
        style.lineHeight = spacing.lineHeight === null
            ? ''
            : String(spacing.lineHeight);

        previewEl.querySelector('p').style.marginBottom =
            spacing.paragraphSpacing === null
                ? ''
                : `${spacing.paragraphSpacing}em`;

        COMMAND_PROPERTIES.highlight.forEach((property) => style.removeProperty(property));

        const textColor = parseColor(getComputedStyle(previewEl).color) ||
            { r: 0, g: 0, b: 0 };
        const highlightColor = parseHexColor(highlight.background);
        const forceBackground = highlight.style === 'force-background';
        const canPaintBackground = !forced && Boolean(highlightColor) &&
            (forceBackground || contrastRatio(textColor, highlightColor) >= 4.5);

        if (highlight.style === 'underline') {
            applyPreviewLine(highlight.line);
            return;
        }

        if (canPaintBackground) {
            style.backgroundColor = highlight.background;
            return;
        }

        if (highlight.style === 'background') {
            applyPreviewLine(highlight.line);
            return;
        }

        style.outline = `2px solid ${readableLineColor(previewEl, highlight.line)}`;
    }

    /**
     * Mirror the draft into the controls and the preview.
     * @param {Object} [next]
     */
    function sync(next) {
        draft = normalizeTextDefaults(next || getDefaults());

        fontSelect.value = draft.fontFamily;
        presetSelect.value = draft.spacingPreset;
        colorSelect.value = draft.highlightColor;
        styleSelect.value = draft.highlightStyle;
        colorSwatch.style.backgroundColor =
            HIGHLIGHT_COLORS[draft.highlightColor].background;

        if (draft.fontFamily === 'opendyslexic') {
            loadOpenDyslexicFonts();
        }

        customSpacing.hidden = draft.spacingPreset !== 'custom';

        SPACING_KEYS.forEach((key) => {
            // A null line height or paragraph spacing leaves the page alone.
            // The hidden slider still needs a number, so show the neutral value.
            const value = draft[key] === null
                ? (key === 'lineHeight' ? 1 : 0)
                : draft[key];
            inputs[key].value = String(value);
            outputs[key].textContent = formatSpacingValue(key, value);
        });

        updatePreview();
    }

    /**
     * Apply a change locally and persist it.
     * @param {Object} values
     */
    function commit(values) {
        draft = normalizeTextDefaults({ ...draft, ...values });
        sync(draft);
        save(values);
    }

    fontSelect.addEventListener('change', () => {
        commit({ fontFamily: fontSelect.value });
    });

    presetSelect.addEventListener('change', () => {
        const spacingPreset = presetSelect.value;
        const updates = { spacingPreset };

        // Custom needs four concrete values. Seed the two nullable ones the
        // first time so the sliders match what the preview shows.
        if (spacingPreset === 'custom') {
            if (draft.lineHeight === null) {
                updates.lineHeight = 1.5;
            }
            if (draft.paragraphSpacing === null) {
                updates.paragraphSpacing = 1;
            }
        }

        commit(updates);
    });

    SPACING_KEYS.forEach((key) => {
        inputs[key].addEventListener('input', () => {
            draft[key] = clampSpacing(key, inputs[key].value);
            outputs[key].textContent = formatSpacingValue(key, draft[key]);
            updatePreview();
        });

        inputs[key].addEventListener('change', () => {
            save({ [key]: draft[key] });
        });
    });

    colorSelect.addEventListener('change', () => {
        commit({ highlightColor: colorSelect.value });
    });

    styleSelect.addEventListener('change', () => {
        commit({ highlightStyle: styleSelect.value });
    });

    resetButton.addEventListener('click', () => {
        const defaults = { ...normalizeTextDefaults() };
        commit(defaults);
        announce('Text styling reset to defaults.');
    });

    sync();

    return { sync };
}
