// Selection translation through Chrome's built-in Translator API.
// Kept free of DOM, chrome, and navigator access so the Node unit test can
// import this module directly and drive it with a fake translator.

// Chrome's published supported-language list (39 tags), checked 2026-11-25:
// https://developer.chrome.com/docs/ai/translator-api#supported-languages
// There is no API to enumerate pairs, so this table is the source of truth.
export const TRANSLATION_LANGUAGES = Object.freeze([
    Object.freeze({ code: 'ar', name: 'Arabic' }),
    Object.freeze({ code: 'bg', name: 'Bulgarian' }),
    Object.freeze({ code: 'bn', name: 'Bengali' }),
    Object.freeze({ code: 'cs', name: 'Czech' }),
    Object.freeze({ code: 'da', name: 'Danish' }),
    Object.freeze({ code: 'de', name: 'German' }),
    Object.freeze({ code: 'el', name: 'Greek' }),
    Object.freeze({ code: 'en', name: 'English' }),
    Object.freeze({ code: 'es', name: 'Spanish' }),
    Object.freeze({ code: 'fi', name: 'Finnish' }),
    Object.freeze({ code: 'fr', name: 'French' }),
    Object.freeze({ code: 'he', name: 'Hebrew' }),
    Object.freeze({ code: 'hi', name: 'Hindi' }),
    Object.freeze({ code: 'hr', name: 'Croatian' }),
    Object.freeze({ code: 'hu', name: 'Hungarian' }),
    Object.freeze({ code: 'id', name: 'Indonesian' }),
    Object.freeze({ code: 'it', name: 'Italian' }),
    Object.freeze({ code: 'ja', name: 'Japanese' }),
    Object.freeze({ code: 'kn', name: 'Kannada' }),
    Object.freeze({ code: 'ko', name: 'Korean' }),
    Object.freeze({ code: 'lt', name: 'Lithuanian' }),
    Object.freeze({ code: 'mr', name: 'Marathi' }),
    Object.freeze({ code: 'nl', name: 'Dutch' }),
    Object.freeze({ code: 'no', name: 'Norwegian' }),
    Object.freeze({ code: 'pl', name: 'Polish' }),
    Object.freeze({ code: 'pt', name: 'Portuguese' }),
    Object.freeze({ code: 'ro', name: 'Romanian' }),
    Object.freeze({ code: 'ru', name: 'Russian' }),
    Object.freeze({ code: 'sk', name: 'Slovak' }),
    Object.freeze({ code: 'sl', name: 'Slovenian' }),
    Object.freeze({ code: 'sv', name: 'Swedish' }),
    Object.freeze({ code: 'ta', name: 'Tamil' }),
    Object.freeze({ code: 'te', name: 'Telugu' }),
    Object.freeze({ code: 'th', name: 'Thai' }),
    Object.freeze({ code: 'tr', name: 'Turkish' }),
    Object.freeze({ code: 'uk', name: 'Ukrainian' }),
    Object.freeze({ code: 'vi', name: 'Vietnamese' }),
    Object.freeze({ code: 'zh', name: 'Chinese' }),
    Object.freeze({ code: 'zh-Hant', name: 'Chinese (Traditional)' })
]);

export const TRANSLATION_LANGUAGE_NAMES = Object.freeze(
    Object.fromEntries(
        TRANSLATION_LANGUAGES.map(({ code, name }) => [code, name])
    )
);

const SUPPORTED_TAGS = new Set(
    TRANSLATION_LANGUAGES.map(({ code }) => code)
);

// Legacy and Norwegian aliases Chrome accepts. Everything else is reduced to
// its primary subtag, which is what the API actually serves.
const LANGUAGE_ALIASES = Object.freeze({
    in: 'id',
    iw: 'he',
    mo: 'ro',
    nb: 'no',
    nn: 'no'
});

export const TRANSLATION_AVAILABILITY = Object.freeze({
    available: 'available',
    downloadable: 'downloadable',
    downloading: 'downloading',
    unavailable: 'unavailable'
});

