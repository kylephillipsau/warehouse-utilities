// Keep a native <dialog> in step with a reactive `open` boolean: showModal when
// it becomes true, close when false. The component still handles the element's
// `close` event (Esc / backdrop) to push state back the other way.
export function dialogSync(node, open) {
    const sync = (o) => {
        if (o && !node.open) { node.showModal(); }
        else if (!o && node.open) { node.close(); }
    };
    sync(open);
    return { update: sync };
}
