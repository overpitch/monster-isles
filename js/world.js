'use strict';
// =====================================================================
//  The world: four islands joined by bridges. Map building, tiles,
//  towns, trainers and townspeople, and drawing it all from above.
// =====================================================================

const TS = 48;                 // tile size in pixels
const MW = 150, MH = 100;      // map size in tiles
// Tiles: ~ water  . ground  , tall grass  s sand  T tree  R rock  L lava  = path  b bridge
//        f town floor  H building  D door  F flowers  P legendary shrine
const SOLID_TILES = new Set(['~', 'T', 'R', 'L', 'H']);

const ISLANDS = [
  { name: 'SUNNY BEACH',    biome: 0, cx: 38,  cy: 70, rx: 30, ry: 21, lv: [2, 6] },
  { name: 'SPOOKY FOREST',  biome: 1, cx: 38,  cy: 24, rx: 29, ry: 19, lv: [6, 11] },
  { name: 'VOLCANO ISLAND', biome: 2, cx: 112, cy: 72, rx: 30, ry: 21, lv: [11, 16] },
  { name: 'FROST ISLAND',   biome: 3, cx: 112, cy: 24, rx: 29, ry: 19, lv: [15, 21] },
];
const BIOME = [
  { ground: '#7fd36e', ground2: '#79cc68', tall: '#3fa34d', tall2: '#2f8a3c', sand: '#f3dca8' },
  { ground: '#3f7d4a', ground2: '#3b7646', tall: '#24552f', tall2: '#1b4424', sand: '#d8c79a' },
  { ground: '#8d7462', ground2: '#876e5c', tall: '#b0703c', tall2: '#8f5a2e', sand: '#5b4a40' },
  { ground: '#eef6ff', ground2: '#e7f1fd', tall: '#a8d4f5', tall2: '#86bde8', sand: '#d6e6f5' },
];
// wild monsters on each island: [species, weight]
const WILD = [
  [['zapper', 30], ['pebblo', 25], ['breezle', 25], ['splashel', 10], ['leafup', 10]],
  [['gloomp', 35], ['leafup', 25], ['breezle', 20], ['zapper', 12], ['embit', 8]],
  [['embit', 30], ['pebblo', 30], ['zapper', 20], ['bouldon', 12], ['gloomp', 8]],
  [['lumina', 28], ['breezle', 25], ['splashel', 20], ['voltaur', 12], ['tidalon', 8], ['lumina', 7]],
];

let MAP = null, BIOMES = null, BUILDINGS = [], NPCS = [];

function hash2(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = t => t * t * (3 - 2 * t);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, s(xf)), lerp(c, d, s(xf)), s(yf));
}

