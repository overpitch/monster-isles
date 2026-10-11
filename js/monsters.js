'use strict';
// =====================================================================
//  Monsters: types, moves, the 15 species (with their cartoon designs),
//  and making / leveling up individual monsters.
// =====================================================================

const OL = '#1a1030';   // outline color

Object.assign(sfx, {
  encounter: () => [880, 660, 880, 660, 1100].forEach((f, i) => tone(f, 0.08, 'square', 0, 0.06, i * 0.07)),
  shake:     () => tone(300, 0.1, 'triangle', 200, 0.07),
  caught:    () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.15, 'square', 0, 0.07, i * 0.12)),
  broke:     () => tone(500, 0.3, 'sawtooth', 100, 0.07),
  levelup:   () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0, 0.06, i * 0.08)),
  evolve:    () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'triangle', 0, 0.07, i * 0.15)),
  faint:     () => tone(400, 0.6, 'square', 60, 0.07),
  buy:       () => tone(1200, 0.08, 'square', 1600, 0.05),
  step:      () => noise(0.04, 0.02, 500),
  talk:      () => tone(500 + Math.random() * 200, 0.03, 'square', 0, 0.03),
});

// ---------------------------------------------------------------- types
const TYPES = {
  normal:   { name: 'NORMAL',   color: '#a8a29e' },
  fire:     { name: 'FIRE',     color: '#f97316' },
  water:    { name: 'WATER',    color: '#3b82f6' },
  grass:    { name: 'GRASS',    color: '#22c55e' },
  electric: { name: 'ELECTRIC', color: '#eab308' },
  rock:     { name: 'ROCK',     color: '#a16207' },
  wind:     { name: 'WIND',     color: '#5eead4' },
  shadow:   { name: 'SHADOW',   color: '#7c3aed' },
  light:    { name: 'LIGHT',    color: '#fde68a' },
};
// how strong an attack type is against a defending type (missing = 1)
const CHART = {
  fire:     { grass: 2, wind: 1, water: 0.5, rock: 0.5, fire: 0.5 },
  water:    { fire: 2, rock: 2, grass: 0.5, water: 0.5 },
  grass:    { water: 2, rock: 2, fire: 0.5, grass: 0.5, wind: 0.5 },
  electric: { water: 2, wind: 2, rock: 0.5, electric: 0.5, grass: 0.5 },
  rock:     { electric: 2, fire: 2, wind: 2, rock: 0.5 },
  wind:     { grass: 2, rock: 0.5, electric: 0.5 },
  shadow:   { light: 2, shadow: 0.5 },
  light:    { shadow: 2, light: 0.5 },
  normal:   { rock: 0.5 },
};
function effectiveness(atkType, defTypes) {
  return defTypes.reduce((m, t) => m * ((CHART[atkType] || {})[t] ?? 1), 1);
}

