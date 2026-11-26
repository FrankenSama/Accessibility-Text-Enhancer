// Built-in reading presets. A preset writes the same text defaults the Font,
// Spacing, and Highlight commands use, plus the two reading-aid toggles. It
// never changes the current selection by itself.
import { DEFAULT_TEXT_DEFAULTS } from './style-defaults.js';

const BASE = DEFAULT_TEXT_DEFAULTS;

export const READING_PRESETS = Object.freeze([
    Object.freeze({
        id: 'comfortable',
        name: 'Comfortable',
        description: 'Sans font, comfortable spacing, no forced highlight.',
        textDefaults: Object.freeze({ ...BASE }),
        focusMode: false,
        ruler: false
    }),
    Object.freeze({
        id: 'dyslexia',
        name: 'Dyslexia-friendly',
        description: 'OpenDyslexic with comfortable spacing.',
        textDefaults: Object.freeze({
            ...BASE,
            fontFamily: 'opendyslexic'
        }),
        focusMode: false,
        ruler: false
    }),
    Object.freeze({
        id: 'low-vision',
        name: 'Low vision',
        description: 'Sans font, WCAG spacing, and an underline highlight.',
        textDefaults: Object.freeze({
            ...BASE,
            fontFamily: 'sans',
            spacingPreset: 'wcag',
            letterSpacing: 0.12,
            wordSpacing: 0.16,
            lineHeight: 1.5,
            paragraphSpacing: 2,
            highlightStyle: 'underline'
        }),
        focusMode: false,
        ruler: false
    }),
    Object.freeze({
        id: 'focus',
        name: 'Focus',
        description: 'Serif font, WCAG spacing, and focus mode on.',
        textDefaults: Object.freeze({
            ...BASE,
            fontFamily: 'serif',
            spacingPreset: 'wcag',
            letterSpacing: 0.12,
            wordSpacing: 0.16,
            lineHeight: 1.5,
            paragraphSpacing: 2
        }),
        focusMode: true,
        ruler: false
    })
]);

/**
 * A built-in preset by id, or null.
 * @param {string} id
 * @returns {Object|null}
 */
export function readingPresetById(id) {
    return READING_PRESETS.find((preset) => preset.id === id) || null;
}
