// Every lesson, case and algorithm on the site. Pure data so the node
// validator can import it. A case's starting position is always the inverse
// of its algorithm (or `setup` when given), so the cube you watch is exactly
// the case the algorithm solves — nothing here is hand-drawn.
//
// `[Label]` tokens inside an alg mark stages; the player shows them above the
// moves and they are not moves.
//
// mask:  cross  -> only the white edges + centres are coloured
//        f2l    -> the yellow layer is greyed out
//        oll    -> top layer shows yellow only
//        none   -> everything coloured
// view:  'top' (default, sees U/F/R) or 'bottom' (sees D/F/R, for the cross)
// thumb: 'iso' | 'isoD' | 'top'

export const NOTATION = {
  faces: [
    { alg: 'R', name: 'R', note: 'Right face, clockwise (as if you were looking at it). Front comes up.' },
    { alg: "R'", name: "R'", note: 'Prime = counter-clockwise. Front goes down.' },
    { alg: 'R2', name: 'R2', note: 'Half turn. Direction does not matter.' },
    { alg: 'L', name: 'L', note: 'Left face clockwise from the left — front goes down.' },
    { alg: "L'", name: "L'", note: 'Front comes up on the left.' },
    { alg: 'U', name: 'U', note: 'Top face clockwise from above — front goes left.' },
    { alg: "U'", name: "U'", note: 'Front goes right. Flick with your left index.' },
    { alg: 'D', name: 'D', note: 'Bottom face, clockwise looking from below — front goes right.' },
    { alg: 'F', name: 'F', note: 'Front face clockwise, like a steering wheel to the right.' },
    { alg: "F'", name: "F'", note: 'Steering wheel to the left.' },
    { alg: 'B', name: 'B', note: 'Back face clockwise looking from behind (feels backwards from the front).' },
  ],
  wide: [
    { alg: 'r', name: 'r / Rw', note: 'Right two layers together.' },
    { alg: 'f', name: 'f / Fw', note: 'Front two layers together.' },
    { alg: 'M', name: 'M', note: 'Middle slice, follows L (front goes down).' },
    { alg: "M'", name: "M'", note: 'Middle slice up. Push with the ring finger.' },
  ],
  rotations: [
    { alg: 'x', name: 'x', note: 'Whole cube follows R.' },
    { alg: 'y', name: 'y', note: 'Whole cube follows U. Front goes left.' },
    { alg: "y'", name: "y'", note: 'Whole cube follows U\'. Front goes right.' },
    { alg: 'z', name: 'z', note: 'Whole cube follows F.' },
  ],
};

export const CROSS = [
  { name: 'White on top, above its spot', alg: 'U F2',
    note: 'Line the edge up over its matching centre with U, then a double turn drops it into place. The easiest case — look for it first.' },
  { name: 'White facing out, top layer', alg: "U' R' F R",
    note: 'Move it beside its slot, R\' lifts the next cross piece out of the way, F places it, R puts that piece back.' },
  { name: 'Middle layer, white facing the side', alg: 'F',
    note: 'One turn. If the edge is next to its slot in the middle layer, just turn that face.' },
  { name: 'Middle layer, white facing front', alg: "R U R' F2",
    note: 'Lift it to the top with R, line it up with U, restore R, then F2.' },
  { name: 'In the wrong bottom slot', alg: 'R2 U F2',
    note: 'Bring it up with a double turn, move it over, drop it in. Do these early, before other edges are solved.' },
  { name: 'Flipped in its own slot', alg: "F2 U' R' F R",
    note: 'Pop it up with F2, then it is the "white facing out" case.' },
];

