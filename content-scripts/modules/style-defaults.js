// User-selected text styling defaults, shared by the content script, the
// options page, and settings import/export. Kept free of DOM and chrome APIs
// so every caller can normalize the same way.

export const FONT_STACKS = Object.freeze({
    sans: 'Arial, sans-serif',
    serif: "Georgia, 'Times New Roman', serif",
    mono: "'Courier New', Courier, monospace",
    opendyslexic: "'OpenDyslexic', Arial, sans-serif"
});

export const FONT_LABELS = Object.freeze({
    sans: 'Sans',
    serif: 'Serif',
    mono: 'Monospace',
    opendyslexic: 'OpenDyslexic'
});

// Light background for the highlight command and a darker line for outline
// and underline modes. The line colours stay above 3:1 against white so the
// command can fall back to a visible line instead of an invisible one.
export const HIGHLIGHT_COLORS = Object.freeze({
    yellow: Object.freeze({
        label: 'Yellow',
        background: '#ffeb3b',
        line: '#8a6d00'
    }),
    green: Object.freeze({
        label: 'Green',
        background: '#a5d6a7',
        line: '#2e7d32'
    }),
    blue: Object.freeze({
        label: 'Blue',
        background: '#90caf9',
        line: '#1565c0'
    }),
    pink: Object.freeze({
        label: 'Pink',
        background: '#f48fb1',
        line: '#ad1457'
    }),
    orange: Object.freeze({
        label: 'Orange',
        background: '#ffcc80',
        line: '#e65100'
    })
});

export const HIGHLIGHT_STYLES = Object.freeze([
    'auto',
    'background',
    'force-background',
    'underline'
]);

export const HIGHLIGHT_STYLE_LABELS = Object.freeze({
    auto: 'Auto',
    background: 'Background',
    'force-background': 'Force background',
    underline: 'Underline'
});

export const SPACING_PRESETS = Object.freeze({
    comfortable: Object.freeze({
        label: 'Comfortable',
        values: Object.freeze({
            letterSpacing: 0.125,
            wordSpacing: 0.25,
            lineHeight: null,
            paragraphSpacing: null
        })
    }),
    wcag: Object.freeze({
        label: 'WCAG 1.4.12',
        values: Object.freeze({
            letterSpacing: 0.12,
            wordSpacing: 0.16,
            lineHeight: 1.5,
            paragraphSpacing: 2
        })
    }),
    custom: Object.freeze({
        label: 'Custom',
        values: null
    })
});

// Values are in em, except line height, which is a unitless multiplier.
// A null line height or paragraph spacing leaves the page's own value alone.
export const SPACING_LIMITS = Object.freeze({
    letterSpacing: Object.freeze({ min: 0, max: 0.5, step: 0.005 }),
    wordSpacing: Object.freeze({ min: 0, max: 1, step: 0.05 }),
    lineHeight: Object.freeze({ min: 1, max: 3, step: 0.1 }),
    paragraphSpacing: Object.freeze({ min: 0, max: 4, step: 0.25 })
});

export const DEFAULT_TEXT_DEFAULTS = Object.freeze({
    fontFamily: 'sans',
    spacingPreset: 'comfortable',
    letterSpacing: 0.125,
    wordSpacing: 0.25,
    lineHeight: null,
    paragraphSpacing: null,
    highlightColor: 'yellow',
    highlightStyle: 'auto'
});

export const TEXT_DEFAULT_KEYS = Object.freeze(Object.keys(DEFAULT_TEXT_DEFAULTS));

const SPACING_KEYS = Object.freeze([
    'letterSpacing',
    'wordSpacing',
    'lineHeight',
    'paragraphSpacing'
]);

/**
 * Whether an object owns a key, so inherited values cannot select a font or
 * colour that is not in the palette.
 * @param {Object} object
 * @param {unknown} key
 * @returns {boolean}
 */