const AVAILABILITY_VALUES = new Set(Object.values(TRANSLATION_AVAILABILITY));

export const DEFAULT_TRANSLATION_MAX_CHARS = 5000;

// Every failure the panel can show. `cancelled` stays silent because the user
// asked for it, and `same` is checked before the API is called.
export const TRANSLATION_ERROR_CODES = Object.freeze({
    missing: 'missing',
    blocked: 'blocked',
    unsupported: 'unsupported',
    network: 'network',
    inactive: 'inactive',
    tooLong: 'tooLong',
    empty: 'empty',
    same: 'same',
    failed: 'failed',
    cancelled: 'cancelled'
});

const RETRY_CODES = new Set([
    TRANSLATION_ERROR_CODES.blocked,
    TRANSLATION_ERROR_CODES.network,
    TRANSLATION_ERROR_CODES.inactive,
    TRANSLATION_ERROR_CODES.empty,
    TRANSLATION_ERROR_CODES.failed
]);

const ERROR_CODE_BY_NAME = Object.freeze({
    AbortError: TRANSLATION_ERROR_CODES.cancelled,
    NotAllowedError: TRANSLATION_ERROR_CODES.blocked,
    NotSupportedError: TRANSLATION_ERROR_CODES.unsupported,
    NetworkError: TRANSLATION_ERROR_CODES.network,
    InvalidStateError: TRANSLATION_ERROR_CODES.inactive,
    QuotaExceededError: TRANSLATION_ERROR_CODES.tooLong,
    OperationError: TRANSLATION_ERROR_CODES.failed,
    UnknownError: TRANSLATION_ERROR_CODES.failed
});

/**
 * Split a language tag into its primary subtag and canonicalized subtags.
 * @param {unknown} tag
 * @returns {{primary: string, subtags: string[]}|null}
 */
function parseLanguageTag(tag) {
    if (typeof tag !== 'string') {
        return null;
    }

    const cleaned = tag.trim().replace(/_/g, '-').replace(/-+/g, '-');
    if (!cleaned) {
        return null;
    }

    const parts = cleaned.split('-');
    const primary = parts[0].toLowerCase();
    if (!/^[a-z]{2,3}$/.test(primary)) {
        return null;
    }

    const subtags = [];
    for (const part of parts.slice(1)) {
        if (/^[a-z]{4}$/i.test(part)) {
            subtags.push(part[0].toUpperCase() + part.slice(1).toLowerCase());
        } else if (/^[a-z]{2}$/i.test(part) || /^\d{3}$/.test(part)) {
            subtags.push(part.toUpperCase());
        }
    }

    return {
        primary: LANGUAGE_ALIASES[primary] || primary,
        subtags
    };
}

/**
 * Reduce a BCP 47 tag to one Chrome serves, or an empty string when the
 * language is not supported.
 * @param {unknown} tag
 * @returns {string}
 */
export function normalizeLanguageTag(tag) {
    const parsed = parseLanguageTag(tag);
    if (!parsed) {
        return '';
    }

    const { primary, subtags } = parsed;

    if (primary === 'zh') {
        const traditional = subtags.includes('Hant') ||
            subtags.includes('TW') ||
            subtags.includes('HK') ||
            subtags.includes('MO');
        return traditional ? 'zh-Hant' : 'zh';
    }

    return SUPPORTED_TAGS.has(primary) ? primary : '';
}

/**
 * The target to persist. Anything unsupported, including a missing value,
 * falls back to English.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTranslationTarget(value) {
    return normalizeLanguageTag(value) || 'en';
}

/**
 * Pick the target from the browser language when the user has not chosen one.
 * @param {unknown} browserLanguage
 * @returns {string}
 */
export function defaultTranslationTarget(browserLanguage) {
    return normalizeLanguageTag(browserLanguage) || 'en';
}

/**
 * The English name of a supported language, or an empty string.
 * @param {unknown} tag
 * @returns {string}
 */
export function translationLanguageName(tag) {
    const normalized = normalizeLanguageTag(tag);
    return normalized ? TRANSLATION_LANGUAGE_NAMES[normalized] : '';
}

