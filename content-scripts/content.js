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

    const IS_MAC = /mac/i.test(
        navigator.userAgentData?.platform || navigator.platform || ''
    );

    const STATE = {
        savedRange: null,
        isExtensionEnabled: true,
        isDarkMode: true,
        history: [],
        historyIndex: -1,
        toolbarTimeout: null,
        positionFrame: null,
        isApplyingCommand: false,
        // Focus Toolbar is a manifest command. These defaults are replaced with
        // the user's actual binding once the background worker responds.
        focusToolbarShortcut: IS_MAC ? 'Cmd+Shift+F' : 'Ctrl+Shift+F',
        focusToolbarAriaShortcut: IS_MAC ? 'Meta+Shift+F' : 'Control+Shift+F'
    };

    const CONFIG = {
        toolbarId: 'accessibility-toolbar',
        settingsPanelId: 'accessibility-settings-panel',
        settingsOverlayId: 'accessibility-settings-overlay',
        highlightAttr: 'data-accessibility-highlight',
        selectionAttr: 'data-atx-selection',
        selectionDelay: 150,
        toastDuration: 2000,
        maxHistorySize: 50,
        maxWrapNodes: 200,
        fontSizeMin: 8,
        fontSizeMax: 50
    };

    // Commands that change readability, so they apply to the nearest block
    // rather than only the selected words.
    const BLOCK_COMMANDS = new Set([
        'sizeDown',
        'sizeUp',
        'fontStyle',
        'spacing',
        'contrast'
    ]);

    // Commands whose effect is a binary toggle. When a selection covers several
    // targets, they all move in the same direction instead of inverting mixed
    // styles element by element.
    const TOGGLE_COMMANDS = new Set([
        'bold',
        'highlight',
        'fontStyle',
        'spacing'
    ]);

    // Inline properties each command controls. When a command is applied to a
    // whole block, matching overrides on exact-selection wrappers inside that
    // block are cleared so the wrappers inherit the block-level result.
    const COMMAND_PROPERTIES = {
        bold: ['font-weight'],
        highlight: ['background-color', 'outline'],
        sizeDown: ['font-size'],
        sizeUp: ['font-size'],
        fontStyle: ['font-family'],
        spacing: ['letter-spacing', 'word-spacing'],
        contrast: ['color']
    };

    // Yellow used by the highlight feature. Highlight only paints a background
    // when the current text colour stays readable against it.
    const HIGHLIGHT_COLOR = { r: 255, g: 235, b: 59 };

    // Wrappers are HTML spans, so they can only be inserted around HTML text.
    const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

    // Content that commands must never style: the extension's own UI, scripts,
    // styles, form controls, and editable regions.
    // An empty or "plaintext-only" contenteditable is still editable, so only
    // an explicit "false" opts an element out.
    const SKIP_SELECTOR = `#${CONFIG.toolbarId}, #${CONFIG.settingsPanelId}, ` +
        'script, style, textarea, input, select, ' +
        '[contenteditable]:not([contenteditable="false"])';

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
            setupMessageListener();
            syncShortcutLabels();

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
        toolbar.setAttribute('aria-orientation', 'horizontal');
        if (STATE.focusToolbarAriaShortcut) {
            toolbar.setAttribute('aria-keyshortcuts', STATE.focusToolbarAriaShortcut);
        }

        if (!STATE.isDarkMode) {
            toolbar.classList.add('light-mode');
        }

        toolbar.innerHTML = `
            <div class="button-group">
                <button type="button" data-command="undo" class="history-btn" data-tooltip="Undo (Ctrl+Z)" ${STATE.historyIndex < 0 ? 'disabled' : ''}>↶</button>
                <button type="button" data-command="redo" class="history-btn" data-tooltip="Redo (Ctrl+Y)" ${STATE.historyIndex >= STATE.history.length - 1 ? 'disabled' : ''}>↷</button>
            </div>

            <div class="button-group">
                <button type="button" data-command="bold" data-tooltip="Bold (Alt+Shift+B) · Shift: paragraph">Bold</button>
                <button type="button" data-command="highlight" data-tooltip="Highlight (Alt+Shift+H) · Shift: paragraph">Highlight</button>
            </div>

            <div class="button-group">
                <button type="button" data-command="sizeDown" class="size-btn" data-tooltip="Decrease Size · Shift: selection">A-</button>
                <button type="button" data-command="sizeUp" class="size-btn" data-tooltip="Increase Size · Shift: selection">A+</button>
            </div>

            <div class="button-group">
                <button type="button" data-command="fontStyle" class="icon-btn" data-tooltip="Toggle Font Style · Shift: selection">A</button>
                <button type="button" data-command="spacing" class="icon-btn" data-tooltip="Text Spacing · Shift: selection">↔️</button>
                <button type="button" data-command="contrast" class="icon-btn" data-tooltip="Fix Contrast · Shift: selection">🎨</button>
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
                handleCommand(btn.dataset.command, {
                    scope: getScopeOverride(btn.dataset.command, event.shiftKey)
                });
            });
        });

        // Add the animation class before insertion so the toolbar does not
        // flash at full opacity for one frame before sliding in.
        toolbar.classList.add('show');
        getMountNode().appendChild(toolbar);
        applyTheme();
        setupToolbarKeyboardNavigation(toolbar);
        updateToolbarState();

        return toolbar;
    }

    /**
     * Buttons in a toolbar that can currently receive focus.
     * @param {HTMLElement} toolbar
     * @param {boolean} [includeDisabled]
     * @returns {HTMLButtonElement[]}
     */
    function getToolbarButtons(toolbar, includeDisabled = false) {
        return Array.from(toolbar.querySelectorAll('button'))
            .filter((button) => includeDisabled || !button.disabled);
    }

    /**
     * Make one button the toolbar's single tab stop.
     * @param {HTMLButtonElement} button
     * @param {HTMLElement} toolbar
     */
    function setToolbarTabStop(button, toolbar) {
        getToolbarButtons(toolbar, true).forEach((item) => {
            item.setAttribute('tabindex', item === button ? '0' : '-1');
        });
    }

    /**
     * Keep exactly one enabled button in the tab order, and move focus off a
     * button that just became disabled.
     * @param {HTMLElement} toolbar
     */
    function syncToolbarTabStops(toolbar) {
        const enabled = getToolbarButtons(toolbar);

        if (enabled.length === 0) {
            getToolbarButtons(toolbar, true).forEach((button) => {
                button.setAttribute('tabindex', '-1');
            });
            return;
        }

        const active = document.activeElement;
        let target = enabled.find((button) => button.getAttribute('tabindex') === '0');

        if (active && toolbar.contains(active) && active.tagName === 'BUTTON' && !active.disabled) {
            target = active;
        }

        if (!target) {
            target = enabled[0];
        }

        setToolbarTabStop(target, toolbar);

        // A keyboard user can disable undo/redo with the button they are on.
        if (active && toolbar.contains(active) && active.disabled) {
            target.focus({ preventScroll: true });
        }
    }

    /**
     * Arrow-key navigation for the toolbar's single tab stop.
     * @param {HTMLElement} toolbar
     */
    function setupToolbarKeyboardNavigation(toolbar) {
        toolbar.addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                return;
            }

            const buttons = getToolbarButtons(toolbar);
            if (buttons.length === 0) {
                return;
            }

            const currentIndex = buttons.indexOf(document.activeElement);
            let nextIndex;

            if (event.key === 'Home') {
                nextIndex = 0;
            } else if (event.key === 'End') {
                nextIndex = buttons.length - 1;
            } else if (currentIndex === -1) {
                nextIndex = 0;
            } else {
                const step = event.key === 'ArrowRight' ? 1 : -1;
                nextIndex = (currentIndex + step + buttons.length) % buttons.length;
            }

            event.preventDefault();
            event.stopPropagation();

            const next = buttons[nextIndex];
            setToolbarTabStop(next, toolbar);
            next.focus({ preventScroll: true });
        });
    }

    /**
     * Focus the toolbar for the current selection, creating it immediately if
     * the selection delay has not fired yet.
     */
    function focusToolbarForSelection() {
        const isPending = Boolean(STATE.toolbarTimeout);
        if (STATE.toolbarTimeout) {
            clearTimeout(STATE.toolbarTimeout);
            STATE.toolbarTimeout = null;
        }

        const existing = document.getElementById(CONFIG.toolbarId);
        if (existing && !isPending) {
            // Already focused inside the toolbar: keep the current button.
            if (existing.contains(document.activeElement)) {
                return;
            }

            const buttons = getToolbarButtons(existing);
            if (buttons.length > 0) {
                setToolbarTabStop(buttons[0], existing);
                buttons[0].focus({ preventScroll: true });
            }
            return;
        }

        if (!STATE.savedRange) {
            const hint = STATE.focusToolbarShortcut
                ? `press ${STATE.focusToolbarShortcut}`
                : 'use the Focus Toolbar shortcut';
            showToast(`Select text first, then ${hint}`);
            return;
        }

        // createToolbar() replaces any stale toolbar left over from the
        // previous selection.
        const toolbar = createToolbar();
        if (!toolbar) {
            return;
        }

        positionToolbar(toolbar, STATE.savedRange);

        const buttons = getToolbarButtons(toolbar);
        if (buttons.length > 0) {
            setToolbarTabStop(buttons[0], toolbar);
            buttons[0].focus({ preventScroll: true });
        }

        showToast('Toolbar focused — use arrow keys');
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

    // ==================== SELECTION SCOPE ====================

    /**
     * Find the nearest block-level ancestor of a node.
     * @param {Node} node
     * @returns {HTMLElement|null} Null when the node is not in the main document
     *     (for example, inside a shadow root).
     */
    function closestBlock(node) {
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
    function getSelectedTextNodes(range) {
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
    function selectedSlice(range, node) {
        const start = node === range.startContainer ? range.startOffset : 0;
        const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
        return node.nodeValue.slice(Math.min(start, end), Math.max(start, end));
    }

    /**
     * Collect the block-level elements covered by a range.
     * @param {Range} range
     * @returns {HTMLElement[]}
     */
    function getBlocksForRange(range) {
        const blocks = new Set();
        const cache = new Map();

        getSelectedTextNodes(range).forEach((node) => {
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
    function getExactElement(range) {
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
    function getContainingWrapper(range) {
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
    function wrapRange(range) {
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
     * The scope a command uses when the user does not override it.
     * @param {string} command
     * @returns {'block'|'selection'}
     */
    function defaultScopeFor(command) {
        return BLOCK_COMMANDS.has(command) ? 'block' : 'selection';
    }

    /**
     * Shift-click flips the default scope: paragraph commands apply to the
     * selection, and selection commands apply to the whole paragraph.
     * @param {string} command
     * @param {boolean} shiftKey
     * @returns {'block'|'selection'|undefined}
     */
    function getScopeOverride(command, shiftKey) {
        if (!shiftKey) {
            return undefined;
        }

        if (BLOCK_COMMANDS.has(command)) {
            return 'selection';
        }

        if (command === 'bold' || command === 'highlight') {
            return 'block';
        }

        return undefined;
    }

    /**
     * Resolve which elements a command should modify.
     * @param {Range} range
     * @param {string} command
     * @param {{scope?: 'block'|'selection'}} options
     * @returns {{targets: HTMLElement[], scope: 'block'|'selection', fallback: boolean}}
     */
    function resolveScope(range, command, options = {}) {
        const scope = options.scope || defaultScopeFor(command);
        const blocks = getBlocksForRange(range);

        if (scope === 'block') {
            return { targets: blocks, scope: 'block', fallback: false };
        }

        // A selection that covers several blocks is applied to each of them
        // rather than wrapping across block boundaries.
        if (blocks.length > 1) {
            return { targets: blocks, scope: 'block', fallback: true };
        }

        const wrapper = getContainingWrapper(range);
        if (wrapper) {
            return { targets: [wrapper], scope: 'selection', fallback: false };
        }

        const exact = getExactElement(range);
        if (exact) {
            return { targets: [exact], scope: 'selection', fallback: false };
        }

        const wrappers = wrapRange(range);
        if (wrappers) {
            return { targets: wrappers, scope: 'selection', fallback: false };
        }

        return { targets: blocks, scope: 'block', fallback: true };
    }

    /**
     * Describe the applied scope in a toast message.
     * @param {{scope?: string}} options
     * @returns {string}
     */
    function scopeSuffix(options) {
        if (options.scope === 'block') {
            return ' (paragraph)';
        }
        if (options.scope === 'selection') {
            return ' (selection)';
        }
        return '';
    }

    /**
     * Show a toast unless the command is being applied to several targets.
     * @param {{silent?: boolean, scope?: string}} options
     * @param {string} message
     */
    function notify(options, message) {
        if (!options.silent) {
            showToast(message + scopeSuffix(options));
        }
    }

    /**
     * Describe a grouped change for the single summary toast.
     * @param {string} command
     * @param {{scope: string, fallback: boolean, targets: HTMLElement[]}} resolved
     * @returns {string}
     */
    function describeScope(command, resolved) {
        const labels = {
            bold: 'Bold',
            highlight: 'Highlight',
            sizeDown: 'Font size',
            sizeUp: 'Font size',
            fontStyle: 'Font style',
            spacing: 'Spacing',
            contrast: 'Contrast'
        };

        const label = labels[command] || 'Change';

        if (resolved.scope === 'selection') {
            return `${label} applied to selection`;
        }

        const count = resolved.targets.length;
        const paragraphs = `${count} paragraph${count === 1 ? '' : 's'}`;

        if (resolved.fallback) {
            return `Selection spans blocks — ${label.toLowerCase()} applied to ${paragraphs}`;
        }

        return `${label} applied to ${paragraphs}`;
    }

    /**
     * Whether a toggle command's effect is already applied to an element.
     * @param {HTMLElement} element
     * @param {string} command
     * @returns {boolean}
     */
    function isCommandApplied(element, command) {
        switch (command) {
            case 'bold': {
                const weight = getComputedStyle(element).fontWeight;
                return weight === 'bold' || parseInt(weight, 10) >= 700;
            }
            case 'highlight':
                return element.hasAttribute(CONFIG.highlightAttr);
            case 'fontStyle': {
                const family = getComputedStyle(element).fontFamily.toLowerCase();
                return family.includes('georgia') ||
                    (family.includes('serif') && !family.includes('sans-serif'));
            }
            case 'spacing':
                return element.style.getPropertyValue('letter-spacing') === '2px' &&
                       element.style.getPropertyValue('word-spacing') === '4px';
            default:
                return false;
        }
    }

    /**
     * Remove a command's exact-selection overrides so the wrapper inherits the
     * block-level style instead.
     * @param {HTMLElement} wrapper
     * @param {string} command
     */
    function clearWrapperOverride(wrapper, command) {
        (COMMAND_PROPERTIES[command] || []).forEach((property) => {
            wrapper.style.removeProperty(property);
        });

        if (command === 'highlight') {
            wrapper.removeAttribute(CONFIG.highlightAttr);
        }
    }

    // ==================== COMMAND HANDLING ====================

    /**
     * Handle toolbar command execution.
     * @param {string} command - The command to execute
     * @param {{scope?: 'block'|'selection'}} options - Scope override
     */
    function handleCommand(command, options = {}) {
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
                enhanceSelection(command, options);
        }
    }

    /**
     * Apply an enhancement to the saved selection.
     * @param {string} command - The enhancement command
     * @param {{scope?: 'block'|'selection'}} options - Scope override
     */
    function enhanceSelection(command, options = {}) {
        if (!STATE.isExtensionEnabled || !STATE.savedRange) {
            return;
        }

        const range = STATE.savedRange;
        if (range.collapsed || !range.toString().trim()) {
            return;
        }

        const anchor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
            ? range.commonAncestorContainer
            : range.commonAncestorContainer.parentElement;

        if (!anchor || anchor.closest(`#${CONFIG.toolbarId}, #${CONFIG.settingsPanelId}`)) {
            return;
        }

        // Reading aloud does not change styles, so it should not create a
        // history entry.
        if (command === 'readAloud') {
            readTextAloud(anchor);
            return;
        }

        const resolved = resolveScope(range, command, options);
        if (resolved.targets.length === 0) {
            showToast('Nothing to change');
            return;
        }

        const commandOptions = {
            // Only mention the scope when it differs from the command default,
            // so the common case stays quiet.
            scope: resolved.scope === defaultScopeFor(command) ? undefined : resolved.scope,
            // One grouped change gets a single summary toast.
            silent: resolved.targets.length > 1,
            // Toggle every target the same way: if the effect is already
            // present on all of them, turn it off everywhere; otherwise turn it
            // on everywhere. This avoids inverting mixed styles.
            toggleOff: TOGGLE_COMMANDS.has(command)
                ? resolved.targets.every((target) => isCommandApplied(target, command))
                : undefined
        };

        const changes = [];
        const nestedWrappers = new Set();

        const applyToTarget = (target) => {
            const before = captureElementState(target);
            applyCommand(target, command, commandOptions);
            const after = captureElementState(target);

            if (before.style !== after.style || before.highlight !== after.highlight) {
                changes.push({ element: target, before, after });
                return true;
            }

            return false;
        };

        let changedTargets = 0;

        for (const target of resolved.targets) {
            if (!target.isConnected) {
                continue;
            }

            // Any exact-selection wrapper inside a target must follow the
            // target's new value for the same property. This also covers the
            // case where selecting a whole paragraph resolves to the paragraph
            // itself rather than to a block command.
            target.querySelectorAll(`[${CONFIG.selectionAttr}]`).forEach((wrapper) => {
                nestedWrappers.add(wrapper);
            });

            if (applyToTarget(target)) {
                changedTargets++;
            }
        }

        // A change on a target supersedes exact-selection styling for the same
        // property inside it, so clear those overrides. Doing this only after
        // the target changed keeps a rejected command (such as a size limit)
        // from wiping a selection's own styling.
        if (changedTargets > 0) {
            for (const wrapper of nestedWrappers) {
                if (!wrapper.isConnected) {
                    continue;
                }

                const before = captureElementState(wrapper);
                clearWrapperOverride(wrapper, command);
                const after = captureElementState(wrapper);

                if (before.style !== after.style || before.highlight !== after.highlight) {
                    changes.push({ element: wrapper, before, after });
                }
            }
        }

        if (changes.length === 0) {
            // A grouped command that changed nothing (for example, every
            // target is already at the size limit) would otherwise be silent.
            if (commandOptions.silent) {
                showToast('Nothing to change');
            }
            return;
        }

        pushHistory({ changes });

        if (commandOptions.silent) {
            showToast(describeScope(command, resolved));
        }

        updateToolbarState();
    }

    /**
     * Dispatch a style command to its enhancement function.
     * @param {HTMLElement} element - Element to modify
     * @param {string} command - The enhancement command
     * @param {{silent?: boolean, scope?: string}} options
     */
    function applyCommand(element, command, options = {}) {
        switch (command) {
            case 'bold':
                toggleBold(element, options);
                break;
            case 'highlight':
                toggleHighlight(element, options);
                break;
            case 'sizeDown':
                adjustFontSize(element, -2, options);
                break;
            case 'sizeUp':
                adjustFontSize(element, 2, options);
                break;
            case 'fontStyle':
                toggleFontStyle(element, options);
                break;
            case 'spacing':
                adjustTextSpacing(element, options);
                break;
            case 'contrast':
                fixTextContrast(element, options);
                break;
        }
    }

    // ==================== ENHANCEMENT FUNCTIONS ====================

    /**
     * Toggle bold styling.
     * @param {HTMLElement} element - Element to modify
     * @param {{silent?: boolean, scope?: string, toggleOff?: boolean}} options
     */
    function toggleBold(element, options = {}) {
        const currentWeight = getComputedStyle(element).fontWeight;
        const isBold = options.toggleOff ??
            (currentWeight === 'bold' || parseInt(currentWeight, 10) >= 700);
        element.style.setProperty('font-weight', isBold ? 'normal' : 'bold', 'important');
        notify(options, isBold ? 'Text unbolded' : 'Text bolded');
    }

    /**
     * Toggle highlight background or outline.
     * @param {HTMLElement} element - Element to modify
     * @param {{silent?: boolean, scope?: string, toggleOff?: boolean}} options
     */
    function toggleHighlight(element, options = {}) {
        const mode = element.getAttribute(CONFIG.highlightAttr);
        const shouldRemove = options.toggleOff ?? (mode === 'background' || mode === 'outline');

        if (shouldRemove) {
            if (mode === 'background') {
                element.style.removeProperty('background-color');
                notify(options, 'Highlight removed');
            } else {
                element.style.removeProperty('outline');
                notify(options, 'Outline removed');
            }

            element.removeAttribute(CONFIG.highlightAttr);
            return;
        }

        // Part of a mixed selection that is being highlighted: keep the mode
        // it already has instead of stacking a background and an outline.
        if (mode) {
            notify(options, mode === 'background' ? 'Text highlighted' : 'Outline applied');
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
            notify(options, 'Outline applied');
        } else {
            element.style.setProperty('background-color', '#ffeb3b', 'important');
            element.setAttribute(CONFIG.highlightAttr, 'background');
            notify(options, 'Text highlighted');
        }
    }

    /**
     * Adjust font size.
     * @param {HTMLElement} element - Element to modify
     * @param {number} change - Size change amount
     * @param {{silent?: boolean, scope?: string}} options
     */
    function adjustFontSize(element, change, options = {}) {
        const currentSize = parseFloat(getComputedStyle(element).fontSize);
        const newSize = currentSize + change;

        if (newSize >= CONFIG.fontSizeMin && newSize <= CONFIG.fontSizeMax) {
            element.style.setProperty('font-size', `${newSize}px`, 'important');
            notify(options, `Font size: ${newSize}px`);
        } else {
            notify(options, `Size limit reached (${CONFIG.fontSizeMin}-${CONFIG.fontSizeMax}px)`);
        }
    }

    /**
     * Toggle font family.
     * @param {HTMLElement} element - Element to modify
     * @param {{silent?: boolean, scope?: string, toggleOff?: boolean}} options
     */
    function toggleFontStyle(element, options = {}) {
        const current = getComputedStyle(element).fontFamily.toLowerCase();
        const isSerif = options.toggleOff ??
            (current.includes('georgia') || (current.includes('serif') && !current.includes('sans-serif')));

        if (isSerif) {
            element.style.setProperty('font-family', 'Arial, sans-serif', 'important');
            notify(options, 'Font: Sans-serif');
        } else {
            element.style.setProperty('font-family', 'Georgia, serif', 'important');
            notify(options, 'Font: Serif');
        }
    }

    /**
     * Toggle text spacing.
     * @param {HTMLElement} element - Element to modify
     * @param {{silent?: boolean, scope?: string, toggleOff?: boolean}} options
     */
    function adjustTextSpacing(element, options = {}) {
        const isSpaced = options.toggleOff ??
            (element.style.getPropertyValue('letter-spacing') === '2px' &&
             element.style.getPropertyValue('word-spacing') === '4px');

        if (isSpaced) {
            element.style.removeProperty('letter-spacing');
            element.style.removeProperty('word-spacing');
            notify(options, 'Spacing reset');
        } else {
            element.style.setProperty('letter-spacing', '2px', 'important');
            element.style.setProperty('word-spacing', '4px', 'important');
            notify(options, 'Spacing increased');
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
     * @param {{silent?: boolean, scope?: string}} options
     */
    function fixTextContrast(element, options = {}) {
        const background = getEffectiveBackgroundColor(element);
        const black = { r: 0, g: 0, b: 0 };
        const white = { r: 255, g: 255, b: 255 };
        const useBlack = contrastRatio(background, black) >= contrastRatio(background, white);
        const newColor = useBlack ? '#000000' : '#ffffff';

        element.style.setProperty('color', newColor, 'important');
        notify(options, `Contrast fixed: ${useBlack ? 'Black' : 'White'} text`);
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
     * @param {{changes: Array<{element: HTMLElement, before: Object, after: Object}>}} entry
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
     * Restore one side of a history entry.
     * @param {{changes: Array<{element: HTMLElement, before: Object, after: Object}>}} entry
     * @param {'before'|'after'} side
     * @returns {number} Number of targets that were still on the page
     */
    function applyHistoryEntry(entry, side) {
        let applied = 0;

        for (const change of entry.changes) {
            // Pages that re-render can detach an element a change was applied
            // to. Restoring it would silently do nothing, so skip it.
            if (!change.element.isConnected) {
                continue;
            }

            restoreElementState(change.element, change[side]);
            applied++;
        }

        return applied;
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

        const applied = applyHistoryEntry(entry, 'before');
        updateToolbarState();

        if (applied === 0) {
            showToast('That change is no longer on the page');
        } else if (applied < entry.changes.length) {
            showToast('Undone (some targets were no longer on the page)');
        } else {
            showToast('Undone');
        }
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

        const applied = applyHistoryEntry(entry, 'after');
        updateToolbarState();

        if (applied === 0) {
            showToast('That change is no longer on the page');
        } else if (applied < entry.changes.length) {
            showToast('Redone (some targets were no longer on the page)');
        } else {
            showToast('Redone');
        }
    }

    /**
     * Update toolbar button states, the roving tab stop, and the announced
     * toggle state of every toggle command.
     */
    function updateToolbarState() {
        const toolbar = document.getElementById(CONFIG.toolbarId);
        if (!toolbar) {
            return;
        }

        const undoBtn = toolbar.querySelector('[data-command="undo"]');
        const redoBtn = toolbar.querySelector('[data-command="redo"]');
        const active = document.activeElement;
        const hadToolbarFocus = Boolean(active && toolbar.contains(active));

        if (undoBtn) {
            undoBtn.disabled = STATE.historyIndex < 0;
        }
        if (redoBtn) {
            redoBtn.disabled = STATE.historyIndex >= STATE.history.length - 1;
        }

        const states = getToggleStates();

        TOGGLE_COMMANDS.forEach((command) => {
            const button = toolbar.querySelector(`[data-command="${command}"]`);
            if (!button) {
                return;
            }

            const state = states[command];
            if (state === undefined) {
                button.removeAttribute('aria-pressed');
            } else {
                button.setAttribute('aria-pressed', String(state));
            }
        });

        syncToolbarTabStops(toolbar);

        // Disabling the focused button can drop focus to the page. Put it back
        // on a usable button so the keyboard user does not lose their place.
        if (hadToolbarFocus && !toolbar.contains(document.activeElement)) {
            const fallback = getToolbarButtons(toolbar)[0];
            if (fallback) {
                fallback.focus({ preventScroll: true });
            }
        }
    }

    /**
     * Read the current on/off state of every toggle command for the saved
     * selection. "mixed" means the selected text disagrees.
     * @returns {Record<string, boolean|'mixed'>}
     */
    function getToggleStates() {
        const range = STATE.savedRange;
        if (!range || !range.commonAncestorContainer.isConnected) {
            return {};
        }

        const textNodes = getSelectedTextNodes(range).filter(
            (node) => selectedSlice(range, node).trim()
        );
        const blocks = getBlocksForRange(range);
        const states = {};

        for (const command of TOGGLE_COMMANDS) {
            if (command === 'bold') {
                const selected = textNodes.map((node) => {
                    const element = node.parentElement;
                    if (!element) {
                        return false;
                    }
                    const weight = getComputedStyle(element).fontWeight;
                    return weight === 'bold' || parseInt(weight, 10) >= 700;
                });
                states.bold = combineStates(
                    selected.length > 0
                        ? selected
                        : blocks.map((block) => isCommandApplied(block, command))
                );
            } else if (command === 'highlight') {
                const selected = textNodes.map((node) => Boolean(
                    node.parentElement &&
                    node.parentElement.closest(`[${CONFIG.highlightAttr}]`)
                ));
                states.highlight = combineStates(
                    selected.length > 0
                        ? selected
                        : blocks.map((block) => isCommandApplied(block, command))
                );
            } else {
                states[command] = combineStates(
                    blocks.map((block) => isCommandApplied(block, command))
                );
            }
        }

        return states;
    }

    /**
     * Collapse per-target toggle states into one aria-pressed value.
     * @param {boolean[]} states
     * @returns {boolean|'mixed'|undefined}
     */
    function combineStates(states) {
        if (states.length === 0) {
            return undefined;
        }
        if (states.every(Boolean)) {
            return true;
        }
        if (states.every((state) => !state)) {
            return false;
        }
        return 'mixed';
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
            version: chrome.runtime.getManifest().version,
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
     * Handle commands relayed from the background worker. Manifest commands
     * cannot run inside a content script, so Focus Toolbar arrives as a
     * message.
     */
    function setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (!message || message.type !== 'focus-toolbar') {
                return false;
            }

            // Leave text entry alone: a global command should not pull focus
            // out of a field the user is typing in.
            if (!STATE.isExtensionEnabled ||
                isEditableTarget(document.activeElement)) {
                sendResponse({ handled: false });
                return false;
            }

            focusToolbarForSelection();
            sendResponse({ handled: true });
            return false;
        });
    }

    /**
     * Ask the background worker for the user's actual command bindings and
     * mirror the Focus Toolbar shortcut into the toolbar's ARIA hint.
     */
    function syncShortcutLabels() {
        try {
            chrome.runtime.sendMessage({ type: 'get-shortcuts' }, (response) => {
                if (chrome.runtime.lastError || !response || !response.shortcuts) {
                    return;
                }

                const focus = response.shortcuts['focus-toolbar'];
                if (!focus) {
                    return;
                }

                STATE.focusToolbarShortcut = focus.shortcut || '';
                STATE.focusToolbarAriaShortcut = focus.aria || '';

                const toolbar = document.getElementById(CONFIG.toolbarId);
                if (!toolbar) {
                    return;
                }

                if (STATE.focusToolbarAriaShortcut) {
                    toolbar.setAttribute(
                        'aria-keyshortcuts',
                        STATE.focusToolbarAriaShortcut
                    );
                } else {
                    toolbar.removeAttribute('aria-keyshortcuts');
                }
            });
        } catch (error) {
            // The extension was reloaded while this page kept the old content
            // script. The default shortcut hint is still usable.
        }
    }

    /**
     * Whether two ranges cover the same boundary points.
     * @param {Range} a
     * @param {Range} b
     * @returns {boolean}
     */
    function rangesMatch(a, b) {
        return a.startContainer === b.startContainer &&
               a.startOffset === b.startOffset &&
               a.endContainer === b.endContainer &&
               a.endOffset === b.endOffset;
    }

    /**
     * Handle selection changes.
     */
    function handleSelectionChange() {
        if (!STATE.isExtensionEnabled) {
            return;
        }

        // Wrapping a selection splits text nodes and temporarily collapses the
        // live selection. Ignore those changes until the range is restored.
        if (STATE.isApplyingCommand) {
            return;
        }

        // Ignore selection changes caused by interacting with the extension UI.
        const activeElement = document.activeElement;
        if (activeElement && activeElement.closest(`#${CONFIG.toolbarId}, #${CONFIG.settingsPanelId}`)) {
            return;
        }

        const selection = window.getSelection();
        const range = selection && selection.rangeCount > 0 && !selection.isCollapsed
            ? selection.getRangeAt(0)
            : null;

        // Ignore the echo from restoring the selection after wrapping, so the
        // toolbar is not torn down and re-animated on every command. This runs
        // before the pending-toolbar timer is cleared.
        if (range && STATE.savedRange && rangesMatch(range, STATE.savedRange)) {
            return;
        }

        if (STATE.toolbarTimeout) {
            clearTimeout(STATE.toolbarTimeout);
            STATE.toolbarTimeout = null;
        }

        if (!range || !range.toString().trim()) {
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
     * Whether an event target is a text-entry region where Alt+Shift+letter
     * should keep its native behaviour.
     * @param {EventTarget|null} target
     * @returns {boolean}
     */
    function isEditableTarget(target) {
        const element = target instanceof Element ? target : null;
        return Boolean(element && element.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
        ));
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

                // Let Escape reach the page while the user is editing text.
                if (document.getElementById(CONFIG.toolbarId) &&
                    !isEditableTarget(event.target)) {
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
            const editable = isEditableTarget(event.target);

            // Ctrl/Cmd + Z = Undo (only while the toolbar is visible, and only
            // when the extension has something to undo). This leaves native
            // text editing and page-level undo alone.
            if (modifier && !event.shiftKey && key === 'z') {
                if (!editable && STATE.historyIndex >= 0 &&
                    document.getElementById(CONFIG.toolbarId)) {
                    event.preventDefault();
                    undo();
                }
                return;
            }

            // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z = Redo.
            if (modifier && (key === 'y' || (event.shiftKey && key === 'z'))) {
                const canRedo = STATE.historyIndex < STATE.history.length - 1;

                if (!editable && canRedo &&
                    document.getElementById(CONFIG.toolbarId)) {
                    event.preventDefault();
                    redo();
                }
                return;
            }

            // Ctrl/Cmd + Shift + B is Chrome's bookmarks bar and Ctrl/Cmd +
            // Shift + H opens the home page on macOS, so those combinations
            // never reach the page. Use Alt/Option + Shift instead and match
            // the physical key so Option-modified characters on macOS still
            // work. Focus Toolbar is a manifest command handled by the
            // background worker, so it is not part of this handler.
            const altShift = event.altKey && event.shiftKey &&
                !event.ctrlKey && !event.metaKey;

            // Alt/Option + Shift + B = Bold.
            if (altShift && !editable &&
                (event.code === 'KeyB' || key === 'b') && STATE.savedRange) {
                event.preventDefault();
                enhanceSelection('bold');
                return;
            }

            // Alt/Option + Shift + H = Highlight.
            if (altShift && !editable &&
                (event.code === 'KeyH' || key === 'h') && STATE.savedRange) {
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