function hasOwn(object, key) {
    return typeof key === 'string' &&
        Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Read a finite number from a number or numeric string.
 * @param {unknown} value
 * @returns {number|null}
 */
function numberOf(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

/**
 * Clamp and round a spacing value.
 * @param {number} value
 * @param {{min: number, max: number}} limit
 * @returns {number}
 */
function clampSpacing(value, limit) {
    const clamped = Math.min(limit.max, Math.max(limit.min, value));
    return Math.round(clamped * 1000) / 1000;
}

/**
 * Fill missing or invalid text defaults with the shipped choices.
 * @param {Object} [values]
 * @returns {{fontFamily: string, spacingPreset: string, letterSpacing: number,
 *     wordSpacing: number, lineHeight: number|null,
 *     paragraphSpacing: number|null, highlightColor: string,
 *     highlightStyle: string}}
 */
export function normalizeTextDefaults(values = {}) {
    const source = values && typeof values === 'object' ? values : {};
    const normalized = { ...DEFAULT_TEXT_DEFAULTS };

    if (hasOwn(FONT_STACKS, source.fontFamily)) {
        normalized.fontFamily = source.fontFamily;
    }
    if (hasOwn(SPACING_PRESETS, source.spacingPreset)) {
        normalized.spacingPreset = source.spacingPreset;
    }
    if (hasOwn(HIGHLIGHT_COLORS, source.highlightColor)) {
        normalized.highlightColor = source.highlightColor;
    }
    if (HIGHLIGHT_STYLES.includes(source.highlightStyle)) {
        normalized.highlightStyle = source.highlightStyle;
    }

    for (const key of SPACING_KEYS) {
        if ((key === 'lineHeight' || key === 'paragraphSpacing') &&
            source[key] === null) {
            normalized[key] = null;
            continue;
        }

        const number = numberOf(source[key]);
        if (number !== null) {
            normalized[key] = clampSpacing(number, SPACING_LIMITS[key]);
        }
    }

    return normalized;
}

/**
 * Keep only the text defaults that a settings file actually provides and that
 * validate, so importing an older file does not reset the current choices.
 * @param {Object} values
 * @returns {Object} A partial text-defaults object.
 */
export function pickTextDefaults(values) {
    const picked = {};

    if (!values || typeof values !== 'object') {
        return picked;
    }

    if (hasOwn(FONT_STACKS, values.fontFamily)) {
        picked.fontFamily = values.fontFamily;
    }
    if (hasOwn(SPACING_PRESETS, values.spacingPreset)) {
        picked.spacingPreset = values.spacingPreset;
    }
    if (hasOwn(HIGHLIGHT_COLORS, values.highlightColor)) {
        picked.highlightColor = values.highlightColor;
    }
    if (HIGHLIGHT_STYLES.includes(values.highlightStyle)) {
        picked.highlightStyle = values.highlightStyle;
    }

    for (const key of SPACING_KEYS) {
        if ((key === 'lineHeight' || key === 'paragraphSpacing') &&
            values[key] === null) {
            picked[key] = null;
            continue;
        }

        if (values[key] === undefined) {
            continue;
        }

        const number = numberOf(values[key]);
        if (number !== null) {
            picked[key] = clampSpacing(number, SPACING_LIMITS[key]);
        }
    }

    return picked;
}

/**
 * The effective font stack for a font choice.
 * @param {string} fontFamily
 * @returns {string}
 */
export function fontStackFor(fontFamily) {
    return hasOwn(FONT_STACKS, fontFamily)
        ? FONT_STACKS[fontFamily]
        : FONT_STACKS[DEFAULT_TEXT_DEFAULTS.fontFamily];
}

/**
 * The spacing values a preset applies. Custom uses the stored values.
 * @param {Object} defaults
 * @returns {{letterSpacing: number, wordSpacing: number,
 *     lineHeight: number|null, paragraphSpacing: number|null}}
 */
export function spacingValuesFor(defaults) {
    const normalized = normalizeTextDefaults(defaults);
    const preset = SPACING_PRESETS[normalized.spacingPreset];

    if (preset.values) {
        return { ...preset.values };
    }

    return {
        letterSpacing: normalized.letterSpacing,
        wordSpacing: normalized.wordSpacing,
        lineHeight: normalized.lineHeight,
        paragraphSpacing: normalized.paragraphSpacing
    };
}

/**
 * The colour and requested mode for the highlight command.
 * @param {Object} defaults
 * @returns {{name: string, label: string, background: string,
 *     line: string, style: string}}
 */
export function highlightValuesFor(defaults) {
    const normalized = normalizeTextDefaults(defaults);
    const color = HIGHLIGHT_COLORS[normalized.highlightColor];

    return {
        name: normalized.highlightColor,
        label: color.label,
        background: color.background,
        line: color.line,
        style: normalized.highlightStyle
    };
}