/**
 * Whether both tags resolve to the same supported language.
 * @param {unknown} source
 * @param {unknown} target
 * @returns {boolean}
 */
export function isSameLanguage(source, target) {
    const from = normalizeLanguageTag(source);
    const to = normalizeLanguageTag(target);
    return Boolean(from && to && from === to);
}

/**
 * Collapse runs of spaces and tabs, keep single paragraph breaks, and trim
 * the ends. Used for both the cap check and the text sent to Chrome.
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeTranslationText(text) {
    if (typeof text !== 'string') {
        return '';
    }

    return text
        .replace(/\r\n?/g, '\n')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Normalize the input and report whether it exceeds the character cap. The
 * text is never truncated silently; the caller asks for a smaller selection.
 * @param {unknown} text
 * @param {number} [maxChars]
 * @returns {{text: string, characters: number, maxChars: number,
 *     tooLong: boolean}}
 */
export function prepareTranslationText(text, maxChars = DEFAULT_TRANSLATION_MAX_CHARS) {
    const limit = Number.isFinite(maxChars) && maxChars > 0
        ? Math.floor(maxChars)
        : DEFAULT_TRANSLATION_MAX_CHARS;
    const normalized = normalizeTranslationText(text);

    return {
        text: normalized,
        characters: normalized.length,
        maxChars: limit,
        tooLong: normalized.length > limit
    };
}

/**
 * A user-facing message for a failure code. Language names come from the
 * supported table so the message can name the pair.
 * @param {string} code
 * @param {{source?: string, target?: string}} [context]
 * @returns {string}
 */
export function translationMessage(code, context = {}) {
    const source = translationLanguageName(context.source) || 'this language';
    const target = translationLanguageName(context.target) || 'the target language';

    switch (code) {
        case TRANSLATION_ERROR_CODES.missing:
            return 'Translation needs Chrome 138 or newer on desktop, on an HTTPS page.';
        case TRANSLATION_ERROR_CODES.blocked:
            return 'Chrome blocked translation. Click Translate again.';
        case TRANSLATION_ERROR_CODES.unsupported:
            return `Chrome can't translate ${source} to ${target} yet.`;
        case TRANSLATION_ERROR_CODES.network:
            return "The language pack couldn't download. Check your connection and try again.";
        case TRANSLATION_ERROR_CODES.inactive:
            return 'Translation paused because the tab was in the background. Try again.';
        case TRANSLATION_ERROR_CODES.tooLong:
            return 'That text is too long to translate. Select less text and try again.';
        case TRANSLATION_ERROR_CODES.empty:
            return 'The translation came back empty. Try again.';
        case TRANSLATION_ERROR_CODES.same:
            return `This text is already in ${target}.`;
        case TRANSLATION_ERROR_CODES.cancelled:
            return '';
        default:
            return 'Translation failed. Try again.';
    }
}

/**
 * Whether a failure should offer a retry control.
 * @param {string} code
 * @returns {boolean}
 */
export function translationErrorRetry(code) {
    return RETRY_CODES.has(code);
}

/**
 * Map a Translator API error onto a stable code, message, retry flag, and a
 * silent flag for user cancellations.
 * @param {unknown} error
 * @param {{source?: string, target?: string}} [context]
 * @returns {{code: string, message: string, retry: boolean,
 *     silent: boolean}}
 */
export function describeTranslationError(error, context = {}) {
    const name = error && typeof error === 'object' ? error.name : '';
    const known = typeof name === 'string' &&
        Object.prototype.hasOwnProperty.call(ERROR_CODE_BY_NAME, name);
    const code = known ? ERROR_CODE_BY_NAME[name] : TRANSLATION_ERROR_CODES.failed;

    return {
        code,
        message: translationMessage(code, context),
        retry: translationErrorRetry(code),
        silent: code === TRANSLATION_ERROR_CODES.cancelled
    };
}

