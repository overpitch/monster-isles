'use strict';
// =====================================================================
//  Battles: turn-based, 1 or 2 monsters on each side.
//  Kinds: 'wild', 'trainer', 'pvp' (player vs player).
//  A second player can join a wild or trainer battle as a team.
// =====================================================================

const ITEMS = {
  orb:         { name: 'CAPTURE ORB', price: 100, desc: 'Throw it at a wild monster to catch it.', orb: 1 },
  superorb:    { name: 'SUPER ORB',   price: 300, desc: 'A better orb. Much easier to catch with.', orb: 1.8 },
  potion:      { name: 'POTION',      price: 100, desc: 'Heals a monster by 25 HP.', heal: 25 },
  superpotion: { name: 'SUPER POTION',price: 300, desc: 'Heals a monster by 60 HP.', heal: 60 },
  revive:      { name: 'REVIVE',      price: 500, desc: 'Wakes up a fainted monster with half its HP.', revive: true },
};
const ITEM_ORDER = ['orb', 'superorb', 'potion', 'superpotion', 'revive'];

const stageMult = s => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
const alive = m => m && m.hp > 0;

class Fight {
  /**
   * kind: 'wild' | 'trainer' | 'pvp'
   * a: the human starting it. b: { wild: mon } | { npc } | { player }
   */
  constructor(kind, a, b) {
    this.kind = kind;
    this.sides = [[], []];
    this.queue = []; this.msg = null; this.msgT = 0;
    this.phase = 'msg';          // msg → choose → (actions run as msgs) → choose...
    this.over = false; this.result = null; this.anims = [];
    this.turn = 0; this.runTries = 0;
    this.caught = null;
    this.addHuman(a, 0);
    if (kind === 'wild') {
      const c = { owner: null, party: [b.wild], active: b.wild, name: 'WILD ' + monName(b.wild), ai: true, side: 1, stages: {} };
      this.sides[1].push(c);
      this.say(`A wild ${monName(b.wild)} appeared!`);
      markSeen(a.trainer, b.wild.sp);
    } else if (kind === 'trainer') {
      this.npc = b.npc;
      const party = b.npc.team.map(([sp, lv]) => makeMon(sp, lv));
      const c = { owner: null, npc: b.npc, party, active: party[0], name: b.npc.name, ai: true, side: 1, stages: {} };
      this.sides[1].push(c);
      this.say(`${b.npc.name} wants to battle!`);
      this.say(`${b.npc.name} sent out ${monName(party[0])}!`, () => this.popIn(c));
      markSeen(a.trainer, party[0].sp);
    } else {
      this.addHuman(b.player, 1);
      this.say(`${a.trainer.name} and ${b.player.trainer.name} are battling!`);
    }
    for (const c of this.sides[0].concat(this.kind === 'pvp' ? this.sides[1] : [])) {
      if (c.owner) this.say(`Go, ${monName(c.active)}!`, () => this.popIn(c));
    }
    this.toChoose();
  }

  addHuman(p, side) {
    const lead = p.trainer.party.find(alive);
    const c = { owner: p, party: p.trainer.party, active: lead, name: p.trainer.name, ai: false, side, stages: {}, menu: null, action: null };
    this.sides[side].push(c);
    p.fight = this;
    return c;
  }
  humans() { return this.sides[0].concat(this.sides[1]).filter(c => c.owner); }
  players() { return [...new Set(this.humans().map(c => c.owner))]; }
  shared() { return this.players().length > 1; }
  foesOf(c) { return this.sides[1 - c.side]; }

  /** Player 2 walks up and joins in. */
  join(p) {
    if (this.kind === 'pvp' || this.over || this.sides[0].some(c => c.owner === p)) return false;
    if (!p.trainer.party.some(alive)) return false;
    const c = this.addHuman(p, 0);
    this.say(`${p.trainer.name} joined the battle!`);
    this.say(`Go, ${monName(c.active)}!`, () => this.popIn(c));
    // a trainer sends out a second monster if it has one
    if (this.kind === 'trainer') {
      const t = this.sides[1][0];
      const next = t.party.find(m => alive(m) && !this.sides[1].some(o => o.active === m));
      if (next) {
        const c2 = { owner: null, npc: t.npc, party: t.party, active: next, name: t.name, ai: true, side: 1, stages: {} };
        this.sides[1].push(c2);
        this.say(`${t.name} sent out ${monName(next)} too!`, () => this.popIn(c2));
      }
    }
    if (this.phase === 'choose') { for (const h of this.humans()) { h.action = null; h.menu = { level: 'main', i: 0 }; } this.phase = 'msg'; this.toChoose(); }
    return true;
  }

  // ------------------------------------------------------------ messages
  say(text, fn, opts = {}) { this.queue.push({ text, fn, ...opts }); }
  toChoose() { this.queue.push({ choose: true }); }