// ---------------------------------------------------------------- moves
// fx: what happens besides damage. self/foe stat changes, heal, drain, status chance.
const MOVES = {
  tackle:     { name: 'TACKLE',      type: 'normal',   power: 40, acc: 100 },
  scratch:    { name: 'SCRATCH',     type: 'normal',   power: 40, acc: 100 },
  quickhit:   { name: 'QUICK HIT',   type: 'normal',   power: 40, acc: 100, priority: 1 },
  bodyslam:   { name: 'BODY SLAM',   type: 'normal',   power: 85, acc: 100, status: ['paralyze', 0.2] },
  growl:      { name: 'GROWL',       type: 'normal',   power: 0,  acc: 100, foe: { atk: -1 } },
  focus:      { name: 'FOCUS',       type: 'normal',   power: 0,  acc: 100, self: { atk: 1 } },
  rest:       { name: 'REST',        type: 'normal',   power: 0,  acc: 100, heal: 0.5 },
  ember:      { name: 'EMBER',       type: 'fire',     power: 40, acc: 100, status: ['burn', 0.1] },
  flamewheel: { name: 'FLAME WHEEL', type: 'fire',     power: 65, acc: 100, status: ['burn', 0.1] },
  fireblast:  { name: 'FIRE BLAST',  type: 'fire',     power: 105, acc: 85, status: ['burn', 0.2] },
  bubble:     { name: 'BUBBLE',      type: 'water',    power: 40, acc: 100 },
  waterpulse: { name: 'WATER PULSE', type: 'water',    power: 65, acc: 100 },
  tidalwave:  { name: 'TIDAL WAVE',  type: 'water',    power: 100, acc: 90 },
  vinewhip:   { name: 'VINE WHIP',   type: 'grass',    power: 45, acc: 100 },
  drainleaf:  { name: 'DRAIN LEAF',  type: 'grass',    power: 55, acc: 100, drain: 0.5 },
  leafblade:  { name: 'LEAF BLADE',  type: 'grass',    power: 80, acc: 100 },
  solarbeam:  { name: 'SOLAR BEAM',  type: 'grass',    power: 110, acc: 85 },
  spark:      { name: 'SPARK',       type: 'electric', power: 40, acc: 100, status: ['paralyze', 0.2] },
  thunderbolt:{ name: 'THUNDERBOLT', type: 'electric', power: 85, acc: 100, status: ['paralyze', 0.1] },
  charge:     { name: 'CHARGE UP',   type: 'electric', power: 0,  acc: 100, self: { atk: 1, spd: 1 } },
  rockthrow:  { name: 'ROCK THROW',  type: 'rock',     power: 50, acc: 95 },
  rockslide:  { name: 'ROCK SLIDE',  type: 'rock',     power: 80, acc: 90 },
  harden:     { name: 'HARDEN',      type: 'rock',     power: 0,  acc: 100, self: { def: 1 } },
  gust:       { name: 'GUST',        type: 'wind',     power: 40, acc: 100 },
  airslash:   { name: 'AIR SLASH',   type: 'wind',     power: 70, acc: 95 },
  tornado:    { name: 'TORNADO',     type: 'wind',     power: 100, acc: 85 },
  shadowclaw: { name: 'SHADOW CLAW', type: 'shadow',   power: 60, acc: 100 },
  nightshade: { name: 'NIGHT SHADE', type: 'shadow',   power: 85, acc: 100 },
  scare:      { name: 'SCARE',       type: 'shadow',   power: 0,  acc: 100, foe: { atk: -1, spd: -1 } },
  sparkle:    { name: 'SPARKLE',     type: 'light',    power: 45, acc: 100 },
  lightbeam:  { name: 'LIGHT BEAM',  type: 'light',    power: 85, acc: 100 },
  healglow:   { name: 'HEAL GLOW',   type: 'light',    power: 0,  acc: 100, heal: 0.5 },
  aurora:     { name: 'AURORA BEAM', type: 'light',    power: 100, acc: 95, foe: { atk: -1 } },
};

