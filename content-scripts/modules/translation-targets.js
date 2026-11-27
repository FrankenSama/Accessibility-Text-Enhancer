// Translation targets: which blocks a command replaces, and what source text
// each one contributes. Kept separate from the bubble so the text rules can be
// reasoned about without the UI.

import { CONFIG, STATE } from './core.js';
import {
    closestBlock,
    getBlocksForRange,
    getSelectedTextNodes,
    selectedSlice,
    textSeparator
} from './dom.js';
import { restoreTranslationNodes } from './history.js';
import { getPageLanguage } from './reading.js';
import {
    normalizeLanguageTag,
    prepareTranslationText
} from './translation.js';

/**
 * Every translated wrapper touched by a range, in document order. A
 * multi-block selection can hold several wrappers, and the Translate button
 * restores them together.
 * @param {Range|null} range
 * @returns {HTMLElement[]}
 */
export function translationWrappersFor(range) {
    if (!range || !range.commonAncestorContainer.isConnected) {
        return [];
    }

    const node = range.commonAncestorContainer;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) {
        return [];
    }

    const wrappers = new Set();
    const closest = element.closest?.(`[${CONFIG.translationAttr}]`);
    if (closest && range.intersectsNode(closest)) {
        wrappers.add(closest);
    }

    element.querySelectorAll?.(`[${CONFIG.translationAttr}]`).forEach((wrapper) => {
        if (range.intersectsNode(wrapper)) {
            wrappers.add(wrapper);
        }
    });

    return [...wrappers].filter((wrapper) =>
        STATE.translations.get(wrapper)?.translated
    );
}

/**
 * Put any translated wrapper inside a range back to its original text before
 * that range is replaced. Without this a new translation can capture a live
 * wrapper, leaving nested records that Reset page cannot classify.
 * @param {Range} range
 * @returns {Object[]} Records that were restored, newest apply supersedes them
 */
export function restoreTranslationsInRange(range) {
    const restored = [];
    const node = range.commonAncestorContainer;
    const element = node.nodeType === Node.ELEMENT_NODE
        ? node
        : node.parentElement;
    if (!element) {
        return restored;
    }

    const wrappers = [];
    if (element.matches?.(`[${CONFIG.translationAttr}]`)) {
        wrappers.push(element);
    }
    element.querySelectorAll?.(`[${CONFIG.translationAttr}]`).forEach((wrapper) => {
        if (range.intersectsNode(wrapper)) {
            wrappers.push(wrapper);
        }
    });

    for (const wrapper of wrappers) {
        const record = STATE.translations.get(wrapper);
        if (!record || !record.translated) {
            continue;
        }

        const startInside = wrapper.contains(range.startContainer);
        const endInside = wrapper.contains(range.endContainer);
        if (!restoreTranslationNodes(record)) {
            continue;
        }
        restored.push(record);

        // Move a boundary that sat inside the restored wrapper to the
        // original nodes, so the following extractContents still sees the
        // whole selection.
        const first = record.originalNodes[0];
        const last = record.originalNodes[record.originalNodes.length - 1];
        if (startInside && first) {
            range.setStartBefore(first);
        }
        if (endInside && last) {
            range.setEndAfter(last);
        }
    }

    return restored;
}

/**
 * The nearest declared language for a node, falling back to the page.
 * @param {Node} node
 * @returns {string} A supported tag, or an empty string when unknown.
 */
export function detectSource(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE
        ? node
        : node?.parentElement;
    const declared = typeof element?.closest === 'function'
        ? element.closest('[lang]')?.getAttribute('lang') || ''
        : '';

    return normalizeLanguageTag(declared) ||
        normalizeLanguageTag(getPageLanguage());
}

/**
 * The node whose declared language describes the text being translated.
 * @param {Range} range
 * @param {'block'|'selection'} scope
 * @returns {Node}
 */
export function sourceNodeFor(range, scope) {
    if (scope === 'block') {
        const block = closestBlock(range.startContainer);
        if (block && block !== document.body && block !== document.documentElement) {
            return block;
        }
    }
    return range.commonAncestorContainer;
}

/**
 * The part of a selection that falls inside one block.
 * @param {Range} saved
 * @param {HTMLElement} block
 * @returns {Range}
 */
