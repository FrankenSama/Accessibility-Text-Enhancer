// Reading preferences dialog plus settings import and export.

import { CONFIG, STATE } from './core.js';
import { clampNumber } from './text.js';
import { getMountNode } from './dom.js';
import { showToast } from './toast.js';
import { applyTheme } from './toolbar.js';
import { getPageLanguage, pickReadingVoice, populateVoiceSelect } from './reading.js';
import { normalizeSiteRules, loadSyncedPreferences, saveSyncedPreferences } from './prefs.js';
import { buildSettingsFile, parseSettingsFile } from './settings-io.js';
import {
    normalizeTextDefaults,
    pickTextDefaults,
    TEXT_DEFAULT_KEYS
} from './style-defaults.js';
import { initTextStylingControls } from './text-styling-ui.js';
import { initSiteRulesControls } from './site-rules-ui.js';
import { closeTranslationPanel } from './translation-ui.js';
import { normalizeTranslationTarget } from './translation.js';
import { hasPageChanges, resetPageChanges } from './history.js';

let settingsReturnFocus = null;
let textStylingControls = null;
let siteRulesControls = null;

// ==================== SETTINGS PANEL ====================

/**
 * Show the settings panel.
 */
export function showSettingsPanel() {
    removeSettingsPanel();
    settingsReturnFocus = document.querySelector(
        `#${CONFIG.toolbarId} [data-command="settings"]`
    ) || document.activeElement;

    const overlay = document.createElement('div');
    overlay.id = CONFIG.settingsOverlayId;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.addEventListener('mousedown', (event) => event.preventDefault());
    overlay.addEventListener('click', removeSettingsPanel);
    getMountNode().appendChild(overlay);

    const panel = document.createElement('div');
    panel.id = CONFIG.settingsPanelId;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'accessibility-settings-title');

    if (!STATE.isDarkMode) {
        panel.classList.add('light-mode');
    }

    panel.innerHTML = `
        <h3 id="accessibility-settings-title">Accessibility Settings</h3>

        <div class="setting-item text-styling-settings">
            <h4>Text styling</h4>
            <p class="setting-help">
                These choices apply to the next font, spacing, or highlight
                command.
            </p>

            <div class="setting-field">
                <label for="atx-text-font">Font</label>
                <select id="atx-text-font" class="setting-select"></select>
            </div>

            <div class="setting-field">
                <label for="atx-text-spacing-preset">Spacing preset</label>
                <select id="atx-text-spacing-preset" class="setting-select"></select>
            </div>

            <div id="atx-custom-spacing" class="custom-spacing" hidden>
                <div class="setting-field">
                    <label for="atx-text-letter-spacing">
                        Letter spacing
                        <output id="atx-text-letter-spacing-value"
                            for="atx-text-letter-spacing">0.125em</output>
                    </label>
                    <input type="range" id="atx-text-letter-spacing">
                </div>

                <div class="setting-field">
                    <label for="atx-text-word-spacing">
                        Word spacing
                        <output id="atx-text-word-spacing-value"
                            for="atx-text-word-spacing">0.25em</output>
                    </label>
                    <input type="range" id="atx-text-word-spacing">
                </div>

                <div class="setting-field">
                    <label for="atx-text-line-height">
                        Line height
                        <output id="atx-text-line-height-value"
                            for="atx-text-line-height">1.5</output>
                    </label>
                    <input type="range" id="atx-text-line-height">
                </div>

                <div class="setting-field">
                    <label for="atx-text-paragraph-spacing">
                        Paragraph spacing
                        <output id="atx-text-paragraph-spacing-value"
                            for="atx-text-paragraph-spacing">1em</output>
                    </label>
                    <input type="range" id="atx-text-paragraph-spacing">
                </div>
            </div>

            <div class="setting-field">
                <label for="atx-text-highlight-color">Highlight colour</label>
                <div class="color-control">
                    <span id="atx-text-highlight-swatch" class="swatch"
                        aria-hidden="true"></span>
                    <select id="atx-text-highlight-color" class="setting-select"></select>
                </div>
            </div>

            <div class="setting-field">
                <label for="atx-text-highlight-style">Highlight style</label>
                <select id="atx-text-highlight-style" class="setting-select"></select>
                <p class="setting-help">
                    Auto paints a background when the text stays readable and
                    outlines it otherwise. Background falls back to an
                    underline rather than hiding the text. Force background
                    always paints the fill, even when the text would lose
                    contrast.
                </p>
            </div>

            <div class="preview-field">
                <p class="preview-label">Preview</p>
                <div id="atx-text-preview" class="text-preview" aria-hidden="true">
                    <p>The quick brown fox jumps over the lazy dog.</p>
                </div>
            </div>

            <button type="button" id="atx-reset-text-styling"
                class="action-btn reset-btn">
                Reset text styling
            </button>
        </div>

        <div class="setting-item reading-settings">
            <h4>Reading aloud</h4>

            <div class="setting-field">
                <label for="tts-voice">Voice</label>
                <select id="tts-voice" class="setting-select"></select>
            </div>

            <div class="setting-field">
                <label for="tts-rate">
                    Speed
                    <output id="tts-rate-value" for="tts-rate">${STATE.ttsRate.toFixed(1)}</output>
                </label>
                <input type="range" id="tts-rate"
                    min="${CONFIG.minTtsRate}" max="${CONFIG.maxTtsRate}"
                    step="0.1" value="${STATE.ttsRate}">
            </div>

            <div class="setting-field">
                <label for="tts-pitch">
                    Pitch
                    <output id="tts-pitch-value" for="tts-pitch">${STATE.ttsPitch.toFixed(1)}</output>
                </label>
                <input type="range" id="tts-pitch"
                    min="${CONFIG.minTtsPitch}" max="${CONFIG.maxTtsPitch}"
                    step="0.1" value="${STATE.ttsPitch}">
            </div>

            <div class="setting-actions">
                <button type="button" id="preview-voice" class="action-btn preview-btn">
                    Preview voice
                </button>
                <button type="button" id="reset-reading" class="action-btn reset-btn">
                    Reset to defaults
                </button>
            </div>
        </div>

        <div class="setting-item site-rules-settings">
            <h4>Site rules</h4>
            <p class="setting-help">
                A site rule keeps the extension always on or off for one site,
                and wins over the global switch. The global switch and the
                rule for the current site are in the extension popup.
            </p>
            <p id="atx-site-rule-count" class="setting-help"></p>
            <ul id="atx-site-rule-list" class="setting-rule-list"></ul>
            <p id="atx-site-rule-empty" class="setting-help">No site rules yet.</p>
            <button type="button" id="atx-clear-site-rules"
                class="action-btn reset-btn">
                Clear all site rules
            </button>
        </div>

        <div class="setting-item page-reset">
            <h4>Page</h4>
            <p class="setting-help">
                Remove every change this extension made to the current page,
                including the undo history.
            </p>
            <button type="button" id="reset-page" class="action-btn reset-btn">
                Reset page changes
            </button>
        </div>

        <div class="setting-item">
            <button type="button" id="export-settings" class="action-btn export-btn">
                Export Settings
            </button>
        </div>

        <div class="setting-item">
            <button type="button" id="import-settings" class="action-btn import-btn">
                Import Settings
            </button>
        </div>

        <button type="button" class="close-btn">Close</button>
    `;

    getMountNode().appendChild(panel);

    textStylingControls = initTextStylingControls({
        root: panel,
        prefix: 'atx-',
        getDefaults: () => STATE.textDefaults,
        save: savePanelTextDefaults,
        announce: showToast
    });

    siteRulesControls = initSiteRulesControls({
        root: panel,
        prefix: 'atx-',
        getRules: () => STATE.siteRules,
        save: savePanelSiteRules,
        announce: showToast
    });

    const closeBtn = panel.querySelector('.close-btn');
    closeBtn.addEventListener('click', removeSettingsPanel);
    panel.querySelector('#export-settings').addEventListener('click', exportSettings);
    panel.querySelector('#import-settings').addEventListener('click', importSettings);
    setupReadingSettings(panel);
    setupPageReset(panel);

    // Keep keyboard focus inside the dialog while it is open.
    panel.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') {
            return;
        }

        const focusable = Array.from(
            panel.querySelectorAll('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])')
        ).filter((element) => !element.disabled);

        if (focusable.length === 0) {
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    closeBtn.focus();
}

