// DOM and selection helpers shared by commands, reading, and the toolbar.

import { CONFIG, HTML_NAMESPACE, SKIP_SELECTOR, STATE } from './core.js';

/**
 * Return the node extension UI should be attached to. Documents without a
 * <body> (for example XML or SVG documents) still have a document element.
 * @returns {HTMLElement}
 */
export function getMountNode() {
    return document.body || document.documentElement;
}

/**
 * Find the nearest block-level ancestor of a node.
 * @param {Node} node
 * @returns {HTMLElement|null} Null when the node is not in the main document
 *     (for example, inside a shadow root).
 */
export function closestBlock(node) {
    let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

    while (element && element !== document.documentElement) {
        const display = getComputedStyle(element).display;
        // Treat inline-level boxes (including inline-block/flex/grid) as
        // part of the surrounding text flow rather than as blocks.
        if (display !== 'inline' &&
            !display.startsWith('inline-') &&
            display !== 'contents' &&
            display !== 'none') {
            return element;
        }
        element = element.parentElement;
    }

    return element === document.documentElement ? getMountNode() : null;
}

/**
 * Collect the text nodes that intersect a range.
 * @param {Range} range
 * @returns {Text[]}
 */
export function getSelectedTextNodes(range) {
    const root = range.commonAncestorContainer;
    const nodes = [];

    if (root.nodeType === Node.TEXT_NODE) {
        if (range.intersectsNode(root)) {
            nodes.push(root);
        }
    } else {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                return range.intersectsNode(node)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        });

        while (walker.nextNode()) {
            nodes.push(walker.currentNode);
        }
    }

    const excluded = new Map();

    return nodes.filter((node) => {
        const parent = node.parentElement;
        if (!parent) {
            return false;
        }

        let skip = excluded.get(parent);
        if (skip === undefined) {
            skip = Boolean(parent.closest(SKIP_SELECTOR));
            excluded.set(parent, skip);
        }

        return !skip;
    });
}

/**
 * The part of a text node that a range covers.
 * @param {Range} range
 * @param {Text} node
 * @returns {string}
 */
export function selectedSlice(range, node) {
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
    return node.nodeValue.slice(Math.min(start, end), Math.max(start, end));
}

/**
 * Collect the block-level elements covered by a range.
 * @param {Range} range
 * @param {Text[]} [textNodes] Precomputed selected text nodes.
 * @returns {HTMLElement[]}
 */
export function getBlocksForRange(range, textNodes = getSelectedTextNodes(range)) {
    const blocks = new Set();
    const cache = new Map();

    textNodes.forEach((node) => {
        // Whitespace between blocks (and boundary-touching nodes) is not
        // part of the selection, so it should not pull in the parent of
        // the whole page.
        if (!selectedSlice(range, node).trim()) {
            return;
        }

        const parent = node.parentElement;
        if (!parent) {
            return;
        }

        let block = cache.get(parent);
        if (block === undefined) {
            block = closestBlock(parent);
            cache.set(parent, block);
        }

        if (block) {
            blocks.add(block);
        }
    });

    if (blocks.size === 0) {
        const ancestor = range.commonAncestorContainer;
        const element = ancestor.nodeType === Node.ELEMENT_NODE
            ? ancestor
            : ancestor.parentElement;

        // Do not fall back to a skipped container such as an editable
        // region or the extension's own toolbar.
        if (element && !element.closest(SKIP_SELECTOR)) {
            const fallback = closestBlock(ancestor);
            if (fallback) {
                blocks.add(fallback);
            }
        }
    }

    return [...blocks];
}

/**
 * Find the smallest element whose text is exactly the selection.
 * @param {Range} range
 * @returns {HTMLElement|null}
 */
export function getExactElement(range) {
    let element = range.commonAncestorContainer;
    if (element.nodeType === Node.TEXT_NODE) {
        element = element.parentElement;
    }

    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    // Never style skipped content such as the extension's own UI, form
    // controls, or editable regions.
    if (element.closest(SKIP_SELECTOR)) {
        return null;
    }

    const normalize = (value) => value.replace(/\s+/g, ' ').trim();
    return normalize(element.textContent) === normalize(range.toString())
        ? element
        : null;
}

/**
 * Find an existing selection wrapper that fully contains the range.
 * @param {Range} range
 * @returns {HTMLElement|null}
 */
export function getContainingWrapper(range) {
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
    }

    const wrapper = node && node.closest(`[${CONFIG.selectionAttr}]`);
    if (!wrapper) {
        return null;
    }

    const wrapperRange = document.createRange();
    wrapperRange.selectNodeContents(wrapper);

    const startsInside = range.compareBoundaryPoints(Range.START_TO_START, wrapperRange) >= 0;
    const endsInside = range.compareBoundaryPoints(Range.END_TO_END, wrapperRange) <= 0;

    return startsInside && endsInside ? wrapper : null;
}

/**
 * Wrap the selected text nodes in inline spans.
 * @param {Range} range
 * @returns {HTMLElement[]|null} Wrappers, or null when the range cannot be
 *     wrapped safely.
 */
