// Grow an element's font size to the largest that still fits its parent box.
// Uses a binary search over the size range (O(log n) reflows) — the fit is
// monotonic (a larger font never fits a box a smaller one overflowed), so this
// matches the old linear scan's result in ~10 measurements instead of hundreds.
export const resizeText = ({ element, elements, minSize = 10, maxSize = 512, step = 1, unit = 'px' }) => {
    (elements || [element]).forEach((el) => {
        if (!el) { return; }
        const parent = el.parentNode;
        if (!parent) { return; }

        // If even the minimum overflows, use the minimum.
        el.style.fontSize = `${minSize}${unit}`;
        if (isOverflown(parent)) { return; }

        let lo = minSize;   // known to fit
        let hi = maxSize;   // may or may not fit
        let best = minSize;
        while (hi - lo > step) {
            const mid = (lo + hi) / 2;
            el.style.fontSize = `${mid}${unit}`;
            if (isOverflown(parent)) { hi = mid; }
            else { best = mid; lo = mid; }
        }
        el.style.fontSize = `${best}${unit}`;
    });
};

export const isOverflown = ({ clientWidth, clientHeight, scrollWidth, scrollHeight }) =>
    (scrollWidth > clientWidth) || (scrollHeight > clientHeight);
