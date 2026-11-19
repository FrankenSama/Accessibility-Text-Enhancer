// Loads the bundled OpenDyslexic faces for the current document.
//
// The content script runs in an isolated world, so a relative URL would be
// resolved against the page and fail. FontFace with an extension URL avoids
// injecting a stylesheet and keeps the fallback stack working when a page's
// CSP refuses the font.

const REGULAR_URL = 'fonts/opendyslexic-regular.woff2';
const BOLD_URL = 'fonts/opendyslexic-bold.woff2';

let loading = null;

/**
 * Turn an extension-relative path into a URL both extension pages and
 * content scripts can load.
 * @param {string} path
 * @returns {string}
 */
function fontUrl(path) {
    if (typeof chrome !== 'undefined' && chrome.runtime &&
        typeof chrome.runtime.getURL === 'function') {
        return chrome.runtime.getURL(path);
    }
    return path;
}

/**
 * Add the regular and bold faces to the document and start loading them.
 * Failures resolve quietly so a command never waits on the font; the stack's
 * fallback keeps the text readable.
 * @returns {Promise<void>}
 */
export function loadOpenDyslexicFonts() {
    if (loading) {
        return loading;
    }

    if (typeof document === 'undefined' ||
        typeof FontFace !== 'function' || !document.fonts) {
        loading = Promise.resolve();
        return loading;
    }

    const faces = [
        new FontFace('OpenDyslexic', `url("${fontUrl(REGULAR_URL)}")`, {
            weight: '400',
            style: 'normal',
            display: 'swap'
        }),
        new FontFace('OpenDyslexic', `url("${fontUrl(BOLD_URL)}")`, {
            weight: '700',
            style: 'normal',
            display: 'swap'
        })
    ];

    loading = Promise.all(faces.map((face) => {
        document.fonts.add(face);
        return face.load().catch(() => null);
    })).then(() => undefined);

    return loading;
}
