// content-scripts/content.js
(function() {
    'use strict';

    // Content scripts can be executed more than once in the same document
    // (for example, when the extension is reloaded). Only initialize once.
    if (window.__accessibilityEnhancerInitialized) {
        return;
    }
    window.__accessibilityEnhancerInitialized = true;

    // ==================== STATE MANAGEMENT ====================

    const STATE = {
        savedRange: null,
        isExtensionEnabled: true,
        isDarkMode: true,
        history: [],
        historyIndex: -1,
        toolbarTimeout: null,
        positionFrame: null
    };

    const CONFIG = {
        toolbarId: 'accessibility-toolbar',
        settingsPanelId: 'accessibility-settings-panel',
        settingsOverlayId: 'accessibility-settings-overlay',
        highlightAttr: 'data-accessibility-highlight',
        selectionDelay: 150,
        toastDuration: 2000,
        maxHistorySize: 50,
        fontSizeMin: 8,
        fontSizeMax: 50
    };

    // Yellow used by the highlight feature. Highlight only paints a background
    // when the current text colour stays readable against it.
    const HIGHLIGHT_COLOR = { r: 255, g: 235, b: 59 };

    let settingsReturnFocus = null;

    /**
     * Promise wrapper around chrome.storage.local.get for older Chrome versions.
     * @param {string[]} keys
     * @returns {Promise<Object>}
     */
    function getStorage(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, resolve);
        });
    }

    /**
     * Return the node extension UI should be attached to. Documents without a
     * <body> (for example XML or SVG documents) still have a document element.
     * @returns {HTMLElement}
     */
    function getMountNode() {
        return document.body || document.documentElement;
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize extension on page load.
     */
    async function initialize() {
        try {
            await loadExtensionState();
            setupEventListeners();
            setupKeyboardShortcuts();

            if (!STATE.isExtensionEnabled) {
                return;
            }

            // Show the toolbar if text was already selected when the page loaded.
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
                const range = selection.getRangeAt(0);
                if (range.toString().trim()) {
                    STATE.savedRange = range.cloneRange();
                    setTimeout(() => {
                        if (!STATE.isExtensionEnabled || !STATE.savedRange) {
                            return;
                        }
                        const toolbar = createToolbar();
                        if (toolbar) {
                            positionToolbar(toolbar, STATE.savedRange);
                        }
                    }, CONFIG.selectionDelay);
                }
            }
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }

    /**
     * Load saved extension state from storage.
     */
    async function loadExtensionState() {
        const result = await getStorage(['extensionEnabled', 'darkMode']);
        STATE.isExtensionEnabled = result.extensionEnabled !== false;
        STATE.isDarkMode = result.darkMode !== false;
    }

    // ==================== STORAGE SYNC ====================

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') {
            return;
        }

        if (changes.extensionEnabled) {
            const isEnabled = changes.extensionEnabled.newValue !== false;
            if (isEnabled !== STATE.isExtensionEnabled) {
                STATE.isExtensionEnabled = isEnabled;

                if (!isEnabled) {
                    STATE.savedRange = null;
                    removeToolbar();
                    removeSettingsPanel();
                }

                showToast(isEnabled ? 'Extension enabled' : 'Extension disabled');
            }
        }

        if (changes.darkMode) {
            STATE.isDarkMode = changes.darkMode.newValue !== false;
            applyTheme();
        }
    });

    // ==================== TOOLBAR MANAGEMENT ====================

    /**
     * Creates and returns the enhanced toolbar element.
     * @returns {HTMLElement|null} The created toolbar element
     */
    function createToolbar() {
        if (!STATE.isExtensionEnabled) {
            return null;
        }
        removeToolbar();

        const toolbar = document.createElement('div');
        toolbar.id = CONFIG.toolbarId;
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Accessibility text enhancement');

        if (!STATE.isDarkMode) {
            toolbar.classList.add('light-mode');
        }

        toolbar.innerHTML = `
            <div class="button-group">
                <button type="button" data-command="undo" class="history-btn" data-tooltip="Undo (Ctrl+Z)" ${STATE.historyIndex < 0 ? 'disabled' : ''}>↶</button>
                <button type="button" data-command="redo" class="history-btn" data-tooltip="Redo (Ctrl+Y)" ${STATE.historyIndex >= STATE.history.length - 1 ? 'disabled' : ''}>↷</button>
            </div>

            <div class="button-group">
                <button type="button" data-command="bold" data-tooltip="Bold (Alt+Shift+B)">Bold</button>
                <button type="button" data-command="highlight" data-tooltip="Highlight (Alt+Shift+H)">Highlight</button>
            </div>

            <div class="button-group">
                <button type="button" data-command="sizeDown" class="size-btn" data-tooltip="Decrease Size">A-</button>
                <button type="button" data-command="sizeUp" class="size-btn" data-tooltip="Increase Size">A+</button>
            </div>

            <div class="button-group">
                <button type="button" data-command="fontStyle" class="icon-btn" data-tooltip="Toggle Font Style">A</button>
                <button type="button" data-command="spacing" class="icon-btn" data-tooltip="Text Spacing">↔️</button>
                <button type="button" data-command="contrast" class="icon-btn" data-tooltip="Fix Contrast">🎨</button>
                <button type="button" data-command="readAloud" class="icon-btn" data-tooltip="Read Aloud">🔊</button>
            </div>

            <div class="button-group">
                <button type="button" data-command="settings" class="settings-btn" data-tooltip="Settings">⚙️</button>
                <button type="button" data-command="toggleTheme" class="settings-btn" data-tooltip="Toggle Theme">${STATE.isDarkMode ? '☀️' : '🌙'}</button>
            </div>
        `;

        // Add accessible names and event listeners to all buttons.
        toolbar.querySelectorAll('button').forEach((btn) => {
            const label = btn.dataset.tooltip;
            if (label) {
                btn.setAttribute('aria-label', label);
            }

            // Prevent the page selection from being cleared when a button is
            // pressed, and stop page-level click handlers from seeing the click.
            btn.addEventListener('mousedown', (event) => {
                event.preventDefault();
                event.stopPropagation();
            });

            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                handleCommand(btn.dataset.command);
            });
        });

        // Add the animation class before insertion so the toolbar does not
        // flash at full opacity for one frame before sliding in.
        toolbar.classList.add('show');
        getMountNode().appendChild(toolbar);
        applyTheme();

        return toolbar;
    }

    /**
     * Positions the toolbar at the top of the viewport.
     * @param {HTMLElement} toolbar - The toolbar element
     * @param {Range} range - The selection range
     */
    function positionToolbar(toolbar, range) {
        if (!toolbar || !range) {
            return;
        }

        const rect = range.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const toolbarWidth = Math.min(toolbar.offsetWidth || 380, viewportWidth - 30);
        const center = rect.width > 0 ? rect.left + (rect.width / 2) : viewportWidth / 2;
        const left = Math.max(
            toolbarWidth / 2 + 15,
            Math.min(center, viewportWidth - toolbarWidth / 2 - 15)
        );

        toolbar.style.top = '15px';
        toolbar.style.left = `${left}px`;
    }

    /**
     * Reposition the toolbar on the next animation frame.
     */
    function scheduleToolbarPosition() {
        if (STATE.positionFrame !== null) {
            return;
        }

        STATE.positionFrame = requestAnimationFrame(() => {
            STATE.positionFrame = null;
            const toolbar = document.getElementById(CONFIG.toolbarId);
            if (toolbar && STATE.savedRange) {
                positionToolbar(toolbar, STATE.savedRange);
            }
        });
    }

    /**
     * Removes the toolbar from the document.
     */
    function removeToolbar() {
        const existingToolbar = document.getElementById(CONFIG.toolbarId);
        if (existingToolbar) {
            existingToolbar.remove();
        }
    }

    /**
     * Checks if a click is outside the toolbar, settings panel, and overlay.
     * @param {Event} event - The mouse event
     * @returns {boolean} True if outside the extension UI
     */
    function isClickOutsideExtensionUi(event) {
        const toolbar = document.getElementById(CONFIG.toolbarId);
        const panel = document.getElementById(CONFIG.settingsPanelId);
        const overlay = document.getElementById(CONFIG.settingsOverlayId);

        return !(toolbar && toolbar.contains(event.target)) &&
               !(panel && panel.contains(event.target)) &&
               !(overlay && overlay.contains(event.target));
    }

    // ==================== COMMAND HANDLING ====================

    /**
     * Handle toolbar command execution.
     * @param {string} command - The command to execute
     */
    function handleCommand(command) {
        switch (command) {
            case 'settings':
                showSettingsPanel();
                return;
            case 'toggleTheme':
                toggleToolbarTheme();
                return;
            case 'undo':
                undo();
                return;
            case 'redo':
                redo();
                return;
            default:
                enhanceSelection(command);
        }
    }

    /**
     * Apply an enhancement to the saved selection.
     * @param {string} command - The enhancement command
     */
    function enhanceSelection(command) {
        if (!STATE.isExtensionEnabled || !STATE.savedRange) {
            return;
        }

        const range = STATE.savedRange;
        if (range.collapsed || !range.toString().trim()) {
            return;
        }

        let elementToStyle = range.commonAncestorContainer;
        while (elementToStyle && elementToStyle.nodeType !== Node.ELEMENT_NODE) {
            elementToStyle = elementToStyle.parentElement;
        }

        if (!elementToStyle) {
            return;
        }

        // Never style the extension's own UI.
        if (elementToStyle.closest(`#${CONFIG.toolbarId}, #${CONFIG.settingsPanelId}`)) {
            return;
        }

        // Reading aloud does not change styles, so it should not create a
        // history entry.
        if (command === 'readAloud') {
            readTextAloud(elementToStyle);
            return;
        }

        const before = captureElementState(elementToStyle);

        switch (command) {
            case 'bold':
                toggleBold(elementToStyle);
                break;
            case 'highlight':
                toggleHighlight(elementToStyle);
                break;
            case 'sizeDown':
                adjustFontSize(elementToStyle, -2);
                break;
            case 'sizeUp':
                adjustFontSize(elementToStyle, 2);
                break;
            case 'fontStyle':
                toggleFontStyle(elementToStyle);
                break;
            case 'spacing':
                adjustTextSpacing(elementToStyle);
                break;
            case 'contrast':
                fixTextContrast(elementToStyle);
                break;
            default:
                return;
        }

        const after = captureElementState(elementToStyle);
        if (before.style !== after.style || before.highlight !== after.highlight) {
            pushHistory({ element: elementToStyle, before, after });
        }

        updateToolbarState();
    }

    // ==================== ENHANCEMENT FUNCTIONS ====================

    /**
     * Toggle bold styling.
     * @param {HTMLElement} element - Element to modify
     */
    function toggleBold(element) {
        const currentWeight = getComputedStyle(element).fontWeight;
        const isBold = currentWeight === 'bold' || parseInt(currentWeight, 10) >= 700;
        element.style.setProperty('font-weight', isBold ? 'normal' : 'bold', 'important');
        showToast(isBold ? 'Text unbolded' : 'Text bolded');
    }

    /**
     * Toggle highlight background or outline.
     * @param {HTMLElement} element - Element to modify
     */
    function toggleHighlight(element) {
        const mode = element.getAttribute(CONFIG.highlightAttr);

        if (mode === 'background') {
            element.style.removeProperty('background-color');
            element.removeAttribute(CONFIG.highlightAttr);
            showToast('Highlight removed');
            return;
        }

        if (mode === 'outline') {
            element.style.removeProperty('outline');
            element.removeAttribute(CONFIG.highlightAttr);
            showToast('Outline removed');
            return;
        }

        const style = getComputedStyle(element);
        const background = parseColor(style.backgroundColor);
        const clipsBackgroundToText = style.backgroundClip === 'text' ||
            style.webkitBackgroundClip === 'text';
        const textColor = parseColor(style.color) || { r: 0, g: 0, b: 0 };

        // A yellow background only works when the text is dark enough to stay
        // readable on it. On dark sites (or after a contrast fix made the text
        // white) outline the element instead of hiding the text behind yellow.
        const backgroundIsReadable = contrastRatio(textColor, HIGHLIGHT_COLOR) >= 4.5;

        if (background || clipsBackgroundToText || !backgroundIsReadable) {
            element.style.setProperty('outline', '2px solid #ffeb3b', 'important');
            element.setAttribute(CONFIG.highlightAttr, 'outline');
            showToast('Outline applied');
        } else {
            element.style.setProperty('background-color', '#ffeb3b', 'important');
            element.setAttribute(CONFIG.highlightAttr, 'background');
            showToast('Text highlighted');
        }
    }

    /**
     * Adjust font size.
     * @param {HTMLElement} element - Element to modify
     * @param {number} change - Size change amount
     */
    function adjustFontSize(element, change) {
        const currentSize = parseFloat(getComputedStyle(element).fontSize);
        const newSize = currentSize + change;

        if (newSize >= CONFIG.fontSizeMin && newSize <= CONFIG.fontSizeMax) {
            element.style.setProperty('font-size', `${newSize}px`, 'important');
            showToast(`Font size: ${newSize}px`);
        } else {
            showToast(`Size limit reached (${CONFIG.fontSizeMin}-${CONFIG.fontSizeMax}px)`);
        }
    }

    /**
     * Toggle font family.
     * @param {HTMLElement} element - Element to modify
     */
    function toggleFontStyle(element) {
        const current = getComputedStyle(element).fontFamily.toLowerCase();

        if (current.includes('georgia') || (current.includes('serif') && !current.includes('sans-serif'))) {
            element.style.setProperty('font-family', 'Arial, sans-serif', 'important');
            showToast('Font: Sans-serif');
        } else {
            element.style.setProperty('font-family', 'Georgia, serif', 'important');
            showToast('Font: Serif');
        }
    }

    /**
     * Toggle text spacing.
     * @param {HTMLElement} element - Element to modify
     */
    function adjustTextSpacing(element) {
        const isSpaced = element.style.getPropertyValue('letter-spacing') === '2px' &&
                         element.style.getPropertyValue('word-spacing') === '4px';

        if (isSpaced) {
            element.style.removeProperty('letter-spacing');
            element.style.removeProperty('word-spacing');
            showToast('Spacing reset');
        } else {
            element.style.setProperty('letter-spacing', '2px', 'important');
            element.style.setProperty('word-spacing', '4px', 'important');
            showToast('Spacing increased');
        }
    }

    /**
     * Parse an rgb()/rgba() colour string into channel values.
     * @param {string} color
     * @returns {{r: number, g: number, b: number, a: number}|null} Null when the
     *     colour is unparseable or fully transparent.
     */
    function parseColor(color) {
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
    function contrastRatio(colorA, colorB) {
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
    function getEffectiveBackgroundColor(element) {
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
     * Force high-contrast text based on the effective background colour.
     * @param {HTMLElement} element - Element to modify
     */
    function fixTextContrast(element) {
        const background = getEffectiveBackgroundColor(element);
        const black = { r: 0, g: 0, b: 0 };
        const white = { r: 255, g: 255, b: 255 };
        const useBlack = contrastRatio(background, black) >= contrastRatio(background, white);
        const newColor = useBlack ? '#000000' : '#ffffff';

        element.style.setProperty('color', newColor, 'important');
        showToast(`Contrast fixed: ${useBlack ? 'Black' : 'White'} text`);
    }

    /**
     * Read the selected text aloud using speech synthesis.
     * @param {HTMLElement} element - Fallback element to read
     */
    function readTextAloud(element) {
        if (!('speechSynthesis' in window)) {
            showToast('Speech synthesis not supported');
            return;
        }

        const text = STATE.savedRange?.toString().trim() || element.textContent.trim();
        if (!text) {
            return;
        }

        window.speechSynthesis.cancel();
        const speech = new SpeechSynthesisUtterance(text);
        speech.rate = 0.9;
        speech.pitch = 1;
        window.speechSynthesis.speak(speech);
        showToast('Reading text...');
    }

    // ==================== HISTORY MANAGEMENT ====================

    /**
     * Capture the inline style and extension marker for an element.
     * @param {HTMLElement} element
     * @returns {{style: string|null, highlight: string|null}}
     */
    function captureElementState(element) {
        return {
            style: element.getAttribute('style'),
            highlight: element.getAttribute(CONFIG.highlightAttr)
        };
    }

    /**
     * Restore a previously captured element state.
     * @param {HTMLElement} element
     * @param {{style: string|null, highlight: string|null}} state
     */
    function restoreElementState(element, state) {
        if (state.style === null) {
            element.removeAttribute('style');
        } else {
            element.setAttribute('style', state.style);
        }

        if (state.highlight === null) {
            element.removeAttribute(CONFIG.highlightAttr);
        } else {
            element.setAttribute(CONFIG.highlightAttr, state.highlight);
        }
    }

    /**
     * Add an entry to the undo history.
     * @param {{element: HTMLElement, before: Object, after: Object}} entry
     */
    function pushHistory(entry) {
        STATE.history = STATE.history.slice(0, STATE.historyIndex + 1);
        STATE.history.push(entry);
        STATE.historyIndex++;

        if (STATE.history.length > CONFIG.maxHistorySize) {
            STATE.history.shift();
            STATE.historyIndex--;
        }
    }

    /**
     * Undo the last action.
     */
    function undo() {
        if (STATE.historyIndex < 0) {
            showToast('Nothing to undo');
            return;
        }

        const entry = STATE.history[STATE.historyIndex];
        STATE.historyIndex--;

        // Pages that re-render can detach the element a change was applied to.
        // Restoring it would silently do nothing, so say so instead.
        if (!entry.element.isConnected) {
            updateToolbarState();
            showToast('That change is no longer on the page');
            return;
        }

        restoreElementState(entry.element, entry.before);
        updateToolbarState();
        showToast('Undone');
    }

    /**
     * Redo the last undone action.
     */
    function redo() {
        if (STATE.historyIndex >= STATE.history.length - 1) {
            showToast('Nothing to redo');
            return;
        }

        STATE.historyIndex++;
        const entry = STATE.history[STATE.historyIndex];

        if (!entry.element.isConnected) {
            updateToolbarState();
            showToast('That change is no longer on the page');
            return;
        }

        restoreElementState(entry.element, entry.after);
        updateToolbarState();
        showToast('Redone');
    }

    /**
     * Update toolbar undo/redo button states.
     */
    function updateToolbarState() {
        const toolbar = document.getElementById(CONFIG.toolbarId);
        if (!toolbar) {
            return;
        }

        const undoBtn = toolbar.querySelector('[data-command="undo"]');
        const redoBtn = toolbar.querySelector('[data-command="redo"]');

        if (undoBtn) {
            undoBtn.disabled = STATE.historyIndex < 0;
        }
        if (redoBtn) {
            redoBtn.disabled = STATE.historyIndex >= STATE.history.length - 1;
        }
    }

    // ==================== SETTINGS PANEL ====================

    /**
     * Show the settings panel.
     */
    function showSettingsPanel() {
        removeSettingsPanel();
        settingsReturnFocus = document.querySelector(
            `#${CONFIG.toolbarId} [data-command="settings"]`
        ) || document.activeElement;

        const overlay = document.createElement('div');
        overlay.id = CONFIG.settingsOverlayId;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.addEventListener('mousedown', (event) => event.preventDefault());
        overlay.addEventListener('click', removeSettingsPanel);
        getMountNode().appendChild(overlay);

        const panel = document.createElement('div');
        panel.id = CONFIG.settingsPanelId;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'accessibility-settings-title');

        if (!STATE.isDarkMode) {
            panel.classList.add('light-mode');
        }

        panel.innerHTML = `
            <h3 id="accessibility-settings-title">Accessibility Settings</h3>

            <div class="setting-item">
                <button type="button" id="export-settings" class="action-btn export-btn">
                    Export Settings
                </button>
            </div>

            <div class="setting-item">
                <button type="button" id="import-settings" class="action-btn import-btn">
                    Import Settings
                </button>
            </div>

            <button type="button" class="close-btn">Close</button>
        `;

        getMountNode().appendChild(panel);

        const closeBtn = panel.querySelector('.close-btn');
        closeBtn.addEventListener('click', removeSettingsPanel);
        panel.querySelector('#export-settings').addEventListener('click', exportSettings);
        panel.querySelector('#import-settings').addEventListener('click', importSettings);

        // Keep keyboard focus inside the dialog while it is open.
        panel.addEventListener('keydown', (event) => {
            if (event.key !== 'Tab') {
                return;
            }

            const focusable = Array.from(
                panel.querySelectorAll('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])')
            ).filter((element) => !element.disabled);

            if (focusable.length === 0) {
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });

        closeBtn.focus();
    }

    /**
     * Remove the settings panel and restore focus.
     */
    function removeSettingsPanel() {
        const panel = document.getElementById(CONFIG.settingsPanelId);
        const overlay = document.getElementById(CONFIG.settingsOverlayId);

        if (panel) {
            panel.remove();
        }
        if (overlay) {
            overlay.remove();
        }

        if (settingsReturnFocus && settingsReturnFocus.isConnected) {
            settingsReturnFocus.focus();
        }
        settingsReturnFocus = null;
    }

    /**
     * Export settings to a JSON file.
     */
    function exportSettings() {
        const settings = {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            preferences: {
                darkMode: STATE.isDarkMode
            }
        };

        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `accessibility-settings-${Date.now()}.json`;
        getMountNode().appendChild(link);
        link.click();
        link.remove();
        // Give the download a moment to start before releasing the blob URL.
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showToast('Settings exported');
    }

    /**
     * Import settings from a JSON file.
     */
    function importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';

        input.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.onload = (loadEvent) => {
                try {
                    const settings = JSON.parse(loadEvent.target.result);

                    if (typeof settings.preferences?.darkMode !== 'boolean') {
                        showToast('No settings found in file');
                        return;
                    }

                    STATE.isDarkMode = settings.preferences.darkMode;
                    chrome.storage.local.set({ darkMode: STATE.isDarkMode });
                    applyTheme();
                    showToast('Settings imported successfully');
                    removeSettingsPanel();
                } catch (error) {
                    showToast('Error importing settings');
                    console.error('Import error:', error);
                }
            };
            reader.readAsText(file);
        });

        input.click();
    }

    /**
     * Apply the current theme to the toolbar and settings panel.
     */
    function applyTheme() {
        const toolbar = document.getElementById(CONFIG.toolbarId);
        if (toolbar) {
            toolbar.classList.toggle('light-mode', !STATE.isDarkMode);

            const themeBtn = toolbar.querySelector('[data-command="toggleTheme"]');
            if (themeBtn) {
                themeBtn.textContent = STATE.isDarkMode ? '☀️' : '🌙';
                themeBtn.setAttribute(
                    'aria-label',
                    STATE.isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'
                );
            }
        }

        const panel = document.getElementById(CONFIG.settingsPanelId);
        if (panel) {
            panel.classList.toggle('light-mode', !STATE.isDarkMode);
        }
    }

    /**
     * Toggle toolbar theme.
     */
    function toggleToolbarTheme() {
        STATE.isDarkMode = !STATE.isDarkMode;
        chrome.storage.local.set({ darkMode: STATE.isDarkMode });
        applyTheme();
        showToast(`${STATE.isDarkMode ? 'Dark' : 'Light'} mode activated`);
    }

    // ==================== UI HELPERS ====================

    /**
     * Show a temporary notification toast.
     * @param {string} message - Message to display
     */
    function showToast(message) {
        document.querySelectorAll('.accessibility-toast').forEach((toast) => toast.remove());

        const toast = document.createElement('div');
        toast.className = 'accessibility-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.setAttribute('aria-atomic', 'true');
        toast.textContent = message;
        getMountNode().appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, CONFIG.toastDuration);
    }

    // ==================== EVENT LISTENERS ====================

    /**
     * Set up selection, click, scroll, and resize listeners.
     */
    function setupEventListeners() {
        document.addEventListener('selectionchange', handleSelectionChange);

        // Dismiss the toolbar when clicking outside the extension UI.
        document.addEventListener('mousedown', (event) => {
            if (isClickOutsideExtensionUi(event)) {
                STATE.savedRange = null;
                removeToolbar();
            }
        });

        window.addEventListener('scroll', scheduleToolbarPosition, { passive: true });
        window.addEventListener('resize', scheduleToolbarPosition);
    }

    /**
     * Handle selection changes.
     */
    function handleSelectionChange() {
        if (!STATE.isExtensionEnabled) {
            return;
        }

        // Ignore selection changes caused by interacting with the extension UI.
        const activeElement = document.activeElement;
        if (activeElement && activeElement.closest(`#${CONFIG.toolbarId}, #${CONFIG.settingsPanelId}`)) {
            return;
        }

        if (STATE.toolbarTimeout) {
            clearTimeout(STATE.toolbarTimeout);
            STATE.toolbarTimeout = null;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            STATE.savedRange = null;
            removeToolbar();
            return;
        }

        const range = selection.getRangeAt(0);
        if (!range.toString().trim()) {
            STATE.savedRange = null;
            removeToolbar();
            return;
        }

        // Keep a snapshot because the live Selection can collapse when the
        // user interacts with the toolbar.
        STATE.savedRange = range.cloneRange();
        const savedRange = STATE.savedRange;

        STATE.toolbarTimeout = setTimeout(() => {
            STATE.toolbarTimeout = null;

            if (!STATE.isExtensionEnabled || !STATE.savedRange) {
                return;
            }

            const toolbar = createToolbar();
            if (toolbar) {
                positionToolbar(toolbar, savedRange);
            }
        }, CONFIG.selectionDelay);
    }

    /**
     * Set up keyboard shortcuts.
     */
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                // Close the dialog first and leave the toolbar in place.
                if (document.getElementById(CONFIG.settingsPanelId)) {
                    removeSettingsPanel();
                    event.preventDefault();
                    return;
                }

                if (document.getElementById(CONFIG.toolbarId)) {
                    STATE.savedRange = null;
                    removeToolbar();
                    event.preventDefault();
                }
                return;
            }

            // While the settings dialog is open, only Escape should affect the
            // extension.
            if (document.getElementById(CONFIG.settingsPanelId)) {
                return;
            }

            if (!STATE.isExtensionEnabled) {
                return;
            }

            const key = event.key.toLowerCase();
            const modifier = event.ctrlKey || event.metaKey;

            // Ctrl/Cmd + Z = Undo (only while the toolbar is visible, so the
            // page's native undo is not hijacked).
            if (modifier && !event.shiftKey && key === 'z') {
                if (document.getElementById(CONFIG.toolbarId)) {
                    event.preventDefault();
                    undo();
                }
                return;
            }

            // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z = Redo.
            if (modifier && (key === 'y' || (event.shiftKey && key === 'z'))) {
                if (document.getElementById(CONFIG.toolbarId)) {
                    event.preventDefault();
                    redo();
                }
                return;
            }

            // Ctrl/Cmd + Shift + B is Chrome's bookmarks bar and Ctrl/Cmd +
            // Shift + H opens the home page on macOS, so those combinations
            // never reach the page. Use Alt/Option + Shift instead and match
            // the physical key so Option-modified characters on macOS still
            // work.
            const altShift = event.altKey && event.shiftKey &&
                !event.ctrlKey && !event.metaKey;

            // Alt/Option + Shift + B = Bold.
            if (altShift && (event.code === 'KeyB' || key === 'b') && STATE.savedRange) {
                event.preventDefault();
                enhanceSelection('bold');
                return;
            }

            // Alt/Option + Shift + H = Highlight.
            if (altShift && (event.code === 'KeyH' || key === 'h') && STATE.savedRange) {
                event.preventDefault();
                enhanceSelection('highlight');
            }
        });
    }

    // ==================== INITIALIZATION ====================

    // Initialize when the DOM is ready.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
