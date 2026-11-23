// options/options.js

import {
    loadSyncedPreferences,
    normalizeSiteRules,
    saveSyncedPreferences
} from '../content-scripts/modules/prefs.js';
import { CONFIG } from '../content-scripts/modules/core.js';
import {
    buildSettingsFile,
    parseSettingsFile
} from '../content-scripts/modules/settings-io.js';
import {
    normalizeTextDefaults,
    pickTextDefaults,
    TEXT_DEFAULT_KEYS
} from '../content-scripts/modules/style-defaults.js';
import { clampNumber } from '../content-scripts/modules/text.js';
import { initTextStylingControls } from '../content-scripts/modules/text-styling-ui.js';
import { initSiteRulesControls } from '../content-scripts/modules/site-rules-ui.js';

const DEFAULTS = {
    darkMode: true,
    ttsVoice: '',
    ttsRate: CONFIG.defaultTtsRate,
    ttsPitch: CONFIG.defaultTtsPitch
};

const LIMITS = {
    minRate: CONFIG.minTtsRate,
    maxRate: CONFIG.maxTtsRate,
    minPitch: CONFIG.minTtsPitch,
    maxPitch: CONFIG.maxTtsPitch
};

const state = {
    ...DEFAULTS,
    textDefaults: normalizeTextDefaults(),
    siteRules: {}
};

let voices = [];
let statusTimer = null;

const themeSelect = document.getElementById('toolbar-theme');
const voiceSelect = document.getElementById('tts-voice');
const rateInput = document.getElementById('tts-rate');
const rateValue = document.getElementById('tts-rate-value');
const pitchInput = document.getElementById('tts-pitch');
const pitchValue = document.getElementById('tts-pitch-value');
const status = document.getElementById('options-status');
const importFile = document.getElementById('import-file');

/**
 * Show a short status message in the page's live region.
 * @param {string} message
 */
function setStatus(message) {
    status.textContent = message;

    if (statusTimer) {
        clearTimeout(statusTimer);
    }

    if (message) {
        statusTimer = setTimeout(() => {
            status.textContent = '';
        }, 5000);
    }
}

/**
 * Persist one or more preferences. Theme and reading preferences sync
 * across the user's Chrome profiles.
 * @param {Record<string, unknown>} values
 * @param {(saved: boolean) => void} [callback]
 */
function savePreferences(values, callback) {
    saveSyncedPreferences(values, (saved) => {
        if (!saved) {
            setStatus('Could not save settings. Try again.');
        }
        if (callback) {
            callback(saved);
        }
    });
}

/**
 * Voices exposed by the browser.
 * @returns {SpeechSynthesisVoice[]}
 */
function getAvailableVoices() {
    if (!('speechSynthesis' in window)) {
        return [];
    }
    return window.speechSynthesis.getVoices() || [];
}

/**
 * Find the voice matching the saved URI or name.
 * @returns {SpeechSynthesisVoice|null}
 */
function findSelectedVoice() {
    if (!state.ttsVoice) {
        return null;
    }

    return voices.find((voice) =>
        voice.voiceURI === state.ttsVoice || voice.name === state.ttsVoice
    ) || null;
}

/**
 * Rebuild the voice list while preserving the current selection.
 */
function populateVoiceSelect() {
    const previous = state.ttsVoice;
    voiceSelect.innerHTML = '';

    const automatic = document.createElement('option');
    automatic.value = '';
    automatic.textContent = 'Automatic (match page language)';
    voiceSelect.appendChild(automatic);

    voices
        .slice()
        .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
        .forEach((voice) => {
            const option = document.createElement('option');
            option.value = voice.voiceURI;
            option.textContent = `${voice.name} (${voice.lang})` +
                (voice.default ? ' — default' : '');
            voiceSelect.appendChild(option);
        });

    const hasSavedVoice = voices.some((voice) => voice.voiceURI === previous);
    voiceSelect.value = hasSavedVoice ? previous : '';

    // A saved voice can disappear after an OS voice update. Fall back to
    // automatic once the browser has actually reported its voice list.
    if (previous && voices.length > 0 && !hasSavedVoice) {
        state.ttsVoice = '';
        savePreferences({ ttsVoice: '' });
    }
}