function clipRangeToBlock(saved, block) {
    if (block.contains(saved.startContainer) && block.contains(saved.endContainer)) {
        return saved.cloneRange();
    }

    const range = document.createRange();

    if (block.contains(saved.startContainer)) {
        range.setStart(saved.startContainer, saved.startOffset);
    } else {
        range.setStart(block, 0);
    }

    if (block.contains(saved.endContainer)) {
        range.setEnd(saved.endContainer, saved.endOffset);
    } else {
        range.setEnd(block, block.childNodes.length);
    }

    return range;
}

/**
 * The text a block would contain without any translations already in it.
 * Block targets can contain a translated wrapper whose stored original is no
 * longer in the DOM; translating the visible translation would translate the
 * output instead of the source.
 * @param {Range} range
 * @returns {string}
 */
export function sourceTextFor(range) {
    const nodes = getSelectedTextNodes(range);
    const used = new Set();
    let text = '';
    let previous = null;

    for (const node of nodes) {
        const wrapper = node.parentElement?.closest?.(
            `[${CONFIG.translationAttr}]`
        );
        const record = wrapper ? STATE.translations.get(wrapper) : null;

        if (record) {
            if (used.has(wrapper)) {
                continue;
            }
            used.add(wrapper);
            if (previous) {
                text += textSeparator(previous, node);
            }
            text += record.originalNodes
                .map((original) => original.textContent || '')
                .join('');
            previous = node;
            continue;
        }

        const slice = selectedSlice(range, node);
        if (!slice) {
            continue;
        }
        if (previous) {
            text += textSeparator(previous, node);
        }
        text += slice;
        previous = node;
    }

    return text;
}

/**
 * One translatable block and its prepared text.
 * @param {Range} range
 * @param {Object|null} [oldRecord] Existing translation being re-translated
 * @returns {{range: Range, oldRecord: Object|null, prepared: Object}}
 */
function translationTarget(range, oldRecord = null) {
    const text = oldRecord
        ? oldRecord.originalNodes.map((node) => node.textContent || '').join('')
        : sourceTextFor(range);

    return {
        range,
        oldRecord,
        prepared: prepareTranslationText(text, CONFIG.translationMaxChars)
    };
}

/**
 * Every block a translation command should replace.
 * @param {Range} saved
 * @param {'block'|'selection'} scope
 * @returns {Array<Object>|null}
 */
export function translationTargetsFor(saved, scope) {
    if (scope === 'block') {
        const block = closestBlock(saved.startContainer);
        if (!block || block === document.body || block === document.documentElement) {
            return null;
        }

        const range = document.createRange();
        range.selectNodeContents(block);
        const target = translationTarget(range);
        return target.prepared.text ? [target] : null;
    }

    const blocks = getBlocksForRange(saved).filter((block) =>
        block !== document.body && block !== document.documentElement
    );

    if (blocks.length === 0) {
        return null;
    }

    const targets = blocks.map((block) => translationTarget(
        clipRangeToBlock(saved, block)
    )).filter((target) => target.prepared.text);

    return targets.length > 0 ? targets : null;
}

/**
 * Targets for re-translating wrappers that are already in the page. The text
 * comes from the stored originals, so a swap translates the source again
 * rather than translating the translation.
 * @param {Range} saved
 * @returns {Array<Object>|null}
 */
export function retranslationTargetsFor(saved) {
    const wrappers = translationWrappersFor(saved);
    if (wrappers.length === 0) {
        return null;
    }

    const targets = wrappers.map((wrapper) => {
        const record = STATE.translations.get(wrapper);
        const range = document.createRange();
        range.selectNodeContents(wrapper);
        return translationTarget(range, record);
    }).filter((target) => target.prepared.text);

    return targets.length > 0 ? targets : null;
}

/**
 * Total character count across every block, which is what the cap applies to.
 * @param {Array<Object>} targets
 * @returns {{characters: number, maxChars: number, tooLong: boolean}}
 */
export function totalPrepared(targets) {
    const characters = targets.reduce(
        (sum, target) => sum + target.prepared.characters,
        0
    );

    return {
        characters,
        maxChars: CONFIG.translationMaxChars,
        tooLong: characters > CONFIG.translationMaxChars
    };
}

/**
 * The over-cap message, with a suggestion that matches the chosen scope.
 * @param {{characters: number, maxChars: number}} prepared
 * @param {'block'|'selection'} scope
 * @returns {string}
 */
export function tooLongMessage(prepared, scope) {
    const suggestion = scope === 'block'
        ? 'Select less text and try again.'
        : 'Select less text, or Shift-click to translate one paragraph.';

    return `That selection is ${prepared.characters} characters; the limit is ` +
        `${prepared.maxChars}. ${suggestion}`;
}
