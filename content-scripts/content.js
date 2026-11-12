// content-scripts/content.js
//
// Classic content script entry point. Chrome does not support static imports
// in content scripts, so this small loader imports the module graph through a
// dynamic import. The modules are listed in web_accessible_resources.
(function () {
    'use strict';

    // Content scripts can be executed more than once in the same document
    // (for example, when the extension is reloaded). Only initialize once.
    if (window.__accessibilityEnhancerInitialized) {
        return;
    }
    window.__accessibilityEnhancerInitialized = true;

    const moduleUrl = (typeof chrome !== 'undefined' && chrome.runtime &&
        typeof chrome.runtime.getURL === 'function')
        ? chrome.runtime.getURL('content-scripts/app.js')
        : new URL('content-scripts/app.js', document.baseURI).href;

    import(moduleUrl)
        .then((module) => module.start())
        .catch((error) => {
            window.__accessibilityEnhancerInitialized = false;
            console.error('Accessibility Text Enhancer failed to load:', error);
        });
})();