/**
 * Build a failure result in the same shape as a successful translation.
 * @param {string} code
 * @param {{source?: string, target?: string}} context
 * @returns {{ok: false, code: string, message: string, retry: boolean,
 *     silent: boolean}}
 */
function translationFailure(code, context) {
    return {
        ok: false,
        code,
        message: translationMessage(code, context),
        retry: translationErrorRetry(code),
        silent: code === TRANSLATION_ERROR_CODES.cancelled
    };
}

/**
 * Chrome exposes Translator on the global object. Reading it lazily keeps the
 * module importable in Node, where the API does not exist.
 * @returns {Function|null}
 */
function defaultTranslatorClass() {
    return typeof globalThis.Translator === 'function'
        ? globalThis.Translator
        : null;
}

/**
 * Wrap the Translator API with a per-page cache and explicit cancellation.
 *
 * A create signal belongs to one creation attempt: aborting it before or after
 * `create()` resolves destroys the instance, so it must never be reused to
 * cancel a translation. A request signal only cancels the current
 * `translate()` call and leaves the cached translator alive.
 *
 * @param {{getTranslator?: Function, maxChars?: number}} [options]
 * @returns {{
 *     isSupported: () => boolean,
 *     availability: (source: string, target: string) => Promise<string>,
 *     translate: (request: Object) => Promise<Object>,
 *     clear: () => void,
 *     size: number
 * }}
 */