  update(inputs) {
    for (const a of this.anims) a.t++;
    this.anims = this.anims.filter(a => a.t < a.dur);
    if (this.phase === 'choose') { this.updateChoose(inputs); return; }
    if (this.phase === 'replace') { this.updateReplace(inputs); return; }
    if (this.phase === 'end') return;
    // showing messages
    if (!this.msg) {
      const next = this.queue.shift();
      if (!next) { this.phase = this.over ? 'end' : 'choose'; return; }
      if (next.choose) { this.startChoose(); return; }
      if (next.end) { this.phase = 'end'; this.over = true; return; }
      this.msg = next; this.msgT = 0;
      if (next.fn) next.fn();
      if (next.sfx) sfx[next.sfx]();
      if (!next.text) { this.msg = null; return; }
    }
    this.msgT++;
    const pressed = this.players().some(p => dev(p.dev).jumpP);
    if ((this.msgT > 18 && pressed) || this.msgT > (this.msg.wait || 75)) this.msg = null;
  }

  // ------------------------------------------------------------ choosing actions
  startChoose() {
    if (this.checkEnd()) return;
    this.turn++;
    this.phase = 'choose';
    for (const c of this.humans()) { c.action = null; c.menu = alive(c.active) ? { level: 'main', i: 0 } : null; }
  }
  updateChoose(inputs) {
    const hs = this.humans().filter(c => alive(c.active));
    for (const c of hs) if (!c.action) this.menuInput(c, inputs[c.owner.dev] || EMPTY);
    if (hs.every(c => c.action)) this.runTurn();
  }
  menuInput(c, d) {
    const m = c.menu;
    const mon = c.active;
    const nav = (n, cols = 2) => {
      if (d.leftP && m.i % cols > 0) m.i--;
      if (d.rightP && m.i % cols < cols - 1 && m.i + 1 < n) m.i++;
      if (d.upP && m.i - cols >= 0) m.i -= cols;
      if (d.downP && m.i + cols < n) m.i += cols;
      if (d.leftP || d.rightP || d.upP || d.downP) sfx.select();
    };
    const back = d.specialP || d.backP;
    if (m.level === 'main') {
      const opts = this.mainOptions();
      nav(opts.length);
      if (d.jumpP) {
        sfx.select();
        const o = opts[m.i];
        if (o === 'FIGHT') { m.level = 'moves'; m.i = 0; }
        else if (o === 'BAG') { m.level = 'bag'; m.i = 0; }
        else if (o === 'TEAM') { m.level = 'team'; m.i = 0; }
        else if (o === 'RUN') c.action = { type: 'run' };
        else if (o === 'GIVE UP') c.action = { type: 'forfeit' };
      }
    } else if (m.level === 'moves') {
      nav(mon.moves.length);
      if (back) { m.level = 'main'; m.i = 0; sfx.select(); }
      else if (d.jumpP) {
        sfx.select();
        const foes = this.foesOf(c).filter(f => alive(f.active));
        if (foes.length > 1 && MOVES[mon.moves[m.i]].power > 0) { m.move = mon.moves[m.i]; m.level = 'target'; m.i = 0; }
        else c.action = { type: 'move', move: mon.moves[m.i], target: foes[0] };
      }
    } else if (m.level === 'target') {
      const foes = this.foesOf(c).filter(f => alive(f.active));
      nav(foes.length);
      if (back) { m.level = 'moves'; m.i = 0; }
      else if (d.jumpP) { c.action = { type: 'move', move: m.move, target: foes[m.i] }; sfx.select(); }
    } else if (m.level === 'bag') {
      const items = this.usableItems(c);
      nav(items.length, 1);
      if (back) { m.level = 'main'; m.i = 0; sfx.select(); }
      else if (d.jumpP && items.length) {
        const it = items[m.i];
        sfx.select();
        if (ITEMS[it].orb) c.action = { type: 'orb', item: it, target: this.sides[1][0] };
        else { m.item = it; m.level = 'itemTarget'; m.i = 0; }
      }
    } else if (m.level === 'itemTarget') {
      nav(c.party.length, 1);
      if (back) { m.level = 'bag'; m.i = 0; }
      else if (d.jumpP) {
        const t = c.party[m.i], it = ITEMS[m.item];
        if ((it.revive && t.hp <= 0) || (it.heal && t.hp > 0 && t.hp < monStats(t).hp)) { c.action = { type: 'item', item: m.item, mon: t }; sfx.select(); }
      }
    } else if (m.level === 'team') {
      nav(c.party.length, 1);
      if (back) { m.level = 'main'; m.i = 0; sfx.select(); }
      else if (d.jumpP) {
        const t = c.party[m.i];
        if (alive(t) && !this.isActive(t)) { c.action = { type: 'switch', mon: t }; sfx.select(); }
      }
    }
  }
  mainOptions() { return this.kind === 'pvp' ? ['FIGHT', 'BAG', 'TEAM', 'GIVE UP'] : ['FIGHT', 'BAG', 'TEAM', 'RUN']; }
  usableItems(c) {
    const bag = c.owner.trainer.bag;
    return ITEM_ORDER.filter(it => bag[it] > 0 && !(ITEMS[it].orb && this.kind !== 'wild'));
  }
  isActive(m) { return this.sides[0].concat(this.sides[1]).some(c => c.active === m); }

