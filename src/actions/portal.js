// Move a node to <body> so it escapes every ancestor's clipping.
//
// position:fixed is normally enough on its own, and it used to be: a popup
// inside a label had to escape .text-container's overflow:hidden, and fixed
// did that. It stops being enough as soon as an ancestor is TRANSFORMED. A
// transformed element becomes the containing block for its fixed-position
// descendants, which puts them back inside the ancestor's clip chain, so the
// popup gets cut off at the label's edge again. The sheet carries a transform
// whenever artwork rotation is on (see .page-frame and .label-rotate), and so
// does the artwork layer the label tools sit in, so any popup opened from a
// label needs this.
//
// Placement is unaffected: getBoundingClientRect reports true viewport
// coordinates through transforms, so a popup positioned from a trigger's rect
// still lands on the trigger.
export function portal(node) {
    document.body.appendChild(node);
    return {
        destroy() { node.remove(); },
    };
}
