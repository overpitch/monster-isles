'use strict';
// =====================================================================
//  Monster Isles: players, exploring, menus, shops, saving,
//  split-screen 2 player, and the title screen.
// =====================================================================

const SAVE_KEY = 'monsterIsles.v1';
let SAVE = { trainers: [] };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && Array.isArray(s.trainers)) SAVE = s; } catch (e) {}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) {} }
function saveTrainer(p) {
  const tr = p.trainer;
  tr.x = p.x; tr.y = p.y; tr.face = p.face;
  const i = SAVE.trainers.findIndex(t => t.id === tr.id);
  if (i >= 0) SAVE.trainers[i] = tr; else SAVE.trainers.push(tr);
  writeSave();
}

let scene = 'title';
let players = [];
let titleT = 0;

buildWorld();

// ---------------------------------------------------------------- players
function newPlayer(devId, slot) {
  return { slot, dev: devId, trainer: null, x: 0, y: 0, face: 'down', walkT: 0, stepAcc: 0, mode: 'pick', menu: [], dialog: null,
           fight: null, toast: null, banner: null, lastIsland: null, pickI: 0, wait: 12, creator: null, starterI: 0, prompt: null, trade: null, spotted: null };
}
function toast(p, s) { p.toast = { text: s, t: 150 }; }
function say(p, lines, onDone, who) { p.mode = 'dialog'; p.dialog = { lines: Array.isArray(lines) ? lines : [lines], i: 0, t: 0, onDone, who }; }
function otherPlayer(p) { return players.find(q => q !== p); }
function healParty(tr) { for (const m of tr.party) { m.hp = monStats(m).hp; m.status = null; } }

function loadTrainer(p, tr) {
  p.trainer = tr;
  const spot = townSpot(0);
  p.x = tr.x ?? spot.x; p.y = tr.y ?? spot.y; p.face = tr.face || 'down';
  // never start inside something solid
  if (solidAtPx(p.x, p.y)) { const s = townSpot(tr.center || 0); p.x = s.x; p.y = s.y; }
  p.mode = 'walk';
  if (!tr.party.length) startStarter(p);
}

function startStarter(p) {
  say(p, [`Hello, ${p.trainer.name}! I'm Professor Oakley.`, 'These islands are full of amazing monsters!', 'Every tamer needs a partner. Pick one of these three!'], () => { p.mode = 'starter'; p.starterI = 0; }, 'PROF. OAKLEY');
}

// ---------------------------------------------------------------- main update
function update() {
  frameCount++;
  pollDevices();
  const A = anyDev();
  if (A.confirmP) initAudio();
  if (scene === 'title') {
    titleT++;
    if (titleT > 30) {
      const id = Object.keys(devices).find(k => devices[k].jumpP || devices[k].startP);
      if (id) { players = [newPlayer(id, 0)]; scene = 'world'; sfx.join(); }
    }
    endFrameInput(); return;
  }
  // a second controller can join any time
  if (players.length === 1) {
    for (const id in devices) {
      if (id === players[0].dev) continue;
      if (devices[id].jumpP || devices[id].startP) { players.push(newPlayer(id, 1)); sfx.join(); toast(players[0], 'Player 2 joined!'); break; }
    }
  }
  // battles (one update per battle, even if both players are in it)
  const fights = [...new Set(players.map(p => p.fight).filter(Boolean))];
  for (const f of fights) {
    f.update(devices);
    if (f.phase === 'end') endFight(f);
  }
  for (const p of players.slice()) updatePlayer(p, dev(p.dev));
  // auto-save
  if (frameCount % 600 === 0) for (const p of players) if (p.trainer) saveTrainer(p);
  endFrameInput();
}

function endFight(f) {
  for (const p of f.players()) {
    p.fight = null; p.mode = 'walk';
    const tr = p.trainer;
    if (f.result === 'lose' && f.kind !== 'pvp') {
      healParty(tr);
      tr.money = Math.floor(tr.money / 2);
      const s = townSpot(tr.center || 0); p.x = s.x; p.y = s.y; p.face = 'down';
    }
    if (f.legendary && (f.result === 'caught' || f.result === 'win')) tr.legend = true;
    if (f.kind === 'pvp') { healParty(tr); toast(p, 'Friendly battle! Both teams got healed.'); }
    for (const m of tr.party) if (m.hp <= 0) m.status = null;
    saveTrainer(p);
  }
}

function updatePlayer(p, d) {
  if (p.toast && --p.toast.t <= 0) p.toast = null;
  if (p.banner && --p.banner.t <= 0) p.banner = null;
  switch (p.mode) {
    case 'pick': updatePick(p, d); break;
    case 'creator': updateCreator(p, d); break;
    case 'starter': updateStarter(p, d); break;
    case 'dialog': updateDialog(p, d); break;
    case 'walk': updateWalk(p, d); break;
    case 'menu': updateMenu(p, d); break;
    case 'prompt': updatePrompt(p, d); break;
    case 'trade': updateTrade(p, d); break;
    case 'waiting': if (d.specialP) { p.mode = 'walk'; const o = otherPlayer(p); if (o && o.mode === 'prompt') o.mode = 'walk'; } break;
    case 'fight': if (!p.fight) p.mode = 'walk'; break;
  }
}

