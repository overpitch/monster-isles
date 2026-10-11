'use strict';
// =====================================================================
//  MONSTER ISLES — core: screen, sound, controls, helpers
// =====================================================================

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const SW = 1280, SH = 720;           // the game always draws at this size, then scales to the window
const FONT = '"Luckiest Guy", "Arial Black", sans-serif';
const FONT2 = '"Nunito", "Arial", sans-serif';
const IS_XBOX = /xbox/i.test(navigator.userAgent);
let frameCount = 0;

try { navigator.gamepadInputEmulation = 'gamepad'; } catch (e) {}

function resize() {
  cv.width = SW; cv.height = SH;
  const s = Math.min(innerWidth / SW, innerHeight / SH);
  cv.style.width = SW * s + 'px';
  cv.style.height = SH * s + 'px';
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- math helpers
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - (1 - t) * (1 - t);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const DEG = Math.PI / 180;
function boxHit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

// ---------------------------------------------------------------- sound
let actx = null, master = null;
function initAudio() {
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createDynamicsCompressor();
      master.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume();
  } catch (e) {}
}
function tone(freq, dur, type = 'square', slide = 0, vol = 0.08, delay = 0) {
  if (!actx) return;
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur);
}
let noiseBuf = null;
function noise(dur, vol = 0.1, freq = 1200, delay = 0) {
  if (!actx) return;
  if (!noiseBuf) {
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = actx.currentTime + delay;
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t0); s.stop(t0 + dur);
}
const sfx = {
  jump:    () => tone(300, 0.12, 'triangle', 600, 0.06),
  djump:   () => tone(420, 0.12, 'triangle', 800, 0.06),
  swing:   () => noise(0.09, 0.05, 3000),
  hitS:    () => { noise(0.08, 0.14, 2500); tone(220, 0.07, 'square', 110, 0.05); },
  hitM:    () => { noise(0.14, 0.2, 1800); tone(160, 0.12, 'square', 70, 0.07); },
  hitL:    () => { noise(0.3, 0.28, 1200); tone(110, 0.3, 'sawtooth', 40, 0.09); },
  shield:  () => tone(900, 0.1, 'sine', 600, 0.07),
  shieldBreak: () => { tone(600, 0.5, 'square', 80, 0.08); noise(0.4, 0.15, 3000); },
  land:    () => noise(0.06, 0.05, 600),
  fire:    () => tone(700, 0.15, 'sawtooth', 200, 0.05),
  magic:   () => { tone(880, 0.25, 'sine', 1760, 0.05); tone(1320, 0.2, 'sine', 660, 0.04, 0.05); },
  ice:     () => { tone(1500, 0.3, 'sine', 3000, 0.04); noise(0.2, 0.05, 6000); },
  teleport:() => tone(200, 0.25, 'sine', 1600, 0.06),
  smoke:   () => noise(0.35, 0.1, 900),
  star:    () => tone(1200, 0.08, 'square', 1800, 0.04),
  boom:    () => { noise(0.6, 0.35, 700); tone(80, 0.5, 'sawtooth', 30, 0.1); },
  heal:    () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, 'triangle', 0, 0.06, i * 0.06)),
  item:    () => tone(660, 0.1, 'square', 990, 0.05),
  ledge:   () => tone(250, 0.06, 'triangle', 0, 0.05),
  ringout: () => { tone(900, 0.6, 'sawtooth', 60, 0.08); noise(0.5, 0.15, 2000, 0.1); },
  ko:      () => { noise(0.9, 0.35, 900); tone(140, 0.9, 'sawtooth', 30, 0.12); [784, 659, 523].forEach((f, i) => tone(f, 0.25, 'square', 0, 0.06, 0.3 + i * 0.2)); },
  count:   () => tone(440, 0.18, 'square', 0, 0.08),
  go:      () => { tone(880, 0.5, 'square', 0, 0.08); tone(1320, 0.5, 'square', 0, 0.05, 0.05); },
  select:  () => tone(660, 0.05, 'square', 0, 0.05),
  join:    () => [523, 784].forEach((f, i) => tone(f, 0.1, 'square', 0, 0.06, i * 0.07)),
  ready:   () => [659, 988].forEach((f, i) => tone(f, 0.1, 'square', 0, 0.06, i * 0.07)),
  pause:   () => tone(880, 0.1, 'square'),
  win:     () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'square', 0, 0.07, i * 0.14)),
};