  // ------------------------------------------------------------ running a turn
  aiAction(c) {
    const mon = c.active;
    const foes = this.foesOf(c).filter(f => alive(f.active));
    const target = pick(foes);
    let best = mon.moves[0], bestScore = -1;
    for (const mv of mon.moves) {
      const M = MOVES[mv];
      let score = M.power ? M.power * effectiveness(M.type, SPECIES[target.active.sp].types) * (SPECIES[mon.sp].types.includes(M.type) ? 1.5 : 1) : 35;
      if (M.heal && mon.hp > monStats(mon).hp * 0.6) score = 5;
      score *= c.npc ? rand(0.8, 1.2) : rand(0.4, 1.6);    // wild monsters are a bit random
      if (score > bestScore) { bestScore = score; best = mv; }
    }
    return { type: 'move', move: best, target };
  }
  runTurn() {
    this.phase = 'msg';
    const all = this.sides[0].concat(this.sides[1]).filter(c => alive(c.active));
    for (const c of all) if (c.ai) c.action = this.aiAction(c);
    const order = all.slice().sort((a, b) => {
      const pa = this.prio(a), pb = this.prio(b);
      if (pa !== pb) return pb - pa;
      return this.speed(b) - this.speed(a) || Math.random() - 0.5;
    });
    for (const c of order) this.queue.push({ act: c });
    this.queue.push({ endTurn: true });
    this.processActs();
  }
  prio(c) {
    const a = c.action;
    if (!a) return 0;
    if (a.type === 'switch' || a.type === 'item' || a.type === 'orb' || a.type === 'run' || a.type === 'forfeit') return 10;
    return MOVES[a.move].priority || 0;
  }
  speed(c) { return monStats(c.active).spd * stageMult(c.stages.spd || 0) * (c.active.status === 'paralyze' ? 0.5 : 1); }

  /** Turns queued actions into messages, one at a time, as the queue reaches them. */
  processActs() {
    const q = this.queue;
    this.queue = [];
    for (const item of q) {
      if (item.act) this.queue.push({ fn: () => this.doAction(item.act), text: '' });
      else if (item.endTurn) this.queue.push({ fn: () => this.endOfTurn(), text: '' });
      else this.queue.push(item);
    }
  }
  /** Inserts messages right after the current one. */
  now(items) { this.queue.unshift(...items); }

  doAction(c) {
    if (this.over || !alive(c.active)) return;
    const a = c.action;
    const out = [];
    if (a.type === 'run') {
      this.runTries++;
      const foe = this.sides[1][0].active;
      const ok = this.speed(c) * 1.2 + this.runTries * 30 > monStats(foe).spd * stageMult(0) || Math.random() < 0.5;
      if (ok) { out.push({ text: 'Got away safely!' }, { fn: () => this.finish('run') , text: '' }); }
      else out.push({ text: "Couldn't get away!" });
    } else if (a.type === 'forfeit') {
      out.push({ text: `${c.name} gave up!` }, { fn: () => this.finish(c.side === 0 ? 'lose' : 'win'), text: '' });
    } else if (a.type === 'switch') {
      out.push({ text: `${c.name}: Come back, ${monName(c.active)}!` },
               { text: `Go, ${a.mon ? monName(a.mon) : ''}!`, fn: () => { c.active = a.mon; c.stages = {}; this.popIn(c); markSeen(c.owner.trainer, a.mon.sp); } });
    } else if (a.type === 'item') {
      const it = ITEMS[a.item], bag = c.owner.trainer.bag;
      bag[a.item]--;
      const st = monStats(a.mon);
      if (it.revive) { a.mon.hp = Math.floor(st.hp / 2); a.mon.status = null; out.push({ text: `${monName(a.mon)} woke up!`, sfx: 'heal' }); }
      else { const before = a.mon.hp; a.mon.hp = Math.min(st.hp, a.mon.hp + it.heal); out.push({ text: `${monName(a.mon)} healed ${a.mon.hp - before} HP!`, sfx: 'heal' }); }
    } else if (a.type === 'orb') {
      const target = this.sides[1][0];
      c.owner.trainer.bag[a.item]--;
      out.push(...this.throwOrb(c, target, ITEMS[a.item].orb));
    } else if (a.type === 'move') {
      let target = a.target;
      if (!target || !alive(target.active)) target = this.foesOf(c).find(f => alive(f.active));
      if (target) out.push(...this.useMove(c, a.move, target));
    }
    this.now(out);
  }