// ---------------------------------------------------------------- choosing / making a trainer
function pickList(p) {
  const used = players.filter(q => q !== p && q.trainer).map(q => q.trainer.id);
  const list = SAVE.trainers.filter(t => !used.includes(t.id)).map(t => ({ label: t.name, sub: `${t.party.length} monsters · ${Object.keys(t.caught).length} caught`, tr: t }));
  list.push({ label: '+ NEW TRAINER', newOne: true });
  if (p.slot === 1) list.push({ label: 'CANCEL', cancel: true });
  return list;
}
function updatePick(p, d) {
  if (p.wait > 0) { p.wait--; return; }   // the button press that joined doesn't also pick
  const list = pickList(p);
  p.pickI = clamp(p.pickI, 0, list.length - 1);
  if (d.upP) { p.pickI = (p.pickI + list.length - 1) % list.length; sfx.select(); }
  if (d.downP) { p.pickI = (p.pickI + 1) % list.length; sfx.select(); }
  if (d.jumpP) {
    const it = list[p.pickI]; sfx.select();
    if (it.cancel) { players.splice(players.indexOf(p), 1); return; }
    if (it.newOne) { p.mode = 'creator'; p.creator = { step: 'name', name: '', i: 0, look: { skin: Math.floor(Math.random() * 4), hair: 0, hairColor: 1, shirt: p.slot ? 2 : 0, pants: 0 }, row: 0 }; return; }
    loadTrainer(p, it.tr);
  }
  if (d.specialP && p.slot === 1) players.splice(players.indexOf(p), 1);
}
const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(['DEL', 'RANDOM', 'OK']);
const NAME_IDEAS = ['ACE', 'NOVA', 'REX', 'LUNA', 'BLAZE', 'SKY', 'KAI', 'ZARA', 'MILO', 'JADE', 'ROCKY', 'PIXEL'];
function updateCreator(p, d) {
  const c = p.creator;
  if (c.step === 'name') {
    const cols = 7;
    if (d.leftP) c.i = Math.max(0, c.i - 1);
    if (d.rightP) c.i = Math.min(KEYS.length - 1, c.i + 1);
    if (d.upP) c.i = Math.max(0, c.i - cols);
    if (d.downP) c.i = Math.min(KEYS.length - 1, c.i + cols);
    if (d.leftP || d.rightP || d.upP || d.downP) sfx.select();
    if (d.specialP) { if (c.name.length) c.name = c.name.slice(0, -1); else { p.mode = 'pick'; return; } }
    if (d.jumpP) {
      const k = KEYS[c.i]; sfx.select();
      if (k === 'DEL') c.name = c.name.slice(0, -1);
      else if (k === 'RANDOM') c.name = pick(NAME_IDEAS);
      else if (k === 'OK') { if (c.name.length) { c.step = 'look'; c.row = 0; } }
      else if (c.name.length < 8) c.name += k;
    }
  } else {
    const rows = ['skin', 'hair', 'hairColor', 'shirt', 'pants', 'done'];
    const counts = { skin: SKINS.length, hair: HAIR_STYLES.length, hairColor: HAIR_COLORS.length, shirt: SHIRTS.length, pants: PANTS.length };
    if (d.upP) { c.row = (c.row + rows.length - 1) % rows.length; sfx.select(); }
    if (d.downP) { c.row = (c.row + 1) % rows.length; sfx.select(); }
    const k = rows[c.row];
    if (k !== 'done' && (d.leftP || d.rightP)) { c.look[k] = (c.look[k] + (d.rightP ? 1 : -1) + counts[k]) % counts[k]; sfx.select(); }
    if (d.specialP) { c.step = 'name'; }
    if (d.jumpP && k === 'done') {
      const spot = townSpot(0);
      const tr = { id: 't' + Date.now() + p.slot, name: c.name, look: { ...c.look }, party: [], box: [], bag: { orb: 5, potion: 3 }, money: 500,
                   x: spot.x + p.slot * 50, y: spot.y, face: 'down', seen: {}, caught: {}, beaten: {}, center: 0, legend: false };
      p.trainer = tr; p.x = tr.x; p.y = tr.y;
      saveTrainer(p);
      sfx.ready();
      startStarter(p);
    }
  }
}
const STARTERS = ['leafup', 'embit', 'splashel'];
function updateStarter(p, d) {
  if (d.leftP) { p.starterI = (p.starterI + 2) % 3; sfx.select(); }
  if (d.rightP) { p.starterI = (p.starterI + 1) % 3; sfx.select(); }
  if (d.jumpP) {
    const sp = STARTERS[p.starterI];
    const m = makeMon(sp, 5);
    p.trainer.party.push(m); markCaught(p.trainer, sp);
    saveTrainer(p);
    sfx.caught();
    say(p, [`You chose ${SPECIES[sp].name}! Take good care of it!`, 'Here are 5 Capture Orbs and 3 Potions to get you started.', 'Walk through tall grass to find wild monsters. Have fun exploring!'], null, 'PROF. OAKLEY');
  }
}

// ---------------------------------------------------------------- dialog
function updateDialog(p, d) {
  const dl = p.dialog;
  dl.t++;
  if (dl.t % 3 === 0 && dl.t < dl.lines[dl.i].length / 1.5) sfx.talk();
  if ((d.jumpP || d.specialP) && dl.t > 8) {
    if (dl.t < dl.lines[dl.i].length / 1.5) { dl.t = 999; return; }
    dl.i++; dl.t = 0;
    if (dl.i >= dl.lines.length) { p.dialog = null; p.mode = 'walk'; if (dl.onDone) dl.onDone(); }
  }
}

// ---------------------------------------------------------------- walking around
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function blocked(px, py, self) {
  for (const [ox, oy] of [[-10, -2], [10, -2], [-10, -12], [10, -12]]) if (solidAtPx(px + ox, py + oy)) return true;
  for (const n of NPCS) if (Math.abs(n.x - px) < 20 && Math.abs(n.y - py) < 14) return true;
  return false;
}
function updateWalk(p, d) {
  const tr = p.trainer;
  if (!tr) { p.mode = 'pick'; return; }
  let dx = (d.right ? 1 : 0) - (d.left ? 1 : 0), dy = (d.down ? 1 : 0) - (d.up ? 1 : 0);
  const speed = (d.special || d.block) ? 5.4 : 3.2;
  let moved = 0;
  if (dx || dy) {
    const L = Math.hypot(dx, dy); dx /= L; dy /= L;
    if (Math.abs(dx) > Math.abs(dy)) p.face = dx > 0 ? 'right' : 'left'; else p.face = dy > 0 ? 'down' : 'up';
    const nx = p.x + dx * speed, ny = p.y + dy * speed;
    if (!blocked(nx, p.y)) { p.x = nx; moved += Math.abs(dx * speed); }
    if (!blocked(p.x, ny)) { p.y = ny; moved += Math.abs(dy * speed); }
    p.walkT += moved > 0 ? speed / 3.2 : 0;
  } else p.walkT = 0;
  // which island are we on?
  const isl = islandAt(p.x, p.y);
  if (isl && isl !== p.lastIsland) { p.banner = { text: isl.name, t: 150 }; p.lastIsland = isl; }
  // wild monsters in tall grass
  const tile = tileAt(Math.floor(p.x / TS), Math.floor((p.y - 6) / TS));
  if (moved > 0 && tile === ',' && tr.party.some(alive)) {
    p.stepAcc += moved;
    if (p.stepAcc > TS) {
      p.stepAcc = 0;
      if (Math.random() < 0.13) { startWild(p, isl); return; }
    }
  }
  // trainers who spot you
  for (const n of NPCS) {
    if (n.kind !== 'trainer' || tr.beaten[n.id] || !tr.party.some(alive)) continue;
    if (spots(n, p)) {
      p.spotted = { npc: n, t: 40 };
      sfx.encounter();
      say(p, n.lines.map(l => `${n.name}: ${l}`), () => startTrainer(p, n), n.name);
      return;
    }
  }
  if (d.startP || d.attackP) { openPause(p); return; }
  if (d.jumpP) interact(p);
}
function spots(n, p) {
  const [fx, fy] = DIRS[n.face];
  const ntx = Math.floor(n.x / TS), nty = Math.floor((n.y - 6) / TS), ptx = Math.floor(p.x / TS), pty = Math.floor((p.y - 6) / TS);
  for (let i = 1; i <= 4; i++) {
    const tx = ntx + fx * i, ty = nty + fy * i;
    if (SOLID_TILES.has(tileAt(tx, ty))) return false;
    if (tx === ptx && ty === pty) return true;
  }
  return false;
}
function interact(p) {
  const [fx, fy] = DIRS[p.face];
  const ix = p.x + fx * 34, iy = p.y - 10 + fy * 34;
  const o = otherPlayer(p);
  // join your friend's battle
  if (o && o.fight && o.fight.kind !== 'pvp' && Math.hypot(o.x - p.x, o.y - p.y) < 150) {
    if (o.fight.join(p)) { p.mode = 'fight'; sfx.join(); }
    else toast(p, p.trainer.party.some(alive) ? "You can't join this battle." : 'Your monsters need healing first!');
    return;
  }
  if (o && o.trainer && Math.hypot(o.x - ix, (o.y - 10) - iy) < 36) { openInteract(p, o); return; }
  for (const n of NPCS) {
    if (Math.hypot(n.x - ix, (n.y - 10) - iy) > 36) continue;
    n.face = { up: 'down', down: 'up', left: 'right', right: 'left' }[p.face];
    if (n.kind === 'prof') {
      if (!p.trainer.party.length) startStarter(p);
      else say(p, [`How's it going, ${p.trainer.name}?`, `You've caught ${Object.keys(p.trainer.caught).length} of ${DEX_ORDER.length} monsters so far. Keep exploring!`], null, n.name);
    } else if (n.kind === 'trainer') {
      if (p.trainer.beaten[n.id]) say(p, `${n.name}: ${n.lose}`, null, n.name);
      else if (!p.trainer.party.some(alive)) say(p, `${n.name}: Heal your monsters first, then we'll battle!`, null, n.name);
      else say(p, n.lines.map(l => `${n.name}: ${l}`), () => startTrainer(p, n), n.name);
    } else say(p, n.lines, null);
    return;
  }
  const tx = Math.floor(ix / TS), ty = Math.floor(iy / TS), t = tileAt(tx, ty);
  if (t === 'D') {
    const b = BUILDINGS.find(bb => bb.door.x === tx && bb.door.y === ty);
    if (!b) return;
    if (b.kind === 'center') {
      healParty(p.trainer); p.trainer.center = b.island; saveTrainer(p);
      sfx.heal();
      say(p, ['Welcome to the Monster Center!', 'Your monsters are all healed up!'], () => { p.menu = [{ type: 'center', i: 0 }]; p.mode = 'menu'; });
    } else if (b.kind === 'shop') { p.menu = [{ type: 'shop', i: 0 }]; p.mode = 'menu'; }
    else say(p, pick(["Nobody's home.", 'The door is locked.', 'You hear snoring inside...']));
    return;
  }
  if (t === 'P') {
    if (p.trainer.legend) say(p, 'The shrine sparkles quietly. AURORIX is your friend now.');
    else if (!p.trainer.party.some(alive)) say(p, 'The shrine glows... but your monsters are too tired.');
    else say(p, ['The shrine starts to glow...', 'The sky fills with northern lights!'], () => { const f = startWild(p, ISLANDS[3], makeMon('aurorix', 30)); if (f) f.legendary = true; });
  }
}
function startWild(p, isl, forced) {
  const b = isl ? isl.biome : 0;
  let mon = forced;
  if (!mon) {
    const table = WILD[b], total = table.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total, sp = table[0][0];
    for (const [s, w] of table) { if ((r -= w) < 0) { sp = s; break; } }
    const [lo, hi] = ISLANDS[b].lv;
    mon = makeMon(sp, lo + Math.floor(Math.random() * (hi - lo + 1)));
  }
  sfx.encounter(); rumble(p.dev, 200, 0.5);
  const f = new Fight('wild', p, { wild: mon });
  p.mode = 'fight';
  return f;
}
function startTrainer(p, n) { p.mode = 'fight'; new Fight('trainer', p, { npc: n }); }

