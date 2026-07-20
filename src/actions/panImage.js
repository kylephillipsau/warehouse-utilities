import { patchAdjust } from '../lib/store.svelte.js';

// Inline drag-to-reposition. Dragging the image nudges object-position the
// opposite way (grab-and-move feel); a click that doesn't move fires onClick
// (used to open the full Adjust dialog). Percentages are relative to the frame.
export function panImage(node, params) {
    let { id, getAdjust, onClick } = params;
    const CLICK_SLOP = 4; // px of movement below which it counts as a click

    const onPointerDown = (event) => {
        event.preventDefault();
        const frame = node.parentNode;
        const rect = frame.getBoundingClientRect();
        const a = getAdjust();
        const startX = event.clientX, startY = event.clientY;
        const baseX = a.posX, baseY = a.posY;
        let moved = 0;
        node.setPointerCapture(event.pointerId);

        const move = (ev) => {
            const dx = (ev.clientX - startX);
            const dy = (ev.clientY - startY);
            moved = Math.max(moved, Math.abs(dx), Math.abs(dy));
            patchAdjust(id, {
                posX: Math.min(100, Math.max(0, baseX - dx / rect.width * 100)),
                posY: Math.min(100, Math.max(0, baseY - dy / rect.height * 100)),
            });
        };
        const up = () => {
            node.releasePointerCapture(event.pointerId);
            node.removeEventListener('pointermove', move);
            node.removeEventListener('pointerup', up);
            if (moved <= CLICK_SLOP && onClick) { onClick(); }
        };
        node.addEventListener('pointermove', move);
        node.addEventListener('pointerup', up);
    };

    node.addEventListener('pointerdown', onPointerDown);
    return {
        update(p) { id = p.id; getAdjust = p.getAdjust; onClick = p.onClick; },
        destroy() { node.removeEventListener('pointerdown', onPointerDown); },
    };
}
