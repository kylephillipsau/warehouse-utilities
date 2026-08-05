import { moveLabel } from '../lib/store.svelte.js';
import { insertionIndex } from '../lib/size.js';

// Reorder a label by dragging its handle (mouse or touch). Ported from the old
// startLabelDrag, but instead of moving DOM nodes it moves the item in the
// store; the keyed {#each} then re-renders the list in the new order.
export function draggable(node, params) {
    let id = params.id;

    const onPointerDown = (startEvent) => {
        if (startEvent.button && startEvent.button !== 0) { return; } // primary button / touch only
        startEvent.preventDefault();
        const li = node.closest('.text-container');
        // Reorder across the whole sheet (segments span multiple media pages)
        const list = li && li.closest('#labelList');
        if (!list) { return; }
        li.classList.add('dragging');

        const move = (ev) => {
            const siblings = [...list.querySelectorAll('.text-container')];
            // insertionIndex measures along the axis the labels run on screen,
            // which is horizontal at artwork rotation 90 (the sheet is turned). It can
            // return one past the end; a MOVE target is an existing position.
            const target = Math.min(insertionIndex(siblings, ev), siblings.length - 1);
            moveLabel(id, target);
        };
        const stop = () => {
            li.classList.remove('dragging');
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', stop);
            document.removeEventListener('pointercancel', stop);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', stop);
        document.addEventListener('pointercancel', stop);
    };

    node.addEventListener('pointerdown', onPointerDown);
    return {
        update(p) { id = p.id; },
        destroy() { node.removeEventListener('pointerdown', onPointerDown); },
    };
}