// ---------------------------------------------------------------- menus
function openPause(p) { p.mode = 'menu'; p.menu = [{ type: 'pause', i: 0 }]; sfx.pause(); }
function pauseItems(p) { return ['MONSTERS', 'BAG', 'MONSTER DEX', 'SAVE', p.slot === 0 ? 'QUIT TO TITLE' : 'LEAVE GAME', 'CLOSE']; }
function openInteract(p, o) {
  if (o.mode !== 'walk') { toast(p, `${o.trainer.name} is busy right now.`); return; }
  p.mode = 'menu'; p.menu = [{ type: 'interact', i: 0, other: o }];
}
function listNav(m, n, d) {
  if (!n) return;
  if (d.upP) { m.i = (m.i + n - 1) % n; sfx.select(); }
  if (d.downP) { m.i = (m.i + 1) % n; sfx.select(); }
}
function updateMenu(p, d) {
  const m = p.menu[p.menu.length - 1];
  if (!m) { p.mode = 'walk'; return; }
  const tr = p.trainer;
  const back = () => { p.menu.pop(); sfx.select(); if (!p.menu.length) p.mode = 'walk'; };
  const B = d.specialP || d.backP;
  switch (m.type) {
    case 'pause': {
      const items = pauseItems(p);
      listNav(m, items.length, d);
      if (B || d.startP) { p.menu = []; p.mode = 'walk'; return; }
      if (d.jumpP) {
        sfx.select();
        const it = items[m.i];
        if (it === 'MONSTERS') p.menu.push({ type: 'party', i: 0 });
        else if (it === 'BAG') p.menu.push({ type: 'bag', i: 0 });
        else if (it === 'MONSTER DEX') p.menu.push({ type: 'dex', i: 0 });
        else if (it === 'SAVE') { saveTrainer(p); toast(p, 'Game saved!'); }
        else if (it === 'QUIT TO TITLE') { for (const q of players) if (q.trainer) saveTrainer(q); players = []; scene = 'title'; titleT = 0; }
        else if (it === 'LEAVE GAME') { saveTrainer(p); players.splice(players.indexOf(p), 1); if (players[0]) toast(players[0], `${tr.name} left the game.`); }
        else { p.menu = []; p.mode = 'walk'; }
      }
      break;
    }
    case 'party': {
      listNav(m, tr.party.length, d);
      if (B) return back();
      if (d.jumpP && tr.party.length) { sfx.select(); p.menu.push({ type: 'monOpts', i: 0, mon: tr.party[m.i], idx: m.i }); }
      break;
    }
    case 'monOpts': {
      const opts = ['SUMMARY', 'MAKE LEADER', 'USE ITEM', 'BACK'];
      listNav(m, opts.length, d);
      if (B) return back();
      if (d.jumpP) {
        const o = opts[m.i]; sfx.select();
        if (o === 'SUMMARY') p.menu.push({ type: 'summary', i: 0, mon: m.mon });
        else if (o === 'MAKE LEADER') { tr.party.splice(m.idx, 1); tr.party.unshift(m.mon); p.menu.pop(); p.menu[p.menu.length - 1].i = 0; toast(p, `${monName(m.mon)} leads the team!`); }
        else if (o === 'USE ITEM') p.menu.push({ type: 'bag', i: 0, forMon: m.mon });
        else back();
      }
      break;
    }
    case 'summary': if (B || d.jumpP) back(); break;
    case 'bag': {
      const items = ITEM_ORDER.filter(k => tr.bag[k] > 0);
      listNav(m, items.length, d);
      if (B) return back();
      if (d.jumpP && items.length) {
        const k = items[m.i], it = ITEMS[k];
        if (it.orb) { toast(p, 'Throw orbs during a wild battle!'); return; }
        if (m.forMon) useItemOn(p, k, m.forMon);
        else p.menu.push({ type: 'useOn', i: 0, item: k });
      }
      break;
    }
    case 'useOn': {
      listNav(m, tr.party.length, d);
      if (B) return back();
      if (d.jumpP) useItemOn(p, m.item, tr.party[m.i]);
      break;
    }
    case 'dex': {
      const n = DEX_ORDER.length;
      if (d.leftP) m.i = (m.i + n - 1) % n; if (d.rightP) m.i = (m.i + 1) % n;
      if (d.upP) m.i = (m.i + n - 5) % n; if (d.downP) m.i = (m.i + 5) % n;
      if (d.leftP || d.rightP || d.upP || d.downP) sfx.select();
      if (B || d.jumpP) back();
      break;
    }
    case 'shop': {
      const n = ITEM_ORDER.length + 1;
      listNav(m, n, d);
      if (B) return back();
      if (d.jumpP) {
        if (m.i === ITEM_ORDER.length) return back();
        const k = ITEM_ORDER[m.i], it = ITEMS[k];
        if (tr.money >= it.price) { tr.money -= it.price; tr.bag[k] = (tr.bag[k] || 0) + 1; sfx.buy(); toast(p, `Bought a ${it.name}!`); }
        else { toast(p, "You don't have enough money."); sfx.broke(); }
      }
      break;
    }
    case 'center': {
      const opts = ['PC BOX', 'LEAVE'];
      listNav(m, opts.length, d);
      if (B || (d.jumpP && m.i === 1)) return back();
      if (d.jumpP) { sfx.select(); p.menu.push({ type: 'box', i: 0, col: 0 }); }
      break;
    }
    case 'box': {
      if (d.leftP || d.rightP) { m.col = 1 - m.col; m.i = 0; sfx.select(); }
      const list = m.col === 0 ? tr.party : tr.box;
      listNav(m, list.length, d);
      if (B) return back();
      if (d.jumpP && list.length) {
        if (m.col === 0) {
          if (tr.party.length <= 1) toast(p, 'You need at least one monster with you!');
          else { tr.box.push(tr.party.splice(m.i, 1)[0]); sfx.select(); m.i = Math.min(m.i, tr.party.length - 1); }
        } else {
          if (tr.party.length >= 6) toast(p, 'Your team is full (6 monsters).');
          else { const mon = tr.box.splice(m.i, 1)[0]; mon.hp = monStats(mon).hp; mon.status = null; tr.party.push(mon); sfx.select(); m.i = Math.max(0, Math.min(m.i, tr.box.length - 1)); }
        }
      }
      break;
    }
    case 'interact': {
      const o = m.other, opts = ['BATTLE', 'TRADE', 'GIVE ITEM', 'CANCEL'];
      listNav(m, opts.length, d);
      if (B) return back();
      if (d.jumpP) {
        const op = opts[m.i]; sfx.select();
        if (!players.includes(o) || o.mode !== 'walk') { toast(p, `${o.trainer.name} is busy right now.`); p.menu = []; p.mode = 'walk'; return; }
        if (op === 'BATTLE') {
          if (!tr.party.some(alive) || !o.trainer.party.some(alive)) { toast(p, 'Both teams need healthy monsters!'); return; }
          o.mode = 'prompt'; o.prompt = { from: p, type: 'battle' }; p.mode = 'waiting'; p.menu = [];
        } else if (op === 'TRADE') { o.mode = 'prompt'; o.prompt = { from: p, type: 'trade' }; p.mode = 'waiting'; p.menu = []; }
        else if (op === 'GIVE ITEM') p.menu.push({ type: 'give', i: 0, other: o });
        else { p.menu = []; p.mode = 'walk'; }
      }
      break;
    }
    case 'give': {
      const items = ITEM_ORDER.filter(k => tr.bag[k] > 0);
      listNav(m, items.length, d);
      if (B) return back();
      if (d.jumpP && items.length) {
        const k = items[m.i], o = m.other;
        tr.bag[k]--; o.trainer.bag[k] = (o.trainer.bag[k] || 0) + 1;
        sfx.buy(); toast(p, `You gave ${o.trainer.name} a ${ITEMS[k].name}.`); toast(o, `${tr.name} gave you a ${ITEMS[k].name}!`);
        saveTrainer(p); saveTrainer(o);
      }
      break;
    }
  }
}
function useItemOn(p, k, mon) {
  const it = ITEMS[k], st = monStats(mon), tr = p.trainer;
  if (it.revive) {
    if (mon.hp > 0) { toast(p, `${monName(mon)} isn't fainted.`); return; }
    mon.hp = Math.floor(st.hp / 2);
  } else {
    if (mon.hp <= 0) { toast(p, `${monName(mon)} has fainted. Use a Revive!`); return; }
    if (mon.hp >= st.hp) { toast(p, `${monName(mon)} is already healthy.`); return; }
    mon.hp = Math.min(st.hp, mon.hp + it.heal);
  }
  tr.bag[k]--; sfx.heal(); toast(p, `${monName(mon)} feels better!`);
  p.menu.pop();
}