// All 41 standard F2L cases, front-right slot. Grouped at runtime by where
// the pieces are, so the grouping can never disagree with the cube.
export const F2L = [
  "U R U' R'", "U' F' U F", "F' U' F", "R U R'",
  "U' R U R' U2 R U' R'", "U F' U' F U2 F' U F", "U' R U2 R' U2 R U' R'", "U F' U2 F U2 F' U F",
  "U' R U' R' U F' U' F", "U' R U R' U R U R'", "U' R U2 R' U F' U' F", "R U' R' U R U' R' U2 R U' R'",
  "U F' U F U' F' U' F", "U' R U' R' U R U R'", "R U' R' U2 F' U' F", "F' U F U2 R U R'",
  "R U2 R' U' R U R'", "F' U2 F U F' U' F", "U R U2 R' U R U' R'", "U' F' U2 F U' F' U F",
  "U2 R U R' U R U' R'", "U2 F' U' F U' F' U F", "F U R U' R' F' R U' R'", "R2 U2 R' U' R U' R2",
  "R U R' U' R U R' U' R U R'", "R U' R' U F' U F", "U R U R' U2 R U R'", "U' F' U' F U2 F' U' F",
  "R U R' U F' U' F", "F' U F U R U R'",
  "U R U' R' U' F' U F", "U' F' U F U R U' R'", "F' U F U' F' U F", "R U' R' U R U' R'",
  "R U R' U' R U R'", "F' U' F U F' U' F",
  "R U' R' U R U2 R' U R U' R'", "R U' R' U' R U R' U2 R U' R'", "R2 U2 F R2 F' U2 R' U R'",
  "R U F R U R' U' F' R'", "R F U R U' R' F' U' R'",
];

// Plain-words recognition for the 4 easy inserts (F2L[0..3]); every position
// was checked against cube.js. Corner = the one above the gap.
export const F2L_NOTES = [
  'White faces YOU. The edge sits right behind the corner on the right, colours matching: already a pair. Move it away, then drop it in.',
  'White faces RIGHT. The edge sits next to the corner along the front, colours matching: already a pair.',
  'White faces YOU. The edge is at the far LEFT of the top layer.',
  'White faces RIGHT. The edge is at the BACK of the top layer.',
];

export const F2L_GROUPS = [
  { key: 'basic', title: 'Start here: the 4 easy inserts', note: 'Learn these first, until you do them without thinking. Almost every other case is a few moves that turn it into one of these.' },
  { key: 'side', title: 'Corner on top, white facing the side', note: 'Same top colours → bring the edge next to the corner. Different → put it across.' },
  { key: 'up', title: 'Corner on top, white facing up', note: 'Hardest group to see. Hide the edge, put the corner over it, rebuild.' },
  { key: 'edgeSlot', title: 'Corner on top, edge in the slot', note: 'Edge already home or flipped in its slot.' },
  { key: 'cornerSlot', title: 'Corner in the slot, edge on top', note: 'Corner already below. Pair the edge without breaking it.' },
  { key: 'both', title: 'Both in the slot', note: 'Solved wrong. Usually take out, then reinsert.' },
];
// Every place the white-green edge can be while the other 3 cross edges are
// already in (found by search, shortest fix that keeps them in). Its other 6
// spots are taken by those 3 edges; see "In the wrong bottom slot" above.
export const CROSS_ALL = [
  { name: "Top layer, front, white facing up", alg: "F2" },
  { name: "Top layer, right, white facing up", alg: "U F2" },
  { name: "Top layer, left, white facing up", alg: "U' F2" },
  { name: "Top layer, back, white facing up", alg: "U2 F2" },
  { name: "Top layer, right, white facing right", alg: "R' F R" },
  { name: "Top layer, left, white facing left", alg: "L F' L'" },
  { name: "Top layer, front, white facing you", alg: "F D R' D'" },
  { name: "Top layer, back, white facing back", alg: "L' U' L F'" },
  { name: "Middle layer, front-right, white facing right", alg: "F" },
  { name: "Middle layer, front-left, white facing left", alg: "F'" },
  { name: "Middle layer, back-right, white facing back", alg: "D R D'" },
  { name: "Middle layer, front-left, white facing you", alg: "D' L D" },
  { name: "Middle layer, front-right, white facing you", alg: "D R' D'" },
  { name: "Middle layer, back-left, white facing back", alg: "D' L' D" },
  { name: "Middle layer, back-left, white facing left", alg: "D2 B D2" },
  { name: "Middle layer, back-right, white facing right", alg: "D2 B' D2" },
  { name: "Bottom, its own spot, white facing you", alg: "F' D R' D'" },
];