/**
 * Persist a text-styling change from the in-page dialog. The app's storage
 * listener refreshes the shared STATE and the toolbar labels.
 * @param {Object} values
 */
function savePanelTextDefaults(values) {
    Object.assign(STATE.textDefaults, values);
    STATE.textDefaults = normalizeTextDefaults(STATE.textDefaults);

    saveSyncedPreferences(values, (saved) => {
        if (saved) {
            return;
        }

        loadSyncedPreferences().then((result) => {
            STATE.textDefaults = normalizeTextDefaults(result);
            syncTextStylingControls();
        }).catch(() => {});

        showToast('Could not save text styling', { error: true });
    });
}

/**
 * Refresh the text-styling controls if the settings dialog is open.
 */
export function syncTextStylingControls() {
    if (textStylingControls) {
        textStylingControls.sync();
    }
}

/**
 * Persist a site-rule change from the in-page dialog, rolling the list back
 * if the write fails.
 * @param {Object<string, 'on'|'off'>} rules
 * @param {string} message
 */
function savePanelSiteRules(rules, message) {
    const previous = STATE.siteRules;
    STATE.siteRules = normalizeSiteRules(rules);
    siteRulesControls?.sync();

    saveSyncedPreferences({ siteRules: STATE.siteRules }, (saved) => {
        if (!saved) {
            STATE.siteRules = previous;
            siteRulesControls?.sync();
            showToast('Could not save site rules', { error: true });
            return;
        }
        showToast(message);
    });
}