  useMove(c, mv, t) {
    const M = MOVES[mv], me = c.active, out = [];
    if (me.status === 'paralyze' && Math.random() < 0.25) return [{ text: `${monName(me)} is paralyzed and can't move!` }];
    out.push({ text: `${monName(me)} used ${M.name}!`, fn: () => this.anims.push({ type: 'lunge', who: c, t: 0, dur: 18 }) });
    if (Math.random() * 100 > M.acc) { out.push({ text: `${monName(me)} missed!` }); return out; }
    if (M.power > 0) {
      const tm = t.active;
      const atkStat = monStats(me).atk * stageMult(c.stages.atk || 0) * (me.status === 'burn' ? 0.5 : 1);
      const defStat = monStats(tm).def * stageMult(t.stages.def || 0);
      const eff = effectiveness(M.type, SPECIES[tm.sp].types);
      const stab = SPECIES[me.sp].types.includes(M.type) ? 1.5 : 1;
      const crit = Math.random() < 0.06 ? 1.5 : 1;
      let dmg = Math.floor(Math.floor(Math.floor(2 * me.lv / 5 + 2) * M.power * atkStat / defStat) / 50) + 2;
      dmg = Math.max(1, Math.floor(dmg * stab * eff * crit * rand(0.85, 1)));
      if (eff === 0) dmg = 0;
      out.push({ text: '', fn: () => {
        tm.hp = Math.max(0, tm.hp - dmg);
        this.anims.push({ type: 'hit', who: t, t: 0, dur: 24, color: TYPES[M.type].color });
        (eff > 1 ? sfx.hitL : eff < 1 ? sfx.hitS : sfx.hitM)();
        rumble(t.owner && t.owner.dev, eff > 1 ? 250 : 120, eff > 1 ? 0.8 : 0.4);
      } });
      if (crit > 1) out.push({ text: 'A critical hit!' });
      if (eff > 1) out.push({ text: "It's super effective!" });
      if (eff < 1 && eff > 0) out.push({ text: "It's not very effective..." });
      if (M.drain) out.push({ text: `${monName(me)} drained some energy!`, fn: () => { me.hp = Math.min(monStats(me).hp, me.hp + Math.ceil(dmg * M.drain)); } });
      if (M.status && !tm.status && Math.random() < M.status[1]) {
        const s = M.status[0], types = SPECIES[tm.sp].types;
        if (!(s === 'burn' && types.includes('fire')) && !(s === 'paralyze' && types.includes('electric'))) {
          out.push({ text: `${monName(tm)} was ${s === 'burn' ? 'burned' : 'paralyzed'}!`, fn: () => { if (tm.hp > 0) tm.status = s; } });
        }
      }
      if (M.foe) out.push(...this.statMsgs(t, M.foe, tm));
      out.push({ text: '', fn: () => { if (tm.hp <= 0) this.now(this.faint(t)); } });
    } else {
      if (M.self) out.push(...this.statMsgs(c, M.self, me));
      if (M.foe) out.push(...this.statMsgs(t, M.foe, t.active));
      if (M.heal) {
        out.push({ text: `${monName(me)} recovered health!`, sfx: 'heal', fn: () => { me.hp = Math.min(monStats(me).hp, me.hp + Math.floor(monStats(me).hp * M.heal)); if (mv === 'rest') me.status = null; } });
      }
    }
    return out;
  }
  statMsgs(c, changes, mon) {
    const out = [];
    const names = { atk: 'ATTACK', def: 'DEFENSE', spd: 'SPEED' };
    for (const k in changes) {
      const v = changes[k];
      out.push({ text: `${monName(mon)}'s ${names[k]} ${v > 0 ? 'rose' : 'fell'}!`, fn: () => { c.stages[k] = clamp((c.stages[k] || 0) + v, -6, 6); } });
    }
    return out;
  }

  faint(c) {
    const out = [{ text: `${monName(c.active)} fainted!`, sfx: 'faint', fn: () => this.anims.push({ type: 'faint', who: c, t: 0, dur: 30 }) }];
    // XP for the other side's humans
    if (c.side === 1 || this.kind === 'pvp') {
      const fm = c.active;
      const winners = this.foesOf(c).filter(h => h.owner && alive(h.active));
      const amount = Math.max(1, Math.floor(SPECIES[fm.sp].xp * fm.lv / 6 * (this.kind === 'trainer' ? 1.5 : this.kind === 'pvp' ? 0.5 : 1) / Math.max(1, winners.length)));
      for (const h of winners) {
        out.push({ text: `${monName(h.active)} gained ${amount} XP!`, fn: () => {
          const msgs = giveXP(h.active, amount);
          this.now(msgs.map(m => ({ text: m.text, sfx: m.sfx })));
        } });
      }
    }
    return out;
  }

