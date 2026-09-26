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
// space, and a line breaks ONLY at whitespace. A hyphen is not a break: on a
// warehouse label it sits inside a code (A-01-03, SKU-12345), and a code split
// across lines reads as two codes. A single word wider than maxW gets its own
// overflowing line; callers shrink the font instead. The screen is held to the
// same rule by glueHyphens, since CSS would otherwise break after the hyphen.
export function wrapLines(measure, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    if (words.length === 0) { return ['']; }
    const lines = [];
    let cur = '';
    for (const word of words) {
        const test = cur ? cur + ' ' + word : word;
        if (!cur || measure(test) <= maxW) { cur = test; }
        else { lines.push(cur); cur = word; }
    }
    if (cur) { lines.push(cur); }
    return lines;
}

// CSS has no property that stops a line breaking after a hyphen, so the screen
// renders text with a WORD JOINER (U+2060, zero width, prohibits a break on
// either side) after every hyphen that has a character after it. This is a DISPLAY
// form only: it is written into the DOM, never into the store, and anything
// read back out of an edited element goes through unglue first.
const WORD_JOINER = '⁠';
export const glueHyphens = (text) => String(text ?? '').replace(/-(?=\S)/g, '-' + WORD_JOINER);
export const unglue = (text) => String(text ?? '').replaceAll(WORD_JOINER, '');

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