/**
 * Refresh the site-rule list if the settings dialog is open.
 */
export function syncSiteRulesControls() {
    if (siteRulesControls) {
        siteRulesControls.sync();
    }
}

/**
 * Wire the reading controls in the settings dialog to storage.
 * @param {HTMLElement} panel
 */
function setupReadingSettings(panel) {
    populateVoiceSelect();
    syncReadingSettingsControls();

    const voiceSelect = panel.querySelector('#tts-voice');
    const rateInput = panel.querySelector('#tts-rate');
    const pitchInput = panel.querySelector('#tts-pitch');

    voiceSelect.addEventListener('change', () => {
        STATE.ttsVoice = voiceSelect.value;
        saveSyncedPreferences({ ttsVoice: STATE.ttsVoice });

        // Apply the new voice to sentences that are not queued yet.
        if (STATE.speech) {
            STATE.speech.voice = pickReadingVoice();
        }
    });

    const bindRange = (input, outputId, stateKey) => {
        const output = panel.querySelector(`#${outputId}`);
        const defaultKey = stateKey === 'ttsRate' ? 'defaultTtsRate' : 'defaultTtsPitch';

        input.addEventListener('input', () => {
            STATE[stateKey] = clampNumber(
                parseFloat(input.value),
                parseFloat(input.min),
                parseFloat(input.max),
                CONFIG[defaultKey]
            );
            output.textContent = STATE[stateKey].toFixed(1);
        });

        input.addEventListener('change', () => {
            saveSyncedPreferences({ [stateKey]: STATE[stateKey] });
        });
    };

    bindRange(rateInput, 'tts-rate-value', 'ttsRate');
    bindRange(pitchInput, 'tts-pitch-value', 'ttsPitch');

    panel.querySelector('#preview-voice').addEventListener('click', previewReadingVoice);
    panel.querySelector('#reset-reading').addEventListener('click', resetReadingSettings);
}

/**
 * Wire the Reset page control. The first press arms the button so a stray
 * click cannot wipe a page of work; the second press performs the reset.
 * @param {HTMLElement} panel
 */
