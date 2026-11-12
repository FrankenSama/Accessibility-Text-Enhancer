// Pure text helpers: sentence splitting, chunking, and number clamping.

// A chunk that has to be split should end after punctuation rather than
// after an arbitrary word. Stopping mid-phrase is what makes the voice
// sound like it stalled instead of finished a thought.
export const STRONG_BREAK_CHARS = new Set(['.', '!', '?', '…', ';', ':']);
export const SOFT_BREAK_CHARS = new Set([',', '—', '–']);
export const CLOSING_CHARS = new Set(['"', "'", '”', '’', ')', ']', '}']);

/**
 * Clamp a stored numeric preference to a valid range.
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
export function clampNumber(value, min, max, fallback) {
    const number = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(number)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, number));
}

/**
 * Trim whitespace from the edges of a segment and report the offsets.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {{start: number, end: number}}
 */
export function trimSegment(text, start, end) {
    let trimmedStart = start;
    let trimmedEnd = end;

    while (trimmedStart < trimmedEnd && /\s/.test(text[trimmedStart])) {
        trimmedStart++;
    }
    while (trimmedEnd > trimmedStart && /\s/.test(text[trimmedEnd - 1])) {
        trimmedEnd--;
    }

    return { start: trimmedStart, end: trimmedEnd };
}

/**
 * Find the last sentence or clause punctuation mark inside a window.
 * @param {string} text
 * @param {number} boundary - Highest offset the chunk may reach
 * @param {number} minimum - Lowest offset worth looking at
 * @returns {number} Offset just past the punctuation, or -1 when none
 */
export function findPunctuationBreak(text, boundary, minimum) {
    let soft = -1;

    for (let index = boundary; index > minimum; index--) {
        const char = text[index - 1];

        // Keep a closing quote or bracket with the punctuation before it.
        if (CLOSING_CHARS.has(char)) {
            continue;
        }

        if (STRONG_BREAK_CHARS.has(char)) {
            let end = index;
            while (end < boundary && CLOSING_CHARS.has(text[end])) {
                end++;
            }
            return end;
        }

        if (soft === -1 && SOFT_BREAK_CHARS.has(char)) {
            soft = index;
        }
    }

    return soft;
}

/**
 * Choose where an over-long chunk should end. Punctuation wins over a word
 * boundary, so a mandatory split lands on a clause break and sounds like a
 * pause instead of the voice stopping mid-phrase.
 * @param {string} text
 * @param {number} start
 * @param {number} limit - Highest offset the chunk may reach
 * @param {number} minimum - Lowest offset worth breaking at
 * @returns {number} Offset to end the chunk at, always past `start`
 */
export function findSpeechBreak(text, start, limit, minimum) {
    const boundary = Math.min(limit, text.length);
    const preferred = findPunctuationBreak(text, boundary, minimum);

    if (preferred > start) {
        return preferred;
    }

    // A clause break further back still beats stopping mid-phrase.
    const relaxed = start + Math.floor((boundary - start) * 0.35);
    const fallback = findPunctuationBreak(text, boundary, Math.max(relaxed, start));

    if (fallback > start) {
        return fallback;
    }

    // No punctuation at all: fall back to the last word boundary.
    for (let index = boundary; index > start; index--) {
        if (/\s/.test(text[index - 1])) {
            return index - 1;
        }
    }

    // A single unbroken word longer than the limit: split it hard.
    return boundary;
}

/**
 * Group text into speech chunks. Consecutive sentences share one utterance
 * while they fit, because every utterance boundary is a place where the
 * voice engine pauses. Only text longer than the limit is split, and then
 * as close to a sentence or clause break as possible.
 * @param {string} text
 * @param {number} maxLength Longest chunk the speech engine should receive
 * @param {string} language BCP 47 language tag used by Intl.Segmenter
 * @returns {Array<{text: string, start: number, end: number}>}
 */
export function buildSpeechChunks(text, maxLength, language) {
    const chunks = [];
    const max = maxLength;
    let pending = null;

    const flush = () => {
        if (pending) {
            chunks.push(pending);
            pending = null;
        }
    };

    for (const segment of splitIntoSentences(text, language)) {
        const trimmed = trimSegment(text, segment.start, segment.end);

        if (trimmed.start >= trimmed.end) {
            continue;
        }

        // A new line means a new paragraph or list item, which should keep
        // its natural pause instead of running into the previous sentence.
        if (pending) {
            const gap = text.slice(pending.end, trimmed.start);
            if (trimmed.end - pending.start <= max && !/[\r\n]/.test(gap)) {
                pending = {
                    text: text.slice(pending.start, trimmed.end),
                    start: pending.start,
                    end: trimmed.end
                };
                continue;
            }
            flush();
        }

        let start = trimmed.start;

        while (start < trimmed.end) {
            let chunkEnd = trimmed.end;

            if (trimmed.end - start > max) {
                const minimum = start + Math.floor(max * 0.6);
                chunkEnd = findSpeechBreak(text, start, start + max, minimum);
            }

            const piece = trimSegment(text, start, chunkEnd);

            if (piece.end > piece.start) {
                const chunk = {
                    text: text.slice(piece.start, piece.end),
                    start: piece.start,
                    end: piece.end
                };

                if (chunkEnd >= trimmed.end) {
                    // The tail of a long sentence can still absorb the
                    // next short one.
                    pending = chunk;
                } else {
                    chunks.push(chunk);
                }
            }

            if (chunkEnd >= trimmed.end) {
                break;
            }

            // Always make progress, even if the break found nothing.
            start = Math.max(chunkEnd, start + 1);
        }
    }

    flush();

    return chunks;
}

/**
 * Sentence boundaries, using Intl.Segmenter when available.
 * @param {string} text
 * @param {string} language BCP 47 language tag used by Intl.Segmenter
 * @returns {Array<{start: number, end: number}>}
 */
export function splitIntoSentences(text, language) {
    const segments = [];

    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        try {
            const segmenter = new Intl.Segmenter(language, {
                granularity: 'sentence'
            });

            for (const part of segmenter.segment(text)) {
                if (part.segment.trim()) {
                    segments.push({
                        start: part.index,
                        end: part.index + part.segment.length
                    });
                }
            }
        } catch (error) {
            // An invalid or unsupported page-language tag falls through to
            // the punctuation-based splitter.
        }
    }

    if (segments.length === 0) {
        const pattern = /[^.!?…\n]+(?:[.!?…]+["'”’)\]]*)?/g;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            if (match[0].trim()) {
                segments.push({
                    start: match.index,
                    end: match.index + match[0].length
                });
            }
        }
    }

    if (segments.length === 0 && text.trim()) {
        segments.push({ start: 0, end: text.length });
    }

    return segments;
}

/**
 * Sentence offsets for the text being read, used to follow along inside a
 * chunk that holds more than one sentence.
 * @param {string} text
 * @param {string} language BCP 47 language tag used by Intl.Segmenter
 * @returns {Array<{start: number, end: number}>}
 */
export function buildSentenceMap(text, language) {
    const sentences = [];

    for (const segment of splitIntoSentences(text, language)) {
        const trimmed = trimSegment(text, segment.start, segment.end);

        if (trimmed.end > trimmed.start) {
            sentences.push({ start: trimmed.start, end: trimmed.end });
        }
    }

    return sentences;
}
