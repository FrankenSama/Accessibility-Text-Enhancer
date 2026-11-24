// Focus mode and reading ruler: transient overlays that never change page
// content, page styles, or the undo history.

import { CONFIG, SKIP_SELECTOR, STATE } from './core.js';
import { closestBlock, getMountNode, isEditableTarget } from './dom.js';
import { showToast } from './toast.js';
import { updateToolbarState } from './toolbar.js';
import {
    FOCUS_INSET,
    aidToggleMessage,
    clampRulerTop,
    rectIntersectsViewport,
    rectsEqual,
    rulerHeightFor,
    spotlightStyle
} from './reading-aids.js';

let focusFrame = null;
let rulerFrame = null;
let focusRect = null;
let pointerY = null;
let rulerHeight = 0;
let appliedRulerHeight = '';
let listenersAttached = false;

// ==================== FOCUS MODE ====================

/**
 * The block a range starts in, or null when the range is not over page text.
 * @param {Range|null} range
 * @returns {HTMLElement|null}
 */
function blockFromRange(range) {
    if (!range || !range.startContainer || !range.startContainer.isConnected) {
        return null;
    }

    const start = range.startContainer;
    const element = start.nodeType === Node.ELEMENT_NODE
        ? start
        : start.parentElement;

    if (!element ||
        element.closest(`#${CONFIG.toolbarId}, #${CONFIG.settingsPanelId}`) ||
        isEditableTarget(element)) {
        return null;
    }

    const block = closestBlock(start);
    if (!block ||
        block === document.body ||
        block === document.documentElement ||
        block.closest(SKIP_SELECTOR) ||
        block.closest(`#${CONFIG.focusOverlayId}, #${CONFIG.readingRulerId}`)) {
        return null;
    }

    return block;
}

/**
 * Resolve the block to spotlight from the saved range, then the live
 * selection, then the last known block.
 * @param {boolean} preferLive - Check the live selection first. Used after a
 *     selection change, when the saved range is stale.
 * @returns {HTMLElement|null}
 */
function resolveFocusBlock(preferLive = false) {
    const selection = window.getSelection();
    const live = selection && selection.rangeCount > 0
        ? selection.getRangeAt(0)
        : null;
    const saved = STATE.savedRange && STATE.savedRange.commonAncestorContainer.isConnected
        ? STATE.savedRange
        : null;

    const candidates = preferLive ? [live, saved] : [saved, live];

    for (const range of candidates) {
        const block = blockFromRange(range);
        if (block) {
            return block;
        }
    }

    return STATE.focusBlock && STATE.focusBlock.isConnected
        ? STATE.focusBlock
        : null;
}

/**
 * Create the spotlight element if it is not on the page yet.
 * @returns {HTMLElement}
 */
function ensureFocusOverlay() {
    let overlay = document.getElementById(CONFIG.focusOverlayId);
    if (overlay) {
        return overlay;
    }

    overlay = document.createElement('div');
    overlay.id = CONFIG.focusOverlayId;
    overlay.setAttribute('aria-hidden', 'true');
    getMountNode().appendChild(overlay);
    focusRect = null;
    return overlay;
}

/**
 * Hide the spotlight without removing it.
 */
function hideFocusOverlay() {
    const overlay = document.getElementById(CONFIG.focusOverlayId);
    if (overlay) {
        overlay.classList.remove('visible');
    }
    focusRect = null;
}

/**
 * Position the spotlight over the focused block. A block that has scrolled
 * completely out of view is not dimmed for.
 */
function updateFocusOverlay() {
    if (!STATE.focusMode) {
        hideFocusOverlay();
        return;
    }

    let block = STATE.focusBlock;

    if (!block || !block.isConnected) {
        block = resolveFocusBlock(false);
        STATE.focusBlock = block;
    }

    if (!block) {
        hideFocusOverlay();
        return;
    }

    const rect = block.getBoundingClientRect();
    if (!rectIntersectsViewport(rect, window.innerWidth, window.innerHeight)) {
        hideFocusOverlay();
        return;
    }

    const style = spotlightStyle(rect, FOCUS_INSET);
    if (!style) {
        hideFocusOverlay();
        return;
    }

    const overlay = ensureFocusOverlay();

    if (!rectsEqual(focusRect, rect)) {
        overlay.style.top = style.top;
        overlay.style.left = style.left;
        overlay.style.width = style.width;
        overlay.style.height = style.height;
        focusRect = {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
        };
    }

    overlay.classList.add('visible');
}

