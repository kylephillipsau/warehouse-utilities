import { patchAdjust } from '../lib/store.svelte.js';
import { ZOOM_MIN, ZOOM_MAX } from '../lib/adjust.js';

// Inline crop: scrolling the wheel over the image zooms it in/out, writing
// adjust.zoom through the same store path the dialog slider uses. preventDefault
// stops the page from scrolling while the pointer is over the image.
export function zoomImage(node, params) {
    let { id, getAdjust } = params;

    const onWheel = (event) => {
        event.preventDefault();
        const current = getAdjust().zoom || 1;
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current - event.deltaY * 0.002));
        patchAdjust(id, { zoom: next });
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return {
        update(p) { id = p.id; getAdjust = p.getAdjust; },
        destroy() { node.removeEventListener('wheel', onWheel); },
    };
}
