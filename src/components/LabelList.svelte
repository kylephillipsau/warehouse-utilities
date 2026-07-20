<script>
    import { store } from '../lib/store.svelte.js';
    import Label from './Label.svelte';
</script>

<main id="labels-section">
    <ul id="labelList" class="printable">
        {#each store.labels as label (label.id)}
            <Label {label} />
        {/each}
    </ul>
</main>
