// Read-aloud session, speech synthesis, and follow-along highlighting.

import { CONFIG, SKIP_SELECTOR, STATE } from './core.js';
import { buildSentenceMap, buildSpeechChunks } from './text.js';
import { buildTextMap, closestBlock, rangeFromOffsets } from './dom.js';
import { showToast } from './toast.js';
import { createToolbar, positionToolbar, updateToolbarReadingState } from './toolbar.js';

/**
 * Cache the browser's voices. getVoices() is asynchronous on most
 * platforms, so this runs again whenever the browser reports a change.
 */
export function loadVoices() {
    if (!('speechSynthesis' in window)) {
        return;
    }

    STATE.voices = window.speechSynthesis.getVoices();
    populateVoiceSelect();
}

/**
 * Keep the settings panel's voice list in sync when voices finish loading.
 */
export function populateVoiceSelect() {
    // Only touch our own panel. Pages may use these generic ids, and the
    // voice list can load before the toolbar or dialog is ever created.
    const panel = document.getElementById(CONFIG.settingsPanelId);
    const select = panel?.querySelector('#tts-voice');
    if (!select) {
        return;
    }

    const voices = getAvailableVoices();
    const previous = STATE.ttsVoice;
    select.innerHTML = '';

    const automatic = document.createElement('option');
    automatic.value = '';
    automatic.textContent = `Automatic (${getPageLanguage()})`;
    select.appendChild(automatic);

    voices
        .slice()
        .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
        .forEach((voice) => {
            const option = document.createElement('option');
            option.value = voice.voiceURI;
            option.textContent = `${voice.name} (${voice.lang})` +
                (voice.default ? ' — default' : '');
            select.appendChild(option);
        });

    select.value = voices.some((voice) => voice.voiceURI === previous)
        ? previous
        : '';

    if (previous && voices.length > 0 && select.value === '') {
        // The saved voice is gone (another browser profile or an OS voice
        // update). Fall back to the language-based pick. An empty voice
        // list means the browser has not loaded voices yet, so keep it.
        STATE.ttsVoice = '';
    }
}

/**
 * Voices currently exposed by the browser.
 * @returns {SpeechSynthesisVoice[]}
 */
function getAvailableVoices() {
    if (!('speechSynthesis' in window)) {
        return [];
    }
    if (STATE.voices.length === 0) {
        STATE.voices = window.speechSynthesis.getVoices();
    }
    return STATE.voices;
}

/**
 * The language the page declares, used to pick a sensible default voice.
 * @returns {string}
 */
export function getPageLanguage() {
    const declared = (document.documentElement.lang || '').trim();
    return declared || navigator.language || 'en';
}

/**
 * Refresh the voice list when the browser finishes loading it.
 */
export function setupVoiceListener() {
    if (!('speechSynthesis' in window)) {
        return;
    }

    const refresh = () => loadVoices();
    if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', refresh);
    } else {
        window.speechSynthesis.onvoiceschanged = refresh;
    }
}

/**
 * Read the selected text aloud, or pause/resume a reading that is already
 * in progress.
 */
export function toggleReadAloud() {
    if (!('speechSynthesis' in window)) {
        showToast('Speech synthesis not supported', { error: true });
        return;
    }

    if (!STATE.isExtensionEnabled) {
        return;
    }

    if (STATE.speech) {
        if (STATE.speech.paused) {
            resumeReading();
        } else {
            pauseReading();
        }
        return;
    }

    const range = getReadingTarget();
    if (!range) {
        showToast('Select text or place the cursor in a paragraph');
        return;
    }

    startReading(range);
}

/**
 * Resolve what to read: the saved selection, the live selection, or the
 * paragraph containing the caret.
 * @returns {Range|null}
 */
function getReadingTarget() {
    if (STATE.savedRange &&
        STATE.savedRange.commonAncestorContainer.isConnected &&
        !STATE.savedRange.collapsed &&
        STATE.savedRange.toString().trim()) {
        return STATE.savedRange.cloneRange();
    }

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
        const live = selection.getRangeAt(0);

        if (!live.collapsed && live.toString().trim()) {
            return live.cloneRange();
        }

        const block = closestBlock(live.startContainer);
        if (block &&
            block !== document.body &&
            block !== document.documentElement &&
            !block.closest(SKIP_SELECTOR)) {
            const range = document.createRange();
            range.selectNodeContents(block);
            if (range.toString().trim()) {
                return range;
            }
        }
    }

    return null;
}

/**
 * The element whose language applies to a reading range.
 * @param {Range} range
 * @returns {HTMLElement|null}
 */
function readingElementFor(range) {
    const node = range.commonAncestorContainer;
    return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}

/**
 * The nearest declared language for a reading range, or the page language.
 * @param {Range} range
 * @returns {string}
 */