function buildWorld() {
  const g = Array.from({ length: MH }, () => Array(MW).fill('~'));
  const bio = Array.from({ length: MH }, () => Array(MW).fill(-1));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < MW && y < MH) g[y][x] = c; };
  // land
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    for (const is of ISLANDS) {
      const d = ((x - is.cx) / is.rx) ** 2 + ((y - is.cy) / is.ry) ** 2 + (vnoise(x * 0.18, y * 0.18, 7) - 0.5) * 0.5;
      if (d < 1) { bio[y][x] = is.biome; g[y][x] = d > 0.8 ? 's' : '.'; }
    }
  }
  // grass, trees, rocks, lava
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (g[y][x] !== '.') continue;
    const b = bio[y][x];
    const n1 = vnoise(x * 0.16, y * 0.16, 11), n2 = vnoise(x * 0.22, y * 0.22, 23), n3 = vnoise(x * 0.3, y * 0.3, 31);
    if (n2 > (b === 1 ? 0.56 : 0.66)) g[y][x] = 'T';
    else if (b === 2 && n3 > 0.72) g[y][x] = 'L';
    else if ((b === 2 || b === 3) && n3 < 0.16) g[y][x] = 'R';
    else if (n1 > 0.54) g[y][x] = ',';
    else if (b === 0 && n3 > 0.8) g[y][x] = 'F';
  }
  // roads and bridges, crossing the middle of each island
  const road = (x1, y1, x2, y2) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(lerp(x1, x2, i / steps)), y = Math.round(lerp(y1, y2, i / steps));
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const tx = x + ox, ty = y + oy;
        if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) continue;
        g[ty][tx] = g[ty][tx] === '~' || g[ty][tx] === 'b' ? 'b' : '=';
      }
    }
  };
  road(38, 70, 112, 70); road(38, 24, 38, 70); road(38, 24, 112, 24); road(112, 24, 112, 70);
  // towns
  BUILDINGS = [];
  ISLANDS.forEach((is, i) => {
    const tx = is.cx - 15, ty = is.cy - 11, tw = 13, th = 9;
    for (let y = ty - 1; y <= ty + th; y++) for (let x = tx - 1; x <= tx + tw; x++) set(x, y, 'f');
    // path from the town down to the main road
    for (let y = ty + th; y <= is.cy; y++) { set(is.cx - 9, y, '='); set(is.cx - 8, y, '='); }
    const addB = (bx, by, bw, bh, kind) => {
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) set(x, y, 'H');
      const door = { x: bx + Math.floor(bw / 2), y: by + bh - 1 };
      set(door.x, door.y, 'D');
      BUILDINGS.push({ x: bx, y: by, w: bw, h: bh, kind, door, island: i });
    };
    addB(tx, ty, 5, 3, 'center');
    addB(tx + 7, ty, 4, 3, 'shop');
    addB(tx + 1, ty + 5, 3, 3, 'house');
    addB(tx + 8, ty + 5, 3, 3, 'house');
  });
  // the legendary shrine at the top of Frost Island
  const sx = 126, sy = 13;
  for (let y = sy - 2; y <= sy + 2; y++) for (let x = sx - 2; x <= sx + 2; x++) if (bio[y] && bio[y][x] === 3) set(x, y, 'f');
  for (let y = sy + 2; y <= 24; y++) { set(sx, y, '='); set(sx + 1, y, '='); }
  set(sx, sy, 'P');
  // keep the starting square clear
  MAP = g; BIOMES = bio;
  buildNPCs();
}

function tileAt(tx, ty) { return tx < 0 || ty < 0 || tx >= MW || ty >= MH ? '~' : MAP[ty][tx]; }
function biomeAt(tx, ty) { return tx < 0 || ty < 0 || tx >= MW || ty >= MH ? 0 : Math.max(0, BIOMES[ty][tx]); }
function islandAt(px, py) {
  const b = BIOMES[clamp(Math.floor(py / TS), 0, MH - 1)][clamp(Math.floor(px / TS), 0, MW - 1)];
  return b >= 0 ? ISLANDS[b] : null;
}
function solidAtPx(px, py) { return SOLID_TILES.has(tileAt(Math.floor(px / TS), Math.floor(py / TS))); }
/** Just outside the Monster Center door of island i. */
function townSpot(i) { const is = ISLANDS[i]; return { x: (is.cx - 13) * TS + TS / 2, y: (is.cy - 7) * TS + TS - 8 }; }