// ---------------------------------------------------------------- drawing helpers
function mb(x, y, rx, ry, color, lw = 4) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = OL; ctx.stroke();
}
function mp(points, color, lw = 4) {
  ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = OL; ctx.stroke();
}
function eye(x, y, r, look = 1, blink = false) {
  if (blink) { ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke(); return; }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = OL; ctx.stroke();
  ctx.fillStyle = OL; ctx.beginPath(); ctx.ellipse(x + r * 0.3 * look, y + r * 0.1, r * 0.55, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + r * 0.1 * look, y - r * 0.3, r * 0.22, 0, Math.PI * 2); ctx.fill();
}
function smile(x, y, w, open = false) {
  ctx.strokeStyle = OL; ctx.lineWidth = 3;
  if (open) { ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.arc(x, y, w, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke(); return; }
  ctx.beginPath(); ctx.arc(x, y - w * 0.4, w, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
}
function feet(xs, y, color, r = 9) { for (const x of xs) mb(x, y, r, r * 0.6, color, 3); }
function flame(x, y, s, t, c1 = '#f97316', c2 = '#fde047') {
  const w = Math.sin(t * 0.3) * 3 * s;
  mp([[x - 10 * s, y], [x + 10 * s, y], [x + 4 * s + w, y - 20 * s], [x + w * 1.5, y - 34 * s], [x - 5 * s + w, y - 18 * s]], c1, 3);
  ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(x + w * 0.5, y - 8 * s, 4 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
}
function leaf(x, y, len, ang, color = '#4ade80') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.4, len, 0); ctx.quadraticCurveTo(len * 0.5, len * 0.4, 0, 0);
  ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(len * 0.8, 0); ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}
function zig(x, y, s, color = '#facc15') {
  mp([[x, y], [x + 8 * s, y - 10 * s], [x + 4 * s, y - 10 * s], [x + 12 * s, y - 24 * s], [x + 2 * s, y - 12 * s], [x + 6 * s, y - 12 * s]], color, 3);
}

// Each species draws itself facing right with its feet at (0, 0). t = time, for wiggles.
const SPECIES = {
  leafup: {
    name: 'LEAFUP', types: ['grass'], base: { hp: 45, atk: 49, def: 49, spd: 45 }, catch: 0.35, xp: 64, size: 0.85,
    learn: [[1, 'tackle'], [1, 'growl'], [5, 'vinewhip'], [9, 'drainleaf'], [15, 'leafblade'], [22, 'solarbeam']],
    evolve: { lv: 14, into: 'thornox' }, dex: 'A sprout that soaks up sunshine through the big leaf on its head.',
    draw(t, b) {
      feet([-14, 14], -2, '#15803d');
      mb(0, -30, 32, 28, '#86efac');
      mb(8, -22, 14, 10, '#bbf7d0', 0);
      leaf(-2, -56, 34, -1.9 + Math.sin(t * 0.08) * 0.15); leaf(2, -56, 30, -1.1 + Math.sin(t * 0.08 + 1) * 0.15, '#22c55e');
      eye(10, -36, 7, 1, b); eye(-8, -36, 6, 1, b); smile(2, -24, 7);
    },
  },
  thornox: {
    name: 'THORNOX', types: ['grass'], base: { hp: 75, atk: 82, def: 83, spd: 60 }, catch: 0.12, xp: 142, size: 1.15,
    learn: [[1, 'vinewhip'], [1, 'harden'], [14, 'leafblade'], [20, 'bodyslam'], [26, 'solarbeam']],
    dex: 'Its back is covered in thorns. It guards forests from anyone who litters.',
    draw(t, b) {
      feet([-30, -10, 14, 32], -2, '#14532d', 11);
      mb(0, -36, 48, 32, '#22c55e');
      for (let i = 0; i < 5; i++) mp([[-36 + i * 16, -58 + Math.abs(i - 2) * 4], [-28 + i * 16, -86 + Math.abs(i - 2) * 6], [-20 + i * 16, -58 + Math.abs(i - 2) * 4]], '#a3e635', 3);
      mb(36, -46, 22, 20, '#4ade80');
      leaf(30, -64, 30, -1.4 + Math.sin(t * 0.06) * 0.1);
      eye(42, -50, 6, 1, b); smile(46, -38, 6);
    },
  },
  embit: {
    name: 'EMBIT', types: ['fire'], base: { hp: 39, atk: 55, def: 43, spd: 65 }, catch: 0.35, xp: 64, size: 0.85,
    learn: [[1, 'scratch'], [1, 'growl'], [5, 'ember'], [10, 'quickhit'], [15, 'flamewheel'], [22, 'fireblast']],
    evolve: { lv: 14, into: 'blazurr' }, dex: 'A little fire fox. When it is happy its tail flame burns brighter.',
    draw(t, b) {
      flame(-30, -28, 1, t);
      feet([-12, 14], -2, '#9a3412');
      mb(0, -28, 28, 24, '#fb923c');
      mb(6, -20, 14, 10, '#fed7aa', 0);
      mp([[-16, -46], [-10, -68], [-2, -48]], '#fb923c', 3); mp([[6, -48], [16, -68], [20, -44]], '#fb923c', 3);
      eye(12, -32, 6.5, 1, b); eye(-4, -32, 5.5, 1, b); smile(8, -22, 6);
    },
  },
  blazurr: {
    name: 'BLAZURR', types: ['fire'], base: { hp: 72, atk: 90, def: 68, spd: 85 }, catch: 0.12, xp: 142, size: 1.15,
    learn: [[1, 'ember'], [1, 'focus'], [14, 'flamewheel'], [20, 'bodyslam'], [26, 'fireblast']],
    dex: 'Its fiery mane can melt rocks. It runs so fast it leaves burning footprints.',
    draw(t, b) {
      flame(-46, -44, 1.4, t);
      feet([-26, -6, 16, 32], -2, '#7c2d12', 11);
      mb(0, -38, 44, 30, '#ea580c');
      for (let i = 0; i < 4; i++) flame(16 + i * 8, -60, 0.9, t + i * 7);
      mb(34, -50, 22, 20, '#f97316');
      mp([[26, -66], [22, -88], [36, -68]], '#fde68a', 3);
      eye(40, -54, 6, 1, b); smile(46, -42, 6, true);
    },
  },
  splashel: {
    name: 'SPLASHEL', types: ['water'], base: { hp: 44, atk: 48, def: 65, spd: 43 }, catch: 0.35, xp: 64, size: 0.85,
    learn: [[1, 'tackle'], [1, 'growl'], [5, 'bubble'], [9, 'harden'], [15, 'waterpulse'], [22, 'tidalwave']],
    evolve: { lv: 14, into: 'tidalon' }, dex: 'A round little turtle. It shoots bubbles from its mouth when it gets excited.',
    draw(t, b) {
      feet([-16, 14], -2, '#1e40af');
      mb(-8, -28, 30, 24, '#a16207');
      for (let i = 0; i < 3; i++) mb(-16 + i * 9, -36 + (i % 2) * 8, 6, 5, '#ca8a04', 2);
      mb(14, -34, 20, 18, '#60a5fa');
      mp([[-30, -40], [-44, -52], [-34, -30]], '#60a5fa', 3);
      eye(20, -38, 6, 1, b); smile(22, -28, 5);
    },
  },
  tidalon: {
    name: 'TIDALON', types: ['water'], base: { hp: 80, atk: 80, def: 90, spd: 70 }, catch: 0.12, xp: 142, size: 1.2,
    learn: [[1, 'bubble'], [1, 'harden'], [14, 'waterpulse'], [21, 'bodyslam'], [27, 'tidalwave']],
    dex: 'A sea serpent whose crest is a crashing wave. Sailors say it brings good luck.',
    draw(t, b) {
      ctx.lineCap = 'round';
      const wob = Math.sin(t * 0.08) * 6;
      ctx.strokeStyle = OL; ctx.lineWidth = 34; ctx.beginPath(); ctx.moveTo(-50, -10); ctx.quadraticCurveTo(-20, -60 + wob, 10, -20); ctx.quadraticCurveTo(30, 10, 30, -60); ctx.stroke();
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 26; ctx.stroke();
      mp([[10, -70], [20, -110], [30, -84], [44, -104], [44, -70]], '#bfdbfe', 3);
      mb(36, -66, 22, 18, '#60a5fa');
      eye(42, -70, 6, 1, b); smile(48, -58, 5);
    },
  },
  zapper: {
    name: 'ZAPPER', types: ['electric'], base: { hp: 35, atk: 55, def: 40, spd: 90 }, catch: 0.45, xp: 60, size: 0.75,
    learn: [[1, 'quickhit'], [1, 'growl'], [4, 'spark'], [10, 'charge'], [16, 'thunderbolt']],
    evolve: { lv: 16, into: 'voltaur' }, dex: 'A fluffy ball of static. Petting it makes your hair stand up.',
    draw(t, b) {
      zig(-30, -14, 1.2);
      feet([-10, 12], -2, '#a16207', 8);
      mb(0, -26, 26, 24, '#fde047');
      mp([[-16, -42], [-26, -70], [-6, -48]], '#fde047', 3); mp([[8, -48], [20, -74], [20, -44]], '#fde047', 3);
      mb(-12, -22, 6, 5, '#f87171', 0); mb(16, -22, 6, 5, '#f87171', 0);
      eye(10, -32, 6, 1, b); eye(-6, -32, 5, 1, b); smile(4, -22, 5);
    },
  },
  voltaur: {
    name: 'VOLTAUR', types: ['electric'], base: { hp: 65, atk: 90, def: 60, spd: 110 }, catch: 0.15, xp: 140, size: 1.1,
    learn: [[1, 'spark'], [1, 'charge'], [16, 'thunderbolt'], [22, 'bodyslam'], [28, 'airslash']],
    dex: 'Lightning crackles between its horns. It can run faster than a thunderstorm.',
    draw(t, b) {
      feet([-24, -6, 14, 30], -2, '#1f2937', 10);
      mb(0, -36, 42, 28, '#facc15');
      for (let i = 0; i < 3; i++) mp([[-30 + i * 18, -58], [-24 + i * 18, -44], [-18 + i * 18, -58]], '#1f2937', 2);
      mb(32, -50, 20, 18, '#fde047');
      zig(24, -64, 1.1, '#fef08a'); zig(36, -64, 1.1, '#fef08a');
      if ((t >> 3) % 2) { ctx.strokeStyle = '#fef9c3'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(30, -88); ctx.lineTo(40, -80); ctx.lineTo(34, -76); ctx.lineTo(46, -70); ctx.stroke(); }
      eye(38, -52, 6, 1, b); smile(44, -42, 5);
    },
  },
  pebblo: {
    name: 'PEBBLO', types: ['rock'], base: { hp: 40, atk: 70, def: 90, spd: 25 }, catch: 0.45, xp: 60, size: 0.75,
    learn: [[1, 'tackle'], [1, 'harden'], [6, 'rockthrow'], [12, 'focus'], [18, 'rockslide']],
    evolve: { lv: 16, into: 'bouldon' }, dex: 'It looks just like a normal rock, until it opens its eyes and waves.',
    draw(t, b) {
      mp([[-30, 0], [-34, -30], [-16, -50], [14, -52], [32, -32], [30, 0]], '#9ca3af');
      mp([[-10, -40], [4, -44], [0, -34]], '#d1d5db', 2);
      mb(-30, -20 + Math.sin(t * 0.1) * 3, 8, 7, '#9ca3af', 3); mb(32, -20 - Math.sin(t * 0.1) * 3, 8, 7, '#9ca3af', 3);
      eye(10, -28, 6, 1, b); eye(-8, -28, 5, 1, b); smile(2, -16, 6);
    },
  },
  bouldon: {
    name: 'BOULDON', types: ['rock'], base: { hp: 80, atk: 100, def: 125, spd: 30 }, catch: 0.15, xp: 140, size: 1.25,
    learn: [[1, 'rockthrow'], [1, 'harden'], [16, 'rockslide'], [22, 'bodyslam'], [30, 'focus']],
    dex: 'A walking boulder with a glowing crystal heart. It sleeps standing up for years.',
    draw(t, b) {
      feet([-22, 22], -2, '#57534e', 14);
      mp([[-44, -8], [-50, -50], [-26, -86], [24, -90], [50, -54], [44, -8]], '#78716c');
      mp([[-6, -88], [0, -114], [10, -88]], '#67e8f9', 3); mp([[8, -88], [18, -104], [20, -86]], '#a5f3fc', 3);
      mb(-50, -40, 14, 12, '#78716c'); mb(52, -40, 14, 12, '#78716c');
      mp([[-20, -60], [-4, -64], [-10, -50]], '#a8a29e', 2);
      eye(14, -52, 7, 1, b); eye(-10, -52, 6, 1, b); smile(4, -36, 8);
    },
  },
  breezle: {
    name: 'BREEZLE', types: ['wind'], base: { hp: 45, atk: 50, def: 45, spd: 85 }, catch: 0.45, xp: 62, size: 0.8,
    learn: [[1, 'tackle'], [1, 'gust'], [8, 'quickhit'], [14, 'airslash'], [22, 'tornado']],
    dex: 'A fluffy puff of wind with wings. It rides breezes all the way across the sea.',
    draw(t, b) {
      const fl = Math.sin(t * 0.25) * 0.4;
      ctx.save(); ctx.translate(-20, -40); ctx.rotate(-0.6 + fl);
      mp([[0, 0], [-30, -20], [-26, 0], [-34, 10]], '#99f6e4', 3); ctx.restore();
      mb(0, -36, 26, 22, '#ccfbf1');
      ctx.strokeStyle = '#5eead4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-6, -34, 8, 0.5, 4.5); ctx.stroke();
      ctx.save(); ctx.translate(16, -44); ctx.rotate(0.4 - fl);
      mp([[0, 0], [24, -22], [20, 0], [30, 8]], '#5eead4', 3); ctx.restore();
      mp([[24, -34], [36, -30], [24, -26]], '#fbbf24', 3);
      feet([-6, 8], -8, '#fbbf24', 5);
      eye(14, -40, 5.5, 1, b);
    },
  },
  gloomp: {
    name: 'GLOOMP', types: ['shadow'], base: { hp: 40, atk: 60, def: 40, spd: 70 }, catch: 0.4, xp: 62, size: 0.85,
    learn: [[1, 'scare'], [1, 'tackle'], [7, 'shadowclaw'], [13, 'rest'], [19, 'nightshade']],
    evolve: { lv: 18, into: 'phantomaw' }, dex: 'A shy ghost that hides in shadows. It giggles when it scares someone.',
    draw(t, b) {
      const fy = Math.sin(t * 0.07) * 5 - 10;
      ctx.save(); ctx.translate(0, fy);
      ctx.beginPath(); ctx.moveTo(-28, -30); ctx.arc(0, -36, 28, Math.PI, 0);
      ctx.lineTo(28, 0); for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(21 - i * 14, -14 + (i % 2) * 8, 14 - i * 14, 0);
      ctx.closePath(); ctx.fillStyle = '#a78bfa'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OL; ctx.stroke();
      eye(10, -42, 6, 1, b); eye(-6, -42, 5, 1, b); smile(4, -28, 6, true);
      ctx.restore();
    },
  },
  phantomaw: {
    name: 'PHANTOMAW', types: ['shadow'], base: { hp: 70, atk: 100, def: 65, spd: 95 }, catch: 0.12, xp: 150, size: 1.2,
    learn: [[1, 'shadowclaw'], [1, 'scare'], [18, 'nightshade'], [24, 'bodyslam'], [30, 'rest']],
    dex: 'Its giant grin can swallow shadows whole. It only comes out on moonless nights.',
    draw(t, b) {
      const fy = Math.sin(t * 0.06) * 6 - 14;
      ctx.save(); ctx.translate(0, fy);
      ctx.beginPath(); ctx.moveTo(-44, -40); ctx.arc(0, -50, 44, Math.PI, 0);
      ctx.lineTo(44, 0); for (let i = 0; i < 5; i++) ctx.quadraticCurveTo(35 - i * 18, -18 + (i % 2) * 10, 26 - i * 18, 0);
      ctx.closePath(); ctx.fillStyle = '#5b21b6'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OL; ctx.stroke();
      mp([[-26, -84], [-38, -112], [-14, -90]], '#4c1d95', 3); mp([[16, -90], [32, -116], [30, -84]], '#4c1d95', 3);
      ctx.fillStyle = '#1e1b4b'; ctx.beginPath(); ctx.arc(8, -34, 24, 0, Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; for (let i = 0; i < 5; i++) mp([[-12 + i * 9, -34], [-8 + i * 9, -26], [-4 + i * 9, -34]], '#fff', 1.5);
      eye(18, -62, 7, 1, b); eye(-6, -62, 6, 1, b);
      ctx.restore();
    },
  },
  lumina: {
    name: 'LUMINA', types: ['light'], base: { hp: 55, atk: 55, def: 60, spd: 80 }, catch: 0.3, xp: 100, size: 0.85,
    learn: [[1, 'sparkle'], [1, 'healglow'], [12, 'lightbeam'], [18, 'focus'], [24, 'aurora']],
    dex: 'A floating spark of light. Seeing one on a snowy night means a wish will come true.',
    draw(t, b) {
      const fy = Math.sin(t * 0.08) * 6 - 18;
      ctx.save(); ctx.translate(0, fy);
      ctx.fillStyle = 'rgba(253,230,138,0.3)'; ctx.beginPath(); ctx.arc(0, -30, 46, 0, Math.PI * 2); ctx.fill();
      const fl = Math.sin(t * 0.3) * 0.3;
      ctx.save(); ctx.translate(-14, -40); ctx.rotate(-0.5 - fl); mb(-14, 0, 16, 9, 'rgba(255,255,255,0.85)', 3); ctx.restore();
      ctx.save(); ctx.translate(14, -40); ctx.rotate(0.5 + fl); mb(14, 0, 16, 9, 'rgba(255,255,255,0.85)', 3); ctx.restore();
      mb(0, -30, 24, 24, '#fef9c3');
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, -62, 16, 5, 0, 0, Math.PI * 2); ctx.stroke();
      eye(8, -32, 5.5, 1, b); eye(-6, -32, 5, 1, b); smile(2, -22, 5);
      ctx.restore();
    },
  },
  aurorix: {
    name: 'AURORIX', types: ['light', 'wind'], base: { hp: 100, atk: 110, def: 100, spd: 100 }, catch: 0.1, xp: 250, size: 1.35, legendary: true,
    learn: [[1, 'lightbeam'], [1, 'airslash'], [1, 'healglow'], [30, 'aurora'], [36, 'tornado']],
    dex: 'A legendary deer made of northern lights. Only the bravest tamers have ever seen it.',
    draw(t, b) {
      const hue = (t * 2) % 360;
      feet([-26, -8, 16, 32], -2, '#e0f2fe', 9);
      mb(0, -42, 42, 24, '#f0f9ff');
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = `hsla(${(hue + i * 40) % 360},90%,70%,0.7)`;
        ctx.beginPath(); ctx.ellipse(-30 + i * 12, -64 - Math.sin(t * 0.1 + i) * 6, 8, 20, -0.3, 0, Math.PI * 2); ctx.fill();
      }
      mb(36, -60, 18, 16, '#f0f9ff');
      ctx.strokeStyle = OL; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(30, -74); ctx.lineTo(22, -104); ctx.moveTo(26, -90); ctx.lineTo(12, -100); ctx.moveTo(40, -74); ctx.lineTo(48, -106); ctx.moveTo(45, -92); ctx.lineTo(58, -100); ctx.stroke();
      ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 4; ctx.stroke();
      eye(42, -62, 5.5, 1, b);
    },
  },
};
const DEX_ORDER = Object.keys(SPECIES);

