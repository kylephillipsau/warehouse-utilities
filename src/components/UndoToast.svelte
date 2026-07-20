<script>
    import { undo, undoDelete, clearUndo } from '../lib/store.svelte.js';

    let timer;
    $effect(() => {
        if (undo.items.length > 0) {
            clearTimeout(timer);
            timer = setTimeout(() => clearUndo(), 6000);
        }
        return () => clearTimeout(timer);
    });
</script>

<div id="undo-toast" class:visible={undo.items.length > 0} role="status">
    <span>Label deleted</span>
    <button id="undo-button" class="btn" onclick={undoDelete}>Undo</button>
</div>
