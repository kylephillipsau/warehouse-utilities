<script>
    // Renders a template label: a vertical stack of text fields, each in its own
    // band sized by the field's weight. Editable bands use the editableField
    // action (which owns textContent so the caret is never clobbered and tokens
    // swap raw↔resolved on focus/blur); static bands (preview/print) just show
    // the resolved text and auto-fit it. Used by Label.svelte and FieldsDialog.
    import { store, patchField } from '../lib/store.svelte.js';
    import { fieldStyle } from '../lib/fields.js';
    import { resolveTemplate } from '../lib/tokens.js';
    import { editableField } from '../actions/editableField.js';
    import { fitText } from '../actions/fitText.js';

    let { label, editable = false } = $props();

    // Re-fit trigger on any page/size/orientation change (bands resize too, but
    // this covers content-independent geometry changes).
    const fitKey = $derived(
        `${store.page.preset}|${store.page.width}|${store.page.height}|` +
        `${store.divisions}|${store.margin}|${store.gap}|${store.orientation}`
    );
</script>

<div class="fields-stack">
    {#each label.fields as field (field.id)}
        <div class="field-band" style={fieldStyle(field)}>
            {#if editable}
                <!-- child left empty on purpose: editableField owns the content so
                     Svelte never reactively overwrites it while you type -->
                <span
                    class="text"
                    role="textbox"
                    aria-label="Field text"
                    aria-multiline="false"
                    contenteditable="true"
                    use:editableField={{
                        value: field.value,
                        resolve: resolveTemplate,
                        onInput: (t) => patchField(label.id, field.id, { value: t }),
                        fitKey,
                    }}
                ></span>
            {:else}
                <span class="text" use:fitText={`${resolveTemplate(field.value)}|${fitKey}`}>{resolveTemplate(field.value)}</span>
            {/if}
        </div>
    {/each}
</div>