function readingLanguageFor(range) {
    const declared = readingElementFor(range)
        ?.closest?.('[lang]')?.getAttribute('lang') || '';
    return declared || getPageLanguage();
}

/**
 * Whether a range is a translated wrapper, which must use its target
 * language and a matching voice.
 * @param {Range} range
 * @returns {boolean}
 */
function readingPrefersLanguage(range) {
    const element = readingElementFor(range);
    return Boolean(element?.closest?.(`[${CONFIG.translationAttr}]`));
}

/**
 * Start a new reading from a range.
 * @param {Range} range
 */
function startReading(range) {
    const map = buildTextMap(range);

    beginReading({
        text: map.text,
        map,
        language: readingLanguageFor(range),
        range,
        preferLanguage: readingPrefersLanguage(range)
    });
}

/**
 * Start a reading session from a page range.
 * @param {{text: string, map: Object, language: string,
 *     range?: Range|null, preferLanguage?: boolean}} reading
 */
function beginReading(reading) {
    if (!('speechSynthesis' in window)) {
        showToast('Speech synthesis not supported', { error: true });
        return;
    }

    const language = reading.language || getPageLanguage();
    const chunks = buildSpeechChunks(
        reading.text,
        CONFIG.maxSpeechChunkLength,
        language
    );

    if (chunks.length === 0) {
        showToast('Nothing to read');
        return;
    }

    // Cancel anything left over from a previous reading before replacing
    // the session, so stale callbacks cannot continue the old queue.
    if (STATE.speech) {
        stopReading({ silent: true });
    }

    const session = {
        map: reading.map,
        language,
        preferLanguage: Boolean(reading.preferLanguage),
        chunks,
        sentences: buildSentenceMap(reading.text, language),
        index: 0,
        // Highest chunk already handed to the speech engine.
        queued: -1,
        // Start offset of the sentence currently highlighted.
        highlightStart: -1,
        paused: false,
        utterance: null,
        voice: pickReadingVoice(language, Boolean(reading.preferLanguage))
    };

    STATE.speech = session;
    ensureReadingToolbar(reading.range);
    queueSpeechChunk(session, 0);
    showToast('Reading aloud');
}

/**
 * Make sure transport controls are reachable. Reading from the caret may
 * start without a selection, so no toolbar exists yet.
 * @param {Range|null} range
 */
function ensureReadingToolbar(range) {
    if (document.getElementById(CONFIG.toolbarId)) {
        updateToolbarReadingState();
        return;
    }

    const toolbar = createToolbar();
    if (toolbar) {
        const target = STATE.savedRange || range;
        if (target) {
            positionToolbar(toolbar, target);
        }
    }
}

/**
 * Whether a voice's language matches the requested language's primary tag.
 * @param {SpeechSynthesisVoice} voice
 * @param {string} language
 * @returns {boolean}
 */
function voiceMatchesLanguage(voice, language) {
    const requested = String(language || getPageLanguage()).toLowerCase();
    const voiceLanguage = String(voice.lang || '').toLowerCase();

    return voiceLanguage === requested ||
        voiceLanguage.split('-')[0] === requested.split('-')[0];
}

/**
 * Pick the saved voice, or the best match for a language. A translation
 * session passes `preferLanguage` so a saved voice for another language is
 * not used with the target text.
 * @param {string} [language] Defaults to the page language.
 * @param {boolean} [preferLanguage]
 * @returns {SpeechSynthesisVoice|null}
 */
export function pickReadingVoice(
    language = getPageLanguage(),
    preferLanguage = false
) {
    const voices = getAvailableVoices();
    if (voices.length === 0) {
        return null;
    }

    if (STATE.ttsVoice) {
        const saved = voices.find((voice) =>
            voice.voiceURI === STATE.ttsVoice || voice.name === STATE.ttsVoice
        );
        if (saved && (!preferLanguage || voiceMatchesLanguage(saved, language))) {
            return saved;
        }
    }

    const pageLanguage = String(language || getPageLanguage()).toLowerCase();
    const primaryLanguage = pageLanguage.split('-')[0];
    const matching = voices.filter((voice) => {
        const voiceLanguage = voice.lang.toLowerCase();
        return voiceLanguage === pageLanguage ||
            voiceLanguage === primaryLanguage ||
            voiceLanguage.startsWith(`${primaryLanguage}-`);
    });

    return matching.find((voice) => voice.default) ||
        matching.find((voice) => voice.localService) ||
        matching[0] ||
        voices.find((voice) => voice.default) ||
        voices[0];
}

/**
 * Queue one speech chunk, and queue the following chunk as soon as this
 * one starts. Calling speak() only after the previous utterance ended
 * makes the engine restart between sentences, which sounds like a
 * multi-second pause. Keeping one chunk ahead lets it continue straight
 * into the next sentence.
 * @param {object} session
 * @param {number} index
 */
