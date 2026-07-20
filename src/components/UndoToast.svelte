<script>
    import { undo, undoDelete, clearUndo } from '../lib/store.svelte.js';

    const visible = $derived(undo.items.length > 0);

    let timer;
    $effect(() => {
        if (undo.items.length > 0) {
            clearTimeout(timer);
            timer = setTimeout(() => clearUndo(), 6000);
        }
        return () => clearTimeout(timer);
    });
</script>

<div
    id="undo-toast"
    class="fixed left-1/2 bottom-5 -translate-x-1/2 z-30 flex items-center gap-3
           bg-ink text-paper pl-4 pr-3 py-[0.6rem] rounded-lg
           transition-[opacity,transform] duration-150"
    class:opacity-0={!visible}
    class:translate-y-2={!visible}
    class:pointer-events-none={!visible}
    style="box-shadow: 0 6px 18px rgba(45, 58, 46, 0.4)"
    role="status"
>
    <span>Label deleted</span>
    <button
        id="undo-button"
        class="btn !bg-transparent !text-amber !border-amber hover:!bg-amber/15 px-[0.7rem] py-1"
        onclick={undoDelete}
    >Undo</button>
</div>
