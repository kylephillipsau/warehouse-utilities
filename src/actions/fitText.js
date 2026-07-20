import { resizeText } from '../lib/textfit.js';

// Grow the label text to the largest size that fits its box. Re-fits when the
// bound dependency changes (text edits) and whenever the surrounding box
// resizes (size preset, orientation, image split, add/remove image) via a
// ResizeObserver on the parent. Replaces the old imperative updateLabels loop.
export function fitText(node) {
    const fit = () => resizeText({ element: node, step: 0.5 });
    // Coalesce bursts of resize/observe callbacks into a single fit per frame.
    let raf = 0;
    const schedule = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(fit);
    };

    let ro;
    const parent = node.parentNode;
    schedule();
    if (parent && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(schedule);
        ro.observe(parent);
    }

    return {
        update() { schedule(); },
        destroy() { cancelAnimationFrame(raf); if (ro) { ro.disconnect(); } },
    };
}