function queueSpeechChunk(session, index) {
    if (session !== STATE.speech ||
        index < 0 ||
        index >= session.chunks.length ||
        index <= session.queued) {
        return;
    }

    session.queued = index;
    const chunk = session.chunks[index];
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    utterance.rate = STATE.ttsRate;
    utterance.pitch = STATE.ttsPitch;

    if (session.voice) {
        utterance.voice = session.voice;
    }
    // A translated range must speak in its target language. Page reading
    // keeps preferring the chosen voice's more specific language.
    utterance.lang = session.preferLanguage
        ? session.language
        : (session.voice?.lang || session.language || getPageLanguage());

    utterance.onstart = () => {
        if (session !== STATE.speech) {
            return;
        }

        session.index = index;
        session.highlightStart = -1;
        const range = rangeFromOffsets(session.map, chunk.start, chunk.end);
        if (range) {
            highlightReadingRange(range);
        }

        // The next chunk is already in the engine's queue by the time this
        // one finishes, so there is no cold start between sentences.
        queueSpeechChunk(session, index + 1);
    };

    // A chunk can hold several sentences. Word boundaries keep the
    // highlight moving without splitting the utterance and re-introducing
    // the pause this packing avoids. Engines that do not report boundaries
    // keep the whole-chunk highlight from onstart.
    utterance.onboundary = (event) => {
        if (session !== STATE.speech || typeof event.charIndex !== 'number') {
            return;
        }

        highlightReadingSentence(session, chunk.start + event.charIndex);
    };

    utterance.onend = () => {
        if (session !== STATE.speech) {
            return;
        }

        if (index === session.chunks.length - 1) {
            finishReading();
        }
    };

    utterance.onerror = (event) => {
        if (session !== STATE.speech) {
            return;
        }

        // cancel() reports an interrupted error for the utterance it
        // aborts. That is expected when the user stops or restarts.
        if (event.error === 'interrupted' || event.error === 'canceled') {
            return;
        }

        console.warn('Speech synthesis error:', event.error);
        stopReading({ silent: true });
        showToast('Reading stopped — the voice could not speak this text', { error: true });
    };

    session.utterance = utterance;
    try {
        window.speechSynthesis.speak(utterance);
    } catch (error) {
        console.warn('Speech synthesis threw:', error);
        stopReading({ silent: true });
        showToast('Reading could not start', { error: true });
    }
}

/**
 * Pause the current reading.
 */
function pauseReading() {
    if (!STATE.speech || STATE.speech.paused) {
        return;
    }

    window.speechSynthesis.pause();
    STATE.speech.paused = true;
    showToast('Reading paused');
    updateToolbarReadingState();
}

/**
 * Resume a paused reading.
 */
function resumeReading() {
    if (!STATE.speech || !STATE.speech.paused) {
        return;
    }

    window.speechSynthesis.resume();
    STATE.speech.paused = false;
    showToast('Reading resumed');
    updateToolbarReadingState();
}

/**
 * Stop the current reading.
 * @param {{silent?: boolean}} [options]
 */
export function stopReading(options = {}) {
    const wasReading = Boolean(STATE.speech);
    STATE.speech = null;

    // Only cancel speech we started. Calling cancel() with no session also
    // stops whatever the page itself is reading aloud.
    if (wasReading && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }

    clearReadingHighlight();
    updateToolbarReadingState();

    if (wasReading && !options.silent) {
        showToast('Reading stopped');
    }
}

/**
 * Finish the current reading normally.
 */
function finishReading() {
    const wasReading = Boolean(STATE.speech);
    STATE.speech = null;
    clearReadingHighlight();
    updateToolbarReadingState();

    if (wasReading) {
        showToast('Finished reading');
    }
}

/**
 * Paint the sentence that is currently being spoken. Uses the CSS Custom
 * Highlight API, which does not mutate the page. Browsers without it still
 * read the text; only the visual follow-along is skipped.
 * @param {Range} range
 */
function highlightReadingRange(range) {
    if (!window.CSS || !CSS.highlights || typeof Highlight !== 'function') {
        return;
    }

    CSS.highlights.set(CONFIG.readingHighlightName, new Highlight(range));
}

/**
 * Move the follow-along highlight to the sentence that contains an offset
 * inside the current chunk.
 * @param {object} session
 * @param {number} offset
 */
function highlightReadingSentence(session, offset) {
    const sentence = session.sentences.find((entry) =>
        offset >= entry.start && offset < entry.end
    );

    if (!sentence || sentence.start === session.highlightStart) {
        return;
    }

    const range = rangeFromOffsets(session.map, sentence.start, sentence.end);
    if (!range) {
        return;
    }

    session.highlightStart = sentence.start;
    highlightReadingRange(range);
}

/**
 * Remove the follow-along highlight.
 */
function clearReadingHighlight() {
    if (window.CSS && CSS.highlights) {
        CSS.highlights.delete(CONFIG.readingHighlightName);
    }
}