// ---------------------------------------------------------------- battle and trade requests between players
function updatePrompt(p, d) {
  const pr = p.prompt, from = pr.from;
  if (!players.includes(from) || from.mode !== 'waiting') { p.mode = 'walk'; p.prompt = null; return; }
  if (d.jumpP) {
    sfx.select();
    if (pr.type === 'battle') {
      if (!p.trainer.party.some(alive)) { toast(p, 'Your monsters need healing first!'); return; }
      from.mode = 'fight'; p.mode = 'fight';
      new Fight('pvp', from, { player: p });
    } else {
      const t = { a: from, b: p, ia: 0, ib: 0, pickA: false, pickB: false, okA: false, okB: false };
      from.trade = t; p.trade = t; from.mode = 'trade'; p.mode = 'trade';
    }
    p.prompt = null;
  } else if (d.specialP) {
    toast(from, `${p.trainer.name} said no.`); from.mode = 'walk'; p.mode = 'walk'; p.prompt = null;
  }
}
function updateTrade(p, d) {
  const t = p.trade;
  if (!t) { p.mode = 'walk'; return; }
  const me = t.a === p ? 'A' : 'B', party = p.trainer.party;
  const cancel = () => { for (const q of [t.a, t.b]) { q.trade = null; q.mode = 'walk'; } toast(t.a, 'Trade cancelled.'); toast(t.b, 'Trade cancelled.'); };
  if (!players.includes(t.a) || !players.includes(t.b)) { cancel(); return; }
  if (d.specialP) { if (t['ok' + me]) t['ok' + me] = false; else if (t['pick' + me]) t['pick' + me] = false; else cancel(); sfx.select(); return; }
  if (!t['pick' + me]) {
    const k = 'i' + me.toLowerCase();
    if (d.upP) { t[k] = (t[k] + party.length - 1) % party.length; sfx.select(); }
    if (d.downP) { t[k] = (t[k] + 1) % party.length; sfx.select(); }
    if (d.jumpP) { t['pick' + me] = true; sfx.select(); }
  } else if (t.pickA && t.pickB && d.jumpP) {
    t['ok' + me] = true; sfx.select();
    if (t.okA && t.okB) {
      const pa = t.a.trainer.party, pb = t.b.trainer.party;
      const ma = pa[t.ia], mb = pb[t.ib];
      pa[t.ia] = mb; pb[t.ib] = ma;
      markCaught(t.a.trainer, mb.sp); markCaught(t.b.trainer, ma.sp);
      sfx.caught();
      for (const q of [t.a, t.b]) { q.trade = null; q.mode = 'walk'; saveTrainer(q); }
      toast(t.a, `You got ${monName(mb)}!`); toast(t.b, `You got ${monName(ma)}!`);
    }
  }
}