function setupPageReset(panel) {
    const button = panel.querySelector('#reset-page');
    let armed = false;
    let timer = null;

    const disarm = () => {
        armed = false;
        button.textContent = 'Reset page changes';
        button.classList.remove('armed');
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    button.addEventListener('click', () => {
        if (!hasPageChanges()) {
            showToast('Nothing to reset');
            return;
        }

        if (!armed) {
            armed = true;
            button.textContent = 'Confirm reset';
            button.classList.add('armed');
            showToast('Press Reset page changes again to confirm');
            timer = setTimeout(disarm, 5000);
            return;
        }

        disarm();

        if (resetPageChanges()) {
            closeTranslationPanel({ restoreFocus: false });
            removeSettingsPanel();
        }
    });
}

/**
 * Refresh the reading controls if the settings dialog is open.
 */
export function syncReadingSettingsControls() {
    const panel = document.getElementById(CONFIG.settingsPanelId);
    if (!panel) {
        return;
    }

    const rateInput = panel.querySelector('#tts-rate');
    if (rateInput) {
        rateInput.value = String(STATE.ttsRate);
    }
    const rateValue = panel.querySelector('#tts-rate-value');
    if (rateValue) {
        rateValue.textContent = STATE.ttsRate.toFixed(1);
    }

    const pitchInput = panel.querySelector('#tts-pitch');
    if (pitchInput) {
        pitchInput.value = String(STATE.ttsPitch);
    }
    const pitchValue = panel.querySelector('#tts-pitch-value');
    if (pitchValue) {
        pitchValue.textContent = STATE.ttsPitch.toFixed(1);
    }
}

/**
 * Speak a short sample with the current reading settings.
 */
function previewReadingVoice() {
    if (!('speechSynthesis' in window)) {
        showToast('Speech is not available in this browser', { error: true });
        return;
    }

    if (STATE.speech) {
        showToast('Stop reading before previewing a voice');
        return;
    }

    window.speechSynthesis.cancel();

    const voice = pickReadingVoice();
    const utterance = new SpeechSynthesisUtterance(
        'This is a preview of the reading voice.'
    );

    if (voice) {
        utterance.voice = voice;
    }
    utterance.lang = voice?.lang || getPageLanguage();
    utterance.rate = STATE.ttsRate;
    utterance.pitch = STATE.ttsPitch;

    utterance.onerror = (event) => {
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
            showToast('Voice preview could not play', { error: true });
        }
    };

    try {
        window.speechSynthesis.speak(utterance);
    } catch (error) {
        console.warn('Voice preview threw:', error);
        showToast('Voice preview could not play', { error: true });
    }
}

/**
 * Restore the default reading preferences.
 */
function resetReadingSettings() {
    STATE.ttsVoice = '';
    STATE.ttsRate = CONFIG.defaultTtsRate;
    STATE.ttsPitch = CONFIG.defaultTtsPitch;

    saveSyncedPreferences({
        ttsVoice: STATE.ttsVoice,
        ttsRate: STATE.ttsRate,
        ttsPitch: STATE.ttsPitch
    });

    if (STATE.speech) {
        STATE.speech.voice = pickReadingVoice(
            STATE.speech.language,
            STATE.speech.origin === 'translation'
        );
    }

    populateVoiceSelect();
    syncReadingSettingsControls();
    showToast('Reading settings reset to defaults');
}

/**
 * Remove the settings panel and restore focus.
 */
export function removeSettingsPanel() {
    const panel = document.getElementById(CONFIG.settingsPanelId);
    const overlay = document.getElementById(CONFIG.settingsOverlayId);
    const hadPanel = Boolean(panel || overlay);

    if (panel) {
        panel.remove();
    }
    if (overlay) {
        overlay.remove();
    }

    textStylingControls = null;
    siteRulesControls = null;

    // Only move focus back when a dialog was actually open. This keeps a
    // storage-triggered cleanup from stealing focus on an unrelated page.
    if (hadPanel && settingsReturnFocus && settingsReturnFocus.isConnected) {
        settingsReturnFocus.focus();
    }
    settingsReturnFocus = null;
}

/**
 * Export settings to a JSON file.
 */
