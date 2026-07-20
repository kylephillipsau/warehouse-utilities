// Grow an element's font size to the largest that still fits its parent box.
// Ported verbatim from the original label maker so the fitting behaviour is
// unchanged; used by the fitText Svelte action.
export const resizeText = ({ element, elements, minSize = 10, maxSize = 512, step = 1, unit = 'px' }) => {
    (elements || [element]).forEach((el) => {
        if (!el) { return; }
        let i = minSize;
        let overflow = false;
        const parent = el.parentNode;
        while (!overflow && i < maxSize) {
            el.style.fontSize = `${i}${unit}`;
            overflow = isOverflown(parent);
            if (!overflow) i += step;
        }
        el.style.fontSize = `${i - step}${unit}`;
    });
};

export const isOverflown = ({ clientWidth, clientHeight, scrollWidth, scrollHeight }) =>
    (scrollWidth > clientWidth) || (scrollHeight > clientHeight);