// ---------------------------------------------------------------- drawing
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (scene === 'title') { drawTitle(); return; }
  const shared = players.length === 2 && players[0].fight && players[0].fight === players[1].fight;
  if (shared) { players[0].fight.draw(SW, SH, null); return; }
  const n = players.length;
  const vw = n === 2 ? (SW - 8) / 2 : SW;
  players.forEach((p, i) => {
    const vx = i === 0 ? 0 : SW - vw;
    ctx.save();
    ctx.beginPath(); ctx.rect(vx, 0, vw, SH); ctx.clip();
    ctx.translate(vx, 0);
    drawView(p, vw, SH);
    ctx.restore();
  });
  if (n === 2) { ctx.fillStyle = OL; ctx.fillRect(vw, 0, SW - vw * 2, SH); }
  if (n === 1 && padList().length > 1 && frameCount % 120 < 90) text('PLAYER 2: PRESS A TO JOIN', SW - 20, SH - 24, 22, '#fff', 'right', OL);
}

function drawView(p, w, h) {
  if (p.mode === 'pick') return drawPick(p, w, h);
  if (p.mode === 'creator') return drawCreator(p, w, h);
  if (p.mode === 'starter') return drawStarter(p, w, h);
  if (p.fight) return p.fight.draw(w, h, p);
  drawWorld(p, w, h);
  // overlays
  if (p.banner) {
    const k = Math.min(1, p.banner.t / 20, (150 - p.banner.t) / 20);
    ctx.globalAlpha = k;
    panel(w / 2 - 200, 20, 400, 60, 'rgba(20,12,40,0.85)', '#fff', 30);
    text(p.banner.text, w / 2, 51, 32, '#facc15');
    ctx.globalAlpha = 1;
  }
  if (p.mode === 'dialog') drawDialog(p, w, h);
  if (p.mode === 'menu') drawMenu(p, w, h);
  if (p.mode === 'prompt') {
    panel(w / 2 - 260, h / 2 - 80, 520, 160, 'rgba(20,12,40,0.95)', '#facc15');
    text(`${p.prompt.from.trainer.name} wants to ${p.prompt.type}!`, w / 2, h / 2 - 30, 28, '#fff');
    text('A: YES      B: NO', w / 2, h / 2 + 30, 26, '#facc15');
  }
  if (p.mode === 'waiting') {
    panel(w / 2 - 230, h - 120, 460, 80, 'rgba(20,12,40,0.9)', '#fff');
    text('Waiting for an answer...  (B: cancel)', w / 2, h - 80, 22, '#fff', 'center', OL, FONT2);
  }
  if (p.mode === 'trade') drawTrade(p, w, h);
  if (p.toast) {
    ctx.globalAlpha = Math.min(1, p.toast.t / 20);
    panel(w / 2 - 260, h - 200, 520, 56, 'rgba(20,12,40,0.9)', '#4ade80');
    text(p.toast.text, w / 2, h - 172, 22, '#fff', 'center', OL, FONT2);
    ctx.globalAlpha = 1;
  }
}

function drawWorld(p, w, h) {
  const camX = clamp(p.x - w / 2, 0, MW * TS - w), camY = clamp(p.y - 40 - h / 2, 0, MH * TS - h);
  ctx.save(); ctx.translate(-Math.round(camX), -Math.round(camY));
  const x0 = Math.floor(camX / TS), y0 = Math.floor(camY / TS), x1 = Math.ceil((camX + w) / TS), y1 = Math.ceil((camY + h) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) drawTile(tileAt(tx, ty), tx, ty, tx * TS, ty * TS);
  // things that stand up, drawn back to front
  const objs = [];
  for (let ty = y0; ty <= y1 + 2; ty++) for (let tx = x0 - 1; tx <= x1 + 1; tx++) {
    const t = tileAt(tx, ty);
    if (t === 'T') objs.push({ y: ty * TS + TS, f: () => drawTree(tx, ty) });
    else if (t === 'R') objs.push({ y: ty * TS + TS, f: () => drawRock(tx, ty) });
  }
  for (const b of BUILDINGS) if ((b.x + b.w) * TS > camX - 60 && b.x * TS < camX + w + 60 && (b.y + b.h) * TS > camY && b.y * TS < camY + h + 100) objs.push({ y: (b.y + b.h) * TS, f: () => drawBuilding(b) });
  for (const n of NPCS) if (Math.abs(n.x - p.x) < w && Math.abs(n.y - p.y) < h) objs.push({ y: n.y, f: () => {
    drawPerson(n.look, n.x, n.y, n.face, 0);
    if (n.kind === 'trainer' && !p.trainer.beaten[n.id]) { /* a little hint they want to battle */ }
    if (p.spotted && p.spotted.npc === n && p.spotted.t-- > 0) text('!', n.x, n.y - 82, 40, '#ef4444');
  } });
  for (const q of players) if (q.trainer && q.mode !== 'pick' && q.mode !== 'creator') objs.push({ y: q.y, f: () => {
    drawPerson(q.trainer.look, q.x, q.y, q.face, q.walkT);
    if (players.length > 1) text(q.slot === 0 ? 'P1' : 'P2', q.x, q.y - 78, 20, q.slot === 0 ? '#f87171' : '#60a5fa');
    if (q.fight && q !== p) text('⚔', q.x + 24, q.y - 70, 26, '#facc15');
  } });
  objs.sort((a, b) => a.y - b.y);
  for (const o of objs) o.f();
  ctx.restore();
  // hint to join a battle
  const o = otherPlayer(p);
  if (o && o.fight && o.fight.kind !== 'pvp' && Math.hypot(o.x - p.x, o.y - p.y) < 150 && p.mode === 'walk') {
    panel(w / 2 - 190, h - 90, 380, 54, 'rgba(20,12,40,0.9)', '#facc15');
    text('A: JOIN THE BATTLE!', w / 2, h - 63, 26, '#facc15');
  }
}

function wrapLines(s, maxW, size, font = FONT2) {
  ctx.font = `${size}px ${font}`;
  const out = [''];
  for (const wd of s.split(' ')) { const t = (out[out.length - 1] + ' ' + wd).trim(); if (ctx.measureText(t).width > maxW && out[out.length - 1]) out.push(wd); else out[out.length - 1] = t; }
  return out;
}
function drawDialog(p, w, h) {
  const dl = p.dialog, line = dl.lines[dl.i];
  panel(16, h - 170, w - 32, 150, 'rgba(255,255,255,0.96)', OL, 18);
  const shown = line.slice(0, Math.floor(dl.t * 1.5));
  wrapLines(shown, w - 80, 26).forEach((ln, i) => text(ln, 40, h - 128 + i * 36, 26, '#1a1030', 'left', null, FONT2));
  if (dl.t * 1.5 >= line.length && (frameCount >> 4) % 2) text('▼', w - 50, h - 40, 22, '#1a1030', 'center', null);
}