function exportSettings() {
    const settings = buildSettingsFile({
        darkMode: STATE.isDarkMode,
        ttsVoice: STATE.ttsVoice,
        ttsRate: STATE.ttsRate,
        ttsPitch: STATE.ttsPitch,
        translationTarget: STATE.translationTarget,
        textDefaults: STATE.textDefaults,
        siteRules: STATE.siteRules,
        appVersion: chrome.runtime.getManifest().version
    });

    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const date = settings.exportedAt.slice(0, 10);
    link.download = `accessibility-text-enhancer-settings-v${settings.appVersion}-${date}.json`;
    getMountNode().appendChild(link);
    link.click();
    link.remove();
    // Give the download a moment to start before releasing the blob URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast('Settings exported');
}

/**
 * Apply the preferences from an imported file to STATE, clamping anything
 * that is out of range. Returns whether at least one preference was found.
 * @param {Object} preferences
 * @returns {boolean}
 */
function applyImportedPreferences(preferences) {
    const keys = [
        'darkMode',
        'ttsVoice',
        'ttsRate',
        'ttsPitch',
        ...TEXT_DEFAULT_KEYS
    ];
    let hasSettings = keys.some((key) => preferences[key] !== undefined);

    if (typeof preferences.translationTarget === 'string') {
        STATE.translationTarget = normalizeTranslationTarget(
            preferences.translationTarget
        );
        hasSettings = true;
    }

    if (typeof preferences.darkMode === 'boolean') {
        STATE.isDarkMode = preferences.darkMode;
    }
    if (typeof preferences.ttsVoice === 'string') {
        STATE.ttsVoice = preferences.ttsVoice;
    }
    if (preferences.ttsRate !== undefined) {
        STATE.ttsRate = clampNumber(
            preferences.ttsRate,
            CONFIG.minTtsRate,
            CONFIG.maxTtsRate,
            CONFIG.defaultTtsRate
        );
    }
    if (preferences.ttsPitch !== undefined) {
        STATE.ttsPitch = clampNumber(
            preferences.ttsPitch,
            CONFIG.minTtsPitch,
            CONFIG.maxTtsPitch,
            CONFIG.defaultTtsPitch
        );
    }

    const textDefaults = normalizeTextDefaults({
        ...STATE.textDefaults,
        ...pickTextDefaults(preferences)
    });
    STATE.textDefaults = textDefaults;

    return hasSettings;
}

/**
 * Import settings from a JSON file.
 */
function importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';

    input.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            try {
                const parsed = parseSettingsFile(loadEvent.target.result);

                if (!parsed) {
                    showToast('No settings found in file', { error: true });
                    return;
                }

                const hasSettings = applyImportedPreferences(parsed.preferences);
                const hasRules = parsed.hasRules;

                if (!hasSettings && !hasRules) {
                    showToast('No settings found in file', { error: true });
                    return;
                }

                const updates = {
                    darkMode: STATE.isDarkMode,
                    ttsVoice: STATE.ttsVoice,
                    ttsRate: STATE.ttsRate,
                    ttsPitch: STATE.ttsPitch,
                    ...STATE.textDefaults
                };

                if (typeof parsed.preferences.translationTarget === 'string') {
                    updates.translationTarget = STATE.translationTarget;
                }

                if (hasRules) {
                    STATE.siteRules = parsed.siteRules;
                    updates.siteRules = STATE.siteRules;
                }

                saveSyncedPreferences(updates);
                applyTheme();
                syncReadingSettingsControls();
                showToast('Settings imported successfully');
                removeSettingsPanel();
            } catch (error) {
                showToast('Error importing settings', { error: true });
                console.error('Import error:', error);
            }
        };
        reader.onerror = () => {
            showToast('Error reading settings file', { error: true });
        };
        reader.readAsText(file);
    });

    input.click();
}

/**
 * Toggle toolbar theme.
 */
export function toggleToolbarTheme() {
    STATE.isDarkMode = !STATE.isDarkMode;
    saveSyncedPreferences({ darkMode: STATE.isDarkMode });
    applyTheme();
    // The preview's contrast fallback depends on the panel's text colour.
    syncTextStylingControls();
    showToast(`${STATE.isDarkMode ? 'Dark' : 'Light'} mode activated`);
}