/**
 * Update the spotlight on the next frame.
 */
function scheduleFocusUpdate() {
    if (focusFrame !== null) {
        return;
    }

    focusFrame = requestAnimationFrame(() => {
        focusFrame = null;
        updateFocusOverlay();
    });
}

/**
 * Follow the live selection or caret. Called from the selection handler
 * before the saved range is replaced.
 */
export function refreshFocusMode() {
    if (!STATE.focusMode) {
        return;
    }

    const block = resolveFocusBlock(true);
    if (block) {
        STATE.focusBlock = block;
    }

    scheduleFocusUpdate();
}

/**
 * Turn focus mode on for the current block.
 * @returns {boolean} Whether it turned on.
 */
export function enableFocusMode() {
    if (!STATE.isExtensionEnabled) {
        return false;
    }

    const block = resolveFocusBlock(false);
    if (!block) {
        showToast('Place the cursor in a paragraph or select text');
        return false;
    }

    STATE.focusBlock = block;
    STATE.focusMode = true;
    updateFocusOverlay();
    syncAidListeners();
    updateToolbarState();
    showToast(aidToggleMessage('focusMode', true));
    return true;
}

/**
 * Turn focus mode off and remove its overlay.
 * @param {{silent?: boolean}} [options]
 */
export function disableFocusMode(options = {}) {
    if (!STATE.focusMode) {
        return;
    }

    STATE.focusMode = false;
    hideFocusOverlay();
    document.getElementById(CONFIG.focusOverlayId)?.remove();
    syncAidListeners();
    updateToolbarState();

    if (!options.silent) {
        showToast(aidToggleMessage('focusMode', false));
    }
}

/**
 * Toggle focus mode.
 */
export function toggleFocusMode() {
    if (STATE.focusMode) {
        disableFocusMode();
    } else {
        enableFocusMode();
    }
}

// ==================== READING RULER ====================

/**
 * Create the ruler element if it is not on the page yet.
 * @returns {HTMLElement}
 */
function ensureReadingRuler() {
    let ruler = document.getElementById(CONFIG.readingRulerId);
    if (ruler) {
        return ruler;
    }

    ruler = document.createElement('div');
    ruler.id = CONFIG.readingRulerId;
    ruler.setAttribute('aria-hidden', 'true');
    getMountNode().appendChild(ruler);
    // A fresh element has no inline height; force the next update to set it.
    appliedRulerHeight = '';
    return ruler;
}

/**
 * Hide the ruler band without turning the aid off. The next pointer move
 * shows it again.
 */
function hideReadingRuler() {
    const ruler = document.getElementById(CONFIG.readingRulerId);
    if (ruler) {
        ruler.classList.remove('visible');
    }
}

/**
 * Read and cache the ruler height. The root font size only needs to be
 * measured on enable and on resize, not on every pointer move.
 * @returns {number}
 */
function measureRulerHeight() {
    const rootSize = parseFloat(
        getComputedStyle(document.documentElement).fontSize
    );
    rulerHeight = rulerHeightFor(rootSize);
    return rulerHeight;
}

/**
 * Position the ruler under the pointer, or at the viewport centre before the
 * pointer has moved.
 */
function updateReadingRuler() {
    if (!STATE.readingRuler) {
        hideReadingRuler();
        return;
    }

    const ruler = ensureReadingRuler();
    const height = rulerHeight || measureRulerHeight();
    const top = clampRulerTop(pointerY, height, window.innerHeight);

    const heightValue = `${height}px`;
    if (appliedRulerHeight !== heightValue) {
        ruler.style.height = heightValue;
        appliedRulerHeight = heightValue;
    }
    ruler.style.top = `${top}px`;
    ruler.classList.add('visible');
}

/**
 * Move the ruler on the next frame.
 */