function menuBox(x, y, w, items, sel, opts = {}) {
  const rh = opts.rh || 44;
  panel(x, y, w, items.length * rh + 24, 'rgba(20,12,40,0.94)', '#fff', 14);
  items.forEach((it, i) => {
    const iy = y + 12 + i * rh;
    if (i === sel) { rrect(x + 8, iy, w - 16, rh - 4, 10); ctx.fillStyle = 'rgba(250,204,21,0.25)'; ctx.fill(); }
    const label = typeof it === 'string' ? it : it.label;
    text((i === sel ? '▶ ' : '  ') + label, x + 18, iy + rh / 2 - 2, opts.size || 24, typeof it === 'object' && it.color ? it.color : '#fff', 'left', OL);
    if (typeof it === 'object' && it.right) text(it.right, x + w - 18, iy + rh / 2 - 2, (opts.size || 24) - 4, '#facc15', 'right', OL, FONT2);
  });
}
function hpBar(x, y, w, m) {
  const st = monStats(m), k = clamp(m.hp / st.hp, 0, 1);
  rrect(x, y, w, 12, 5); ctx.fillStyle = '#374151'; ctx.fill();
  if (k > 0) { rrect(x, y, w * k, 12, 5); ctx.fillStyle = k > 0.5 ? '#22c55e' : k > 0.2 ? '#facc15' : '#ef4444'; ctx.fill(); }
}
function drawMenu(p, w, h) {
  const tr = p.trainer;
  for (let li = 0; li < p.menu.length; li++) {
    const m = p.menu[li], top = li === p.menu.length - 1;
    if (!top && !['pause', 'interact'].includes(m.type)) continue;
    switch (m.type) {
      case 'pause': {
        menuBox(w - 300, 20, 280, pauseItems(p), m.i);
        panel(20, 20, 280, 110, 'rgba(20,12,40,0.9)', '#fff');
        text(tr.name, 40, 52, 28, '#facc15', 'left');
        text(`$${tr.money}`, 40, 86, 22, '#fff', 'left', OL, FONT2);
        text(`Caught ${Object.keys(tr.caught).length}/${DEX_ORDER.length}`, 40, 112, 18, '#cbd5e1', 'left', OL, FONT2);
        break;
      }
      case 'party': case 'useOn': {
        const title = m.type === 'useOn' ? `Use ${ITEMS[m.item].name} on...` : 'YOUR MONSTERS';
        panel(20, 20, w - 40, h - 40, 'rgba(20,12,40,0.95)', '#fff');
        text(title, w / 2, 56, 34, '#facc15');
        tr.party.forEach((mon, i) => {
          const y = 90 + i * 96, sel = i === m.i;
          rrect(40, y, w - 80, 86, 14); ctx.fillStyle = sel ? 'rgba(250,204,21,0.22)' : 'rgba(255,255,255,0.06)'; ctx.fill();
          if (sel) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.stroke(); }
          drawMonster(mon.sp, 90, y + 78, 0.65, 1, frameCount + i * 20);
          text(`${monName(mon)}`, 150, y + 26, 26, '#fff', 'left');
          text(`Lv ${mon.lv}`, 150, y + 56, 20, '#cbd5e1', 'left', OL, FONT2);
          hpBar(260, y + 50, Math.min(260, w - 400), mon);
          text(`${Math.ceil(mon.hp)}/${monStats(mon).hp}`, 260 + Math.min(260, w - 400) + 10, y + 56, 18, '#fff', 'left', OL, FONT2);
          if (mon.hp <= 0) text('FAINTED', w - 70, y + 26, 18, '#f87171', 'right');
          else if (mon.status) text(mon.status === 'burn' ? 'BURNED' : 'PARALYZED', w - 70, y + 26, 18, '#fb923c', 'right');
        });
        break;
      }
      case 'monOpts': menuBox(w - 300, 120, 260, ['SUMMARY', 'MAKE LEADER', 'USE ITEM', 'BACK'], m.i); break;
      case 'summary': {
        const mon = m.mon, sp = SPECIES[mon.sp], st = monStats(mon);
        panel(20, 20, w - 40, h - 40, 'rgba(20,12,40,0.96)', '#fff');
        drawMonster(mon.sp, Math.min(220, w * 0.25), 330, 2, 1);
        const tx = Math.min(420, w * 0.45);
        text(sp.name, tx, 70, 40, '#facc15', 'left');
        sp.types.forEach((t, i) => { rrect(tx + i * 110, 96, 100, 26, 8); ctx.fillStyle = TYPES[t].color; ctx.fill(); text(TYPES[t].name, tx + 50 + i * 110, 110, 16, '#fff', 'center', OL); });
        text(`LEVEL ${mon.lv}`, tx, 150, 24, '#fff', 'left');
        const nextXp = xpForLevel(mon.lv + 1) - mon.xp;
        text(`${Math.max(0, nextXp)} XP to next level`, tx, 178, 18, '#cbd5e1', 'left', OL, FONT2);
        [['HP', `${Math.ceil(mon.hp)}/${st.hp}`], ['ATTACK', st.atk], ['DEFENSE', st.def], ['SPEED', st.spd]].forEach(([k, v], i) => {
          text(k, tx, 220 + i * 30, 20, '#e0e7ff', 'left', OL, FONT2); text(String(v), tx + 200, 220 + i * 30, 20, '#fff', 'left', OL, FONT2);
        });
        text('MOVES', tx, 360, 24, '#facc15', 'left');
        mon.moves.forEach((mv, i) => { const M = MOVES[mv]; text(`${M.name}`, tx, 394 + i * 30, 20, TYPES[M.type].color, 'left', OL); text(M.power ? `power ${M.power}` : 'special', tx + 220, 394 + i * 30, 16, '#cbd5e1', 'left', OL, FONT2); });
        const evo = sp.evolve;
        if (evo) text(`Evolves at level ${evo.lv}`, tx, 530, 18, '#4ade80', 'left', OL, FONT2);
        wrapLines(sp.dex, w - 100, 18).forEach((ln, i) => text(ln, 50, 580 + i * 26, 18, '#e0e7ff', 'left', OL, FONT2));
        break;
      }
      case 'bag': {
        const items = ITEM_ORDER.filter(k => tr.bag[k] > 0);
        panel(20, 20, w - 40, h - 40, 'rgba(20,12,40,0.95)', '#fff');
        text('BAG', w / 2, 56, 34, '#facc15');
        if (!items.length) text('Your bag is empty.', w / 2, 200, 26, '#fff');
        else menuBox(40, 90, w - 80, items.map(k => ({ label: ITEMS[k].name, right: 'x' + tr.bag[k] })), m.i);
        if (items[m.i]) wrapLines(ITEMS[items[m.i]].desc, w - 100, 20).forEach((ln, i) => text(ln, 50, h - 80 + i * 26, 20, '#e0e7ff', 'left', OL, FONT2));
        break;
      }
      case 'dex': {
        panel(20, 20, w - 40, h - 40, 'rgba(20,12,40,0.96)', '#fff');
        text(`MONSTER DEX  ${Object.keys(tr.caught).length}/${DEX_ORDER.length}`, w / 2, 56, 30, '#facc15');
        const cw = (w - 80) / 5;
        DEX_ORDER.forEach((sp, i) => {
          const x = 40 + (i % 5) * cw, y = 90 + Math.floor(i / 5) * 150, sel = i === m.i;
          rrect(x + 4, y, cw - 8, 140, 12); ctx.fillStyle = sel ? 'rgba(250,204,21,0.25)' : 'rgba(255,255,255,0.06)'; ctx.fill();
          if (sel) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.stroke(); }
          const seen = tr.seen[sp], caught = tr.caught[sp];
          if (seen) drawMonster(sp, x + cw / 2, y + 108, Math.min(0.8, cw / 160), 1, frameCount, { silhouette: !caught, still: !caught });
          else text('?', x + cw / 2, y + 66, 50, '#6b7280');
          text(seen ? SPECIES[sp].name : '???', x + cw / 2, y + 126, Math.min(16, cw / 7), caught ? '#fff' : '#9ca3af', 'center', OL);
        });
        const sp = DEX_ORDER[m.i];
        const txt = tr.caught[sp] ? SPECIES[sp].dex : tr.seen[sp] ? 'Seen, but not caught yet.' : 'Not seen yet.';
        wrapLines(txt, w - 100, 20).forEach((ln, i) => text(ln, 50, h - 80 + i * 26, 20, '#e0e7ff', 'left', OL, FONT2));
        break;
      }
      case 'shop': {
        panel(20, 20, w - 40, h - 40, 'rgba(20,12,40,0.95)', '#fff');
        text('SHOP', w / 2, 56, 34, '#facc15');
        text(`You have $${tr.money}`, w / 2, 92, 22, '#fff', 'center', OL, FONT2);
        menuBox(40, 120, w - 80, ITEM_ORDER.map(k => ({ label: ITEMS[k].name, right: `$${ITEMS[k].price}  (have ${tr.bag[k] || 0})` })).concat(['LEAVE']), m.i);
        if (m.i < ITEM_ORDER.length) wrapLines(ITEMS[ITEM_ORDER[m.i]].desc, w - 100, 20).forEach((ln, i) => text(ln, 50, h - 80 + i * 26, 20, '#e0e7ff', 'left', OL, FONT2));
        break;
      }
      case 'center': menuBox(w / 2 - 160, h / 2 - 70, 320, ['PC BOX', 'LEAVE'], m.i); break;
      case 'box': {
        panel(20, 20, w - 40, h - 40, 'rgba(20,12,40,0.95)', '#fff');
        text('PC BOX', w / 2, 56, 34, '#facc15');
        text('LEFT/RIGHT: switch side    A: move monster', w / 2, 90, 18, '#cbd5e1', 'center', OL, FONT2);
        const cw = (w - 100) / 2;
        [[tr.party, 'YOUR TEAM'], [tr.box, 'BOX']].forEach(([list, title], col) => {
          const x = 40 + col * (cw + 20);
          text(title, x + cw / 2, 124, 24, m.col === col ? '#facc15' : '#fff');
          list.slice(0, 12).forEach((mon, i) => {
            const y = 146 + i * 42, sel = m.col === col && i === m.i;
            rrect(x, y, cw, 38, 8); ctx.fillStyle = sel ? 'rgba(250,204,21,0.25)' : 'rgba(255,255,255,0.06)'; ctx.fill();
            text(`${monName(mon)}  Lv${mon.lv}`, x + 14, y + 19, 20, '#fff', 'left', OL);
          });
          if (!list.length) text('(empty)', x + cw / 2, 170, 20, '#9ca3af');
        });
        break;
      }
      case 'interact': menuBox(w / 2 - 170, h / 2 - 120, 340, ['BATTLE', 'TRADE', 'GIVE ITEM', 'CANCEL'], m.i); text(`With ${m.other.trainer.name}:`, w / 2, h / 2 - 140, 24, '#fff'); break;
      case 'give': {
        const items = ITEM_ORDER.filter(k => tr.bag[k] > 0);
        text(`Give to ${m.other.trainer.name}:`, w / 2, 80, 26, '#fff');
        if (items.length) menuBox(w / 2 - 220, 110, 440, items.map(k => ({ label: ITEMS[k].name, right: 'x' + tr.bag[k] })), m.i);
        else text('Nothing to give.', w / 2, 160, 24, '#fff');
        break;
      }
    }
  }
}

