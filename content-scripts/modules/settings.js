// Reading preferences dialog plus settings import and export.

import { CONFIG, STATE } from './core.js';
import { clampNumber } from './text.js';
import { getMountNode } from './dom.js';
import { showToast } from './toast.js';
import { applyTheme } from './toolbar.js';
import { getPageLanguage, pickReadingVoice, populateVoiceSelect } from './reading.js';
import { normalizeSiteRules, saveSyncedPreferences } from './prefs.js';
import { hasPageChanges, resetPageChanges } from './history.js';

let settingsReturnFocus = null;

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
            removeSettingsPanel();
        }
    });
}

/**
 * Refresh the reading controls if the settings dialog is open.
 */
export function syncReadingSettingsControls() {
    const rateInput = document.getElementById('tts-rate');
    if (rateInput) {
        rateInput.value = String(STATE.ttsRate);
    }
    const rateValue = document.getElementById('tts-rate-value');
    if (rateValue) {
        rateValue.textContent = STATE.ttsRate.toFixed(1);
    }

    const pitchInput = document.getElementById('tts-pitch');
    if (pitchInput) {
        pitchInput.value = String(STATE.ttsPitch);
    }
    const pitchValue = document.getElementById('tts-pitch-value');
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
        STATE.speech.voice = pickReadingVoice();
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
    const appVersion = chrome.runtime.getManifest().version;
    const settings = {
        schema: CONFIG.settingsSchemaVersion,
        appVersion,
        exportedAt: new Date().toISOString(),
        preferences: {
            darkMode: STATE.isDarkMode,
            ttsVoice: STATE.ttsVoice,
            ttsRate: STATE.ttsRate,
            ttsPitch: STATE.ttsPitch
        },
        siteRules: STATE.siteRules || {}
    };

    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const date = settings.exportedAt.slice(0, 10);
    link.download = `accessibility-text-enhancer-settings-v${appVersion}-${date}.json`;
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
    const keys = ['darkMode', 'ttsVoice', 'ttsRate', 'ttsPitch'];
    const hasSettings = keys.some((key) => preferences[key] !== undefined);

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
                const settings = JSON.parse(loadEvent.target.result);
                const preferences = settings.preferences;

                if (!preferences || typeof preferences !== 'object') {
                    showToast('No settings found in file', { error: true });
                    return;
                }

                // Files written before schema 2 have no schema field and
                // only carry preferences, so they import as-is.
                const schema = typeof settings.schema === 'number' ? settings.schema : 1;
                const hasSettings = applyImportedPreferences(preferences);
                const hasRules = schema >= 2 && settings.siteRules !== undefined;

                if (!hasSettings && !hasRules) {
                    showToast('No settings found in file', { error: true });
                    return;
                }

                const updates = {
                    darkMode: STATE.isDarkMode,
                    ttsVoice: STATE.ttsVoice,
                    ttsRate: STATE.ttsRate,
                    ttsPitch: STATE.ttsPitch
                };

                if (hasRules) {
                    STATE.siteRules = normalizeSiteRules(settings.siteRules);
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
    showToast(`${STATE.isDarkMode ? 'Dark' : 'Light'} mode activated`);
}
