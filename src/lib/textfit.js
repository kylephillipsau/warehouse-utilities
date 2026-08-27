// Text fitting shared by both renderers. The screen (this module's resizeText)
// and the ZPL canvas (zpl.js) each grow a label's text to the largest font that
// fits its box, so they must agree on how a run of text becomes lines and how
// tall a line is — otherwise the preview and the printed label choose different
// sizes for the same field. The constants and the wrapper live here, and zpl.js
// imports them, so neither renderer holds its own opinion.

// Height of a line as a multiple of the font size. resizeText sets it inline on
// every element it fits (the page default of 1.5 made screen fits ~30% shorter
// than print, which measures with this factor).
export const LINE_HEIGHT = 1.15;

// Horizontal inset of a fitted text's box, in millimetres. The stylesheet pads
// field bands `0 1mm` (see .field-band in app.css); the ZPL canvas insets by
// the same physical distance (dots-per-mm × PAD_MM). Horizontal only — bands
// have no vertical padding, so neither renderer reserves any.
export const PAD_MM = 1;

// Wrap text into lines no wider than maxW, measured by `measure` (string →
// width, e.g. bound ctx.measureText). Runs of whitespace collapse to a single
// space, and a line may break at whitespace or after a hyphen that follows a
// letter or digit — the break opportunities CSS uses for this app's text, so
// the canvas breaks exactly where the screen does. A single segment wider than
// maxW gets its own overflowing line; callers shrink the font instead.
export function wrapLines(measure, text, maxW) {
    const segments = String(text)
        .split(/\s+/)
        .filter(Boolean)
        .flatMap((word, w) =>
            word.split(/(?<=\w-)(?=.)/).map((part, p) => ({ part, space: p === 0 && w > 0 })));
    if (segments.length === 0) { return ['']; }
    const lines = [];
    let cur = '';
    for (const { part, space } of segments) {
        const test = cur ? cur + (space ? ' ' : '') + part : part;
        if (!cur || measure(test) <= maxW) { cur = test; }
        else { lines.push(cur); cur = part; }
    }
    if (cur) { lines.push(cur); }
    return lines;
}

// Grow an element's font size to the largest that still fits its parent box.
// Uses a binary search over the size range (O(log n) reflows) — the fit is
// monotonic (a larger font never fits a box a smaller one overflowed), so this
// matches the old linear scan's result in ~10 measurements instead of hundreds.
export const resizeText = ({ element, elements, minSize = 10, maxSize = 512, step = 1, unit = 'px' }) => {
    (elements || [element]).forEach((el) => {
        if (!el) { return; }
        const parent = el.parentNode;
        if (!parent) { return; }

        el.style.lineHeight = String(LINE_HEIGHT);

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