function drawTrade(p, w, h) {
  const t = p.trade;
  panel(20, 20, w - 40, h - 40, 'rgba(20,12,40,0.96)', '#facc15');
  text('TRADE', w / 2, 56, 36, '#facc15');
  const me = t.a === p ? 'A' : 'B', other = me === 'A' ? t.b : t.a;
  const myI = t['i' + me.toLowerCase()], otherI = t['i' + (me === 'A' ? 'b' : 'a')];
  const myPick = t['pick' + me], otherPick = t['pick' + (me === 'A' ? 'B' : 'A')];
  text('You give:', w * 0.27, 100, 24, '#fff');
  p.trainer.party.forEach((mon, i) => {
    const y = 120 + i * 50, sel = i === myI;
    rrect(40, y, w * 0.46 - 40, 44, 8); ctx.fillStyle = sel ? (myPick ? 'rgba(74,222,128,0.35)' : 'rgba(250,204,21,0.25)') : 'rgba(255,255,255,0.06)'; ctx.fill();
    text(`${monName(mon)} Lv${mon.lv}`, 56, y + 22, 20, '#fff', 'left', OL);
  });
  text(`${other.trainer.name} gives:`, w * 0.75, 100, 24, '#fff');
  const om = other.trainer.party[otherI];
  if (om) {
    drawMonster(om.sp, w * 0.75, 340, Math.min(1.5, w / 600), -1);
    text(`${monName(om)} Lv${om.lv}`, w * 0.75, 380, 24, otherPick ? '#4ade80' : '#cbd5e1');
    text(otherPick ? 'Chosen!' : 'Still choosing...', w * 0.75, 412, 18, '#cbd5e1', 'center', OL, FONT2);
  }
  let msg = 'Pick a monster to trade (A)   B: cancel';
  if (myPick && !otherPick) msg = 'Waiting for the other player...';
  if (t.pickA && t.pickB) msg = t['ok' + me] ? 'Waiting for them to say yes...' : 'A: TRADE!    B: change';
  text(msg, w / 2, h - 60, 22, '#facc15', 'center', OL, FONT2);
}

