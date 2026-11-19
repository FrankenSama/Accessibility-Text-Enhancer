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
    FONT_LABELS,
    fontStackFor,
    HIGHLIGHT_COLORS,
    HIGHLIGHT_STYLE_LABELS,
    HIGHLIGHT_STYLES,
    highlightValuesFor,
    normalizeTextDefaults,
    pickTextDefaults,
    SPACING_LIMITS,
    SPACING_PRESETS,
    spacingValuesFor,
    TEXT_DEFAULT_KEYS
} from '../content-scripts/modules/style-defaults.js';
import {
    contrastRatio,
    getEffectiveBackgroundColor,
    parseColor,
    parseHexColor
} from '../content-scripts/modules/contrast.js';

const DEFAULTS = {
    darkMode: true,
    ttsVoice: '',
    ttsRate: 0.9,
    ttsPitch: 1
};

const LIMITS = {
    minRate: 0.5,
    maxRate: 2,
    minPitch: 0.5,
    maxPitch: 2
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
const fontSelect = document.getElementById('text-font');
const presetSelect = document.getElementById('text-spacing-preset');
const customSpacing = document.getElementById('custom-spacing');
const colorSelect = document.getElementById('text-highlight-color');
const colorSwatch = document.getElementById('text-highlight-swatch');
const highlightStyleSelect = document.getElementById('text-highlight-style');
const previewEl = document.getElementById('text-preview');
const status = document.getElementById('options-status');
const siteRuleList = document.getElementById('site-rule-list');
const siteRuleEmpty = document.getElementById('site-rule-empty');
const siteRuleCount = document.getElementById('site-rule-count');
const clearRulesButton = document.getElementById('clear-site-rules');
const importFile = document.getElementById('import-file');

const SPACING_KEYS = [
    'letterSpacing',
    'wordSpacing',
    'lineHeight',
    'paragraphSpacing'
];

const spacingInputs = {
    letterSpacing: document.getElementById('text-letter-spacing'),
    wordSpacing: document.getElementById('text-word-spacing'),
    lineHeight: document.getElementById('text-line-height'),
    paragraphSpacing: document.getElementById('text-paragraph-spacing')
};

const spacingOutputs = {
    letterSpacing: document.getElementById('text-letter-spacing-value'),
    wordSpacing: document.getElementById('text-word-spacing-value'),
    lineHeight: document.getElementById('text-line-height-value'),
    paragraphSpacing: document.getElementById('text-paragraph-spacing-value')
};

/**
 * Clamp a stored numeric preference to a valid range.
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
function clampNumber(value, min, max, fallback) {
    const number = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(number)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, number));
}

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
 * Build the text-styling selects from the shared labels and give the custom
 * sliders the ranges from the shared limits.
 */
function setupTextControls() {
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
        addOption(highlightStyleSelect, value, HIGHLIGHT_STYLE_LABELS[value]);
    });

    SPACING_KEYS.forEach((key) => {
        const limit = SPACING_LIMITS[key];
        spacingInputs[key].min = String(limit.min);
        spacingInputs[key].max = String(limit.max);
        spacingInputs[key].step = String(limit.step);
    });
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
 * Pick a preview line colour that stays visible on the preview background.
 * @param {string} lineColor
 * @returns {string}
 */
function previewLineColor(lineColor) {
    if (window.matchMedia && window.matchMedia('(forced-colors: active)').matches) {
        return 'Highlight';
    }

    const line = parseHexColor(lineColor);
    const background = getEffectiveBackgroundColor(previewEl);

    if (!line || !background || contrastRatio(line, background) < 3) {
        return 'currentColor';
    }

    return lineColor;
}

/**
 * Draw an underline fallback in the preview.
 * @param {string} lineColor
 */
function applyPreviewLine(lineColor) {
    previewEl.style.textDecorationLine = 'underline';
    previewEl.style.textDecorationThickness = '2px';
    previewEl.style.textDecorationColor = previewLineColor(lineColor);
    previewEl.style.textUnderlineOffset = '2px';
}

