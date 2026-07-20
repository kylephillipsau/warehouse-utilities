<script>
    import { store } from '../lib/store.svelte.js';
    import { tiling } from '../lib/size.js';
    import Label from './Label.svelte';

    // The page divides into N labels; that's how many fit per media page
    const perPage = $derived(tiling(store.divisions).perPage);

    // Flow the labels across as many media pages as needed (at least one page so
    // the media is always visible on screen).
    const pages = $derived.by(() => {
        const per = perPage;
        const out = [];
        for (let i = 0; i < store.labels.length; i += per) {
            out.push(store.labels.slice(i, i + per));
        }
        if (out.length === 0) { out.push([]); }
        return out;
    });
</script>

<main id="labels-section">
    <div id="labelList" class="printable">
        {#each pages as page, pi (pi)}
            <ul class="print-page">
                {#each page as label (label.id)}
                    <Label {label} />
                {/each}
            </ul>
        {/each}
    </div>
</main>
