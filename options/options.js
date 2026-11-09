// options/options.js

const DEFAULTS = {
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

const state = { ...DEFAULTS };
let voices = [];
let statusTimer = null;

const voiceSelect = document.getElementById('tts-voice');
const rateInput = document.getElementById('tts-rate');
const rateValue = document.getElementById('tts-rate-value');
const pitchInput = document.getElementById('tts-pitch');
const pitchValue = document.getElementById('tts-pitch-value');
const status = document.getElementById('options-status');

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
 * Persist one or more preferences.
 * @param {Record<string, unknown>} values
 */
function savePreferences(values) {
    chrome.storage.local.set(values, () => {
        if (chrome.runtime.lastError) {
            setStatus('Could not save settings. Try again.');
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
 * Mirror the state into the controls.
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

// Load saved preferences.
chrome.storage.local.get(['ttsVoice', 'ttsRate', 'ttsPitch'], (result) => {
    if (chrome.runtime.lastError) {
        setStatus('Could not load settings. Try reopening this page.');
        return;
    }

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

    loadVoices();
    syncControls();
});

// Keep the page in sync if the same settings are changed from the in-page
// toolbar while this page is open.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
        return;
    }

    let changed = false;

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

    if (changed) {
        syncControls();
    }
});

// Voices load asynchronously on most platforms.
loadVoices();
if ('speechSynthesis' in window) {
    if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    } else {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
}

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

document.getElementById('version').textContent =
    `v${chrome.runtime.getManifest().version}`;