  /** After faints: computer trainers send their next monster, humans pick one. */
  endOfTurn() {
    const out = [];
    for (const c of this.sides[0].concat(this.sides[1])) {
      const m = c.active;
      if (alive(m) && m.status === 'burn') {
        out.push({ text: `${monName(m)} is hurt by its burn!`, fn: () => {
          m.hp = Math.max(0, m.hp - Math.max(1, Math.floor(monStats(m).hp / 16)));
          this.anims.push({ type: 'hit', who: c, t: 0, dur: 16, color: '#f97316' });
          if (m.hp <= 0) this.now(this.faint(c));
        } });
      }
    }
    out.push({ text: '', fn: () => this.replaceFainted() });
    this.now(out);
  }
  replaceFainted() {
    if (this.checkEnd()) return;
    const out = [];
    let humansNeed = false;
    for (const c of this.sides[0].concat(this.sides[1])) {
      if (alive(c.active)) continue;
      const next = c.party.find(m => alive(m) && !this.isActive(m));
      if (!next) { c.out = true; continue; }
      if (c.ai) out.push({ text: `${c.name} sent out ${monName(next)}!`, fn: () => { c.active = next; c.stages = {}; this.popIn(c); markSeenAll(this, next.sp); } });
      else { c.needReplace = true; c.menu = { level: 'replace', i: c.party.indexOf(next) }; humansNeed = true; }
    }
    this.now(out);
    if (humansNeed) this.queue.push({ text: '', fn: () => { this.phase = 'replace'; } });
    this.queue.push({ choose: true });
  }
  updateReplace(inputs) {
    const need = this.humans().filter(c => c.needReplace);
    if (!need.length) { this.phase = 'msg'; return; }
    for (const c of need) {
      const d = inputs[c.owner.dev] || EMPTY, m = c.menu;
      if (d.upP && m.i > 0) { m.i--; sfx.select(); }
      if (d.downP && m.i < c.party.length - 1) { m.i++; sfx.select(); }
      if (d.jumpP) {
        const t = c.party[m.i];
        if (alive(t) && !this.isActive(t)) { c.active = t; c.stages = {}; c.needReplace = false; this.popIn(c); sfx.select(); }
      }
    }
    if (!this.humans().some(c => c.needReplace)) this.phase = 'msg';
  }

  checkEnd() {
    if (this.over) return true;
    const sideOut = s => this.sides[s].every(c => !alive(c.active) && !c.party.some(m => alive(m) && !this.sides[s].some(o => o.active === m && o !== c)));
    const out0 = this.sides[0].every(c => !c.party.some(alive));
    const out1 = this.sides[1].every(c => !c.party.some(alive));
    if (out1) { this.finish('win'); return true; }
    if (out0) { this.finish('lose'); return true; }
    return false;
  }
  finish(result) {
    if (this.over) return;
    this.over = true; this.result = result;
    this.queue = [];
    const msgs = [];
    if (this.kind === 'trainer') {
      if (result === 'win') {
        msgs.push({ text: `You beat ${this.npc.name}!` }, { text: `"${this.npc.lose}"` });
        for (const h of this.sides[0]) {
          const reward = Math.floor(this.npc.reward / this.sides[0].length);
          msgs.push({ text: `${h.name} got $${reward}!`, sfx: 'buy', fn: () => { h.owner.trainer.money += reward; h.owner.trainer.beaten[this.npc.id] = true; } });
        }
      }
    }
    if (this.kind === 'pvp') {
      const winner = result === 'win' ? this.sides[0][0] : this.sides[1][0];
      msgs.push({ text: `${winner.name} wins the battle!`, sfx: 'caught' });
    }
    if (result === 'lose' && this.kind !== 'pvp') msgs.push({ text: 'All your monsters fainted...' }, { text: 'You hurried back to the Monster Center.' });
    // evolutions
    for (const p of this.players()) {
      for (const m of p.trainer.party) {
        const into = alive(m) && canEvolve(m);
        if (!into) continue;
        const was = monName(m);
        msgs.push({ text: `What? ${was} is evolving!`, sfx: 'evolve', wait: 110, fn: () => this.anims.push({ type: 'evolve', mon: m, t: 0, dur: 110 }) },
                  { text: `${was} evolved into ${SPECIES[into].name}!`, sfx: 'caught', fn: () => { evolveMon(m); markCaught(p.trainer, m.sp); } });
      }
    }
    msgs.push({ end: true });
    this.queue = msgs;
    this.msg = null;
    this.phase = 'msg';
  }

