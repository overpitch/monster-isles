'use strict';
// Test helpers. In the browser console: load this file, then use the functions below.
window.step = n => { for (let i = 0; i < n; i++) update(); };
// fake controllers: setPad(i, {a:true, right:true...})
window.fakePads = [];
const realGetPads = navigator.getGamepads.bind(navigator);
function mkPad(i) { return { index: i, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; }
window.usePads = n => { fakePads = Array.from({ length: n }, (_, i) => mkPad(i)); navigator.getGamepads = () => fakePads; step(2); };
window.press = (i, btn, frames = 2) => {   // btn: number (0=A,1=B,2=X,9=Start,12-15 dpad)
  fakePads[i].buttons[btn].pressed = true; step(frames);
  fakePads[i].buttons[btn].pressed = false; step(2);
};
window.hold = (i, btn, frames) => { fakePads[i].buttons[btn].pressed = true; step(frames); fakePads[i].buttons[btn].pressed = false; step(1); };
window.BTN = { A: 0, B: 1, X: 2, Y: 3, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
/** Makes a ready-to-play trainer for player slot (skipping the creator). */
window.quickTrainer = (devId, slot, party = [['leafup', 8]]) => {
  const spot = townSpot(0);
  const p = newPlayer(devId, slot);
  const tr = { id: 'test' + slot + Date.now(), name: slot ? 'MAHER' : 'MURILO', look: { skin: 1, hair: slot, hairColor: 1, shirt: slot ? 3 : 0, pants: 0 },
               party: party.map(([s, l]) => makeMon(s, l)), box: [], bag: { orb: 5, superorb: 2, potion: 3, revive: 1 }, money: 1000,
               x: spot.x + slot * 50, y: spot.y, face: 'down', seen: {}, caught: {}, beaten: {}, center: 0, legend: false };
  p.trainer = tr; p.x = tr.x; p.y = tr.y; p.mode = 'walk';
  players[slot] = p; scene = 'world';
  return p;
};
/** Mashes A through messages until the battle wants a choice (or ends). */
window.toChoice = (f, maxFrames = 2000) => {
  for (let i = 0; i < maxFrames && f.phase !== 'choose' && f.phase !== 'end' && f.phase !== 'replace'; i++) {
    for (const p of f.players()) { const pi = players.indexOf(p); if (fakePads[pi]) fakePads[pi].buttons[0].pressed = (i % 4 === 0); }
    step(1);
  }
  for (const pad of fakePads) pad.buttons[0].pressed = false;
  step(1);
  return f.phase;
};

/** Can you walk from the start to every person, door and the shrine? */
window.checkReach = () => {
  const start = townSpot(0), sx = Math.floor(start.x / TS), sy = Math.floor((start.y - 6) / TS);
  const seen = new Set([sx + ',' + sy]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || SOLID_TILES.has(tileAt(nx, ny))) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return {
    startTile: tileAt(sx, sy),
    unreachableNPCs: NPCS.filter(n => !seen.has(Math.floor(n.x / TS) + ',' + Math.floor((n.y - 6) / TS))).map(n => n.id),
    doorsOk: BUILDINGS.every(b => b.kind === 'house' || seen.has(b.door.x + ',' + (b.door.y + 1))),
    shrine: seen.has('126,13'),
  };
};

/** Button-mashing test: two fake controllers press random buttons for a long time. Reports crashes. */
window.mash = (frames = 20000, seed = 1) => {
  let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const problems = [];
  const btns = [0, 1, 2, 9, 12, 13, 14, 15, 4];
  try {
    for (let f = 0; f < frames; f++) {
      for (const pad of fakePads) {
        if (f % 6 === 0) for (const b of btns) pad.buttons[b].pressed = r() < (b === 9 ? 0.02 : b >= 12 ? 0.25 : 0.12);
      }
      update();
      if (f % 50 === 0) render();
      for (const p of players) {
        if (!p.trainer) continue;
        if (![p.x, p.y].every(Number.isFinite)) { problems.push('bad position'); return problems; }
        if (p.mode === 'walk' && blocked(p.x, p.y) && !NPCS.some(n => Math.abs(n.x - p.x) < 20 && Math.abs(n.y - p.y) < 14)) problems.push(`P${p.slot + 1} stuck in a wall at frame ${f}`);
      }
      if (scene === 'title') { // came back to the title: start again
        players = []; quickTrainer('pad0', 0, [['leafup', 12], ['zapper', 10]]); if (fakePads[1]) quickTrainer('pad1', 1, [['embit', 12]]);
      }
    }
  } catch (e) { problems.push('CRASH: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')); }
  return [...new Set(problems)];
};

/** Runs many complete battles with random choices. Reports any that freeze or crash. */
window.battleStress = (count = 200, seed = 7) => {
  let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const sp = DEX_ORDER;
  const team = () => Array.from({ length: 1 + Math.floor(r() * 3) }, () => makeMon(sp[Math.floor(r() * sp.length)], 3 + Math.floor(r() * 25)));
  const problems = [], results = {};
  const realUpdate = Fight.prototype.update;
  for (let k = 0; k < count; k++) {
    const kinds = ['wild', 'trainer', 'pvp', 'team-wild', 'team-trainer'];
    const kind = kinds[k % kinds.length];
    const p1 = newPlayer('x1', 0), p2 = newPlayer('x2', 1);
    for (const p of [p1, p2]) { p.trainer = { name: 'T' + p.slot, party: team(), box: [], bag: { orb: 3, superorb: 1, potion: 2, revive: 1 }, money: 100, seen: {}, caught: {}, beaten: {} }; p.x = 1800; p.y = 3300; }
    let f;
    try {
      if (kind === 'pvp') f = new Fight('pvp', p1, { player: p2 });
      else if (kind.endsWith('trainer')) f = new Fight('trainer', p1, { npc: NPCS.find(n => n.kind === 'trainer') });
      else f = new Fight('wild', p1, { wild: makeMon(sp[Math.floor(r() * sp.length)], 3 + Math.floor(r() * 25)) });
      let joined = !kind.startsWith('team');
      let frames = 0;
      while (f.phase !== 'end' && frames < 60 * 60 * 10) {
        frames++;
        if (!joined && frames > 200) { f.join(p2); joined = true; }
        if (f.phase === 'choose') {
          for (const c of f.humans()) {
            if (c.action || !alive(c.active)) continue;
            const roll = r();
            const foes = f.foesOf(c).filter(o => alive(o.active));
            const healthy = c.party.filter(m => alive(m) && !f.isActive(m));
            if (roll < 0.06 && f.kind === 'wild') c.action = { type: 'run' };
            else if (roll < 0.12 && f.kind === 'wild' && c.owner.trainer.bag.orb > 0) c.action = { type: 'orb', item: 'orb', target: f.sides[1][0] };
            else if (roll < 0.17 && healthy.length) c.action = { type: 'switch', mon: healthy[0] };
            else if (roll < 0.2 && c.owner.trainer.bag.potion > 0 && c.active.hp < monStats(c.active).hp) c.action = { type: 'item', item: 'potion', mon: c.active };
            else if (roll < 0.21 && f.kind === 'pvp') c.action = { type: 'forfeit' };
            else c.action = { type: 'move', move: c.active.moves[Math.floor(r() * c.active.moves.length)], target: foes[Math.floor(r() * foes.length)] };
          }
        }
        if (f.phase === 'replace') {
          for (const c of f.humans()) if (c.needReplace) { const m = c.party.find(x => alive(x) && !f.isActive(x)); if (m) { c.active = m; c.needReplace = false; } }
          if (!f.humans().some(c => c.needReplace)) f.phase = 'msg';
        }
        if (f.msg) f.msgT = 999;   // skip waiting on messages
        realUpdate.call(f, {});
        for (const c of f.sides[0].concat(f.sides[1])) for (const m of c.party) if (!Number.isFinite(m.hp) || m.hp < 0) { problems.push(`${kind}: bad HP`); }
      }
      if (f.phase !== 'end') problems.push(`${kind} #${k}: battle never ended (phase ${f.phase})`);
      else results[kind + ':' + f.result] = (results[kind + ':' + f.result] || 0) + 1;
    } catch (e) { problems.push(`${kind} #${k}: CRASH ${e.message} @ ${(e.stack || '').split('\n')[1]}`); }
  }
  return { problems: [...new Set(problems)].slice(0, 10), results };
};
