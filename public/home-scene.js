/* Low-poly warehouse diorama for the landing page hero.
   Flat-shaded boxes, orthographic projection, painter's sort. No libraries,
   no WebGL. A little forklift shuttles pallets between racking slots.
   The canvas is decorative (aria-hidden). */
(function () {
  'use strict';

  var canvas = document.getElementById('warehouse-scene');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var PITCH = 0.64;                 // camera elevation
  var ORBIT_SPEED = 0.00009;        // radians per ms (~70 s per turn)
  var STATIC_YAW = -0.62;           // pose used when motion is reduced
  var cosP = Math.cos(PITCH);
  var sinP = Math.sin(PITCH);

  var LIGHT = normalize([0.5, 0.85, 0.3]);

  var COLORS = {
    slab: '#93AC97',
    lane: '#E8C24A',
    post: '#2E5DA6',
    beam: '#DE7630',
    pallet: '#A67C4E',
    plankLight: '#B58A58',
    plankDark: '#8F6A42',
    kraft: '#C9A272',
    kraftDark: '#B18B5B',
    sage: '#5F8A6C',
    purple: '#52489C',
    lift: '#F0B23C',
    steel: '#9FA8A0',
    ink: '#333E35'
  };

  function normalize(v) {
    var l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function rgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ];
  }

  /* ---- layout ----
     Bays are the openings between upright frames; pallets are centred in
     them with clear margin to the steel. All racking geometry derives from
     these numbers. */

  /* Occlusion contract: this renderer draws with the painter's algorithm
     (faces sorted far-to-near by centroid depth), which is only correct if
     the geometry cooperates. Three rules keep it correct by construction:
       1. Solids never interpenetrate: the fork tines travel through the
          pallets' real pocket gaps, with clearance on every side.
       2. The ground plane is a separate unsorted underlay (a huge face's
          average depth misrepresents it against small nearby faces).
       3. Long members are subdivided (beams per bay) and distinct objects
          keep small clearances so overlapping coplanar faces never occur. */

  var PALLET = { w: 56, h: 9, d: 40 };

  /* A real stringer pallet: 3 bottom boards, 3 stringers leaving two fork
     pockets (u 4..26 and 30..52, y 2..6), 5 top deck boards. Layout is
     symmetric in both axes, so racked/carried mirroring needs no fix-up.
     Plank: [u, y, v, du, dh, dv, color] in pallet-local coordinates
     (u across the 56 face, v across the 40 face). */
  var PLANKS = [
    [0, 0, 0, 56, 2, 6, 'plankDark'],      // bottom boards
    [0, 0, 17, 56, 2, 6, 'plankDark'],
    [0, 0, 34, 56, 2, 6, 'plankDark'],
    [0, 2, 0, 4, 4, 40, 'pallet'],         // stringers
    [26, 2, 0, 4, 4, 40, 'pallet'],
    [52, 2, 0, 4, 4, 40, 'pallet'],
    [0, 6, 0, 56, 3, 6, 'plankLight'],     // top deck boards
    [0, 6, 8.5, 56, 3, 6, 'pallet'],
    [0, 6, 17, 56, 3, 6, 'plankLight'],
    [0, 6, 25.5, 56, 3, 6, 'pallet'],
    [0, 6, 34, 56, 3, 6, 'plankLight']
  ];

  function palletBoxes(arr, x, y, z) {
    for (var i = 0; i < PLANKS.length; i++) {
      var p = PLANKS[i];
      pushBox(arr, x + p[0], y + p[1], z + p[2], p[3], p[4], p[5], COLORS[p[6]]);
    }
  }
  var FRAME_X = [-142, -50, 42, 134];       // upright frame left edges (8 wide)
  var BAY_X = [-120, -28, 64];              // pallet left edge, centred per bay
  var LEVEL_Y = { floor: 0, beam: 61 };     // pallet resting heights
  var AISLE_Z = 4;                          // forklift travel line (centre z)
  var FORK_REACH = 24;                      // pallet near edge sits this far
                                            // ahead of the forklift centre
  var ROWS = {
    back: {
      zFront: -142,                         // rack envelope: -142 .. -100
      palletZ: -141,
      face: -Math.PI / 2,                   // heading that faces this row
      engageZ: -101 + FORK_REACH            // centre z when forks are in
    },
    front: {
      zFront: 108,                          // rack envelope: 108 .. 150
      palletZ: 109,
      face: Math.PI / 2,
      engageZ: 109 - FORK_REACH
    }
  };

  /* ---- box lists ----
     ground: flat underlay, drawn first, never sorted against objects.
     staticBoxes: racking and clutter, projected every frame but built once.
     dynamicBoxes: pallets + forklift, rebuilt every frame from state. */

  var groundBoxes = [];
  var staticBoxes = [];
  var dynamicBoxes = [];

  // rot (optional): { ry, px, pz } rotates the box around the vertical
  // axis through (px, pz).
  function pushBox(arr, x, y, z, w, h, d, color, rot) {
    arr.push({ x: x, y: y, z: z, w: w, h: h, d: d, c: rgb(color), r: rot || null });
  }

  function buildStatic() {
    pushBox(groundBoxes, -250, -10, -150, 500, 10, 300, COLORS.slab);
    pushBox(groundBoxes, -250, -0.5, -68, 500, 1, 4, COLORS.lane);
    pushBox(groundBoxes, -250, -0.5, 64, 500, 1, 4, COLORS.lane);

    rackRow(ROWS.back.zFront);
    rackRow(ROWS.front.zFront);

    // loose stock at the aisle ends, outside the forklift's turning circle
    palletBoxes(staticBoxes, -224, 0, -20);
    palletBoxes(staticBoxes, -224, 9, -20);
    palletBoxes(staticBoxes, -224, 18, -20);
    pushBox(staticBoxes, 170, 0, -34, 30, 30, 30, COLORS.kraft);
    pushBox(staticBoxes, 175, 30, -30, 20, 18, 22, COLORS.kraftDark);
  }

  // One frame bracing member between a frame's two posts, in the vertical
  // plane through the post centreline. Same call handles horizontals
  // (y1 === y2) and diagonals; ends are inset 1 unit so members kiss at
  // joints instead of interpenetrating.
  function brace(fx, y1, z1, y2, z2) {
    var len = Math.hypot(y2 - y1, z2 - z1);
    var yc = (y1 + y2) / 2;
    var zc = (z1 + z2) / 2;
    pushBox(staticBoxes, fx + 2.5, yc - len / 2 + 1, zc - 1.5, 3, len - 2, 3,
      COLORS.steel, { rx: Math.atan2(z2 - z1, y2 - y1), py: yc, pz: zc });
  }

  function rackRow(zFront) {
    var i;
    for (i = 0; i < FRAME_X.length; i++) {
      var fx = FRAME_X[i];
      pushBox(staticBoxes, fx, 0, zFront, 8, 118, 8, COLORS.post);
      pushBox(staticBoxes, fx, 0, zFront + 34, 8, 118, 8, COLORS.post);

      // frame ties: horizontals top and bottom, zigzag diagonals between,
      // spanning the clear gap between the two posts of the frame
      var near = zFront + 10;
      var far = zFront + 32;
      brace(fx, 6, near, 6, far);
      brace(fx, 112, near, 112, far);
      brace(fx, 8, near, 34, far);
      brace(fx, 34, far, 60, near);
      brace(fx, 60, near, 86, far);
      brace(fx, 86, far, 112, near);
    }
    for (i = 0; i < BAY_X.length; i++) {
      var bx = BAY_X[i] - 14;               // beam spans the bay opening
      pushBox(staticBoxes, bx, 54, zFront, 84, 7, 5, COLORS.beam);
      pushBox(staticBoxes, bx, 54, zFront + 37, 84, 7, 5, COLORS.beam);
      pushBox(staticBoxes, bx, 110, zFront, 84, 7, 5, COLORS.beam);
      pushBox(staticBoxes, bx, 110, zFront + 37, 84, 7, 5, COLORS.beam);
    }
  }

  /* ---- slots & pallets ----
     A slot is one pallet position in the racking. Cartons are stored in
     pallet-local coordinates: u across the pallet's 56 face, v across its
     40 face, then [u, v, w, h, d, color]. */

  var slots = [];

  function slot(row, bay, level, cartons) {
    slots.push({
      row: row, bay: bay, level: level,
      pallet: cartons ? { cartons: cartons } : null
    });
  }

  function buildSlots() {
    slot('back', 0, 'floor', [[6, 4, 40, 34, 30, COLORS.kraft]]);
    slot('back', 1, 'floor', [[4, 2, 26, 26, 34, COLORS.kraftDark], [32, 8, 18, 18, 24, COLORS.kraft]]);
    slot('back', 2, 'floor', [[8, 6, 38, 22, 28, COLORS.sage]]);
    slot('back', 0, 'beam', [[10, 4, 34, 28, 30, COLORS.kraftDark]]);
    slot('back', 1, 'beam', null);
    slot('back', 2, 'beam', [[6, 6, 40, 30, 26, COLORS.kraft]]);

    slot('front', 0, 'floor', [[6, 4, 40, 30, 30, COLORS.kraftDark]]);
    slot('front', 1, 'floor', null);
    slot('front', 2, 'floor', [[4, 4, 24, 24, 30, COLORS.kraft], [30, 8, 20, 16, 22, COLORS.purple]]);
    slot('front', 0, 'beam', null);
    slot('front', 1, 'beam', [[8, 4, 36, 26, 30, COLORS.kraft]]);
    slot('front', 2, 'beam', [[10, 6, 32, 22, 26, COLORS.kraftDark]]);
  }

  function rackedPalletBoxes(s) {
    var x = BAY_X[s.bay];
    var z = ROWS[s.row].palletZ;
    var y = LEVEL_Y[s.level];
    palletBoxes(dynamicBoxes, x, y, z);
    var cs = s.pallet.cartons;
    for (var i = 0; i < cs.length; i++) {
      pushBox(dynamicBoxes, x + cs[i][0], y + PALLET.h, z + cs[i][1],
        cs[i][2], cs[i][3], cs[i][4], cs[i][5]);
    }
  }

  /* ---- forklift ----
     Modelled facing +x with its centre at (lift.x, lift.z); every part is
     rotated by the current heading around that centre. */

  var lift = {
    x: -40, z: AISLE_Z,
    h: 0,                  // heading, radians; 0 = +x
    fy: 2,                 // fork height
    pallet: null           // carried pallet, or null
  };

  function liftBoxes() {
    var rot = { ry: lift.h, px: lift.x, pz: lift.z };
    var X = lift.x, Z = lift.z;
    var fy = lift.fy;

    function part(dx, y, dz, w, h, d, color) {
      pushBox(dynamicBoxes, X + dx, y, Z + dz, w, h, d, color, rot);
    }

    // chassis (wheels sit fully outside the body, clear of its flanks)
    part(-26, 4, -10, 36, 18, 20, COLORS.lift);          // body
    part(-30, 2, -10, 4, 24, 20, COLORS.lift);           // counterweight
    part(2, 22, -8, 8, 4, 16, COLORS.lift);              // cowl
    part(-10, 22, -6, 8, 5, 12, COLORS.ink);             // seat
    part(-24, 0, -14.5, 9, 9, 3.5, COLORS.ink);          // wheels
    part(6, 0, -14.5, 9, 9, 3.5, COLORS.ink);
    part(-24, 0, 11, 9, 9, 3.5, COLORS.ink);
    part(6, 0, 11, 9, 9, 3.5, COLORS.ink);

    // overhead guard
    part(7, 26, -7.5, 3, 20, 3, COLORS.ink);
    part(7, 26, 4.5, 3, 20, 3, COLORS.ink);
    part(-21, 22, -7.5, 3, 24, 3, COLORS.ink);
    part(-21, 22, 4.5, 3, 24, 3, COLORS.ink);
    part(-22, 46, -11, 33, 3, 22, COLORS.lift);

    /* Duplex mast, modelled on the real mechanism:
       - fixed outer channels bolted to the chassis
       - a fixed-length inner section that telescopes inside them. The first
         FREE_LIFT units of fork travel are the carriage alone (free lift),
         after which the whole inner section rises with it, always keeping
         overlap with the outer channels
       - twin hydraulic cylinders behind the mast: fixed barrels, piston
         rods that extend to the inner section's top tie bar and push it up */
    var FREE_LIFT = 40;
    var INNER_LEN = 56;
    var innerY = Math.max(0, fy - FREE_LIFT);
    var innerTop = innerY + INNER_LEN;

    part(15.5, 0, -13, 3.5, 54, 3.5, COLORS.ink);        // outer channels
    part(15.5, 0, 9.5, 3.5, 54, 3.5, COLORS.ink);
    part(14.5, 6, -9, 1.5, 4, 18, COLORS.ink);           // cross braces sit
    part(14.5, 48, -9, 1.5, 4, 18, COLORS.ink);          // behind the rails
    part(16.5, innerY, -7, 2, INNER_LEN, 3, COLORS.ink); // inner rails
    part(16.5, innerY, 4, 2, INNER_LEN, 3, COLORS.ink);
    part(11.5, innerTop, -10.5, 7.5, 3, 21, COLORS.ink); // top tie bar

    part(11, 1, -10.5, 3, 29, 2, COLORS.ink);            // cylinder barrels
    part(11, 1, 8.5, 3, 29, 2, COLORS.ink);
    part(11.75, 30, -10, 1, innerTop - 30, 1, COLORS.steel);  // piston rods
    part(11.75, 30, 9, 1, innerTop - 30, 1, COLORS.steel);

    // carriage: load backrest plate, then two L-shaped tines (vertical
    // shanks and horizontal blades), spaced to run through the pallet's
    // pocket gaps (blade z ±11..15 inside pockets ±2..24) without touching
    part(19.5, fy + 3, -16, 1.5, 13, 32, COLORS.ink);    // backrest
    part(21, fy, -15, 2.5, 13, 4, COLORS.ink);           // shanks
    part(21, fy, 11, 2.5, 13, 4, COLORS.ink);
    part(23.5, fy, -15, 24, 2.5, 4, COLORS.ink);         // blades
    part(23.5, fy, 11, 24, 2.5, 4, COLORS.ink);

    if (lift.pallet) {
      // pallet rides the tines: near edge FORK_REACH ahead of centre,
      // depth axis along the heading, width axis across it; blades sit on
      // the pocket floor, so racked and carried heights meet exactly at
      // the hand-over instant
      var py = fy - 2;
      var i, p;
      for (i = 0; i < PLANKS.length; i++) {
        p = PLANKS[i];
        part(FORK_REACH + p[2], py + p[1], -PALLET.w / 2 + p[0],
          p[5], p[4], p[3], COLORS[p[6]]);
      }
      var cs = lift.pallet.cartons;
      for (i = 0; i < cs.length; i++) {
        part(FORK_REACH + cs[i][1], py + PALLET.h, -PALLET.w / 2 + cs[i][0],
          cs[i][4], cs[i][3], cs[i][2], cs[i][5]);
      }
    }
  }

  function buildDynamic() {
    dynamicBoxes.length = 0;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].pallet) rackedPalletBoxes(slots[i]);
    }
    liftBoxes();
  }

  /* ---- forklift choreography ----
     A queue of simple steps: tween one property of `lift`, wait, or run a
     callback. When the queue drains, the next pallet move is planned:
     take a pallet from an occupied slot, drive it to an empty one. */

  var DRIVE_SPEED = 55 / 1000;      // world units per ms
  var ENTER_SPEED = 30 / 1000;
  var LIFT_SPEED = 28 / 1000;
  var TURN_SPEED = 1.5 / 1000;      // radians per ms
  var PAUSE = 300;

  var queue = [];
  var step = null;
  var lastDst = null;

  function tween(key, to, speed) { queue.push({ key: key, to: to, speed: speed }); }
  function wait(ms) { queue.push({ waitLeft: ms }); }
  function call(fn) { queue.push({ fn: fn }); }

  // Cartons are stored in racked orientation. Entering the front row the
  // carried frame mirrors the pallet's width axis, entering the back row
  // its depth axis; applying the matching mirror on both grab and release
  // keeps every carton exactly in place at the moment of hand-over.
  function mirrorCartons(pallet, row) {
    var cs = pallet.cartons;
    for (var i = 0; i < cs.length; i++) {
      if (row === 'front') cs[i][0] = PALLET.w - cs[i][0] - cs[i][2];
      else cs[i][1] = PALLET.d - cs[i][1] - cs[i][4];
    }
  }

  function planVisit(s, simX, grab) {
    var row = ROWS[s.row];
    var alignX = BAY_X[s.bay] + PALLET.w / 2;
    var slotY = LEVEL_Y[s.level];

    if (Math.abs(alignX - simX) > 0.5) {
      tween('h', alignX > simX ? 0 : Math.PI, TURN_SPEED);
      tween('x', alignX, DRIVE_SPEED);
    }
    tween('h', row.face, TURN_SPEED);
    // grabbing: forks glide in at pocket height; placing: the carried
    // pallet enters hovering just above its resting spot
    tween('fy', slotY + (grab ? 2 : 8), LIFT_SPEED);
    tween('z', row.engageZ, ENTER_SPEED);
    wait(PAUSE);
    if (grab) {
      call(function () {
        lift.pallet = s.pallet;
        s.pallet = null;
        mirrorCartons(lift.pallet, s.row);
      });
      tween('fy', slotY + 10, LIFT_SPEED);      // lift clear
    } else {
      tween('fy', slotY + 2, LIFT_SPEED);       // set down
      call(function () {
        mirrorCartons(lift.pallet, s.row);
        s.pallet = lift.pallet;
        lift.pallet = null;
      });
    }
    wait(PAUSE);
    tween('z', AISLE_Z, ENTER_SPEED);
    tween('fy', grab ? 12 : 2, LIFT_SPEED);     // carry height / travel height
    return alignX;
  }

  function planMove() {
    var occupied = [], empty = [], i;
    for (i = 0; i < slots.length; i++) {
      if (slots[i].pallet) {
        if (slots[i] !== lastDst) occupied.push(slots[i]);
      } else {
        empty.push(slots[i]);
      }
    }
    var src = occupied[Math.floor(Math.random() * occupied.length)];
    var dst = empty[Math.floor(Math.random() * empty.length)];

    var simX = planVisit(src, lift.x, true);
    planVisit(dst, simX, false);
    wait(PAUSE);
    lastDst = dst;
  }

  function updateLift(dt) {
    while (dt > 0) {
      if (!step) {
        if (!queue.length) planMove();
        step = queue.shift();
        if (step.key !== undefined) {
          step.from = lift[step.key];
          if (step.key === 'h') {
            // turn the short way round
            var delta = step.to - step.from;
            delta -= Math.round(delta / (2 * Math.PI)) * 2 * Math.PI;
            step.to = step.from + delta;
          }
          step.dur = Math.abs(step.to - step.from) / step.speed;
          step.t = 0;
          if (step.dur < 1) { lift[step.key] = step.to; step = null; continue; }
        } else if (step.fn) {
          step.fn();
          step = null;
          continue;
        }
      }
      if (step.waitLeft !== undefined) {
        if (step.waitLeft > dt) { step.waitLeft -= dt; dt = 0; }
        else { dt -= step.waitLeft; step = null; }
        continue;
      }
      step.t += dt;
      dt = 0;
      var p = Math.min(step.t / step.dur, 1);
      var e = p * p * (3 - 2 * p);              // smoothstep
      lift[step.key] = step.from + (step.to - step.from) * e;
      if (p === 1) step = null;
    }
  }

  /* ---- projection & drawing ---- */

  // All 6 faces of a cuboid, each with its outward normal and which box
  // dimensions span it (u along idx[0]->idx[1], v along idx[1]->idx[2]).
  // Corner indices refer to the 8-corner arrays built in projectBox().
  var FACES = [
    { idx: [4, 5, 6, 7], n: [0, 1, 0], u: 'w', v: 'd' },   // top
    { idx: [3, 2, 1, 0], n: [0, -1, 0], u: 'w', v: 'd' },  // bottom
    { idx: [3, 2, 6, 7], n: [0, 0, 1], u: 'w', v: 'h' },   // +z
    { idx: [1, 0, 4, 5], n: [0, 0, -1], u: 'w', v: 'h' },  // -z
    { idx: [2, 1, 5, 6], n: [1, 0, 0], u: 'd', v: 'h' },   // +x
    { idx: [0, 3, 7, 4], n: [-1, 0, 0], u: 'd', v: 'h' }   // -x
  ];

  /* Painter's sort orders faces by centroid depth, and view depth includes
     a height term (the camera looks down), so one big face (a full rack
     post, a whole beam) averages badly against small faces near it and
     can draw over things standing in front of it. Classic fix: subdivide
     any face larger than this into cells before sorting, so ordering is
     decided locally. Projection is affine, so cells come from exact
     bilinear interpolation of the projected corners. */
  var MAX_FACE = 30;

  // View transform: yaw around Y, then pitch around X, orthographic drop.
  // View-space z points at the camera, so a face is visible exactly when
  // its transformed normal has positive view-space z.
  function viewZ(nx, ny, nz, cy, sy) {
    return ny * sinP + (nx * sy + nz * cy) * cosP;
  }

  // Project one box and append its camera-facing faces to `quads`.
  function projectBox(b, cy, sy, scale, ox, oy, quads) {
    var px = [b.x, b.x + b.w, b.x + b.w, b.x, b.x, b.x + b.w, b.x + b.w, b.x];
    var pyv = [b.y, b.y, b.y, b.y, b.y + b.h, b.y + b.h, b.y + b.h, b.y + b.h];
    var pz = [b.z, b.z, b.z + b.d, b.z + b.d, b.z, b.z, b.z + b.d, b.z + b.d];
    var k, cr, sr, crx, srx, dz;

    if (b.r) {
      if (b.r.rx !== undefined) {          // tilt in a vertical plane
        crx = Math.cos(b.r.rx);
        srx = Math.sin(b.r.rx);
        for (k = 0; k < 8; k++) {
          var dy = pyv[k] - b.r.py;
          dz = pz[k] - b.r.pz;
          pyv[k] = b.r.py + dy * crx - dz * srx;
          pz[k] = b.r.pz + dy * srx + dz * crx;
        }
      }
      if (b.r.ry !== undefined) {          // spin around the vertical axis
        cr = Math.cos(b.r.ry);
        sr = Math.sin(b.r.ry);
        for (k = 0; k < 8; k++) {
          var dx = px[k] - b.r.px;
          dz = pz[k] - b.r.pz;
          px[k] = b.r.px + dx * cr - dz * sr;
          pz[k] = b.r.pz + dx * sr + dz * cr;
        }
      }
    }

    var sxs = [], sys = [], depths = [];
    for (k = 0; k < 8; k++) {
      var rx = px[k] * cy - pz[k] * sy;
      var rz = px[k] * sy + pz[k] * cy;
      sxs.push(ox + rx * scale);
      sys.push(oy - (pyv[k] * cosP - rz * sinP) * scale);
      depths.push(pyv[k] * sinP + rz * cosP);
    }

    for (var j = 0; j < FACES.length; j++) {
      var f = FACES[j];
      var nx = f.n[0], ny = f.n[1], nz = f.n[2], t;
      if (b.r) {
        if (b.r.rx !== undefined) {
          t = ny * crx - nz * srx;
          nz = ny * srx + nz * crx;
          ny = t;
        }
        if (b.r.ry !== undefined) {
          t = nx * cr - nz * sr;
          nz = nx * sr + nz * cr;
          nx = t;
        }
      }
      if (viewZ(nx, ny, nz, cy, sy) <= 0) continue;  // faces away

      // light the face with its world normal, spun by the scene yaw
      var wx = nx * cy - nz * sy;
      var wz = nx * sy + nz * cy;
      var lum = 0.58 + 0.42 * Math.max(0, wx * LIGHT[0] + ny * LIGHT[1] + wz * LIGHT[2]);

      var i0 = f.idx[0], i1 = f.idx[1], i2 = f.idx[2], i3 = f.idx[3];
      var nu = Math.ceil(b[f.u] / MAX_FACE);
      var nv = Math.ceil(b[f.v] / MAX_FACE);

      if (nu === 1 && nv === 1) {
        quads.push({
          d: (depths[i0] + depths[i1] + depths[i2] + depths[i3]) / 4,
          x: [sxs[i0], sxs[i1], sxs[i2], sxs[i3]],
          y: [sys[i0], sys[i1], sys[i2], sys[i3]],
          c: b.c, l: lum
        });
        continue;
      }

      // bilinear over the projected face: i0=(0,0) i1=(1,0) i2=(1,1) i3=(0,1)
      var bl = function (A, u, v) {
        return A[i0] * (1 - u) * (1 - v) + A[i1] * u * (1 - v) +
          A[i2] * u * v + A[i3] * (1 - u) * v;
      };
      for (var iu = 0; iu < nu; iu++) {
        var u0 = iu / nu, u1 = (iu + 1) / nu;
        for (var iv = 0; iv < nv; iv++) {
          var v0 = iv / nv, v1 = (iv + 1) / nv;
          quads.push({
            d: bl(depths, (u0 + u1) / 2, (v0 + v1) / 2),
            x: [bl(sxs, u0, v0), bl(sxs, u1, v0), bl(sxs, u1, v1), bl(sxs, u0, v1)],
            y: [bl(sys, u0, v0), bl(sys, u1, v0), bl(sys, u1, v1), bl(sys, u0, v1)],
            c: b.c, l: lum
          });
        }
      }
    }
  }

  function drawQuads(quads) {
    for (var j = 0; j < quads.length; j++) {
      var qd = quads[j];
      ctx.fillStyle = 'rgb(' +
        Math.round(qd.c[0] * qd.l) + ',' +
        Math.round(qd.c[1] * qd.l) + ',' +
        Math.round(qd.c[2] * qd.l) + ')';
      // inflate a hair so abutting quads overlap; otherwise canvas
      // anti-aliasing leaves visible seams between subdivision cells
      var cxq = (qd.x[0] + qd.x[1] + qd.x[2] + qd.x[3]) / 4;
      var cyq = (qd.y[0] + qd.y[1] + qd.y[2] + qd.y[3]) / 4;
      ctx.beginPath();
      for (var v = 0; v < 4; v++) {
        var dx = qd.x[v] - cxq;
        var dy = qd.y[v] - cyq;
        var len = Math.hypot(dx, dy) || 1;
        var ix = qd.x[v] + dx / len * 0.4;
        var iy = qd.y[v] + dy / len * 0.4;
        if (v === 0) ctx.moveTo(ix, iy);
        else ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  function render(yaw) {
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    var cy = Math.cos(yaw);
    var sy = Math.sin(yaw);
    var scale = Math.min(w * 0.5 / 315, h * 0.55 / 250);
    var ox = w / 2;
    var oy = h * 0.58;

    buildDynamic();

    var i;

    // Ground layer first: the slab and painted lanes lie flat under
    // everything, and keeping them out of the depth sort stops the huge
    // floor polygon (whose average depth is its centre) from painting
    // over the base of objects standing near its far edge.
    var groundQuads = [];
    for (i = 0; i < groundBoxes.length; i++) {
      projectBox(groundBoxes[i], cy, sy, scale, ox, oy, groundQuads);
    }
    drawQuads(groundQuads);

    // Everything else painter-sorted, far faces first.
    var quads = [];
    for (i = 0; i < staticBoxes.length; i++) {
      projectBox(staticBoxes[i], cy, sy, scale, ox, oy, quads);
    }
    for (i = 0; i < dynamicBoxes.length; i++) {
      projectBox(dynamicBoxes[i], cy, sy, scale, ox, oy, quads);
    }
    quads.sort(function (m, n) { return m.d - n.d; });
    drawQuads(quads);
  }

  /* ---- sizing & animation ---- */

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var running = false;
  var rafId = 0;
  var lastT = null;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    if (!running) render(STATIC_YAW);
  }

  function frame(t) {
    if (lastT !== null) {
      updateLift(Math.min(t - lastT, 100));
    }
    lastT = t;
    render(STATIC_YAW + t * ORBIT_SPEED);
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduceMotion.matches) return;
    running = true;
    lastT = null;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function motionChanged() {
    if (reduceMotion.matches) {
      stop();
      render(STATIC_YAW);
    } else {
      start();
    }
  }

  buildStatic();
  buildSlots();
  resize();
  window.addEventListener('resize', resize);

  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener('change', motionChanged);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start();
      else stop();
    }).observe(canvas);
  } else {
    start();
  }

  motionChanged();
})();
