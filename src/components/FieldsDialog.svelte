<script>
    // The template / fields editor: a live resolved preview on top, then one row
    // per field (reorder, delete, value, size, align, bold) and a token inserter.
    // Structural edits live here so the tiny on-canvas label stays a quick-tweak
    // surface. Modeled on AdjustDialog.
    import { ui, closeFields } from '../lib/ui.svelte.js';
    import { store, addField, removeField, moveField, patchField } from '../lib/store.svelte.js';
    import { SIZE_OPTIONS, ALIGN_OPTIONS } from '../lib/fields.js';
    import { TOKEN_PRESETS } from '../lib/tokens.js';
    import { dialogSync } from '../actions/dialogSync.js';
    import FieldsLabel from './FieldsLabel.svelte';

    let dlg;
    let previewW = $state(320);
    let previewH = $state(120);
    let lastId = null;

    // Which field input has the caret, and where — so "Insert token" drops the
    // token exactly where you were typing.
    let active = $state({ id: null, start: 0, end: 0 });
    const inputs = {};

    const label = $derived(store.labels.find((l) => l.id === ui.fieldsTargetId));
    const open = $derived(ui.fieldsTargetId != null);

    let tokenOpen = $state(false);
    let tokenEl;
    $effect(() => {
        if (!tokenOpen) { return; }
        const onDoc = (e) => { if (tokenEl && !tokenEl.contains(e.target)) { tokenOpen = false; } };
        document.addEventListener('pointerdown', onDoc, true);
        return () => document.removeEventListener('pointerdown', onDoc, true);
    });

    // Size the preview to the label's real aspect when the dialog opens.
    $effect(() => {
        const id = ui.fieldsTargetId;
        if (id === lastId) { return; }
        lastId = id;
        if (id == null) { return; }
        const el = document.querySelector(`[data-id="${id}"]`);
        const rect = el ? el.getBoundingClientRect() : null;
        const aspect = rect && rect.width && rect.height ? rect.width / rect.height : 100 / 40;
        const avail = (window.innerWidth || 360) - 32 - 40;
        const maxW = Math.min(360, avail), maxH = 220;
        let w = maxW, h = w / aspect;
        if (h > maxH) { h = maxH; w = h * aspect; }
        previewW = Math.round(w);
        previewH = Math.round(h);
    });

    function trackCaret(field, el) {
        active = { id: field.id, start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length };
    }
    function onFieldInput(field, event) {
        patchField(label.id, field.id, { value: event.target.value });
        trackCaret(field, event.target);
    }
    function insertToken(token) {
        const f = label && label.fields && label.fields.find((x) => x.id === active.id);
        const target = f || (label && label.fields && label.fields[label.fields.length - 1]);
        if (!target) { return; }
        const v = target.value || '';
        const start = f ? active.start : v.length;
        const end = f ? active.end : v.length;
        const nv = v.slice(0, start) + token + v.slice(end);
        patchField(label.id, target.id, { value: nv });
        tokenOpen = false;
        // restore focus + caret just after the inserted token
        const el = inputs[target.id];
        if (el) {
            queueMicrotask(() => {
                el.focus();
                const pos = start + token.length;
                el.setSelectionRange(pos, pos);
                active = { id: target.id, start: pos, end: pos };
            });
        }
    }

    function onDialogClick(event) { if (event.target === dlg) { closeFields(); } }
</script>

<dialog id="fields-dialog" class="dialog dialog-wide" aria-labelledby="fields-title" bind:this={dlg} use:dialogSync={open} onclose={closeFields} onclick={onDialogClick}>
    <div class="flex flex-col gap-[0.85rem] p-5">
        <span class="group-label" id="fields-title">Label fields</span>

        {#if label && label.fields}
            <div class="flex justify-center rounded-lg border-2 border-ink/15 bg-sage/30 p-4">
                <div class="text-container" style="width:{previewW}px;height:{previewH}px">
                    <FieldsLabel {label} />
                </div>
            </div>

            <div class="flex flex-col gap-3">
                {#each label.fields as field, i (field.id)}
                    <div class="flex flex-col gap-2 rounded-lg border-2 border-ink/15 p-3">
                        <div class="flex items-center gap-2">
                            <input
                                type="text"
                                class="min-w-0 flex-1"
                                aria-label={`Field ${i + 1} text`}
                                placeholder="Field text — use the token menu for dates"
                                value={field.value}
                                bind:this={inputs[field.id]}
                                oninput={(e) => onFieldInput(field, e)}
                                onkeyup={(e) => trackCaret(field, e.target)}
                                onclick={(e) => trackCaret(field, e.target)}
                                onfocus={(e) => trackCaret(field, e.target)}
                            />
                            <button type="button" class="label-tool shrink-0" title="Move up" aria-label="Move field up" disabled={i === 0} onclick={() => moveField(label.id, field.id, -1)}>&uarr;</button>
                            <button type="button" class="label-tool shrink-0" title="Move down" aria-label="Move field down" disabled={i === label.fields.length - 1} onclick={() => moveField(label.id, field.id, 1)}>&darr;</button>
                            <button type="button" class="label-tool shrink-0 text-orange" title="Remove field" aria-label="Remove field" onclick={() => removeField(label.id, field.id)}>&times;</button>
                        </div>
                        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.85rem]">
                            <div class="flex items-center gap-1" role="group" aria-label={`Field ${i + 1} size`}>
                                <span class="group-label mr-1">Size</span>
                                {#each SIZE_OPTIONS as opt}
                                    <button type="button" class="btn px-[0.6rem] py-[0.25rem]" class:btn-active={field.size === opt.value} aria-pressed={field.size === opt.value} onclick={() => patchField(label.id, field.id, { size: opt.value })}>{opt.label}</button>
                                {/each}
                            </div>
                            <div class="flex items-center gap-1" role="group" aria-label={`Field ${i + 1} alignment`}>
                                <span class="group-label mr-1">Align</span>
                                {#each ALIGN_OPTIONS as opt}
                                    <button type="button" class="btn px-[0.6rem] py-[0.25rem]" class:btn-active={field.align === opt.value} aria-pressed={field.align === opt.value} onclick={() => patchField(label.id, field.id, { align: opt.value })}>{opt.label}</button>
                                {/each}
                            </div>
                            <button type="button" class="btn px-[0.6rem] py-[0.25rem]" class:btn-active={field.bold} aria-pressed={field.bold} onclick={() => patchField(label.id, field.id, { bold: !field.bold })}>Bold</button>
                        </div>
                    </div>
                {/each}
            </div>

            <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="btn" id="add-field" onclick={() => addField(label.id)}>+ Add field</button>
                <div class="relative" bind:this={tokenEl}>
                    <button type="button" class="btn" id="insert-token" aria-haspopup="menu" aria-expanded={tokenOpen} onclick={() => (tokenOpen = !tokenOpen)}>Insert token &#9662;</button>
                    {#if tokenOpen}
                        <div class="absolute left-0 top-[calc(100%+6px)] z-[70] w-max min-w-[13rem] rounded-lg border-2 border-ink bg-paper p-1 shadow-popover" role="menu">
                            {#each TOKEN_PRESETS as t}
                                <button type="button" role="menuitem" class="block w-full whitespace-nowrap rounded px-3 py-2 text-left text-[0.9rem] text-ink hover:bg-ink/[0.08]" onclick={() => insertToken(t.token)}>{t.label}</button>
                            {/each}
                        </div>
                    {/if}
                </div>
                <span class="flex-1"></span>
                <button type="button" class="btn btn-primary" id="fields-done" onclick={closeFields}>Done</button>
            </div>
        {/if}
    </div>
</dialog>