// ---------------- choosing / making a trainer, choosing a starter
function drawBackdrop(w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#38bdf8'); g.addColorStop(1, '#a7f3d0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    const x = ((i * 260 + frameCount * 0.3) % (w + 300)) - 150;
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x, 80 + (i % 3) * 50, 40, 0, Math.PI * 2); ctx.arc(x + 50, 70 + (i % 3) * 50, 50, 0, Math.PI * 2); ctx.arc(x + 100, 80 + (i % 3) * 50, 40, 0, Math.PI * 2); ctx.fill();
  }
}
function drawPick(p, w, h) {
  drawBackdrop(w, h);
  text(p.slot === 0 ? 'PLAYER 1' : 'PLAYER 2', w / 2, 60, 46, p.slot === 0 ? '#f87171' : '#60a5fa');
  text('Choose your trainer', w / 2, 110, 26, '#fff', 'center', OL, FONT2);
  const list = pickList(p);
  list.forEach((it, i) => {
    const y = 150 + i * 80, sel = i === p.pickI;
    panel(w / 2 - Math.min(300, w / 2 - 30), y, Math.min(600, w - 60), 70, sel ? 'rgba(250,204,21,0.9)' : 'rgba(20,12,40,0.8)', '#fff');
    if (it.tr) drawPerson(it.tr.look, w / 2 - Math.min(250, w / 2 - 80), y + 62, 'down', 0, 0.9);
    text(it.label, w / 2 - Math.min(200, w / 2 - 130), y + (it.sub ? 26 : 35), 28, sel ? '#1a1030' : '#fff', 'left', sel ? null : OL);
    if (it.sub) text(it.sub, w / 2 - Math.min(200, w / 2 - 130), y + 52, 18, sel ? '#1a1030' : '#cbd5e1', 'left', null, FONT2);
  });
}
function drawCreator(p, w, h) {
  drawBackdrop(w, h);
  const c = p.creator;
  text('NEW TRAINER', w / 2, 50, 44, '#facc15');
  if (c.step === 'name') {
    text('What\'s your name?', w / 2, 100, 26, '#fff', 'center', OL, FONT2);
    panel(w / 2 - 200, 125, 400, 64, '#fff', OL);
    text(c.name + ((frameCount >> 4) % 2 ? '_' : ' '), w / 2, 158, 36, '#1a1030', 'center', null);
    const cols = 7, kw = Math.min(70, (w - 60) / cols), x0 = w / 2 - kw * cols / 2;
    KEYS.forEach((k, i) => {
      const x = x0 + (i % cols) * kw, y = 220 + Math.floor(i / cols) * 70, sel = i === c.i;
      const wide = k.length > 1;
      rrect(x + 3, y, kw - 6, 62, 10); ctx.fillStyle = sel ? '#facc15' : 'rgba(20,12,40,0.8)'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      text(k, x + kw / 2, y + 32, wide ? 13 : 28, sel ? '#1a1030' : '#fff', 'center', sel ? null : OL);
    });
    text('A: type   B: delete   OK: done', w / 2, h - 40, 22, '#fff', 'center', OL, FONT2);
  } else {
    drawPerson(c.look, w * 0.3, h * 0.72, ['down', 'right', 'up', 'left'][Math.floor(frameCount / 60) % 4], frameCount * 0.5, Math.min(4, w / 220));
    const rows = [['SKIN', SKINS.length, 'skin'], ['HAIR', HAIR_STYLES.length, 'hair'], ['HAIR COLOR', HAIR_COLORS.length, 'hairColor'], ['SHIRT', SHIRTS.length, 'shirt'], ['PANTS', PANTS.length, 'pants'], ['DONE', 0, 'done']];
    const x = w * 0.55, rw = Math.min(400, w * 0.42);
    rows.forEach(([label, , key], i) => {
      const y = 130 + i * 80, sel = i === c.row;
      panel(x, y, rw, 66, sel ? 'rgba(250,204,21,0.9)' : 'rgba(20,12,40,0.8)', '#fff');
      text(label, x + 20, y + 34, 24, sel ? '#1a1030' : '#fff', 'left', sel ? null : OL);
      if (key !== 'done') {
        const v = c.look[key];
        let sw = null;
        if (key === 'skin') sw = SKINS[v]; else if (key === 'hairColor') sw = HAIR_COLORS[v]; else if (key === 'shirt') sw = SHIRTS[v]; else if (key === 'pants') sw = PANTS[v];
        if (sw) { ctx.fillStyle = sw; ctx.beginPath(); ctx.arc(x + rw - 60, y + 33, 18, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.stroke(); }
        else text(HAIR_STYLES[v], x + rw - 60, y + 34, 20, sel ? '#1a1030' : '#fff', 'center', sel ? null : OL);
        if (sel) { text('◀', x + rw - 105, y + 34, 22, '#1a1030', 'center', null); text('▶', x + rw - 15, y + 34, 22, '#1a1030', 'center', null); }
      }
    });
    text(c.name, w * 0.3, 110, 40, '#fff');
  }
}
function drawStarter(p, w, h) {
  drawBackdrop(w, h);
  text('CHOOSE YOUR PARTNER', w / 2, 60, 42, '#facc15');
  const cw = w / 3;
  STARTERS.forEach((sp, i) => {
    const x = cw * i + cw / 2, sel = i === p.starterI, S = SPECIES[sp];
    panel(x - cw / 2 + 10, 100, cw - 20, 440, sel ? 'rgba(250,204,21,0.35)' : 'rgba(20,12,40,0.6)', sel ? '#facc15' : '#fff');
    const hop = sel ? Math.abs(Math.sin(frameCount * 0.12)) * 20 : 0;
    drawMonster(sp, x, 380 - hop, Math.min(2.4, cw / 150), 1);
    text(S.name, x, 430, Math.min(34, cw / 7), '#fff');
    rrect(x - 50, 452, 100, 28, 8); ctx.fillStyle = TYPES[S.types[0]].color; ctx.fill();
    text(TYPES[S.types[0]].name, x, 467, 18, '#fff', 'center', OL);
    if (sel) wrapLines(S.dex, cw - 40, 16).forEach((ln, j) => text(ln, x, 500 + j * 20, 16, '#fff', 'center', OL, FONT2));
  });
  text('◀ ▶ choose    A: this one!', w / 2, h - 60, 26, '#fff', 'center', OL, FONT2);
}

function drawTitle() {
  drawBackdrop(SW, SH);
  // the islands below, slowly drifting
  const cx = (frameCount * 0.6) % (MW * TS - SW), cy = 30 * TS;
  ctx.save(); ctx.globalAlpha = 0.9; ctx.translate(-cx, -cy + 200);
  const x0 = Math.floor(cx / TS), y0 = Math.floor((cy - 200) / TS);
  for (let ty = y0; ty < y0 + 17; ty++) for (let tx = x0; tx < x0 + 28; tx++) drawTile(tileAt(tx, ty), tx, ty, tx * TS, ty * TS);
  ctx.restore();
  ctx.fillStyle = 'rgba(20,12,40,0.25)'; ctx.fillRect(0, 0, SW, SH);
  const bob = Math.sin(frameCount * 0.05) * 6;
  text('MONSTER', SW / 2, 120 + bob, 110, '#facc15');
  text('ISLES', SW / 2, 230 + bob, 130, '#22d3ee');
  ['leafup', 'embit', 'splashel', 'zapper', 'gloomp', 'lumina'].forEach((sp, i) => {
    drawMonster(sp, 180 + i * 185, 520 - Math.abs(Math.sin(frameCount * 0.07 + i)) * 24, 1.3, i < 3 ? 1 : -1, frameCount + i * 30);
  });
  if ((frameCount >> 5) % 2) text('PRESS A TO START', SW / 2, 610, 40, '#fff');
  text(IS_XBOX ? 'XBOX: HOLD THE MENU BUTTON FOR A SECOND TO USE YOUR CONTROLLER' : 'PLAYER 2 CAN JOIN ANY TIME WITH A SECOND CONTROLLER · F11 = FULL SCREEN', SW / 2, 660, 20, '#fff', 'center', OL, FONT2);
  text('A GAME BY MURILO', SW / 2, 700, 18, '#fff');
}

// ---------------------------------------------------------------- main loop
let last = performance.now(), acc = 0;
const STEP = 1000 / 60;
function frame(now) {
  acc += Math.min(100, now - last);
  last = now;
  while (acc >= STEP) { update(); acc -= STEP; }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
