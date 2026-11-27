// Applying and restoring translations as one transaction, with grouped
// history and rollback. Kept separate from the language bubble.

import { CONFIG, STATE } from './core.js';
import {
    pushHistory,
    removeTranslationHistory,
    selectTranslationGroup,
    setTranslationState
} from './history.js';
import { saveSyncedPreferences } from './prefs.js';
import { showToast } from './toast.js';
import { updateToolbarState } from './toolbar.js';
import { prepareTranslationText } from './translation.js';
import {
    restoreTranslationsInRange,
    sourceTextFor
} from './translation-targets.js';

/**
 * Replace every target with its translated wrapper in one transaction. All
 * translations are already in hand, so a DOM failure rolls back every block
 * and leaves the page as it was.
 * @param {Array<Object>} targets
 * @param {Array<Object>} results
 * @returns {number} Number of blocks applied
 */
export function applyTranslationGroup(targets, results) {
    if (targets.length === 0 || targets.length !== results.length) {
        showToast('The translation could not be applied to the page.',
            { error: true });
        return 0;
    }

    for (let index = 0; index < targets.length; index++) {
        const target = targets[index];

        if (!target.range || !target.range.commonAncestorContainer.isConnected) {
            showToast('The selection is no longer on the page.', { error: true });
            return 0;
        }

        // A slow language-pack download can outlive the text the bubble was
        // opened for. Compare before touching the page, except when the
        // source is a stored original belonging to an existing wrapper.
        if (!target.oldRecord) {
            const current = prepareTranslationText(
                sourceTextFor(target.range),
                CONFIG.translationMaxChars
            ).text;
            if (current !== target.prepared.text) {
                showToast(
                    'The page text changed while translating. Select it again.',
                    { error: true }
                );
                return 0;
            }
        }
    }

    STATE.isApplyingCommand = true;
    const applied = [];
    const oldRecords = new Map();
    const nestedRestores = new Map();

    try {
        for (let index = 0; index < targets.length; index++) {
            const target = targets[index];
            const result = results[index];
            let range = target.range;

            if (target.oldRecord) {
                const old = target.oldRecord;
                oldRecords.set(old, old);
                if (!setTranslationState(old, 'original')) {
                    throw new Error('the previous translation is no longer on the page');
                }

                const first = old.originalNodes.find((node) => node.isConnected);
                const last = [...old.originalNodes].reverse()
                    .find((node) => node.isConnected);
                if (!first || !last) {
                    throw new Error('the original text is no longer on the page');
                }

                range = document.createRange();
                range.setStartBefore(first);
                range.setEndAfter(last);
            } else {
                restoreTranslationsInRange(range).forEach((record) => {
                    nestedRestores.set(record, record);
                });
            }

            const fragment = range.extractContents();
            const originalNodes = Array.from(fragment.childNodes);
            if (originalNodes.length === 0) {
                throw new Error('empty selection');
            }

            // Track the extracted text before inserting so a failure in
            // insertNode can still put the block back.
            const item = {
                record: null,
                originalNodes,
                restoreRange: range.cloneRange()
            };
            applied.push(item);

            const wrapper = document.createElement('span');
            wrapper.setAttribute(CONFIG.translationAttr, result.target);
            wrapper.setAttribute('lang', result.target);
            wrapper.setAttribute('dir', 'auto');
            wrapper.textContent = result.text;
            range.insertNode(wrapper);

            const record = {
                wrapper,
                originalNodes,
                parent: wrapper.parentNode,
                next: wrapper.nextSibling,
                source: result.source,
                target: result.target,
                translated: true
            };
            item.record = record;
            STATE.translations.set(wrapper, record);
        }

        const records = applied.map((item) => item.record);
        selectTranslationGroup(records, 'translated');

        // A new translation replaces every translation it consumed. Drop
        // those records and their history so Undo cannot resurrect a wrapper
        // the page no longer tracks.
        const superseded = [...oldRecords.keys(), ...nestedRestores.keys()];
        for (const record of superseded) {
            STATE.translations.delete(record.wrapper);
        }
        removeTranslationHistory(superseded);

        pushHistory({
            type: 'translationGroup',
            label: 'Translate',
            group: records.map((record) => ({
                record,
                before: 'original',
                after: 'translated'
            }))
        });

        const target = results[0].target;
        STATE.translationTarget = target;
        saveSyncedPreferences({ translationTarget: target });
        updateToolbarState();
        return applied.length;
    } catch (error) {
        console.error('Translation could not be applied:', error);

        for (let index = applied.length - 1; index >= 0; index--) {
            const { record, originalNodes, restoreRange } = applied[index];

            if (record) {
                STATE.translations.delete(record.wrapper);
                if (record.wrapper.isConnected) {
                    record.wrapper.remove();
                }
            }

            const fragment = document.createDocumentFragment();
            for (const node of originalNodes) {
                fragment.appendChild(node);
            }

            if (restoreRange?.startContainer?.isConnected &&
                restoreRange.endContainer?.isConnected) {
                try {
                    restoreRange.insertNode(fragment);
                } catch (restoreError) {
                    console.error(
                        'The original block could not be restored:',
                        restoreError
                    );
                }
            }
        }

        // Put back every translation the failed apply consumed, in both the
        // re-translation and nested-restore paths.
        const reapply = (record) => {
            if (record.translated) {
                return;
            }
            try {
                if (setTranslationState(record, 'translated')) {
                    STATE.translations.set(record.wrapper, record);
                }
            } catch (restoreError) {
                console.error(
                    'The previous translation could not be restored:',
                    restoreError
                );
            }
        };
        oldRecords.forEach(reapply);
        nestedRestores.forEach(reapply);

        // Keep a usable selection on the original text after a rollback.
        const firstItem = applied[0];
        const firstRecord = firstItem?.record;
        const nodes = firstRecord?.originalNodes || firstItem?.originalNodes || [];
        const firstNode = nodes.find((node) => node.isConnected);
        const lastNode = [...nodes].reverse().find((node) => node.isConnected);
        if (firstNode && lastNode) {
            const selection = window.getSelection();
            if (selection) {
                const range = document.createRange();
                range.setStartBefore(firstNode);
                range.setEndAfter(lastNode);
                selection.removeAllRanges();
                selection.addRange(range);
                STATE.savedRange = range.cloneRange();
            }
        }

        showToast('The translation could not be applied to the page.',
            { error: true });
        return 0;
    } finally {
        STATE.isApplyingCommand = false;
    }
}

/**
 * Restore one or more translations and add the restore to history.
 * @param {HTMLElement[]} wrappers
 */
export function restoreTranslationRecords(wrappers) {
    const restored = [];
    const records = wrappers
        .map((wrapper) => STATE.translations.get(wrapper))
        .filter(Boolean);

    for (const record of records) {
        if (setTranslationState(record, 'original')) {
            restored.push(record);
        }
    }

    if (restored.length === 0) {
        showToast('The original text is no longer on the page.', { error: true });
        return;
    }

    selectTranslationGroup(restored, 'original');
    pushHistory({
        type: 'translationGroup',
        label: restored.length > 1 ? 'Restore translations' : 'Restore original',
        group: restored.map((record) => ({
            record,
            before: 'translated',
            after: 'original'
        }))
    });
    updateToolbarState();
    showToast(restored.length > 1
        ? `${restored.length} translations restored`
        : 'Original text restored');
}
