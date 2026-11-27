// Shared settings transfer logic for the in-page dialog and the options page.
// Both surfaces keep the same preference shape, so importing, exporting, and
// downloading can live in one place.

import { CONFIG } from './core.js';
import { getMountNode } from './dom.js';
import {
    normalizeTextDefaults,
    pickTextDefaults
} from './style-defaults.js';
import { clampNumber } from './text.js';
import {
    clampFocusDim,
    normalizeRulerSource
} from './reading-aids.js';
import { normalizeStoredTranslationTarget } from './translation.js';
import { buildSettingsFile } from './settings-io.js';

/**
 * Apply the preferences from an imported file to a state object, clamping
 * anything out of range. Returns whether at least one preference was found.
 * @param {Object} state
 * @param {Object} preferences
 * @returns {boolean}
 */
export function applyImportedPreferencesToState(state, preferences) {
    let applied = false;
    const darkKey = Object.prototype.hasOwnProperty.call(state, 'darkMode')
        ? 'darkMode'
        : 'isDarkMode';

    if (typeof preferences.darkMode === 'boolean') {
        state[darkKey] = preferences.darkMode;
        applied = true;
    }
    if (typeof preferences.ttsVoice === 'string') {
        state.ttsVoice = preferences.ttsVoice;
        applied = true;
    }
    if (preferences.ttsRate !== undefined) {
        state.ttsRate = clampNumber(
            preferences.ttsRate,
            CONFIG.minTtsRate,
            CONFIG.maxTtsRate,
            CONFIG.defaultTtsRate
        );
        applied = true;
    }
    if (preferences.ttsPitch !== undefined) {
        state.ttsPitch = clampNumber(
            preferences.ttsPitch,
            CONFIG.minTtsPitch,
            CONFIG.maxTtsPitch,
            CONFIG.defaultTtsPitch
        );
        applied = true;
    }
    if (preferences.rulerSource !== undefined) {
        state.rulerSource = normalizeRulerSource(preferences.rulerSource);
        applied = true;
    }
    if (preferences.focusDim !== undefined) {
        state.focusDim = clampFocusDim(preferences.focusDim);
        applied = true;
    }
    if (typeof preferences.translationTarget === 'string') {
        state.translationTarget = normalizeStoredTranslationTarget(
            preferences.translationTarget
        );
        applied = true;
    }

    const textDefaults = pickTextDefaults(preferences);
    if (Object.keys(textDefaults).length > 0) {
        state.textDefaults = normalizeTextDefaults({
            ...state.textDefaults,
            ...textDefaults
        });
        applied = true;
    }

    return applied;
}

/**
 * Build the versioned settings file from a content-script or options state.
 * @param {Object} state
 * @param {string} appVersion
 * @returns {Object}
 */
export function buildSettingsFileFromState(state, appVersion) {
    return buildSettingsFile({
        darkMode: typeof state.darkMode === 'boolean'
            ? state.darkMode
            : state.isDarkMode,
        ttsVoice: state.ttsVoice,
        ttsRate: state.ttsRate,
        ttsPitch: state.ttsPitch,
        translationTarget: state.translationTarget,
        rulerSource: state.rulerSource,
        focusDim: state.focusDim,
        textDefaults: state.textDefaults,
        siteRules: state.siteRules,
        appVersion
    });
}

/**
 * Download a settings file. The link is attached so Chrome starts the
 * download consistently, then removed.
 * @param {Object} settings
 */
export function downloadSettingsFile(settings) {
    const blob = new Blob(
        [JSON.stringify(settings, null, 2)],
        { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = settings.exportedAt.slice(0, 10);

    link.href = url;
    link.download =
        `accessibility-text-enhancer-settings-v${settings.appVersion}-${date}.json`;
    getMountNode().appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
