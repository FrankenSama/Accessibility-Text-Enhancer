// Versioned settings file: the shared shape used by the in-page dialog and
// the options page. Kept free of DOM and chrome APIs so both callers can use
// it and it stays easy to test.

import { CONFIG } from './core.js';
import { normalizeSiteRules } from './prefs.js';
import {
    normalizeTextDefaults,
    pickTextDefaults,
    TEXT_DEFAULT_KEYS
} from './style-defaults.js';

const PREFERENCE_KEYS = [
    'darkMode',
    'ttsVoice',
    'ttsRate',
    'ttsPitch',
    ...TEXT_DEFAULT_KEYS
];

/**
 * Build the object written to a settings file.
 * @param {{darkMode: boolean, ttsVoice: string, ttsRate: number,
 *     ttsPitch: number, textDefaults?: Object, siteRules: Object,
 *     appVersion: string, now?: Date}} settings
 * @returns {Object}
 */
export function buildSettingsFile(settings) {
    const now = settings.now || new Date();

    return {
        schema: CONFIG.settingsSchemaVersion,
        appVersion: settings.appVersion,
        exportedAt: now.toISOString(),
        preferences: {
            darkMode: Boolean(settings.darkMode),
            ttsVoice: typeof settings.ttsVoice === 'string' ? settings.ttsVoice : '',
            ttsRate: settings.ttsRate,
            ttsPitch: settings.ttsPitch,
            ...normalizeTextDefaults(settings.textDefaults)
        },
        siteRules: normalizeSiteRules(settings.siteRules)
    };
}

/**
 * Parse a settings file. Files written before schema 2 have no schema field
 * and carry preferences only, so they are treated as schema 1.
 * @param {string} text
 * @returns {{preferences: Object, textDefaults: Object,
 *     hasSettings: boolean, hasRules: boolean, siteRules: Object|null}|null}
 *     Null when the file has no preferences object at all.
 */
export function parseSettingsFile(text) {
    const settings = JSON.parse(text);

    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return null;
    }

    const preferences = settings.preferences;
    if (!preferences || typeof preferences !== 'object' ||
        Array.isArray(preferences)) {
        return null;
    }

    const schema = typeof settings.schema === 'number' ? settings.schema : 1;
    const hasSettings = PREFERENCE_KEYS.some(
        (key) => preferences[key] !== undefined
    );
    const rules = settings.siteRules;
    const hasRules = schema >= 2 && Boolean(rules) &&
        typeof rules === 'object' && !Array.isArray(rules);

    return {
        preferences,
        textDefaults: pickTextDefaults(preferences),
        hasSettings,
        hasRules,
        siteRules: hasRules ? normalizeSiteRules(rules) : null
    };
}