export function wrapRange(range) {
    const textNodes = getSelectedTextNodes(range);

    if (textNodes.length === 0 || textNodes.length > CONFIG.maxWrapNodes) {
        return null;
    }

    // Do not mix HTML wrappers into SVG or MathML content.
    if (textNodes.some((node) => node.parentElement.namespaceURI !== HTML_NAMESPACE)) {
        return null;
    }

    const wrappers = [];

    // Wrapping splits text nodes and can collapse the live selection, which
    // would make the toolbar disappear. Suppress selection handling until
    // the new selection is in place.
    STATE.isApplyingCommand = true;

    try {
        for (const node of textNodes) {
            const start = node === range.startContainer ? range.startOffset : 0;
            const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;

            // Skip boundary-touching and whitespace-only slices, such as
            // the indentation between two paragraphs.
            if (start >= end || !node.nodeValue.slice(start, end).trim()) {
                continue;
            }

            let selected = node;
            if (start > 0) {
                selected = node.splitText(start);
            }
            if (end - start < selected.nodeValue.length) {
                selected.splitText(end - start);
            }

            if (!selected.parentNode) {
                continue;
            }

            const span = document.createElement('span');
            span.setAttribute(CONFIG.selectionAttr, '');
            selected.parentNode.insertBefore(span, selected);
            span.appendChild(selected);
            wrappers.push(span);
        }

        if (wrappers.length === 0) {
            return null;
        }

        const first = wrappers[0];
        const last = wrappers[wrappers.length - 1];
        const wrappedRange = document.createRange();
        wrappedRange.setStart(first.firstChild, 0);
        wrappedRange.setEnd(last.lastChild, last.lastChild.length);
        STATE.savedRange = wrappedRange;

        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(wrappedRange);
        }

        return wrappers;
    } finally {
        setTimeout(() => {
            STATE.isApplyingCommand = false;
        }, 0);
    }
}

/**
 * The separator needed between two consecutive text nodes. Browsers render
 * a space at most inline boundaries, but the DOM stores none for a <br> or
 * for two adjacent block elements, so plain concatenation would glue words
 * such as "line oneline two" together.
 * @param {Text} previous
 * @param {Text} next
 * @returns {string}
 */
function textSeparator(previous, next) {
    if (/\s$/.test(previous.nodeValue) || /^\s/.test(next.nodeValue)) {
        return '';
    }

    const previousBlock = closestBlock(previous);
    const nextBlock = closestBlock(next);

    if (previousBlock && nextBlock && previousBlock !== nextBlock) {
        return '\n';
    }

    // Look for a <br> between the two nodes. A plain inline wrapper, such
    // as the spans this extension creates, adds no gap and must not split
    // a word in two.
    const gap = document.createRange();
    gap.setStart(previous, previous.nodeValue.length);
    gap.setEnd(next, 0);

    if (gap.cloneContents().querySelector('br')) {
        return '\n';
    }

    return '';
}

/**
 * Build a text map that keeps DOM offsets alongside the plain text. This
 * lets sentence chunks be converted back into ranges for highlighting.
 * @param {Range} range
 * @returns {{text: string, entries: Array<{node: Text, startOffset: number, textStart: number, textEnd: number}>}}
 */
export function buildTextMap(range) {
    const entries = [];
    let text = '';
    let previous = null;

    getSelectedTextNodes(range).forEach((node) => {
        const start = node === range.startContainer ? range.startOffset : 0;
        const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
        const from = Math.min(start, end);
        const to = Math.max(start, end);

        if (to <= from) {
            return;
        }

        if (previous) {
            text += textSeparator(previous, node);
        }

        const value = node.nodeValue.slice(from, to);
        entries.push({
            node,
            startOffset: from,
            textStart: text.length,
            textEnd: text.length + value.length
        });
        text += value;
        previous = node;
    });

    return { text, entries };
}

/**
 * Convert a start/end offset in a text map back into a DOM range.
 * @param {{entries: Array<Object>}} map
 * @param {number} start
 * @param {number} end
 * @returns {Range|null}
 */
export function rangeFromOffsets(map, start, end) {
    const entries = map.entries;
    if (entries.length === 0 || end <= start) {
        return null;
    }

    const startEntry = entries.find((entry) =>
        start >= entry.textStart && start < entry.textEnd
    );
    let endEntry = null;
    for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index];
        if (end > entry.textStart && end <= entry.textEnd) {
            endEntry = entry;
            break;
        }
    }

    if (!startEntry || !endEntry) {
        return null;
    }

    const range = document.createRange();
    range.setStart(
        startEntry.node,
        startEntry.startOffset + (start - startEntry.textStart)
    );
    range.setEnd(
        endEntry.node,
        endEntry.startOffset + (end - endEntry.textStart)
    );
    return range;
}

export function rangesMatch(a, b) {
    return a.startContainer === b.startContainer &&
           a.startOffset === b.startOffset &&
           a.endContainer === b.endContainer &&
           a.endOffset === b.endOffset;
}

/**
 * Whether an event target is a text-entry region where Alt+Shift+letter
 * should keep its native behaviour.
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
export function isEditableTarget(target) {
    const element = target instanceof Element ? target : null;
    return Boolean(element && element.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
    ));
}
