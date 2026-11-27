// Filter settings controls by their visible labels and help text.
//
// Shared by the in-page dialog and the options page so both surfaces behave
// the same way. Filtering only hides controls; it never reads or writes a
// saved setting.

const HIDDEN_ATTR = 'data-atx-search-hidden';

/**
 * Normalize text for a case-insensitive, whitespace-insensitive match.
 * @param {string} value
 * @returns {string}
 */
function normalize(value) {
    return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * @param {HTMLElement} element
 * @param {boolean} hidden
 */
function setHidden(element, hidden) {
    if (hidden) {
        element.setAttribute(HIDDEN_ATTR, '');
    } else {
        element.removeAttribute(HIDDEN_ATTR);
    }
}

/**
 * Wire a search field to a list of setting cards.
 * @param {{root: ParentNode, input: HTMLInputElement,
 *     clear: HTMLButtonElement, status: HTMLElement,
 *     itemSelector: string, fieldSelector: string,
 *     headingSelector: string}} options
 * @returns {{refresh: () => void, clear: () => void}}
 */
export function initSettingsSearch(options) {
    const { root, input, clear, status, itemSelector, fieldSelector, headingSelector } = options;

    if (!input) {
        return { refresh: () => {}, clear: () => {} };
    }

    const items = Array.from(root.querySelectorAll(itemSelector));

    /**
     * Fields that are currently visible enough to be searched. A field in a
     * collapsed group (such as custom spacing before the Custom preset is
     * chosen) is not a useful result because the user cannot see it.
     * @param {HTMLElement} item
     * @returns {HTMLElement[]}
     */
    const searchableFields = (item) => Array.from(
        item.querySelectorAll(fieldSelector)
    ).filter((field) => !field.parentElement?.closest('[hidden]'));

    const apply = () => {
        const query = normalize(input.value);
        if (clear) {
            clear.hidden = query.length === 0;
        }
        let matches = 0;

        for (const item of items) {
            const fields = searchableFields(item);
            const heading = item.querySelector(headingSelector);
            const headingMatches = Boolean(
                query && heading && normalize(heading.textContent).includes(query)
            );

            if (!query) {
                setHidden(item, false);
                Array.from(item.querySelectorAll(fieldSelector))
                    .forEach((field) => setHidden(field, false));
                matches++;
                continue;
            }

            let visibleFields = 0;
            for (const field of fields) {
                const fieldMatches = headingMatches ||
                    normalize(field.textContent).includes(query);
                setHidden(field, !fieldMatches);
                if (fieldMatches) {
                    visibleFields++;
                }
            }

            let itemMatches = headingMatches || visibleFields > 0;

            // Help text, buttons, and empty states live outside a field. If
            // they match, keep the whole card so the result has context.
            if (!itemMatches && normalize(item.textContent).includes(query)) {
                itemMatches = true;
                fields.forEach((field) => setHidden(field, false));
            }

            setHidden(item, !itemMatches);
            if (itemMatches) {
                matches++;
            }
        }

        if (!query) {
            status.textContent = '';
        } else if (matches === 0) {
            status.textContent = 'No settings match';
        } else {
            status.textContent = matches === 1
                ? '1 setting matches'
                : `${matches} settings match`;
        }
    };

    const clearSearch = () => {
        input.value = '';
        apply();
        input.focus();
    };

    input.addEventListener('input', apply);
    clear.addEventListener('click', clearSearch);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && input.value) {
            // Clear the filter without closing the whole settings dialog.
            event.preventDefault();
            event.stopPropagation();
            clearSearch();
        }
    });

    apply();

    return {
        refresh: apply,
        clear: clearSearch
    };
}