/**
 * Refresh the voice list when the browser finishes loading voices.
 */
function loadVoices() {
    voices = getAvailableVoices();
    populateVoiceSelect();
}

/**
 * Mirror the reading state into the controls.
 */
function syncControls() {
    rateInput.value = String(state.ttsRate);
    rateValue.textContent = state.ttsRate.toFixed(1);
    pitchInput.value = String(state.ttsPitch);
    pitchValue.textContent = state.ttsPitch.toFixed(1);

    const hasSavedVoice = voices.some((voice) => voice.voiceURI === state.ttsVoice);
    voiceSelect.value = hasSavedVoice ? state.ttsVoice : '';
}

/**
 * Mirror the stored theme into the appearance control.
 */
function syncThemeControl() {
    themeSelect.value = state.darkMode ? 'dark' : 'light';
}

/**
 * Save text defaults, rolling the controls back from storage if the write
 * fails.
 * @param {Object} values
 */
function saveTextDefaults(values) {
    Object.assign(state.textDefaults, values);

    savePreferences(values, (saved) => {
        if (saved) {
            return;
        }

        loadSyncedPreferences().then((result) => {
            state.textDefaults = normalizeTextDefaults(result);
            textControls?.sync();
        }).catch(() => {});
    });
}

/** @type {{sync: (defaults?: Object) => void}|null} */
let textControls = null;

/**
 * Build the shared text-styling controls.
 */
function setupTextControls() {
    textControls = initTextStylingControls({
        root: document,
        getDefaults: () => state.textDefaults,
        save: saveTextDefaults,
        announce: setStatus
    });
}

/** @type {{sync: () => void}|null} */
let siteRulesControls = null;

/**
 * Save a site-rule map, rolling the list back if the write fails.
 * @param {Object<string, 'on'|'off'>} rules
 * @param {string} message
 */
function saveSiteRules(rules, message) {
    const previous = state.siteRules;
    state.siteRules = rules;
    siteRulesControls?.sync();

    savePreferences({ siteRules: rules }, (saved) => {
        if (!saved) {
            state.siteRules = previous;
            siteRulesControls?.sync();
            return;
        }
        setStatus(message);
    });
}

/**
 * Build the shared site-rule list.
 */
function setupSiteRules() {
    siteRulesControls = initSiteRulesControls({
        root: document,
        getRules: () => state.siteRules,
        save: saveSiteRules,
        announce: setStatus
    });
}

/**
 * Speak a short sample with the current settings.
 */
function previewVoice() {
    if (!('speechSynthesis' in window)) {
        setStatus('Speech is not available in this browser.');
        return;
    }

    window.speechSynthesis.cancel();

    const voice = findSelectedVoice();
    const utterance = new SpeechSynthesisUtterance(
        'This is a preview of the reading voice.'
    );

    if (voice) {
        utterance.voice = voice;
    }
    utterance.lang = voice?.lang || navigator.language || 'en';
    utterance.rate = state.ttsRate;
    utterance.pitch = state.ttsPitch;

    utterance.onend = () => {
        setStatus('Preview finished.');
    };

    utterance.onerror = (event) => {
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
            setStatus('The preview voice could not play.');
        }
    };

    try {
        window.speechSynthesis.speak(utterance);
        setStatus('Playing voice preview…');
    } catch (error) {
        console.warn('Voice preview threw:', error);
        setStatus('The preview voice could not play.');
    }
}

/**
 * Restore the default reading preferences.
 */
