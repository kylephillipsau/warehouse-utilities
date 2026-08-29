// Pins the geometry rules a print head imposes on paper. size.js has no imports
// and no DOM, so this runs under `node --test` (npm test) directly. The rules it
// covers are the ones a new output backend gets wrong by omission: the head
// limit now arrives as a parameter from the registry (output.deviceFor), and a
// page turned the long way round is the case that limit exists to catch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePage, resolveLabel, resolveContent, exceedsPrintWidth } from './size.js';

const page = (preset, orientation = 'portrait') => ({ preset, width: '', height: '', unit: 'mm', orientation });

test('media orientation swaps the page, and only the page', () => {
    assert.deepEqual(resolvePage(page('a4')), { width: 210, height: 297 });
    assert.deepEqual(resolvePage(page('a4', 'landscape')), { width: 297, height: 210 });
});

test('a device with no head has no width it cannot print', () => {
    // An A4 sheet is legitimately 210 mm wide; null is how a sheet printer says so.
    assert.equal(exceedsPrintWidth(page('a4'), null), false);
    assert.equal(exceedsPrintWidth(page('a4', 'landscape'), null), false);
});

test('a fixed head clips anything wider than itself', () => {
    assert.equal(exceedsPrintWidth(page('a4'), 104), true);           // 210 across a 4-inch head
    assert.equal(exceedsPrintWidth(page('zebra-4x6'), 104), false);   // 101.6 fits
    assert.equal(exceedsPrintWidth(page('zebra-104x76'), 104), false); // exactly the head is not over it
});

test('turning roll stock is what the head limit exists to catch', () => {
    // 4×6 fed the long way round presents 152.4 mm to a 104 mm head. Nothing
    // stops this geometrically, which is why the device declares mediaTurns
    // false and output.effectivePage resolves the page back before it is drawn.
    assert.equal(exceedsPrintWidth(page('zebra-4x6', 'landscape'), 104), true);
});

test('labels divide down the feed, spanning the full media width', () => {
    const l = resolveLabel(page('zebra-4x6'), 5, 0, 0);
    assert.equal(l.width, 101.6);     // the whole width, always
    assert.equal(l.height, 30.48);    // 152.4 / 5
});

test('margin and gap come out of the feed direction before dividing', () => {
    // 152.4 − 2×5 margin − 3×2 gap = 136.4, over 4 labels
    const l = resolveLabel(page('zebra-4x6'), 4, 5, 2);
    assert.equal(l.width, 91.6);      // 101.6 − 2×5
    assert.equal(l.height, 34.1);
});

test('artwork rotation swaps the design surface and nothing else', () => {
    const spec = [page('zebra-4x6'), 5, 0, 0];
    const label = resolveLabel(...spec);
    assert.deepEqual(resolveContent(...spec, 0), label);
    assert.deepEqual(resolveContent(...spec, 90), { width: label.height, height: label.width });
});
