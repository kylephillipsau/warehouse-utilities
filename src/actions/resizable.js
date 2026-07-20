import { patchAdjust } from '../lib/store.svelte.js';

// Inline resize of the beside-mode image column. Dragging the handle on the
// image/text boundary sets adjust.split (percentage of the label width the
// image occupies). Honours the image side so the handle always tracks the
// pointer intuitively.
export function resizable(node, params) {
    let { id, getSide } = params;

    const onPointerDown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const content = node.closest('.label-content');
        if (!content) { return; }
        const rect = content.getBoundingClientRect();
        node.setPointerCapture(event.pointerId);

        const move = (ev) => {
            let pct = (ev.clientX - rect.left) / rect.width * 100;
            if (getSide() === 'right') { pct = 100 - pct; }
            patchAdjust(id, { split: Math.min(85, Math.max(15, pct)) });
        };
        const up = () => {
            node.releasePointerCapture(event.pointerId);
            node.removeEventListener('pointermove', move);
            node.removeEventListener('pointerup', up);
        };
        node.addEventListener('pointermove', move);
        node.addEventListener('pointerup', up);
    };

    node.addEventListener('pointerdown', onPointerDown);
    return {
        update(p) { id = p.id; getSide = p.getSide; },
        destroy() { node.removeEventListener('pointerdown', onPointerDown); },
    };
}