  throwOrb(c, target, bonus) {
    const m = target.active, st = monStats(m);
    const hpPart = 1 - (m.hp / st.hp) * 0.75;
    const chance = clamp(SPECIES[m.sp].catch * bonus * (0.35 + hpPart * 1.3) * (m.status ? 1.5 : 1), 0.01, 0.98);
    const shakes = [0, 1, 2].map(() => Math.random() < Math.pow(chance, 1 / 3));
    let n = 0; while (n < 3 && shakes[n]) n++;
    const caught = n === 3;
    const out = [{ text: `${c.name} threw a ${bonus > 1 ? 'SUPER ORB' : 'CAPTURE ORB'}!`, fn: () => this.anims.push({ type: 'orb', who: target, t: 0, dur: 40 + 30 * Math.max(1, n), shakes: n, caught }) }];
    for (let i = 0; i < Math.min(n, 3); i++) out.push({ text: '...', sfx: 'shake', wait: 30 });
    if (caught) {
      out.push({ text: `Gotcha! ${monName(m)} was caught!`, sfx: 'caught', fn: () => {
        target.caughtBy = c;
        const tr = c.owner.trainer;
        m.status = null;
        markCaught(tr, m.sp);
        if (tr.party.length < 6) tr.party.push(m); else tr.box.push(m);
        this.caught = m;
      } });
      if (c.owner.trainer.party.length >= 6) out.push({ text: `${monName(m)} was sent to the box.` });
      out.push({ text: '', fn: () => this.finish('caught') });
    } else {
      out.push({ text: ['Oh no! It broke free!', 'Argh! Almost had it!', 'So close!'][Math.min(n, 2)], sfx: 'broke' });
    }
    return out;
  }
  popIn(c) { this.anims.push({ type: 'pop', who: c, t: 0, dur: 20 }); sfx.select(); }