// ---------------------------------------------------------------- townspeople and trainers
function npcAt(tx, ty, o) { return { x: tx * TS + TS / 2, y: ty * TS + TS - 6, face: 'down', ...o }; }
function buildNPCs() {
  const T = (is, dx, dy) => [ISLANDS[is].cx + dx, ISLANDS[is].cy + dy];
  NPCS = [
    npcAt(...T(0, -12, -1), { id: 'prof', kind: 'prof', name: 'PROF. OAKLEY', look: { skin: 1, hair: 2, hairColor: 4, shirt: 7, pants: 2 } }),
    npcAt(...T(0, -2, -6), { id: 'v0', kind: 'talk', look: { skin: 2, hair: 1, hairColor: 1, shirt: 3, pants: 1 },
      lines: ['Tall grass is where wild monsters hide!', 'Hold B to run. Throw a Capture Orb when a monster is weak to catch it.'] }),
    npcAt(...T(1, -2, -6), { id: 'v1', kind: 'talk', look: { skin: 0, hair: 0, hairColor: 0, shirt: 5, pants: 3 },
      lines: ['Shadow monsters are scared of light ones...', '...and light monsters are scared of shadow ones! Spooky, right?'] }),
    npcAt(...T(2, -2, -6), { id: 'v2', kind: 'talk', look: { skin: 3, hair: 1, hairColor: 2, shirt: 1, pants: 0 },
      lines: ['Water puts out fire, and rock blocks electric.', 'Bring a water or rock monster if you want to explore the volcano!'] }),
    npcAt(...T(3, -2, -6), { id: 'v3', kind: 'talk', look: { skin: 1, hair: 2, hairColor: 3, shirt: 6, pants: 2 },
      lines: ['They say a legendary monster made of northern lights lives at the top of this island.', 'Follow the path north... if you dare!'] }),
    // trainers
    npcAt(...T(0, 6, 2), { id: 't1', kind: 'trainer', face: 'left', name: 'BEACH BOY BEN', look: { skin: 2, hair: 0, hairColor: 2, shirt: 2, pants: 1 },
      team: [['zapper', 4], ['breezle', 5]], reward: 120, lines: ['Hey! Let\'s battle!'], lose: 'Wipeout! You\'re good!' }),
    npcAt(...T(0, 18, -1), { id: 't2', kind: 'trainer', face: 'left', name: 'SURFER SKY', look: { skin: 1, hair: 2, hairColor: 3, shirt: 4, pants: 0 },
      team: [['splashel', 6], ['pebblo', 6]], reward: 180, lines: ['The waves told me you\'d come!'], lose: 'Totally tubular battle!' }),
    npcAt(...T(1, 2, 6), { id: 't3', kind: 'trainer', face: 'up', name: 'SPOOKY SAM', look: { skin: 0, hair: 1, hairColor: 0, shirt: 5, pants: 3 },
      team: [['gloomp', 8], ['gloomp', 9]], reward: 260, lines: ['Boo! Did I scare you?'], lose: 'Eek! You weren\'t scared at all!' }),
    npcAt(...T(1, 14, 1), { id: 't4', kind: 'trainer', face: 'left', name: 'RANGER IVY', look: { skin: 3, hair: 2, hairColor: 1, shirt: 3, pants: 2 },
      team: [['leafup', 9], ['breezle', 10], ['thornox', 11]], reward: 340, lines: ['The forest protects its own!'], lose: 'The forest... respects you.' }),
    npcAt(...T(2, -6, 6), { id: 't5', kind: 'trainer', face: 'up', name: 'HIKER ROCKY', look: { skin: 2, hair: 0, hairColor: 2, shirt: 1, pants: 1 },
      team: [['pebblo', 12], ['bouldon', 14]], reward: 420, lines: ['My monsters are tough as stone!'], lose: 'You crushed it!' }),
    npcAt(...T(2, 14, 1), { id: 't6', kind: 'trainer', face: 'left', name: 'FIRE CHIEF FLINT', look: { skin: 1, hair: 1, hairColor: 4, shirt: 0, pants: 0 },
      team: [['embit', 13], ['zapper', 14], ['blazurr', 16]], reward: 520, lines: ['Feel the heat!'], lose: 'You put out my fire!' }),
    npcAt(...T(3, -6, 6), { id: 't7', kind: 'trainer', face: 'up', name: 'SKIER SNOW', look: { skin: 0, hair: 2, hairColor: 5, shirt: 4, pants: 3 },
      team: [['breezle', 16], ['lumina', 17]], reward: 600, lines: ['Brrr! Let\'s warm up with a battle!'], lose: 'That was cool!' }),
    npcAt(...T(3, 14, 1), { id: 't8', kind: 'trainer', face: 'left', name: 'ACE TAMER ZOE', look: { skin: 3, hair: 2, hairColor: 0, shirt: 6, pants: 2 },
      team: [['voltaur', 19], ['tidalon', 20], ['phantomaw', 21]], reward: 900, lines: ['I\'m the strongest tamer on the islands. Show me what you\'ve got!'], lose: 'Incredible... you\'re a true Monster Isles tamer!' }),
  ];
  // make sure everyone stands on open ground with a path to the main road
  for (const n of NPCS) {
    const tx = Math.floor(n.x / TS), ty = Math.floor(n.y / TS);
    const is = ISLANDS[Math.max(0, BIOMES[ty][tx])];
    const open = (x, y) => { const c = MAP[y][x]; if ((SOLID_TILES.has(c) && c !== 'H') || c === ',') MAP[y][x] = '='; };
    // straight to the island's main road row, then along it to the crossroads
    for (let y = Math.min(ty, is.cy); y <= Math.max(ty, is.cy); y++) open(tx, y);
    for (let x = Math.min(tx, is.cx); x <= Math.max(tx, is.cx); x++) open(x, is.cy);
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (SOLID_TILES.has(MAP[ty + oy][tx + ox]) && MAP[ty + oy][tx + ox] !== 'H') MAP[ty + oy][tx + ox] = '.';
    // trainers get a clear path in front of them, so they can spot you coming
    if (n.kind === 'trainer') {
      const [fx, fy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[n.face];
      for (let i = 1; i <= 4; i++) open(tx + fx * i, ty + fy * i);
    }
  }
}

// ---------------------------------------------------------------- drawing people from above
const SKINS = ['#ffe0c2', '#f2c194', '#c98a5a', '#8d5a3b'];
const HAIR_COLORS = ['#2a1a0a', '#6b3a1a', '#d4a24c', '#e85d3a', '#9ca3af', '#6d28d9'];
const SHIRTS = ['#ef4444', '#f97316', '#3b82f6', '#22c55e', '#06b6d4', '#a855f7', '#ec4899', '#f5f5f4'];
const PANTS = ['#1e3a8a', '#374151', '#78350f', '#111827'];
const HAIR_STYLES = ['SHORT', 'SPIKY', 'LONG'];

/** Draws a person seen from above-front. (x, y) = feet. face: down/up/left/right. */
function drawPerson(look, x, y, face, walkT = 0, s = 1) {
  const skin = SKINS[look.skin], hc = HAIR_COLORS[look.hairColor], shirt = SHIRTS[look.shirt], pants = PANTS[look.pants];
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
  const step = Math.sin(walkT * 0.35) * 4;
  const side = face === 'left' || face === 'right';
  // legs
  if (side) { mb(-3 + step, -6, 5, 7, pants, 3); mb(3 - step, -6, 5, 7, pants, 3); }
  else { mb(-6, -6 - Math.max(0, step), 5, 7, pants, 3); mb(6, -6 - Math.max(0, -step), 5, 7, pants, 3); }
  // body
  rrect(-12, -30, 24, 22, 9); ctx.fillStyle = shirt; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke();
  // arms
  if (!side) { mb(-14, -20 + step * 0.5, 4.5, 7, shirt, 3); mb(14, -20 - step * 0.5, 4.5, 7, shirt, 3); }
  else mb(face === 'right' ? -2 : 2, -20 + step * 0.6, 4.5, 8, shirt, 3);
  // head
  mb(0, -44, 15, 14, skin, 3);
  ctx.fillStyle = hc; ctx.strokeStyle = OL; ctx.lineWidth = 3;
  const hs = look.hair;
  if (face === 'up') {
    ctx.beginPath(); ctx.ellipse(0, -45, 15, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (hs === 2) { ctx.beginPath(); ctx.ellipse(0, -34, 12, 8, 0, 0, Math.PI); ctx.fill(); }
  } else {
    ctx.beginPath(); ctx.ellipse(0, -50, 15.5, 9, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    if (hs === 1) for (let i = -1; i <= 1; i++) mp([[i * 8 - 5, -54], [i * 8, -66], [i * 8 + 5, -54]], hc, 2.5);
    if (hs === 2) { ctx.beginPath(); ctx.ellipse(face === 'left' ? 8 : face === 'right' ? -8 : -13, -40, 5, 12, 0, 0, Math.PI * 2); ctx.fill(); if (face === 'down') { ctx.beginPath(); ctx.ellipse(13, -40, 5, 12, 0, 0, Math.PI * 2); ctx.fill(); } }
    // eyes
    ctx.fillStyle = OL;
    if (face === 'down') { ctx.beginPath(); ctx.ellipse(-5, -43, 2.2, 3, 0, 0, Math.PI * 2); ctx.ellipse(5, -43, 2.2, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    else { const ex = face === 'right' ? 7 : -7; ctx.beginPath(); ctx.ellipse(ex, -43, 2.2, 3, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- drawing the map
function drawTile(c, tx, ty, x, y) {
  const b = BIOME[biomeAt(tx, ty)];
  const alt = hash2(tx, ty, 5) > 0.5;   // gentle random patches, not a checkerboard
  switch (c) {
    case '~': {
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(x, y, TS, TS);
      const w = Math.sin(frameCount * 0.04 + tx * 0.7 + ty * 0.5);
      ctx.strokeStyle = 'rgba(191,219,254,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x + 16 + w * 4, y + 20, 7, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 34 - w * 4, y + 36, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      // foam along the shore
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      if (tileAt(tx, ty - 1) !== '~' && tileAt(tx, ty - 1) !== 'b') ctx.fillRect(x, y, TS, 5 + w * 2);
      if (tileAt(tx, ty + 1) !== '~' && tileAt(tx, ty + 1) !== 'b') ctx.fillRect(x, y + TS - 5 - w * 2, TS, 5 + w * 2);
      if (tileAt(tx - 1, ty) !== '~' && tileAt(tx - 1, ty) !== 'b') ctx.fillRect(x, y, 5 + w * 2, TS);
      if (tileAt(tx + 1, ty) !== '~' && tileAt(tx + 1, ty) !== 'b') ctx.fillRect(x + TS - 5 - w * 2, y, 5 + w * 2, TS);
      break;
    }
    case 's': ctx.fillStyle = b.sand; ctx.fillRect(x, y, TS, TS); ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x + 10, y + 14, 3, 3); ctx.fillRect(x + 30, y + 32, 3, 3); break;
    case 'b':
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(x, y, TS, TS);
      ctx.fillStyle = '#b07a46'; ctx.fillRect(x, y + 2, TS, TS - 4);
      ctx.strokeStyle = '#7c4a22'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x, y + 4 + i * 11); ctx.lineTo(x + TS, y + 4 + i * 11); ctx.stroke(); }
      break;
    case '=': ctx.fillStyle = '#dcc293'; ctx.fillRect(x, y, TS, TS); ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(x + 8, y + 30, 6, 4); ctx.fillRect(x + 32, y + 12, 5, 4); break;
    case 'f': case 'D': case 'H':
      ctx.fillStyle = alt ? '#e8d8b8' : '#e1cfad'; ctx.fillRect(x, y, TS, TS);
      ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2);
      break;
    case 'L': {
      ctx.fillStyle = b.ground; ctx.fillRect(x, y, TS, TS);
      const k = Math.sin(frameCount * 0.06 + tx + ty) * 0.15;
      ctx.fillStyle = '#f97316'; rrect(x + 2, y + 2, TS - 4, TS - 4, 14); ctx.fill();
      ctx.fillStyle = `rgba(253,224,71,${0.5 + k})`; ctx.beginPath(); ctx.arc(x + 20, y + 22, 8, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'P':
      ctx.fillStyle = '#e8d8b8'; ctx.fillRect(x, y, TS, TS);
      ctx.fillStyle = `hsla(${(frameCount * 2) % 360},90%,75%,0.6)`; ctx.beginPath(); ctx.arc(x + TS / 2, y + TS / 2, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7dd3fc'; ctx.strokeStyle = OL; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 24, y + 4); ctx.lineTo(x + 36, y + 24); ctx.lineTo(x + 24, y + 44); ctx.lineTo(x + 12, y + 24); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    default: {
      ctx.fillStyle = alt ? b.ground : b.ground2; ctx.fillRect(x, y, TS, TS);
      if (c === ',') {
        const sway = Math.sin(frameCount * 0.05 + tx * 0.9) * 2;
        for (const [ox, oy] of [[8, 40], [24, 30], [38, 44], [16, 20], [34, 16]]) {
          ctx.fillStyle = b.tall2;
          ctx.beginPath(); ctx.moveTo(x + ox - 7, y + oy); ctx.lineTo(x + ox + sway, y + oy - 18); ctx.lineTo(x + ox + 7, y + oy); ctx.fill();
          ctx.fillStyle = b.tall;
          ctx.beginPath(); ctx.moveTo(x + ox - 4, y + oy); ctx.lineTo(x + ox + 2 + sway, y + oy - 14); ctx.lineTo(x + ox + 5, y + oy); ctx.fill();
        }
      } else if (c === 'F') {
        for (const [ox, oy, col] of [[12, 14, '#f472b6'], [34, 22, '#facc15'], [20, 36, '#f87171']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + ox, y + oy, 4, 0, Math.PI * 2); ctx.fill(); }
      } else if (c === 'T' || c === 'R') { /* drawn in the object layer */ }
    }
  }
}

/** Trees and rocks stand up out of the ground, so they're drawn sorted with the people. */
function drawTree(tx, ty) {
  const x = tx * TS + TS / 2, y = ty * TS + TS - 4, b = biomeAt(tx, ty);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x, y, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
  if (b === 0) {        // palm tree
    mp([[x - 4, y], [x + 4, y], [x + 7, y - 40], [x - 1, y - 40]], '#a16207', 3);
    for (const a of [-2.6, -1.9, -1.2, -0.5, 0.2]) { ctx.save(); ctx.translate(x + 3, y - 42); ctx.rotate(a); mb(16, 0, 18, 6, '#22c55e', 3); ctx.restore(); }
  } else if (b === 1) { // dark pine
    mp([[x - 3, y], [x + 3, y], [x + 3, y - 12], [x - 3, y - 12]], '#5b3a1a', 3);
    mp([[x - 22, y - 10], [x + 22, y - 10], [x, y - 40]], '#1f5130', 3);
    mp([[x - 17, y - 26], [x + 17, y - 26], [x, y - 54]], '#256338', 3);
  } else if (b === 2) { // dead tree
    ctx.strokeStyle = OL; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 34); ctx.moveTo(x, y - 22); ctx.lineTo(x - 12, y - 34); ctx.moveTo(x, y - 28); ctx.lineTo(x + 12, y - 42); ctx.stroke();
    ctx.strokeStyle = '#57534e'; ctx.lineWidth = 4; ctx.stroke();
  } else {              // snowy pine
    mp([[x - 3, y], [x + 3, y], [x + 3, y - 12], [x - 3, y - 12]], '#5b3a1a', 3);
    mp([[x - 22, y - 10], [x + 22, y - 10], [x, y - 42]], '#2f7a52', 3);
    mp([[x - 16, y - 28], [x + 16, y - 28], [x, y - 56]], '#368a5e', 3);
    mp([[x - 8, y - 42], [x + 8, y - 42], [x, y - 56]], '#f8fafc', 2);
  }
}
function drawRock(tx, ty) {
  const x = tx * TS + TS / 2, y = ty * TS + TS - 6;
  mp([[x - 20, y], [x - 18, y - 18], [x - 4, y - 28], [x + 14, y - 24], [x + 20, y]], biomeAt(tx, ty) === 3 ? '#cbd5e1' : '#9ca3af', 3);
  mp([[x - 6, y - 22], [x + 6, y - 22], [x, y - 14]], 'rgba(255,255,255,0.5)', 0);
}
function drawBuilding(bd) {
  const x = bd.x * TS, y = bd.y * TS, w = bd.w * TS, h = bd.h * TS;
  const roof = bd.kind === 'center' ? '#ef4444' : bd.kind === 'shop' ? '#3b82f6' : ['#a16207', '#16a34a', '#7c3aed'][(bd.x + bd.y) % 3];
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + 6, y + h - 6, w, 10);
  rrect(x + 4, y + h * 0.35, w - 8, h * 0.65, 6); ctx.fillStyle = '#fef3c7'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OL; ctx.stroke();
  mp([[x - 6, y + h * 0.42], [x + w / 2, y - 10], [x + w + 6, y + h * 0.42]], roof, 4);
  // windows
  ctx.fillStyle = '#7dd3fc';
  for (let i = 0; i < bd.w; i++) if (i !== Math.floor(bd.w / 2)) { rrect(x + i * TS + 12, y + h * 0.5, 24, 20, 4); ctx.fill(); ctx.stroke(); }
  // door
  const dx = bd.door.x * TS, dy = bd.door.y * TS;
  rrect(dx + 10, dy + 8, 28, 40, 6); ctx.fillStyle = '#7c4a22'; ctx.fill(); ctx.stroke();
  if (bd.kind === 'center') { text('+', x + w / 2, y + h * 0.18 + 6, 34, '#fff', 'center', OL); }
  if (bd.kind === 'shop') { text('SHOP', x + w / 2, y + h * 0.22 + 6, 20, '#fff', 'center', OL); }
}