/**
 * Show the saved font, spacing, and highlight on a sample sentence.
 */
function updatePreview() {
    const defaults = state.textDefaults;
    const spacing = spacingValuesFor(defaults);
    const highlight = highlightValuesFor(defaults);
    const forced = Boolean(window.matchMedia &&
        window.matchMedia('(forced-colors: active)').matches);
    const style = previewEl.style;

    style.fontFamily = fontStackFor(defaults.fontFamily);
    style.letterSpacing = `${spacing.letterSpacing}em`;
    style.wordSpacing = `${spacing.wordSpacing}em`;
    style.lineHeight = spacing.lineHeight === null
        ? ''
        : String(spacing.lineHeight);

    previewEl.querySelector('p').style.marginBottom =
        spacing.paragraphSpacing === null
            ? ''
            : `${spacing.paragraphSpacing}em`;

    [
        'background-color',
        'outline',
        'text-decoration-line',
        'text-decoration-thickness',
        'text-decoration-color',
        'text-underline-offset'
    ].forEach((property) => style.removeProperty(property));

    const textColor = parseColor(getComputedStyle(previewEl).color) ||
        { r: 0, g: 0, b: 0 };
    const highlightColor = parseHexColor(highlight.background);
    const canPaintBackground = !forced && Boolean(highlightColor) &&
        contrastRatio(textColor, highlightColor) >= 4.5;

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

    style.outline = `2px solid ${previewLineColor(highlight.line)}`;
}

/**
 * Mirror the text styling state into the controls and the preview.
 */
function syncTextControls() {
    const defaults = state.textDefaults;

    fontSelect.value = defaults.fontFamily;
    presetSelect.value = defaults.spacingPreset;
    colorSelect.value = defaults.highlightColor;
    highlightStyleSelect.value = defaults.highlightStyle;
    colorSwatch.style.backgroundColor =
        HIGHLIGHT_COLORS[defaults.highlightColor].background;

    customSpacing.hidden = defaults.spacingPreset !== 'custom';

    SPACING_KEYS.forEach((key) => {
        // A null line height or paragraph spacing leaves the page alone.
        // The hidden slider still needs a number, so show the neutral value.
        const value = defaults[key] === null
            ? (key === 'lineHeight' ? 1 : 0)
            : defaults[key];
        spacingInputs[key].value = String(value);
        spacingOutputs[key].textContent = formatSpacingValue(key, value);
    });

    updatePreview();
}

/**
 * Save text defaults, rolling the controls back from storage if the write
 * fails.
 * @param {Object} values
 */
function saveTextDefaults(values) {
    Object.assign(state.textDefaults, values);
    syncTextControls();

    savePreferences(values, (saved) => {
        if (saved) {
            return;
        }

        loadSyncedPreferences().then((result) => {
            state.textDefaults = normalizeTextDefaults(result);
            syncTextControls();
        }).catch(() => {});
    });
}

/**
 * Restore the shipped font, spacing, and highlight choices.
 */
function resetTextStyling() {
    state.textDefaults = normalizeTextDefaults();
    saveTextDefaults({ ...state.textDefaults });
    setStatus('Text styling reset to defaults.');
}

/**
 * Human-readable label for a stored site rule.
 * @param {'on'|'off'} rule
 * @returns {string}
 */
function ruleLabel(rule) {
    return rule === 'on' ? 'Always on' : 'Always off';
}

/**
 * Rebuild the site-rule list and its count.
 */
