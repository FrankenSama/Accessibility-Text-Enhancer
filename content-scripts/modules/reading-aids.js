// Geometry and messages for the v1.6.0 reading aids. This module is kept
// free of DOM and chrome APIs so Node can import a copy directly.

// The spotlight hole is grown by a couple of pixels so descenders, focus
// outlines, and italic overhangs are not dimmed at the edge.
export const FOCUS_INSET = 2;

// The ruler is about one comfortably spaced line tall, with a floor and a
// ceiling so very small or very large root fonts stay useful.
export const RULER_HEIGHT_EM = 2.2;
export const RULER_MIN_HEIGHT = 28;
export const RULER_MAX_HEIGHT = 56;

/**
 * Height of the reading ruler for a root font size, clamped to a readable
 * range. Falls back to a 16 px root when the value is missing.
 * @param {number} fontSize - Root font size in CSS pixels.
 * @returns {number}
 */
export function rulerHeightFor(fontSize) {
    const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16;
    const height = size * RULER_HEIGHT_EM;
    return Math.round(Math.min(
        RULER_MAX_HEIGHT,
        Math.max(RULER_MIN_HEIGHT, height)
    ));
}

/**
 * The ruler's viewport top so its centre follows the pointer without
 * leaving the viewport. Non-finite coordinates centre it instead.
 * @param {number} clientY - Pointer position in viewport coordinates.
 * @param {number} height - Ruler height in CSS pixels.
 * @param {number} viewportHeight - Viewport height in CSS pixels.
 * @returns {number}
 */
export function clampRulerTop(clientY, height, viewportHeight) {
    const rulerHeight = Number.isFinite(height) && height > 0 ? height : 0;
    const viewport = Number.isFinite(viewportHeight) && viewportHeight > 0
        ? viewportHeight
        : 0;
    const pointer = Number.isFinite(clientY) ? clientY : viewport / 2;
    const maxTop = Math.max(0, viewport - rulerHeight);

    return Math.round(Math.min(maxTop, Math.max(0, pointer - rulerHeight / 2)));
}

/**
 * A rect grown on every side, or null when the input is not a usable rect.
 * @param {{top: number, left: number, width: number, height: number}} rect
 * @param {number} [inset]
 * @returns {{top: number, left: number, width: number, height: number}|null}
 */
export function insetRect(rect, inset = FOCUS_INSET) {
    if (!rect ||
        !Number.isFinite(rect.top) ||
        !Number.isFinite(rect.left) ||
        !Number.isFinite(rect.width) ||
        !Number.isFinite(rect.height)) {
        return null;
    }

    const growth = Number.isFinite(inset) ? inset : 0;
    const width = rect.width + growth * 2;
    const height = rect.height + growth * 2;

    if (rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0) {
        return null;
    }

    return {
        top: rect.top - growth,
        left: rect.left - growth,
        width,
        height
    };
}

/**
 * The fixed-position styles for the focus spotlight, or null when there is
 * nothing to show.
 * @param {{top: number, left: number, width: number, height: number}} rect
 * @param {number} [inset]
 * @returns {{top: string, left: string, width: string, height: string}|null}
 */
export function spotlightStyle(rect, inset = FOCUS_INSET) {
    const grown = insetRect(rect, inset);
    if (!grown) {
        return null;
    }

    return {
        top: `${Math.round(grown.top)}px`,
        left: `${Math.round(grown.left)}px`,
        width: `${Math.round(grown.width)}px`,
        height: `${Math.round(grown.height)}px`
    };
}

/**
 * Whether two rects are close enough to skip a style write. Sub-pixel drift
 * from scrolling should not thrash the overlay every frame.
 * @param {{top: number, left: number, width: number, height: number}|null} a
 * @param {{top: number, left: number, width: number, height: number}|null} b
 * @param {number} [tolerance] - Allowed difference in CSS pixels.
 * @returns {boolean}
 */
export function rectsEqual(a, b, tolerance = 0.5) {
    if (!a || !b) {
        return a === b;
    }

    const limit = Number.isFinite(tolerance) ? tolerance : 0;
    return Math.abs(a.top - b.top) <= limit &&
        Math.abs(a.left - b.left) <= limit &&
        Math.abs(a.width - b.width) <= limit &&
        Math.abs(a.height - b.height) <= limit;
}

/**
 * Whether any part of a rect is inside the viewport. A focused block that
 * has scrolled completely away should not dim the page it is no longer on.
 * @param {{top: number, left: number, width: number, height: number}} rect
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @returns {boolean}
 */
export function rectIntersectsViewport(rect, viewportWidth, viewportHeight) {
    if (!rect) {
        return false;
    }

    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;

    return right > 0 &&
        bottom > 0 &&
        rect.left < viewportWidth &&
        rect.top < viewportHeight;
}

/**
 * Confirmation text for an aid toggle. The button's pressed state is the
 * primary signal; this keeps the toast wording consistent.
 * @param {'focusMode'|'readingRuler'} aid
 * @param {boolean} on
 * @returns {string}
 */
export function aidToggleMessage(aid, on) {
    if (aid === 'focusMode') {
        return on ? 'Focus mode on' : 'Focus mode off';
    }

    return on ? 'Reading ruler on' : 'Reading ruler off';
}