function scheduleRulerUpdate() {
    if (rulerFrame !== null) {
        return;
    }

    rulerFrame = requestAnimationFrame(() => {
        rulerFrame = null;
        updateReadingRuler();
    });
}

/**
 * Turn the reading ruler on.
 */
export function enableReadingRuler() {
    if (!STATE.isExtensionEnabled) {
        return;
    }

    STATE.readingRuler = true;
    measureRulerHeight();
    updateReadingRuler();
    syncAidListeners();
    updateToolbarState();
    showToast(aidToggleMessage('readingRuler', true));
}

/**
 * Turn the reading ruler off and remove its band.
 * @param {{silent?: boolean}} [options]
 */
export function disableReadingRuler(options = {}) {
    if (!STATE.readingRuler) {
        return;
    }

    STATE.readingRuler = false;
    hideReadingRuler();
    document.getElementById(CONFIG.readingRulerId)?.remove();
    syncAidListeners();
    updateToolbarState();

    if (!options.silent) {
        showToast(aidToggleMessage('readingRuler', false));
    }
}

/**
 * Toggle the reading ruler.
 */
export function toggleReadingRuler() {
    if (STATE.readingRuler) {
        disableReadingRuler();
    } else {
        enableReadingRuler();
    }
}

// ==================== SHARED LISTENERS ====================

/**
 * Follow the pointer for the ruler. Touch input has no hover position, so it
 * is ignored and the band stays at the viewport centre.
 * @param {PointerEvent} event
 */
function handlePointerMove(event) {
    if (event.pointerType === 'touch' || !STATE.readingRuler) {
        return;
    }

    pointerY = event.clientY;
    scheduleRulerUpdate();
}

/**
 * Reposition the spotlight after scrolling or resizing. The ruler follows
 * the pointer in viewport coordinates and needs no scroll update.
 */
function handleViewportChange(event) {
    if (STATE.focusMode) {
        scheduleFocusUpdate();
    }

    if (event.type === 'resize' && STATE.readingRuler) {
        rulerHeight = 0;
        const ruler = document.getElementById(CONFIG.readingRulerId);
        if (ruler && ruler.classList.contains('visible')) {
            scheduleRulerUpdate();
        }
    }
}

/**
 * Keep the global listeners attached only while at least one aid is on.
 */
function syncAidListeners() {
    const needed = STATE.focusMode || STATE.readingRuler;

    if (needed && !listenersAttached) {
        listenersAttached = true;
        window.addEventListener('scroll', handleViewportChange, { passive: true });
        window.addEventListener('resize', handleViewportChange);
        document.addEventListener('pointermove', handlePointerMove, {
            passive: true,
            capture: true
        });
        document.documentElement.addEventListener('pointerleave', hideReadingRuler);
        window.addEventListener('blur', hideReadingRuler);
        return;
    }

    if (!needed && listenersAttached) {
        listenersAttached = false;
        window.removeEventListener('scroll', handleViewportChange);
        window.removeEventListener('resize', handleViewportChange);
        document.removeEventListener('pointermove', handlePointerMove, {
            capture: true
        });
        document.documentElement.removeEventListener('pointerleave', hideReadingRuler);
        window.removeEventListener('blur', hideReadingRuler);

        if (focusFrame !== null) {
            cancelAnimationFrame(focusFrame);
            focusFrame = null;
        }
        if (rulerFrame !== null) {
            cancelAnimationFrame(rulerFrame);
            rulerFrame = null;
        }
    }
}

/**
 * Turn both aids off and remove their overlays. Used when the extension is
 * disabled, the site rule turns off, or the toolbar's close button is used.
 * @param {{silent?: boolean}} [options]
 */
export function disableReadingAids(options = {}) {
    const wasOn = STATE.focusMode || STATE.readingRuler;

    STATE.focusMode = false;
    STATE.readingRuler = false;
    STATE.focusBlock = null;
    focusRect = null;

    hideFocusOverlay();
    hideReadingRuler();
    document.getElementById(CONFIG.focusOverlayId)?.remove();
    document.getElementById(CONFIG.readingRulerId)?.remove();
    syncAidListeners();
    updateToolbarState();

    if (wasOn && !options.silent) {
        showToast('Reading aids off');
    }
}