function renderSiteRules() {
    const origins = Object.keys(state.siteRules).sort();
    siteRuleList.innerHTML = '';

    origins.forEach((origin) => {
        const item = document.createElement('li');
        item.className = 'site-rule-item';

        const name = document.createElement('span');
        name.className = 'site-rule-origin';
        name.textContent = origin;

        const value = document.createElement('span');
        value.className = 'site-rule-value';
        value.textContent = ruleLabel(state.siteRules[origin]);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn link';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', `Remove site rule for ${origin}`);
        remove.addEventListener('click', () => removeSiteRule(origin));

        item.append(name, value, remove);
        siteRuleList.appendChild(item);
    });

    siteRuleList.hidden = origins.length === 0;
    siteRuleEmpty.hidden = origins.length > 0;
    clearRulesButton.disabled = origins.length === 0;
    siteRuleCount.textContent =
        `${origins.length} of ${CONFIG.maxSiteRules} site rules used.`;
}

/**
 * Save a site-rule map, rolling the list back if the write fails.
 * @param {Object<string, 'on'|'off'>} rules
 * @param {string} message
 */
function saveSiteRules(rules, message) {
    const previous = state.siteRules;
    state.siteRules = rules;
    renderSiteRules();

    savePreferences({ siteRules: rules }, (saved) => {
        if (!saved) {
            state.siteRules = previous;
            renderSiteRules();
            return;
        }
        setStatus(message);
    });
}

/**
 * Remove the rule for one origin.
 * @param {string} origin
 */
function removeSiteRule(origin) {
    const rules = { ...state.siteRules };
    delete rules[origin];
    saveSiteRules(rules, `Removed the site rule for ${origin}.`);
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
            syncTextControls();
            renderSiteRules();
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
    syncTextControls();
    renderSiteRules();
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
        syncTextControls();
    }

    if (changes.siteRules) {
        state.siteRules = normalizeSiteRules(changes.siteRules.newValue);
        renderSiteRules();
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

fontSelect.addEventListener('change', () => {
    saveTextDefaults({ fontFamily: fontSelect.value });
});

presetSelect.addEventListener('change', () => {
    const spacingPreset = presetSelect.value;
    const updates = { spacingPreset };

    // Custom needs four concrete values. Seed the two nullable ones the first
    // time so the sliders match what the preview shows.
    if (spacingPreset === 'custom') {
        if (state.textDefaults.lineHeight === null) {
            updates.lineHeight = 1.5;
        }
        if (state.textDefaults.paragraphSpacing === null) {
            updates.paragraphSpacing = 1;
        }
    }

    saveTextDefaults(updates);
});

SPACING_KEYS.forEach((key) => {
    const input = spacingInputs[key];

    input.addEventListener('input', () => {
        state.textDefaults[key] = clampSpacing(key, input.value);
        spacingOutputs[key].textContent =
            formatSpacingValue(key, state.textDefaults[key]);
        updatePreview();
    });

    input.addEventListener('change', () => {
        saveTextDefaults({ [key]: state.textDefaults[key] });
    });
});

colorSelect.addEventListener('change', () => {
    saveTextDefaults({ highlightColor: colorSelect.value });
});

highlightStyleSelect.addEventListener('change', () => {
    saveTextDefaults({ highlightStyle: highlightStyleSelect.value });
});

document.getElementById('reset-text-styling').addEventListener('click', resetTextStyling);

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

// Clearing every rule asks for a second click, matching the in-page reset.
let clearArmed = false;
let clearTimer = null;

function disarmClear() {
    clearArmed = false;
    clearRulesButton.textContent = 'Clear all site rules';
    if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = null;
    }
}

clearRulesButton.addEventListener('click', () => {
    if (Object.keys(state.siteRules).length === 0) {
        setStatus('There are no site rules to clear.');
        return;
    }

    if (!clearArmed) {
        clearArmed = true;
        clearRulesButton.textContent = 'Confirm clear all';
        clearTimer = setTimeout(disarmClear, 5000);
        setStatus('Activate Confirm clear all to remove every site rule.');
        return;
    }

    disarmClear();
    saveSiteRules({}, 'All site rules cleared.');
});

document.getElementById('version').textContent =
    `v${chrome.runtime.getManifest().version}`;