export const OLL_EDGES = [
  { name: 'Line', alg: "F R U R' U' F'", note: 'Hold the line horizontal (left to right).' },
  { name: 'L shape', alg: "F U R U' R' F'", note: 'Hold the L at the back-left (pointing at 9 and 12 o\'clock).' },
  { name: 'Dot', alg: "F R U R' U' F' U2 F U R U' R' F'", note: 'No edges yellow. Line algorithm, U2, then the L algorithm.' },
];

export const OLL_CORNERS = [
  { name: 'Sune', alg: "R U R' U R U2 R'", note: 'One yellow corner up, "fish" pointing front-left. The most common OLL — learn it first.' },
  { name: 'Antisune', alg: "R U2 R' U' R U' R'", note: 'Mirror of Sune. One corner up, at the back-right.' },
  { name: 'H', alg: "F R U R' U' R U R' U' R U R' U' F'", note: 'No corners up, yellow on left and right sides in pairs. F, (R U R\' U\') three times, F\'.' },
  { name: 'Pi', alg: "R U2 R2 U' R2 U' R2 U2 R", note: 'No corners up, headlights on the left.' },
  { name: 'Headlights (U)', alg: "R2 D R' U2 R D' R' U2 R'", note: 'Two corners up, headlights facing you on the front.' },
  { name: 'T', alg: "r U R' U' r' F R F'", note: 'Two corners up side by side, yellow on the front and back of the other two.' },
  { name: 'Bowtie (L)', alg: "F' r U R' U' r' F R", note: 'Two corners up diagonally.' },
];