// ---------------------------------------------------------------- controls
// Devices: each Xbox controller ('pad0'...), plus two keyboard players ('kb1', 'kb2').
const keys = {}, tapped = {};
addEventListener('keydown', e => {
  keys[e.code] = true; tapped[e.code] = true;
  initAudio();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Slash', 'Quote'].includes(e.code)) e.preventDefault();
  if (e.code === 'F11') { e.preventDefault(); toggleFullscreen(); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('pointerdown', () => initAudio());
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function toggleFullscreen() {
  try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } catch (e) {}
}

const KEYBOARDS = {
  kb1: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
         jump: ['Space'], attack: ['KeyJ'], special: ['KeyK'], block: ['KeyL', 'ShiftLeft'], start: ['Enter'], back: ['Escape'] },
  kb2: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
         jump: ['Numpad0', 'Slash'], attack: ['Numpad1', 'Period'], special: ['Numpad2', 'Comma'], block: ['Numpad3', 'ShiftRight'],
         start: ['NumpadEnter'], back: ['Backspace'] },
};

/** Connected real controllers. Odd devices (headsets, remotes) are skipped when a real controller is there. */
function padList() {
  const ps = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(p => p && p.connected);
  const real = ps.filter(p => p.mapping === 'standard');
  return real.length ? real : ps;
}
// A stick or button only counts after it's been seen centered/released once (a stuck one can't drive the game).
const settled = new Map();
function readPad(p) {
  let s = settled.get(p.index);
  if (!s) { s = { axes: [], buttons: [] }; settled.set(p.index, s); }
  const b = n => {
    const btn = p.buttons[n];
    const down = !!(btn && (btn.pressed || btn.value > 0.5));
    if (!down) s.buttons[n] = true;
    return down && !!s.buttons[n];
  };
  const axis = i => { const v = p.axes[i] || 0; if (Math.abs(v) < 0.3) s.axes[i] = true; return s.axes[i] ? v : 0; };
  const ax = axis(0), ay = axis(1);
  return {
    left: ax < -0.35 || b(14), right: ax > 0.35 || b(15), up: ay < -0.5 || b(12), down: ay > 0.5 || b(13),
    jump: b(0) || b(3),                       // A or Y
    attack: b(2),                             // X
    special: b(1),                            // B
    block: b(4) || b(5) || b(6) || b(7),      // bumpers or triggers
    start: b(9), back: b(8),
  };
}

const EMPTY = { left: false, right: false, up: false, down: false, jump: false, attack: false, special: false, block: false, start: false, back: false };
let prevDev = {};
let devices = {};   // id -> state with edge flags (xxxP = pressed this frame)

function pollDevices() {
  const k = c => !!(keys[c] || tapped[c]);
  const now = {};
  for (const id in KEYBOARDS) {
    const set = KEYBOARDS[id], o = {};
    for (const f in set) o[f] = set[f].some(k);
    now[id] = o;
  }
  for (const p of padList()) now['pad' + p.index] = readPad(p);
  for (const id in now) {
    const cur = now[id], prev = prevDev[id] || EMPTY;
    for (const f of Object.keys(EMPTY)) cur[f + 'P'] = cur[f] && !prev[f];
    // a fresh push on the stick, for menus
    cur.anyP = Object.keys(EMPTY).some(f => cur[f + 'P']);
  }
  prevDev = now;
  devices = now;
  for (const c in tapped) delete tapped[c];
  return now;
}
function dev(id) { return devices[id] || EMPTY; }
/** Menu input from every device at once. */
function anyDev() {
  const o = {};
  for (const f of Object.keys(EMPTY)) { o[f] = false; o[f + 'P'] = false; }
  for (const id in devices) for (const f in o) o[f] = o[f] || devices[id][f];
  o.confirmP = o.jumpP || o.startP || o.attackP;
  o.backP = o.specialP || o.backP;
  // the Enter key confirms too
  if (keys.Enter && !prevEnter) o.confirmP = true;
  return o;
}
let prevEnter = false;
function endFrameInput() { prevEnter = !!keys.Enter; }

function rumble(devId, ms = 150, strength = 0.6) {
  if (!devId || !devId.startsWith('pad')) return;
  const idx = +devId.slice(3);
  const g = padList().find(p => p.index === idx);
  if (!g || !g.vibrationActuator) return;
  try { g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }); } catch (e) {}
}

// ---------------------------------------------------------------- drawing helpers
function text(s, x, y, size, color, align = 'center', outline = '#1a1030', font = FONT) {
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (outline) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.18); ctx.strokeStyle = outline; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function panel(x, y, w, h, fill = 'rgba(20,12,40,0.8)', stroke = '#fff', r = 14) {
  rrect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.stroke(); }
}

// ---------------------------------------------------------------- Xbox
addEventListener('wheel', e => e.preventDefault(), { passive: false });
if (IS_XBOX) {
  // Edge on Xbox maps B to browser Back. Keep an extra history entry so Back stays in the game (same as Evil One).
  let guarded = false;
  const guard = () => { if (guarded) return; try { history.pushState({ monsterIsles: true }, ''); guarded = true; } catch (e) {} };
  for (const type of ['pointerdown', 'keydown']) addEventListener(type, guard);
  addEventListener('popstate', () => { guarded = false; guard(); });
}
