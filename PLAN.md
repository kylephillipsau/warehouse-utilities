# Warehouse Utilities: Landing Page Redesign & Product Roadmap

## Where things stand

The site is fully static (`public/`, no build step), and that's a strength worth
keeping. The landing page today is a heading and one card linking to the Label
Maker. Brand elements already in place: Glacial Indifference font, sage green
background (`#84A98C`), dark green text (`#2D3A2E`), purple links (`#52489C`).

Note: the Forklift Test is not in this repo and isn't linked from the landing
page. We need its URL to give it a card.

## The vision

Warehouse Utilities grows from a collection of small tools into a warehouse
operations suite:

1. **3D warehouse map**: model a real warehouse (aisles, bays, levels, bins)
   and fly around it in the browser.
2. **Inventory management**: track what's in every bin, searchable, with
   put-away and stock-take flows.
3. **Picking order calculator**: given a pick list, compute an efficient
   walking/driving route through the warehouse and visualise it on the 3D map.

The landing page redesign is Phase 1: it should *look* like the front door of
that suite, while the only shipped tools are still the Label Maker and the
Forklift Test.

## Phase 1: Landing page redesign

Keep it a single static `index.html` with no build tooling.

**Layout (top to bottom):**

1. **Hero**: "Kyle's Warehouse Utilities" with a tagline like *"Tools for
   people who actually work in warehouses."* Behind or beside it, a low-poly
   3D warehouse scene (racking, pallets, a little forklift), slowly orbiting.
   This doubles as a teaser for the 3D map product.
   - Built: hand-rolled flat-shaded box renderer on 2D canvas
     (`home-scene.js`): no Three.js, no WebGL, no dependencies.
   - `prefers-reduced-motion` renders a single static pose; the canvas is
     decorative (`aria-hidden`) so the page never depends on it.
2. **Available now**: the two existing tools as cards, links unchanged:
   Label Maker (`labels.html`) and Forklift Test (URL TBD).
3. **Coming soon**: three roadmap cards (3D Map, Inventory, Picking Order
   Calculator) with one-line descriptions, visually distinct (muted/outlined,
   "in development" badge) so nobody mistakes them for live tools.
4. **Footer**: keep the "Made by Kyle Phillips" credit and source link.

**Design direction:** keep the sage green + Glacial Indifference identity so
the Label Maker still feels like part of the family, and add an industrial
accent (safety-yellow/black chevron details, label-tag-shaped cards) to give
it warehouse character. Mobile-first; the current card grid already behaves
well and the new sections should too.

**Definition of done:** Label Maker and Forklift Test reachable in one click,
page loads fast on a phone without WebGL, Lighthouse doesn't fall off a cliff
because of the 3D hero.

### How the diorama decides what draws in front

Considered: z-buffer (needs WebGL or per-pixel rasterising), BSP trees
(built for static geometry; ours moves), Newell-Newell-Sancha pairwise
ordering (correct but O(n²) with polygon splitting). Chosen: painter's
algorithm (faces sorted far-to-near by centroid depth) made reliable by
a geometry contract rather than a smarter sort:

1. Solids never interpenetrate. The fork tines travel through the pallets'
   real pocket gaps with clearance on every side.
2. The ground plane draws as a separate unsorted underlay, because a huge
   face's average depth misrepresents it against small nearby faces.
3. Long members are subdivided (beams per bay) and distinct objects keep
   small clearances, so overlapping coplanar faces never occur.

Face-level global sorting (not object-level) is deliberate: interlocked
machinery (tines inside pockets, a pallet threading between beams) needs
faces of different objects interleaved in depth. If the scene ever grows
past a few hundred boxes, the upgrade path is WebGL and its z-buffer.

## Phase 2: 3D warehouse map (foundation for everything else)

- Define a warehouse layout format first: a JSON schema of zones → aisles →
  bays → levels → bins, each bin with an address like `A-03-B-2`. This data
  model is the backbone: inventory attaches to bins, and the picking
  calculator routes over the same geometry.
- Renderer: Three.js. Start with orbit/pan controls, click a bin to select it,
  simple box geometry generated from the layout JSON.
- A small layout editor (even a hand-edited JSON file at first) beats building
  a full editor UI early.

## Phase 3: Inventory management

- CRUD for items in bins, search by SKU/name/location.
- Storage: start client-side (IndexedDB) so it stays a static site; graduate
  to a Cloudflare Worker + D1 backend when multi-device/multi-user matters.
- Selecting a search result highlights the bin in the 3D map.

## Phase 4: Picking order calculator

- Input: a pick list (SKUs or bin addresses; reuse the Label Maker's list
  import pattern).
- Build a walkability graph from the layout (aisle centrelines + cross
  aisles), then order picks with a nearest-neighbour pass plus 2-opt
  improvement; classic S-shape/return heuristics as presets.
- Output: ordered pick list (printable, like the labels) and an animated route
  drawn through the 3D map.

## Open questions

- Where does the Forklift Test live? Need its URL for the Phase 1 card.
- Any interest in collecting "notify me" emails on the coming-soon cards, or
  keep the site entirely static with no data collection?
- Is the eventual inventory system single-user (Kyle's warehouse) or
  multi-user? Decides how soon a backend is needed.
