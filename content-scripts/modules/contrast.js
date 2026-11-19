// WCAG colour math and the contrast command.

import { notify } from './feedback.js';

/**
 * Parse an rgb()/rgba() colour string into channel values.
 * @param {string} color
 * @returns {{r: number, g: number, b: number, a: number}|null} Null when the
 *     colour is unparseable or fully transparent.
 */
export function parseColor(color) {
    const match = color && color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) {
        return null;
    }

    const alpha = match[4] === undefined ? 1 : parseFloat(match[4]);
    if (alpha === 0) {
        return null;
    }

    return {
        r: parseInt(match[1], 10),
        g: parseInt(match[2], 10),
        b: parseInt(match[3], 10),
        a: alpha
    };
}

/**
 * Parse a #rgb or #rrggbb colour into channel values.
 * @param {string} color
 * @returns {{r: number, g: number, b: number, a: number}|null}
 */
export function parseHexColor(color) {
    const match = typeof color === 'string' &&
        color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) {
        return null;
    }

    const hex = match[1].length === 3
        ? match[1].split('').map((digit) => digit + digit).join('')
        : match[1];

    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1
    };
}

/**
 * Relative luminance as defined by WCAG 2.x.
 * @param {{r: number, g: number, b: number}} color
 * @returns {number}
 */
function relativeLuminance({ r, g, b }) {
    const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };

    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG contrast ratio between two colours.
 * @param {{r: number, g: number, b: number}} colorA
 * @param {{r: number, g: number, b: number}} colorB
 * @returns {number} Ratio between 1 and 21.
 */
export function contrastRatio(colorA, colorB) {
    const luminanceA = relativeLuminance(colorA);
    const luminanceB = relativeLuminance(colorB);

    return (Math.max(luminanceA, luminanceB) + 0.05) /
           (Math.min(luminanceA, luminanceB) + 0.05);
}

/**
 * Find the effective (non-transparent) background colour of an element.
 * @param {HTMLElement} element
 * @returns {{r: number, g: number, b: number}}
 */
export function getEffectiveBackgroundColor(element) {
    const layers = [];
    let node = element;

    while (node && node.nodeType === Node.ELEMENT_NODE) {
        const background = parseColor(getComputedStyle(node).backgroundColor);
        if (background) {
            layers.push(background);
            if (background.a >= 1) {
                break;
            }
        }

        node = node.parentElement;
    }

    // Composite translucent layers over the page background, working from
    // the outermost layer inwards.
    let result = { r: 255, g: 255, b: 255 };
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        result = {
            r: layer.r * layer.a + result.r * (1 - layer.a),
            g: layer.g * layer.a + result.g * (1 - layer.a),
            b: layer.b * layer.a + result.b * (1 - layer.a)
        };
    }

    return result;
}

/**
 * Whether the browser is in a forced-colours mode, where authored background
 * colours are suppressed and system colours have to be used instead.
 * @returns {boolean}
 */
export function forcedColorsActive() {
    return Boolean(window.matchMedia &&
        window.matchMedia('(forced-colors: active)').matches);
}

/**
 * Pick a line colour that stays visible against the element's background, or
 * fall back to the text colour when the chosen one would disappear.
 * @param {HTMLElement} element
 * @param {string} lineColor
 * @returns {string}
 */
export function readableLineColor(element, lineColor) {
    if (forcedColorsActive()) {
        return 'Highlight';
    }

    const line = parseHexColor(lineColor);
    const background = getEffectiveBackgroundColor(element);

    if (!line || !background || contrastRatio(line, background) < 3) {
        return 'currentColor';
    }

    return lineColor;
}

/**
 * Force high-contrast text based on the effective background colour.
 * @param {HTMLElement} element - Element to modify
 * @param {{silent?: boolean, scope?: string}} options
 */
export function fixTextContrast(element, options = {}) {
    const background = getEffectiveBackgroundColor(element);
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    const useBlack = contrastRatio(background, black) >= contrastRatio(background, white);
    const newColor = useBlack ? '#000000' : '#ffffff';

    element.style.setProperty('color', newColor, 'important');
    notify(options, `Contrast fixed: ${useBlack ? 'Black' : 'White'} text`);
}