  // ------------------------------------------------------------ drawing
  /** Draws the battle into a w×h area. `who` = the viewing player (null = shared screen). */
  draw(w, h, viewer) {
    // background
    const isl = viewer ? islandAt(viewer.x, viewer.y) : null;
    const bio = isl ? isl.biome : 0;
    const skies = [['#7dd3fc', '#e0f2fe'], ['#1e3a2b', '#4b7a55'], ['#7c2d12', '#fdba74'], ['#bfdbfe', '#f8fafc']];
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, skies[bio][0]); g.addColorStop(1, skies[bio][1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const pad = BIOME[bio];
    const panelH = 190;
    // platforms
    const ex = w * 0.72, ey = h * 0.38, ax = w * 0.28, ay = h - panelH - 40;
    for (const [px, py, r] of [[ex, ey, Math.min(220, w * 0.3)], [ax, ay, Math.min(240, w * 0.33)]]) {
      ctx.fillStyle = pad.tall2; ctx.beginPath(); ctx.ellipse(px, py + 6, r, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pad.ground; ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = OL; ctx.stroke();
    }
    const scale = Math.min(2.2, w / 560);
    const place = (side, i, n) => {
      const spread = n > 1 ? (i === 0 ? -1 : 1) * Math.min(110, w * 0.12) : 0;
      return side === 1 ? { x: ex + spread, y: ey + (n > 1 && i === 1 ? 14 : 0) } : { x: ax + spread, y: ay + (n > 1 && i === 1 ? 14 : 0) };
    };
    // monsters
    const drawn = [];
    for (const s of [1, 0]) {
      this.sides[s].forEach((c, i) => {
        const m = c.active;
        if (!m) return;
        const pos = place(s, i, this.sides[s].length);
        let x = pos.x, y = pos.y, alpha = 1, flash = 0, sc = scale * (s === 0 ? 1.1 : 1);
        for (const a of this.anims) {
          if (a.who !== c) continue;
          const k = a.t / a.dur;
          if (a.type === 'lunge') x += Math.sin(k * Math.PI) * 50 * (s === 0 ? 1 : -1);
          if (a.type === 'hit') { flash = (a.t >> 2) % 2 ? 0.8 : 0; x += Math.sin(a.t * 1.5) * 6 * (1 - k); }
          if (a.type === 'faint') { y += k * 60; alpha = 1 - k; }
          if (a.type === 'pop') sc *= easeOut(k);
          if (a.type === 'orb') {
            if (a.t < 40) sc *= 1; else if (!a.caught || a.t < a.dur) sc *= 0;
            if (!a.caught && a.t >= a.dur - 10) sc = scale;
          }
        }
        if (!alive(m) && !this.anims.some(a => a.who === c && a.type === 'faint')) return;
        if (this.anims.some(a => a.type === 'orb' && a.who === c && a.t >= 40)) sc = 0;
        if (c.caughtBy) return;
        if (sc > 0.02) drawMonster(m.sp, x, y, sc, s === 0 ? 1 : -1, frameCount, { alpha, flash });
        drawn.push({ c, x, y, s, i, n: this.sides[s].length });
        // hit sparks
        for (const a of this.anims) if (a.who === c && a.type === 'hit' && a.t < 12) {
          ctx.save(); ctx.globalAlpha = 1 - a.t / 12;
          ctx.fillStyle = a.color; ctx.strokeStyle = OL; ctx.lineWidth = 3;
          ctx.beginPath();
          for (let k = 0; k < 16; k++) { const r = (k % 2 ? 18 : 46) * (0.6 + a.t / 20), ang = k * Math.PI / 8; ctx.lineTo(x + Math.cos(ang) * r, y - 60 + Math.sin(ang) * r); }
          ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        }
      });
    }
    // capture orb flying and wobbling
    for (const a of this.anims) if (a.type === 'orb') {
      const i = this.sides[1].indexOf(a.who), pos = place(1, i, this.sides[1].length);
      let ox, oy;
      if (a.t < 40) { const k = a.t / 40; ox = lerp(ax, pos.x, k); oy = lerp(ay - 80, pos.y - 30, k) - Math.sin(k * Math.PI) * 140; }
      else { ox = pos.x + Math.sin((a.t - 40) * 0.4) * (a.t % 30 < 15 ? 8 : 0); oy = pos.y - 18; }
      drawOrb(ox, oy, 16, a.caught && a.t > a.dur - 20);
    }
    // evolution glow
    for (const a of this.anims) if (a.type === 'evolve') {
      ctx.fillStyle = `rgba(255,255,255,${Math.sin(a.t * 0.2) * 0.3 + 0.4})`; ctx.fillRect(0, 0, w, h - panelH);
      drawMonster(a.t < 70 ? a.mon.sp : (canEvolve(a.mon) || a.mon.sp), w / 2, h * 0.55, scale * 1.4, 1, frameCount, { flash: Math.abs(Math.sin(a.t * 0.15)) });
    }
    // info boxes
    for (const dd of drawn) this.drawInfo(dd.c, dd.s, dd.i, dd.n, w, h - panelH);
    // bottom panel
    this.drawPanel(w, h, panelH, viewer);
  }

  drawInfo(c, s, i, n, w, bottom) {
    const m = c.active, st = monStats(m);
    const bw = Math.min(250, w * 0.38), bh = 66;
    // foes' boxes stack in the top-left corner, yours stack above the menu on the right
    const bx = s === 1 ? 14 : w - bw - 14;
    const by = s === 1 ? 14 + i * (bh + 22) : bottom - 18 - (n - i) * (bh + 22);
    panel(bx, by, bw, bh, 'rgba(255,255,255,0.92)', OL, 12);
    text(monName(m), bx + 12, by + 18, 20, '#1a1030', 'left', null);
    text('Lv' + m.lv, bx + bw - 12, by + 18, 18, '#1a1030', 'right', null);
    if (m.status) text(m.status === 'burn' ? 'BRN' : 'PAR', bx + bw - 58, by + 18, 14, m.status === 'burn' ? '#ea580c' : '#ca8a04', 'right', null);
    // animated HP bar
    c.shownHp = c.shownHp === undefined || c.shownFor !== m ? m.hp : lerp(c.shownHp, m.hp, 0.12);
    c.shownFor = m;
    const k = clamp(c.shownHp / st.hp, 0, 1);
    rrect(bx + 12, by + 34, bw - 24, 14, 6); ctx.fillStyle = '#374151'; ctx.fill();
    if (k > 0) { rrect(bx + 12, by + 34, (bw - 24) * k, 14, 6); ctx.fillStyle = k > 0.5 ? '#22c55e' : k > 0.2 ? '#facc15' : '#ef4444'; ctx.fill(); }
    if (c.owner) text(`${Math.ceil(m.hp)}/${st.hp}`, bx + bw - 12, by + 58, 14, '#374151', 'right', null, FONT2);
    // type tags
    SPECIES[m.sp].types.forEach((t, i) => { rrect(bx + 12 + i * 70, by + 51, 64, 13, 5); ctx.fillStyle = TYPES[t].color; ctx.fill(); text(TYPES[t].name, bx + 44 + i * 70, by + 58, 10, '#fff', 'center', OL, FONT2); });
    if (c.owner && this.shared()) text(c.name, bx + bw / 2, by - 10, 14, '#fff', 'center', OL, FONT2);
  }

  drawPanel(w, h, ph, viewer) {
    const y = h - ph;
    panel(6, y, w - 12, ph - 8, 'rgba(20,12,40,0.92)', '#fff', 16);
    if (this.phase === 'choose' || this.phase === 'replace') {
      const hs = this.humans().filter(c => (this.phase === 'choose' ? alive(c.active) : c.needReplace));
      const mine = viewer ? hs.filter(c => c.owner === viewer) : hs;
      const shown = mine.length ? mine : hs;
      const n = shown.length;
      shown.forEach((c, i) => {
        const x0 = 6 + i * (w - 12) / n, cw = (w - 12) / n;
        if (n > 1 && i > 0) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x0, y + 10, 2, ph - 28); }
        this.drawMenu(c, x0 + 14, y + 14, cw - 28, ph - 36);
      });
      if (!shown.length) text('Waiting...', w / 2, y + ph / 2 - 4, 26, '#fff');
      return;
    }
    if (this.msg && this.msg.text) {
      ctx.save();
      ctx.font = `26px ${FONT2}`;
      const words = this.msg.text.split(' '), lines = [''];
      for (const wd of words) { const tst = (lines[lines.length - 1] + ' ' + wd).trim(); if (ctx.measureText(tst).width > w - 70 && lines[lines.length - 1]) lines.push(wd); else lines[lines.length - 1] = tst; }
      const shownChars = Math.floor(this.msgT * 2.2);
      let left = shownChars;
      lines.forEach((ln, i) => { const part = ln.slice(0, Math.max(0, left)); left -= ln.length; text(part, 30, y + 44 + i * 38, 26, '#fff', 'left', OL, FONT2); });
      ctx.restore();
    }
  }
  drawMenu(c, x, y, w, h) {
    const m = c.menu;
    if (!m) return;
    const label = (s, i, cols, rows, color = '#fff', sub, top = 0) => {
      const cw = w / cols, rh = (h - top) / rows, cx = x + (i % cols) * cw, cy = y + top + Math.floor(i / cols) * rh;
      const sel = i === m.i;
      if (sel) { rrect(cx + 2, cy + 2, cw - 4, rh - 4, 10); ctx.fillStyle = 'rgba(250,204,21,0.25)'; ctx.fill(); ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.stroke(); }
      text((sel ? '▶ ' : '') + s, cx + 14, cy + rh / 2 - (sub ? 8 : 0), Math.min(26, rh * 0.42), color, 'left', OL);
      if (sub) text(sub, cx + 34, cy + rh / 2 + 14, Math.min(15, rh * 0.25), '#cbd5e1', 'left', OL, FONT2);
    };
    if (c.action) { text(`${c.name} is ready!`, x + w / 2, y + h / 2, 24, '#4ade80'); return; }
    const head = this.shared() ? c.name + ': ' : '';
    if (m.level === 'main') {
      text(`${head}What will ${monName(c.active)} do?`, x, y + 4, 16, '#e0e7ff', 'left', OL, FONT2);
      this.mainOptions().forEach((o, i) => label(o, i, 2, 2, '#fff', null, 18));
    } else if (m.level === 'moves') {
      c.active.moves.forEach((mv, i) => {
        const M = MOVES[mv];
        const foe = this.foesOf(c).find(f => alive(f.active));
        const eff = foe && M.power ? effectiveness(M.type, SPECIES[foe.active.sp].types) : 1;
        label(M.name, i, 2, 2, TYPES[M.type].color, `${TYPES[M.type].name}${M.power ? ' · ' + M.power : ''}${eff > 1 ? ' · STRONG!' : eff < 1 ? ' · weak' : ''}`);
      });
    } else if (m.level === 'target') {
      this.foesOf(c).filter(f => alive(f.active)).forEach((f, i) => label(monName(f.active), i, 2, 1));
    } else if (m.level === 'bag') {
      const items = this.usableItems(c);
      if (!items.length) text('Your bag is empty!', x + w / 2, y + h / 2, 22, '#fff');
      const rows = Math.max(3, items.length);
      items.forEach((it, i) => label(`${ITEMS[it].name} x${c.owner.trainer.bag[it]}`, i, 1, rows));
    } else if (m.level === 'itemTarget' || m.level === 'team' || m.level === 'replace') {
      if (m.level === 'replace') text('Choose your next monster!', x, y + 4, 16, '#facc15', 'left', OL, FONT2);
      const rows = Math.max(3, c.party.length);
      c.party.forEach((pm, i) => label(`${monName(pm)} Lv${pm.lv}  ${Math.ceil(pm.hp)}/${monStats(pm).hp}${this.isActive(pm) ? ' (out)' : ''}`, i, 1, rows, pm.hp > 0 ? '#fff' : '#f87171'));
    }
  }
}

function drawOrb(x, y, r, glow = false) {
  ctx.save(); ctx.translate(x, y);
  if (glow) { ctx.fillStyle = 'rgba(253,224,71,0.5)'; ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.fillStyle = '#8b5cf6'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.fillStyle = '#f8fafc'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2); ctx.fillStyle = '#fde047'; ctx.fill(); ctx.stroke();
  ctx.restore();
}

function markSeen(tr, sp) { if (tr) tr.seen[sp] = true; }
function markCaught(tr, sp) { if (tr) { tr.seen[sp] = true; tr.caught[sp] = true; } }
function markSeenAll(fight, sp) { for (const p of fight.players()) markSeen(p.trainer, sp); }