export const PLL_2LOOK = [
  { name: 'T perm (corners, headlights)', alg: "R U R' U' R' F R2 U' R' U' R U R' F'", note: 'Headlights on one side: hold them on the LEFT. Swaps the two right corners.' },
  { name: 'Y perm (corners, diagonal)', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'", note: 'No headlights anywhere: swap two diagonal corners.' },
  { name: 'Ua', alg: "R U' R U R U R U' R' U' R2", note: 'Solved bar at the back, edges cycle anticlockwise (seen from above).' },
  { name: 'Ub', alg: "R2 U R U R' U' R' U' R' U R'", note: 'Solved bar at the back, edges cycle clockwise.' },
  { name: 'H', alg: 'M2 U M2 U2 M2 U M2', note: 'Opposite edges swap. Checkerboard on every side.' },
  { name: 'Z', alg: "M' U M2 U M2 U M' U2 M2 U'", note: 'Adjacent edges swap in two pairs.' },
];

export const PLL_FULL = [
  { name: 'Aa', alg: "x R' U R' D2 R U' R' D2 R2 x'" },
  { name: 'Ab', alg: "x R2 D2 R U R' D2 R U' R x'" },
  { name: 'E', alg: "x' R U' R' D R U R' D' R U R' D R U' R' D' x" },
  { name: 'F', alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R" },
  { name: 'Ga', alg: "R2 U R' U R' U' R U' R2 U' D R' U R D'" },
  { name: 'Gb', alg: "R' U' R U D' R2 U R' U R U' R U' R2 D" },
  { name: 'Gc', alg: "R2 U' R U' R U R' U R2 U D' R U' R' D" },
  { name: 'Gd', alg: "R U R' U' D R2 U' R U' R' U R' U R2 D'" },
  { name: 'H', alg: 'M2 U M2 U2 M2 U M2' },
  { name: 'Ja', alg: "x R2 F R F' R U2 r' U r U2 x'" },
  { name: 'Jb', alg: "R U R' F' R U R' U' R' F R2 U' R' U'" },
  { name: 'Na', alg: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'" },
  { name: 'Nb', alg: "R' U R U' R' F' U' F R U R' F R' F' R U' R" },
  { name: 'Ra', alg: "R U' R' U' R U R D R' U' R D' R' U2 R' U'" },
  { name: 'Rb', alg: "R2 F R U R U' R' F' R U2 R' U2 R U" },
  { name: 'T', alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
  { name: 'Ua', alg: "R U' R U R U R U' R' U' R2" },
  { name: 'Ub', alg: "R2 U R U R' U' R' U' R' U R'" },
  { name: 'V', alg: "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2" },
  { name: 'Y', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
  { name: 'Z', alg: "M' U M2 U M2 U M' U2 M2 U'" },
];

// A whole CFOP solve. The scramble is derived from this (inverse, rotations
// folded out), so every stage is genuinely what it says. Net rotation is y4
// so the scramble is held the normal way: yellow up, green front.
export const FULL_SOLVE =
  "[Cross] F' R D2 L' B' D' F2 " +
  "[F2L 1] U' R U R' U2 R U' R' " +
  "[F2L 2] y U R U2 R' U R U' R' " +
  "[F2L 3] y R U' R' U R U' R' " +
  "[F2L 4] y U F' U' F U2 F' U F " +
  "[OLL edges] y F R U R' U' F' " +
  "[OLL corners] R U R' U R U2 R' " +
  "[PLL corners] R U R' U' R' F R2 U' R' U' R U R' F' " +
  "[PLL edges] R U' R U R U R U' R' U' R2 " +
  '[AUF] U';

// Techniques past basic CFOP. `setup` scrambles the rest of the cube first so
// the demo starts from a believable mid-solve position.
export const ADVANCED = [
  { name: 'X-cross', setup: "L U L' B' U2 B U' L' U' L R' U R", alg: "[Cross + first pair together] F' R D2 U R' F D' L2",
    note: 'Plan the cross AND the first F2L pair in the 15 s inspection, then solve both as one step. Saves ~1–2 s every solve. The first advanced trick to learn.' },
  { name: 'Pseudo slotting', setup: "L' U L U2 B U' B'", alg: "[Insert with bottom turned] R U R' [Fix the bottom] D",
    note: 'The bottom layer is turned one step off. Instead of fixing it first, insert anyway: the corner fits relative to the cross. One D turn at the end lines everything up. Fewer moves than fixing first.' },
];

// Full OLL, one look. Every alg verified: F2L untouched, 57 distinct cases.
export const OLL_FULL = [
  { group: "Cross done (OCLL) — learn first", cases: [
    { n: 27, alg: "R U R' U R U2 R'" },
    { n: 26, alg: "R U2 R' U' R U' R'" },
    { n: 21, alg: "R U2 R' U' R U R' U' R U' R'" },
    { n: 22, alg: "R U2 R2 U' R2 U' R2 U2 R" },
    { n: 23, alg: "R2 D' R U2 R' D R U2 R" },
    { n: 24, alg: "r U R' U' r' F R F'" },
    { n: 25, alg: "F' r U R' U' r' F R" },
  ] },
  { group: "Dot", cases: [
    { n: 1, alg: "R U2 R2 F R F' U2 R' F R F'" },
    { n: 2, alg: "F R U R' U' F' f R U R' U' f'" },
    { n: 3, alg: "f R U R' U' f' U' F R U R' U' F'" },
    { n: 4, alg: "f R U R' U' f' U F R U R' U' F'" },
    { n: 17, alg: "F R' F' R2 r' U R U' R' U' M'" },
    { n: 18, alg: "r U R' U R U2 r2 U' R U' R' U2 r" },
    { n: 19, alg: "r' R U R U R' U' M' R' F R F'" },
    { n: 20, alg: "r U R' U' M2 U R U' R' U' M'" },
  ] },
  { group: "Line", cases: [
    { n: 51, alg: "F U R U' R' U R U' R' F'" },
    { n: 52, alg: "R U R' U R U' B U' B' R'" },
    { n: 55, alg: "R' F R U R U' R2 F' R2 U' R' U R U R'" },
    { n: 56, alg: "r' U' r U' R' U R U' R' U R r' U r" },
  ] },
  { group: "T", cases: [
    { n: 33, alg: "R U R' U' R' F R F'" },
    { n: 45, alg: "F R U R' U' F'" },
  ] },
  { group: "P", cases: [
    { n: 31, alg: "R' U' F U R U' R' F' R" },
    { n: 32, alg: "L U F' U' L' U L F L'" },
    { n: 43, alg: "F' U' L' U L F" },
    { n: 44, alg: "F U R U' R' F'" },
  ] },
  { group: "Square", cases: [
    { n: 5, alg: "r' U2 R U R' U r" },
    { n: 6, alg: "r U2 R' U' R U' r'" },
  ] },
  { group: "C", cases: [
    { n: 34, alg: "R U R2 U' R' F R U R U' F'" },
    { n: 46, alg: "R' U' R' F R F' U R" },
  ] },
  { group: "W", cases: [
    { n: 36, alg: "L' U' L U' L' U L U L F' L' F" },
    { n: 38, alg: "R U R' U R U' R' U' R' F R F'" },
  ] },
  { group: "Fish", cases: [
    { n: 9, alg: "R U R' U' R' F R2 U R' U' F'" },
    { n: 10, alg: "R U R' U R' F R F' R U2 R'" },
    { n: 35, alg: "R U2 R2 F R F' R U2 R'" },
    { n: 37, alg: "F R' F' R U R U' R'" },
  ] },
  { group: "Small lightning", cases: [
    { n: 7, alg: "r U R' U R U2 r'" },
    { n: 8, alg: "l' U' L U' L' U2 l" },
    { n: 11, alg: "r U R' U R' F R F' R U2 r'" },
    { n: 12, alg: "M' R' U' R U' R' U2 R U' R r'" },
  ] },
  { group: "Big lightning", cases: [
    { n: 39, alg: "L F' L' U' L U F U' L'" },
    { n: 40, alg: "R' F R U R' U' F' U R" },
  ] },
  { group: "Knight move", cases: [
    { n: 13, alg: "F U R U' R2 F' R U R U' R'" },
    { n: 14, alg: "R' F R U R' F' R F U' F'" },
    { n: 15, alg: "r' U' r R' U' R U r' U r" },
    { n: 16, alg: "r U r' R U R' U' r U' r'" },
  ] },
  { group: "Awkward", cases: [
    { n: 29, alg: "R U R' U' R U' R' F' U' F R U R'" },
    { n: 30, alg: "F R' F R2 U' R' U' R U R' F2" },
    { n: 41, alg: "R U R' U R U2 R' F R U R' U' F'" },
    { n: 42, alg: "R' U' R U' R' U2 R F R U R' U' F'" },
  ] },
  { group: "Small L", cases: [
    { n: 47, alg: "R' U' R' F R F' R' F R F' U R" },
    { n: 48, alg: "F R U R' U' R U R' U' F'" },
    { n: 49, alg: "r U' r2 U r2 U r2 U' r" },
    { n: 50, alg: "r' U r2 U' r2 U' r2 U r'" },
    { n: 53, alg: "r' U' R U' R' U R U' R' U2 r" },
    { n: 54, alg: "r U R' U R U' R' U R U2 r'" },
  ] },
  { group: "Corners done", cases: [
    { n: 28, alg: "r U R' U' r' R U R U' R'" },
    { n: 57, alg: "R U R' U' M' U R U' r'" },
  ] },
];