function resetReadingSettings() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }

    state.ttsVoice = DEFAULTS.ttsVoice;
    state.ttsRate = DEFAULTS.ttsRate;
    state.ttsPitch = DEFAULTS.ttsPitch;

    savePreferences({
        ttsVoice: state.ttsVoice,
        ttsRate: state.ttsRate,
        ttsPitch: state.ttsPitch
    });

    syncControls();
    setStatus('Reading settings reset to defaults.');
}

/**
 * Export the full settings file.
 */
function exportSettings() {
    const settings = buildSettingsFile({
        darkMode: state.darkMode,
        ttsVoice: state.ttsVoice,
        ttsRate: state.ttsRate,
        ttsPitch: state.ttsPitch,
        textDefaults: state.textDefaults,
        siteRules: state.siteRules,
        appVersion: chrome.runtime.getManifest().version
    });

    const blob = new Blob(
        [JSON.stringify(settings, null, 2)],
        { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const date = settings.exportedAt.slice(0, 10);
    link.download =
        `accessibility-text-enhancer-settings-v${settings.appVersion}-${date}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setStatus('Settings exported.');
}

/**
 * Apply imported preferences to the page state.
 * @param {Object} preferences
 * @returns {boolean} Whether at least one preference was found.
 */
function applyImportedPreferences(preferences) {
    let applied = false;

    if (typeof preferences.darkMode === 'boolean') {
        state.darkMode = preferences.darkMode;
        applied = true;
    }
    if (typeof preferences.ttsVoice === 'string') {
        state.ttsVoice = preferences.ttsVoice;
        applied = true;
    }
    if (preferences.ttsRate !== undefined) {
        state.ttsRate = clampNumber(
            preferences.ttsRate,
            LIMITS.minRate,
            LIMITS.maxRate,
            DEFAULTS.ttsRate
        );
        applied = true;
    }
    if (preferences.ttsPitch !== undefined) {
        state.ttsPitch = clampNumber(
            preferences.ttsPitch,
            LIMITS.minPitch,
            LIMITS.maxPitch,
            DEFAULTS.ttsPitch
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
 * Read a chosen settings file and apply it.
 * @param {File} file
 */
function importFileContents(file) {
    const reader = new FileReader();

    reader.onload = (event) => {
        let parsed;

        try {
            parsed = parseSettingsFile(event.target.result);
        } catch (error) {
            console.warn('Import error:', error);
            setStatus('That file is not valid settings JSON.');
            return;
        }

        if (!parsed) {
            setStatus('No settings found in that file.');
            return;
        }

        const hasSettings = applyImportedPreferences(parsed.preferences);
        const hasRules = parsed.hasRules;

        if (!hasSettings && !hasRules) {
            setStatus('No settings found in that file.');
            return;
        }

        const updates = {
            darkMode: state.darkMode,
            ttsVoice: state.ttsVoice,
            ttsRate: state.ttsRate,
            ttsPitch: state.ttsPitch,
            ...state.textDefaults
        };

        if (hasRules) {
            state.siteRules = parsed.siteRules;
            updates.siteRules = state.siteRules;
        }

        savePreferences(updates, (saved) => {
            if (!saved) {
                return;
            }
            loadVoices();
            syncControls();
            syncThemeControl();
            textControls.sync();
            siteRulesControls.sync();
            setStatus('Settings imported.');
        });
    };

    reader.onerror = () => {
        setStatus('Could not read that settings file.');
    };

    reader.readAsText(file);
}

// Load saved preferences.
setupTextControls();
setupSiteRules();

loadSyncedPreferences().then((result) => {
    state.darkMode = typeof result.darkMode === 'boolean'
        ? result.darkMode
        : DEFAULTS.darkMode;
    state.ttsVoice = typeof result.ttsVoice === 'string' ? result.ttsVoice : '';
    state.ttsRate = clampNumber(
        result.ttsRate,
        LIMITS.minRate,
        LIMITS.maxRate,
        DEFAULTS.ttsRate
    );
    state.ttsPitch = clampNumber(
        result.ttsPitch,
        LIMITS.minPitch,
        LIMITS.maxPitch,
        DEFAULTS.ttsPitch
    );
    state.textDefaults = normalizeTextDefaults(result);
    state.siteRules = normalizeSiteRules(result.siteRules);

    loadVoices();
    syncControls();
    syncThemeControl();
    textControls.sync();
    siteRulesControls.sync();
}).catch(() => {
    setStatus('Could not load settings. Try reopening this page.');
});

// Keep the page in sync if the same settings are changed from the in-page
// toolbar or another profile while this page is open.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
        return;
    }

    let changed = false;

    if (changes.darkMode) {
        state.darkMode = changes.darkMode.newValue !== false;
        syncThemeControl();
    }

    if (changes.ttsVoice) {
        state.ttsVoice = typeof changes.ttsVoice.newValue === 'string'
            ? changes.ttsVoice.newValue
            : '';
        changed = true;
    }

    if (changes.ttsRate) {
        state.ttsRate = clampNumber(
            changes.ttsRate.newValue,
            LIMITS.minRate,
            LIMITS.maxRate,
            DEFAULTS.ttsRate
        );
        changed = true;
    }

    if (changes.ttsPitch) {
        state.ttsPitch = clampNumber(
            changes.ttsPitch.newValue,
            LIMITS.minPitch,
            LIMITS.maxPitch,
            DEFAULTS.ttsPitch
        );
        changed = true;
    }

    if (TEXT_DEFAULT_KEYS.some((key) => changes[key])) {
        const next = { ...state.textDefaults };
        for (const key of TEXT_DEFAULT_KEYS) {
            if (changes[key]) {
                next[key] = changes[key].newValue;
            }
        }
        state.textDefaults = normalizeTextDefaults(next);
        textControls.sync();
    }

    if (changes.siteRules) {
        state.siteRules = normalizeSiteRules(changes.siteRules.newValue);
        siteRulesControls.sync();
    }

    if (changed) {
        syncControls();
    }
});

// Voices load asynchronously on most platforms.
if ('speechSynthesis' in window) {
    if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    } else {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
}

themeSelect.addEventListener('change', () => {
    state.darkMode = themeSelect.value !== 'light';
    savePreferences({ darkMode: state.darkMode });
});

voiceSelect.addEventListener('change', () => {
    state.ttsVoice = voiceSelect.value;
    savePreferences({ ttsVoice: state.ttsVoice });
});

rateInput.addEventListener('input', () => {
    state.ttsRate = clampNumber(
        parseFloat(rateInput.value),
        LIMITS.minRate,
        LIMITS.maxRate,
        DEFAULTS.ttsRate
    );
    rateValue.textContent = state.ttsRate.toFixed(1);
});

rateInput.addEventListener('change', () => {
    savePreferences({ ttsRate: state.ttsRate });
});

pitchInput.addEventListener('input', () => {
    state.ttsPitch = clampNumber(
        parseFloat(pitchInput.value),
        LIMITS.minPitch,
        LIMITS.maxPitch,
        DEFAULTS.ttsPitch
    );
    pitchValue.textContent = state.ttsPitch.toFixed(1);
});

pitchInput.addEventListener('change', () => {
    savePreferences({ ttsPitch: state.ttsPitch });
});

document.getElementById('preview-voice').addEventListener('click', previewVoice);
document.getElementById('reset-reading').addEventListener('click', resetReadingSettings);
document.getElementById('export-settings').addEventListener('click', exportSettings);
document.getElementById('import-settings').addEventListener('click', () => {
    importFile.click();
});

importFile.addEventListener('change', () => {
    const file = importFile.files[0];
    importFile.value = '';
    if (file) {
        importFileContents(file);
    }
});

document.getElementById('version').textContent =
    `v${chrome.runtime.getManifest().version}`;