export function createTranslationService(options = {}) {
    const getTranslator = typeof options.getTranslator === 'function'
        ? options.getTranslator
        : defaultTranslatorClass;
    const maxChars = Number.isFinite(options.maxChars) && options.maxChars > 0
        ? Math.floor(options.maxChars)
        : DEFAULT_TRANSLATION_MAX_CHARS;
    const cache = new Map();

    /**
     * Resolve the injected or global constructor. A non-function is treated
     * as a missing API.
     * @returns {Function|null}
     */
    function translatorClass() {
        const candidate = getTranslator();
        return typeof candidate === 'function' ? candidate : null;
    }

    /**
     * Drop an entry and destroy its translator. Called when a create signal is
     * aborted, because Chrome destroys the instance in that case anyway.
     * @param {string} key
     * @param {Object} entry
     */
    function evict(key, entry) {
        entry.destroyed = true;
        if (cache.get(key) === entry) {
            cache.delete(key);
        }

        try {
            entry.translator.destroy();
        } catch (error) {
            // A translator that cannot be destroyed is still safe to drop.
        }
    }

    /**
     * @param {unknown} source
     * @param {unknown} target
     * @returns {Promise<string>} available, downloadable, downloading, or
     *     unavailable. A null or unknown answer is treated as unavailable.
     */
    async function availability(source, target) {
        const from = normalizeLanguageTag(source);
        const to = normalizeTranslationTarget(target);
        const TranslatorClass = translatorClass();

        if (!TranslatorClass || !from || isSameLanguage(from, to)) {
            return TRANSLATION_AVAILABILITY.unavailable;
        }

        try {
            const value = await TranslatorClass.availability({
                sourceLanguage: from,
                targetLanguage: to
            });
            return AVAILABILITY_VALUES.has(value)
                ? value
                : TRANSLATION_AVAILABILITY.unavailable;
        } catch (error) {
            return TRANSLATION_AVAILABILITY.unavailable;
        }
    }

    /**
     * Create and cache one translator, forwarding download progress.
     * @param {Function} TranslatorClass
     * @param {string} key
     * @param {string} from
     * @param {string} to
     * @param {AbortSignal|undefined} createSignal
     * @param {Function|undefined} onProgress
     * @param {{source: string, target: string}} context
     * @returns {Promise<Object>}
     */
    async function createEntry(
        TranslatorClass,
        key,
        from,
        to,
        createSignal,
        onProgress,
        context
    ) {
        if (createSignal?.aborted) {
            return translationFailure(TRANSLATION_ERROR_CODES.cancelled, context);
        }

        let translator;
        try {
            translator = await TranslatorClass.create({
                sourceLanguage: from,
                targetLanguage: to,
                signal: createSignal,
                monitor(monitor) {
                    if (typeof onProgress !== 'function' ||
                        typeof monitor?.addEventListener !== 'function') {
                        return;
                    }

                    monitor.addEventListener('downloadprogress', (event) => {
                        const loaded = Number(event?.loaded);
                        if (Number.isFinite(loaded)) {
                            onProgress(Math.min(1, Math.max(0, loaded)));
                        }
                    });
                }
            });
        } catch (error) {
            return {
                ok: false,
                ...describeTranslationError(error, context)
            };
        }

        if (!translator || typeof translator.translate !== 'function') {
            return translationFailure(TRANSLATION_ERROR_CODES.failed, context);
        }

        if (createSignal?.aborted) {
            // Creation finished after the panel closed. Chrome treats an
            // abort after creation as destroy(), so do not keep the instance.
            try {
                translator.destroy?.();
            } catch (error) {
                // Nothing to clean up if destroy is unavailable.
            }
            return translationFailure(TRANSLATION_ERROR_CODES.cancelled, context);
        }

        const entry = {
            translator,
            source: from,
            target: to,
            destroyed: false
        };
        cache.set(key, entry);

        if (typeof createSignal?.addEventListener === 'function') {
            createSignal.addEventListener('abort', () => {
                if (!entry.destroyed) {
                    evict(key, entry);
                }
            }, { once: true });
        }

        return { ok: true, entry };
    }

    /**
     * Translate text, creating the pair's translator on first use.
     * @param {{text: unknown, source: unknown, target: unknown,
     *     signal?: AbortSignal, createSignal?: AbortSignal,
     *     onProgress?: Function}} request
     * @returns {Promise<Object>}
     */
    async function translate(request = {}) {
        const {
            text,
            source,
            target,
            signal,
            createSignal,
            onProgress
        } = request;

        const from = normalizeLanguageTag(source);
        const to = normalizeTranslationTarget(target);
        const context = { source: from, target: to };
        const prepared = prepareTranslationText(text, maxChars);

        if (!prepared.text) {
            return translationFailure(TRANSLATION_ERROR_CODES.empty, context);
        }
        if (!from) {
            return translationFailure(TRANSLATION_ERROR_CODES.unsupported, context);
        }
        if (isSameLanguage(from, to)) {
            return translationFailure(TRANSLATION_ERROR_CODES.same, context);
        }
        if (prepared.tooLong) {
            return translationFailure(TRANSLATION_ERROR_CODES.tooLong, context);
        }

        const TranslatorClass = translatorClass();
        if (!TranslatorClass) {
            return translationFailure(TRANSLATION_ERROR_CODES.missing, context);
        }
        if (signal?.aborted) {
            return translationFailure(TRANSLATION_ERROR_CODES.cancelled, context);
        }

        const key = `${from}>${to}`;
        let entry = cache.get(key);
        if (entry?.destroyed) {
            cache.delete(key);
            entry = null;
        }

        if (!entry) {
            const created = await createEntry(
                TranslatorClass,
                key,
                from,
                to,
                createSignal,
                onProgress,
                context
            );
            if (!created.ok) {
                return created;
            }
            entry = created.entry;
        }

        try {
            const output = await entry.translator.translate(prepared.text, { signal });
            const translated = typeof output === 'string'
                ? output
                : String(output ?? '');

            if (!translated.trim()) {
                return translationFailure(TRANSLATION_ERROR_CODES.empty, context);
            }

            return {
                ok: true,
                text: translated,
                source: from,
                target: to
            };
        } catch (error) {
            return {
                ok: false,
                ...describeTranslationError(error, context)
            };
        }
    }

    /**
     * Destroy every cached translator. Used when the page unloads, not when
     * the panel closes, so a reopened panel can reuse the downloaded model.
     */
    function clear() {
        for (const [key, entry] of [...cache]) {
            evict(key, entry);
        }
    }

    return {
        isSupported: () => Boolean(translatorClass()),
        availability,
        translate,
        clear,
        get size() {
            return cache.size;
        }
    };
}
