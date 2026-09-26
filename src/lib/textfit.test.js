// Pins the fitting contract both renderers share: where lines may break, and
// the constants that make a line the same height and a box the same width on
// screen and on paper. Runs under `node --test` (npm test) with no DOM — the
// width measure is injected, so a character-count stand-in exercises the same
// paths ctx.measureText does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapLines, glueHyphens, unglue, LINE_HEIGHT, PAD_MM } from './textfit.js';

// One character = one unit of width.
const measure = (s) => s.length;

test('shared constants hold the values the stylesheet pairs with', () => {
    assert.equal(LINE_HEIGHT, 1.15);   // resizeText sets it inline; zpl.js fitText measures with it
    assert.equal(PAD_MM, 1);           // .field-band pads `0 1mm`; zpl.js insets dpmm × PAD_MM
});

test('text that fits stays on one line', () => {
    assert.deepEqual(wrapLines(measure, 'QTY 48', 6), ['QTY 48']);
    assert.deepEqual(wrapLines(measure, 'SKU-12345', 9), ['SKU-12345']);
});

test('breaks at whitespace, greedily filling each line', () => {
    assert.deepEqual(wrapLines(measure, 'QTY 48', 5), ['QTY', '48']);
    assert.deepEqual(wrapLines(measure, 'PALLET 12 OF 30', 9), ['PALLET 12', 'OF 30']);
});

test('never breaks at a hyphen: a code stays whole and overflows instead', () => {
    // "A-01-" over "03" reads as two codes; the fitter shrinks the font instead.
    assert.deepEqual(wrapLines(measure, 'SKU-12345', 8), ['SKU-12345']);
    assert.deepEqual(wrapLines(measure, 'PALLET A-01-03', 7), ['PALLET', 'A-01-03']);
    assert.deepEqual(wrapLines(measure, 'A-B-C', 2), ['A-B-C']);
});

test('the display form glues every hyphen to what follows, and unglues exactly', () => {
    assert.equal(glueHyphens('A-01-03'), 'A-⁠01-⁠03');
    assert.equal(glueHyphens('ABC- X -5'), 'ABC- X -⁠5');   // nothing to join before a space or the end
    assert.equal(glueHyphens(''), '');
    for (const s of ['A-01-03', 'SKU-12345 OF 3', '--', '- x']) { assert.equal(unglue(glueHyphens(s)), s); }
});

test('a segment wider than the box gets its own overflowing line', () => {
    // The fitter responds by shrinking the font, never by breaking mid-word.
    assert.deepEqual(wrapLines(measure, '123456789', 4), ['123456789']);
    assert.deepEqual(wrapLines(measure, 'X 123456789 Y', 4), ['X', '123456789', 'Y']);
});

test('whitespace collapses; a break swallows the space it lands on', () => {
    assert.deepEqual(wrapLines(measure, '  A   B  ', 3), ['A B']);
    assert.deepEqual(wrapLines(measure, 'AA  BB', 2), ['AA', 'BB']);
});

test('empty and blank text produce one empty line', () => {
    assert.deepEqual(wrapLines(measure, '', 10), ['']);
    assert.deepEqual(wrapLines(measure, '   ', 10), ['']);
});