/** Draws a species at (x, y) (feet), scale s, facing (1 right, -1 left). */
function drawMonster(spId, x, y, s = 1, face = 1, t = frameCount, opts = {}) {
  const sp = SPECIES[spId];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face * s * (sp.size || 1), s * (sp.size || 1));
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts.silhouette) ctx.filter = 'brightness(0)';
  const blink = (t + x) % 200 < 6;
  // little bounce when idle
  const bob = opts.still ? 0 : Math.sin(t * 0.1 + x * 0.01) * 1.5;
  ctx.translate(0, bob);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, 2 - bob, 40, 8, 0, 0, Math.PI * 2); ctx.fill();
  sp.draw(t, blink);
  if (opts.flash) {
    ctx.filter = 'brightness(0) invert(1)'; ctx.globalAlpha = opts.flash; sp.draw(t, blink);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- individual monsters
let monUid = 1;
function statsFor(sp, lv) {
  const b = SPECIES[sp].base;
  return {
    hp: Math.floor(b.hp * 2 * lv / 100) + lv + 10,
    atk: Math.floor(b.atk * 2 * lv / 100) + 5,
    def: Math.floor(b.def * 2 * lv / 100) + 5,
    spd: Math.floor(b.spd * 2 * lv / 100) + 5,
  };
}
const xpForLevel = lv => Math.floor(Math.pow(lv, 3) * 0.8);
function makeMon(sp, lv) {
  const learned = SPECIES[sp].learn.filter(([l]) => l <= lv).map(([, m]) => m);
  const moves = [...new Set(learned)].slice(-4);
  const st = statsFor(sp, lv);
  return { uid: Date.now() % 1e9 + (monUid++), sp, lv, xp: xpForLevel(lv), hp: st.hp, status: null, moves };
}
function monStats(m) { return statsFor(m.sp, m.lv); }
function monName(m) { return SPECIES[m.sp].name; }

/** Gives XP. Returns messages about level-ups, new moves, and whether it should evolve. */
function giveXP(m, amount) {
  const msgs = [];
  m.xp += amount;
  while (m.lv < 50 && m.xp >= xpForLevel(m.lv + 1)) {
    const before = monStats(m);
    m.lv++;
    const after = monStats(m);
    m.hp = Math.min(after.hp, m.hp + (after.hp - before.hp));
    msgs.push({ text: `${monName(m)} grew to level ${m.lv}!`, sfx: 'levelup' });
    for (const [l, mv] of SPECIES[m.sp].learn) {
      if (l !== m.lv || m.moves.includes(mv)) continue;
      if (m.moves.length < 4) { m.moves.push(mv); msgs.push({ text: `${monName(m)} learned ${MOVES[mv].name}!` }); }
      else {
        // swap out the weakest move
        let wi = 0;
        m.moves.forEach((x, i) => { if ((MOVES[x].power || 30) < (MOVES[m.moves[wi]].power || 30)) wi = i; });
        const old = m.moves[wi]; m.moves[wi] = mv;
        msgs.push({ text: `${monName(m)} forgot ${MOVES[old].name} and learned ${MOVES[mv].name}!` });
      }
    }
  }
  return msgs;
}
function canEvolve(m) { const e = SPECIES[m.sp].evolve; return e && m.lv >= e.lv ? e.into : null; }
function evolveMon(m) {
  const into = canEvolve(m);
  if (!into) return;
  const before = monStats(m);
  m.sp = into;
  const after = monStats(m);
  m.hp = Math.min(after.hp, m.hp + (after.hp - before.hp));
}
