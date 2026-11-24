/* Squeeze Street — sim.test.js
 * Plain node, no dependencies:   node test/sim.test.js      (exit 0 = all good)
 *   VERBOSE=1 prints one line per simulated day for the first seed (VERBOSE=<seed> for another).
 *   SEEDS=3,4,5 plays other seeds.
 * Three bots play full games on several seeds while every invariant is checked,
 * then the balance targets are asserted and a short balance table is printed.
 */
'use strict';
const path = require('path');

/* in-memory localStorage, installed before the game scripts load */
const disk = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: { getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => { disk.set(k, String(v)); }, removeItem: (k) => { disk.delete(k); } }
});
require(path.join(__dirname, '..', 'js', 'core.js'));
require(path.join(__dirname, '..', 'js', 'sim.js'));
const SS = globalThis.SS, D = SS.DATA, Sim = SS.Sim;

const SEEDS = process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : [11, 2024, 77123, 5150];
const DAYS = 60;
const VERBOSE = process.env.VERBOSE ? Number(process.env.VERBOSE) || 1 : 0;      // 1 = first seed, or a seed number
const failures = [];
let checks = 0;
function ok(cond, msg) { checks++; if (!cond) { if (failures.length < 40) failures.push(msg); } return !!cond; }
const isNum = (v) => typeof v === 'number' && isFinite(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isObj = (v) => !!v && typeof v === 'object';
const PHASES = ['title', 'prep', 'day', 'results'];
const BUBBLES = ['thirsty', 'pricey', 'wait', 'soldout', 'happy', 'love', 'meh', 'angry', 'sour', 'sweet', 'watery', 'warm', 'tip', 'star'];
const STATES = ['walk', 'approach', 'queue', 'order', 'leave'];
const FEEDBACK = ['great', 'sour', 'sweet', 'watery', 'warm', 'pricey', 'slow', 'cheap', 'quiet'];
const ITEMS = D.itemOrder;
const OUTCOMES = ['new', 'streak', 'broken', 'saved', 'lost', 'closed', 'away'];
const BREAKS = ['taste', 'pricey', 'slow', 'wait', 'soldout', 'quit'];
const isCount = (v) => Number.isInteger(v) && v >= 0;
const r2 = (n) => Math.round(n * 100) / 100;
const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

/* ---------------------------------------------------------------- *
 * Shape checks
 * ---------------------------------------------------------------- */
function isCustomer(c) {
  return isObj(c) && isNum(c.id) && !!D.kinds[c.kind] && isNum(c.seed) && isNum(c.x) && isNum(c.lane) && c.lane >= 0 && c.lane <= 1 &&
    (c.dir === 1 || c.dir === -1) && isNum(c.speed) && c.speed >= 0 && STATES.includes(c.state) && isNum(c.stateT) &&
    typeof c.hasDrink === 'boolean' && isNum(c.mood) && c.mood >= -1 && c.mood <= 1 && isNum(c.patience) && c.patience >= 0 && c.patience <= 1 &&
    (c.bubble === null || (isObj(c.bubble) && BUBBLES.includes(c.bubble.type) && isNum(c.bubble.ttl) && c.bubble.ttl > 0 && isNum(c.bubble.max))) &&
    Number.isInteger(c.qty) && c.qty >= 1 && c.qty <= 4 &&
    (c.regularId === null ? c.streak === 0 && c.mult === 1 : isStr(c.regularId) && isCount(c.streak) && c.mult === SS.loyaltyMult(c.streak));
}
/** strict = as stored in state.regulars (a removed regular's last payload may carry 2 strikes) */
function isRegular(g, strict) {
  return isObj(g) && /^r\d+$/.test(g.id) && isStr(g.name) && !!D.regularNames[g.kind] && isCount(g.seed) &&
    isCount(g.streak) && isCount(g.best) && g.best >= g.streak && isCount(g.visits) && g.visits >= 1 &&
    isCount(g.strikes) && g.strikes <= (strict ? 1 : 2) && isCount(g.since) && isCount(g.lastDay) && g.since >= 1 && g.lastDay >= g.since;
}
const isWx = (w) => isObj(w) && !!D.weather[w.type] && isNum(w.temp);
const isTip = (t) => isObj(t) && isNum(t.id) && isNum(t.x) && isNum(t.lane) && isNum(t.amount) && t.amount > 0 && isNum(t.ttl);
const isEvent = (e) => e === null || (isObj(e) && !!D.byId(D.events, e.id) && isStr(e.title) && isStr(e.desc) && isStr(e.icon) && typeof e.known === 'boolean');

function isResult(r) {
  if (!isObj(r)) return 'not an object';
  const nums = ['day', 'cups', 'revenue', 'tips', 'ingredientCost', 'rent', 'profit', 'satisfaction', 'repBefore', 'repAfter', 'cashAfter'];
  for (const k of nums) if (!isNum(r[k])) return 'bad number ' + k;
  if (!D.byId(D.locations, r.location)) return 'location';
  if (!isWx(r.weather)) return 'weather';
  if (!isEvent(r.event)) return 'event';
  if (!isObj(r.people) || !['passed', 'served', 'pricey', 'wait', 'soldout', 'quit'].every((k) => isNum(r.people[k]) && r.people[k] >= 0)) return 'people';
  if (r.satisfaction < 0 || r.satisfaction > 1) return 'satisfaction range';
  if (!Array.isArray(r.reviews) || r.reviews.length > 6) return 'reviews';
  for (const v of r.reviews) if (!isStr(v.text) || !isNum(v.mood) || !FEEDBACK.includes(v.kind) || !D.kinds[v.who]) return 'review entry';
  if (!FEEDBACK.includes(r.topFeedback)) return 'topFeedback ' + r.topFeedback;
  if (!isStr(r.advice) || r.advice.length < 20) return 'advice';
  if (!Array.isArray(r.hourly) || r.hourly.length !== 9 || !r.hourly.every(isNum)) return 'hourly';
  if (r.hourly.reduce((a, b) => a + b, 0) !== r.cups) return 'hourly does not add up to cups';
  if (!isObj(r.spoiled) || !isNum(r.spoiled.lemons) || !isNum(r.spoiled.ice)) return 'spoiled';
  if (!Array.isArray(r.milestones) || !r.milestones.every((id) => !!D.byId(D.milestones, id))) return 'milestones';
  if (typeof r.bestDay !== 'boolean') return 'bestDay';
  if (!isNum(r.loyalty) || r.loyalty < 0 || !isNum(r.boostCost) || r.boostCost < 0) return 'loyalty / boostCost';
  if (!Array.isArray(r.boosts) || !r.boosts.every((id) => !!D.byId(D.boosts, id)) || new Set(r.boosts).size !== r.boosts.length) return 'boosts';
  if (!Array.isArray(r.regulars) || new Set(r.regulars.map((g) => g && g.id)).size !== r.regulars.length) return 'regulars';
  for (const g of r.regulars) {
    if (!isObj(g) || !isStr(g.id) || !isStr(g.name) || !D.regularNames[g.kind] || !OUTCOMES.includes(g.outcome) || !isCount(g.streak) ||
      g.mult !== SS.loyaltyMult(g.streak) || !isNum(g.bonus) || g.bonus < 0 || typeof g.reason !== 'string' ||
      (['broken', 'saved', 'lost'].includes(g.outcome) ? !BREAKS.includes(g.reason) : g.reason !== '')) return 'regular row ' + JSON.stringify(g);
    if (g.outcome === 'away' && g.streak < 3) return 'away row with a short streak';
  }
  if (Math.abs(r.profit - (r.revenue + r.tips + r.loyalty - r.ingredientCost - r.rent - r.boostCost)) > 0.011) return 'profit does not add up';
  return '';
}

/* every documented Sim event, with a validator for its payload */
const SPEC = {
  'phase': (p) => (p.from === null || PHASES.includes(p.from)) && PHASES.includes(p.to),
  'day:start': (p) => isNum(p.day) && isWx(p.weather) && isEvent(p.event),
  'day:end': (p) => isResult(p.result) === '',
  'customer:spawn': (p) => isCustomer(p.c),
  'customer:join': (p) => isCustomer(p.c) && p.c.state === 'queue',
  'customer:balk': (p) => isCustomer(p.c) && ['pricey', 'wait', 'soldout'].includes(p.reason),
  'customer:quit': (p) => isCustomer(p.c),
  'pour': (p) => isCustomer(p.c) && isNum(p.duration) && p.duration > 0,
  'sale': (p) => isCustomer(p.c) && isNum(p.price) && Number.isInteger(p.qty) && p.qty >= 1 && isNum(p.x) && isNum(p.lane),
  'review': (p) => isCustomer(p.c) && isStr(p.text) && isNum(p.mood) && p.mood >= -1 && p.mood <= 1 && FEEDBACK.includes(p.kind),
  'tip:drop': (p) => isTip(p.tip),
  'tip:collect': (p) => isTip(p.tip) && typeof p.auto === 'boolean',
  'brew:start': (p) => isNum(p.duration) && p.duration > 0,
  'brew:done': (p) => isNum(p.cups) && p.cups >= 1,
  'brew:tap': (p) => isObj(p),
  'soldout': (p) => ITEMS.includes(p.missing),
  'bell': (p) => isObj(p),
  'weather:change': (p) => !!D.weather[p.type] && isNum(p.temp),
  'event:trigger': (p) => !!D.byId(D.events, p.id) && isStr(p.title) && isStr(p.desc) && isStr(p.icon),
  'cash': (p) => isNum(p.amount) && p.amount >= 0 && isNum(p.delta) && isStr(p.reason),
  'reputation': (p) => isNum(p.value) && p.value >= 0 && p.value <= 5 && isNum(p.delta),
  'milestone': (p) => !!D.byId(D.milestones, p.id) && isStr(p.title) && isNum(p.reward),
  'win': (p) => isObj(p),
  'upgrade:buy': (p) => !!D.byId(D.upgrades, p.id) && isNum(p.level) && p.level >= 1,
  'flavor:buy': (p) => !!D.byId(D.flavors, p.id),
  'flavor:set': (p) => !!D.byId(D.flavors, p.id),
  'location:unlock': (p) => !!D.byId(D.locations, p.id),
  'location:set': (p) => !!D.byId(D.locations, p.id),
  'cart': (p) => isObj(p), 'recipe': (p) => isObj(p), 'price': (p) => isObj(p),
  'settings': (p) => isStr(p.key) && p.value !== undefined,
  'toast': (p) => isStr(p.text) && ['info', 'good', 'bad'].includes(p.kind) && isStr(p.icon),
  'save': (p) => isObj(p),
  'regular:new': (p) => isRegular(p.regular, true) && isCustomer(p.c) && p.c.regularId === p.regular.id && p.regular.streak === 1 && p.c.seed === p.regular.seed,
  'regular:visit': (p) => isRegular(p.regular, true) && isCustomer(p.c) && p.c.regularId === p.regular.id && p.c.kind === p.regular.kind && p.c.seed === p.regular.seed,
  'regular:streak': (p) => isRegular(p.regular, true) && isCustomer(p.c) && p.streak >= 1 && p.streak === p.regular.streak && p.mult === SS.loyaltyMult(p.streak),
  'regular:broken': (p) => isRegular(p.regular, false) && isCustomer(p.c) && BREAKS.includes(p.reason) && typeof p.shielded === 'boolean' && (p.shielded || p.regular.streak === 0),
  'regular:lost': (p) => isRegular(p.regular, false) && p.regular.strikes === 2,
  'loyalty': (p) => isCustomer(p.c) && isStr(p.c.regularId) && isNum(p.amount) && p.amount > 0 && p.mult > 1 && p.mult === p.c.mult,
  'dealer:buy': (p) => (p.kind === 'boost' ? !!D.byId(D.boosts, p.id) : p.kind === 'limited' && !!(D.byId(D.flavors, p.id) || {}).limited) && isNum(p.cost) && p.cost > 0,
  'boost:on': (p) => !!D.byId(D.boosts, p.id)
};
const seen = {};
const phaseLog = [];
Object.keys(SPEC).forEach((name) => {
  seen[name] = 0;
  SS.on(name, (p) => {
    seen[name]++;
    let good = false;
    try { good = isObj(p) && SPEC[name](p); } catch (e) { good = false; }
    ok(good, 'bad payload for "' + name + '": ' + safeJSON(p));
    if (name === 'phase') phaseLog.push(p.from + '>' + p.to);
  });
});
function safeJSON(v) { try { return JSON.stringify(v, (k, x) => (k === 'c' && x ? { id: x.id, state: x.state, qty: x.qty, mood: x.mood, lane: x.lane, bubble: x.bubble } : x)).slice(0, 220); } catch (e) { return String(v); } }

/** no NaN / undefined anywhere in the state, nothing negative that should not be */
function scan(v, where) {
  if (v === undefined) return ok(false, 'undefined at ' + where);
  if (typeof v === 'number') return ok(isFinite(v), 'non-finite number at ' + where);
  if (!isObj(v)) return true;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) scan(v[i], where + '[' + i + ']'); return true; }
  for (const k in v) scan(v[k], where + '.' + k);
  return true;
}
function checkState(tag) {
  const st = SS.state;
  scan(st, tag);
  ok(st.cash >= 0, tag + ': cash negative ' + st.cash);
  ITEMS.forEach((it) => ok(st.stock[it] >= 0, tag + ': stock.' + it + ' negative'));
  ok(st.reputation >= 0 && st.reputation <= 5, tag + ': reputation out of range');
  ok(PHASES.includes(st.phase), tag + ': phase');
  // regulars, boosts and Dex
  ok(Array.isArray(st.regulars) && st.regulars.length <= 12, tag + ': at most 12 regulars');
  ok(new Set(st.regulars.map((g) => g.id)).size === st.regulars.length, tag + ': duplicate regular ids');
  st.regulars.forEach((g) => {
    ok(isRegular(g, true), tag + ': malformed regular ' + JSON.stringify(g));
    ok(Number(g.id.slice(1)) < st.nextRegular, tag + ': nextRegular would reuse ' + g.id);
    ok(st.stats.bestStreak >= g.best, tag + ': stats.bestStreak below a regular\'s best');
  });
  ok(isCount(st.stats.bestStreak), tag + ': bestStreak');
  ok(Array.isArray(st.boosts) && st.boosts.every((id) => !!D.byId(D.boosts, id)) && new Set(st.boosts).size === st.boosts.length, tag + ': boosts');
  ok(isNum(st.boostCost) && st.boostCost >= 0 && (st.boosts.length > 0 || st.boostCost === 0), tag + ': boostCost');
  if (st.phase === 'results') ok(st.boosts.length === 0, tag + ': boosts must clear when the day ends');
  if (st.phase === 'prep' || st.phase === 'day') {
    if (st.day < 2) ok(st.dealer === null && Sim.dealerInfo().present === false, tag + ': no Dex on day 1');
    else {
      const dl = st.dealer, info = Sim.dealerInfo();
      ok(isObj(dl) && dl.day === st.day && Array.isArray(dl.offers) && dl.offers.length <= 4 && dl.offers.filter((o) => o.kind === 'boost').length <= 3, tag + ': dealer stock');
      ok(new Set(dl.offers.map((o) => o.id)).size === dl.offers.length && dl.offers.every((o) => typeof o.sold === 'boolean' &&
        (o.kind === 'boost' ? !!D.byId(D.boosts, o.id) : o.kind === 'limited' && !!(D.byId(D.flavors, o.id) || {}).limited)), tag + ': dealer offers');
      ok(info.present && isStr(info.line) && info.offers.length === dl.offers.length && info.offers.every((o) => isStr(o.name) && isStr(o.desc) && isStr(o.icon) &&
        /^#[0-9A-Fa-f]{6}$/.test(o.color) && isNum(o.cost) && o.cost > 0 && typeof o.sold === 'boolean' && typeof o.canBuy === 'boolean' &&
        typeof o.reason === 'string' && o.canBuy === (o.reason === '')), tag + ': dealerInfo shape');
    }
  }
  ok((st.phase === 'day') === !!st.today, tag + ': today must exist only during the day');
  const td = st.today;
  if (!td) return;
  const ids = new Set(td.customers.map((c) => c.id));
  ok(ids.size === td.customers.length, tag + ': duplicate customer ids');
  ok(td.customers.length <= 80, tag + ': crowd over the cap (' + td.customers.length + ')');
  td.queue.forEach((id, i) => {
    const c = td.customers.find((x) => x.id === id);
    if (ok(!!c, tag + ': queue id ' + id + ' has no customer')) ok(c.state === 'queue' || c.state === 'order', tag + ': queued customer in state ' + c.state + ' at slot ' + i);
  });
  td.customers.forEach((c) => {
    ok(isCustomer(c), tag + ': malformed customer ' + safeJSON({ c }));
    if (c.state === 'queue' || c.state === 'order') ok(td.queue.includes(c.id), tag + ': ' + c.state + ' customer missing from queue');
    if (c.state === 'order') ok(td.queue[0] === c.id, tag + ': order customer not at the front');
  });
  ok(td.serving === null || (ids.has(td.serving.id) && td.serving.p >= 0 && td.serving.p <= 1 && td.queue[0] === td.serving.id), tag + ': serving is inconsistent');
  ok(td.pitcher.cups >= 0 && td.pitcher.cups <= td.pitcher.max && (td.pitcher.brew === null || (td.pitcher.brew >= 0 && td.pitcher.brew <= 1.2)), tag + ': pitcher');
  ok(td.t >= 0 && td.t <= 1 && td.clock >= 0 && td.clock <= SS.DAY_LENGTH + 1e-6, tag + ': clock');
  ok(td.bell.cd >= 0 && td.bell.active >= 0, tag + ': bell');
  ok(td.tips.every(isTip), tag + ': tips');
  ok(td.hourly.length === 9 && isWx(td.weatherNow), tag + ': hourly / weatherNow');
}

/* ---------------------------------------------------------------- *
 * Bots
 * ---------------------------------------------------------------- */
function restock(st, cupsWanted) {
  // cheapest cart that covers cupsWanted cups with the current recipe; shrinks until it is affordable
  const cooler = Sim.upgradeInfo('cooler'), saved = cooler.level ? D.byId(D.upgrades, 'cooler').levels[cooler.level - 1].value : 0;
  for (let want = cupsWanted; want >= 4; want = Math.floor(want * 0.85)) {
    const need = { lemons: want * st.recipe.lemons / 10, sugar: want * st.recipe.sugar / 10, ice: want * st.recipe.ice * (1 + 0.45 * (1 - saved)), cups: want };
    let cost = 0; const packs = {};
    ITEMS.forEach((it) => { packs[it] = Math.max(0, Math.ceil((need[it] - st.stock[it]) / D.items[it].pack)); cost += packs[it] * st.market[it]; });
    if (cost <= st.cash - Sim.rent() + 1e-9 || want < 5) { ITEMS.forEach((it) => Sim.setCart(it, packs[it])); return; }
  }
}

function naiveBot(price) {
  return {
    name: price > 2 ? 'greedy' : 'naive', log: {},
    prep(st) {
      Sim.setPrice(price);
      ITEMS.forEach((it) => Sim.setCart(it, Math.max(0, 2 - Math.floor(st.stock[it] / D.items[it].pack))));
      if (!Sim.canStartDay().ok) {          // short of cash: buy only what is actually missing
        ITEMS.forEach((it) => Sim.setCart(it, 0));
        for (let i = 0; i < 4 && !Sim.canStartDay().ok; i++) { const it = Sim.prepInfo().limiting; Sim.setCart(it, st.cart[it] + 1); }
      }
    },
    tick() {}
  };
}

function competentBot() {
  const log = { firstUpgrade: null, canAfford: null, loc: {}, mogul: null, deals: {} };
  let polishFloor = 0, golden = false;
  let tapAcc = 0, boost = 1;
  const wxPull = (type) => D.weather[type].traffic * D.weather[type].thirst;
  const FLOW = ['pitcher', 'juicer', 'helper', 'speaker', 'awning'];      // things that move the line
  function cheapest(st, only) {
    let best = null;
    D.upgrades.forEach((u) => {
      if (only && !only.includes(u.id)) return;
      const info = Sim.upgradeInfo(u.id);
      if (info.next && (!best || info.next.cost < best.cost)) best = { id: u.id, cost: info.next.cost };
    });
    return best;
  }
  function shop(st) {
    const lr = st.lastResult;
    const reserve = Math.max(10, (lr ? lr.ingredientCost : 8) * 1.3) + Sim.rent();
    const idx = D.locations.findIndex((l) => l.id === st.location), next = D.locations[idx + 1];
    let saving = false;
    if (next && st.reputation >= next.repReq) {
      const from = D.locations[idx];
      if (st.cash >= next.unlockCost + next.rent + reserve * 1.5 && Sim.unlockLocation(next.id).ok && Sim.setLocation(next.id).ok) {
        log.loc[next.id] = st.day;
        Sim.setPrice(st.price * Math.pow(next.wtp / from.wtp, 0.9));
        boost = next.traffic / from.traffic;
      } else saving = true;                 // the next spot is within reach: put money aside for it
    }
    const jammed = !!lr && lr.people.wait + lr.people.quit > lr.people.served * 0.4;
    const cap = saving ? Math.max(30, next.unlockCost * 0.15) : Infinity;
    const any = cheapest(st, null);
    if (log.canAfford === null && any && st.cash - reserve >= any.cost) log.canAfford = st.day;
    for (const f of D.flavors) {
      const info = Sim.flavorInfo(f.id), old = D.byId(D.flavors, st.flavor);
      if (!info.owned && info.canBuy && f.cost <= Math.min(cap, (st.cash - reserve) * 0.6) && Sim.buyFlavor(f.id).ok) Sim.setPrice(st.price * (1 + f.wtp) / (1 + old.wtp));
    }
    for (let guard = 0; guard < (saving ? 1 : 30); guard++) {
      const best = (jammed && cheapest(st, FLOW)) || cheapest(st, null);
      if (!best || best.cost > Math.min(cap, (st.cash - reserve) * 0.8) || !Sim.buyUpgrade(best.id).ok) break;
      if (log.firstUpgrade === null) log.firstUpgrade = st.day;
    }
    // Dex: a boost when it should pay for itself, a limited flavor when it beats the one we pour
    const deal = Sim.dealerInfo();
    if (!deal.present) return;
    const recent = st.history.slice(-3), profit = recent.length ? avg(recent.map((h) => h.profit)) : 10;
    const fine = wxPull(st.forecast.type) >= 0.6, streak = Math.max(0, ...st.regulars.map((g) => g.streak));
    const spare = !!lr && lr.people.wait + lr.people.quit < lr.people.served * 0.1;              // the line kept up yesterday
    const shaky = !!lr && lr.regulars.some((g) => g.outcome !== 'streak' && g.outcome !== 'new' && g.outcome !== 'closed' && g.outcome !== 'away');
    for (const o of deal.offers) {
      if (!o.canBuy || st.cash - o.cost < reserve) continue;
      const fl = D.byId(D.flavors, o.id), cur = D.byId(D.flavors, st.flavor);
      const want = o.kind === 'limited' ? fl.wtp > cur.wtp && o.cost <= Math.min(cap, (st.cash - reserve) * 0.5)
        : o.id === 'golden' ? fine && o.cost <= profit * 0.2
          : o.id === 'flyers' ? fine && spare && o.cost <= profit * 0.15
            : o.id === 'shield' ? streak >= 6 && shaky && o.cost <= profit * 0.15
              : o.id === 'hype' ? st.regulars.length >= 6 && o.cost <= profit * 0.12 : false;
      if (!want || !Sim.buyDeal(o.id).ok) continue;
      log.deals[o.id] = (log.deals[o.id] || 0) + 1;
      if (o.kind === 'limited') Sim.setPrice(st.price * (1 + fl.wtp) / (1 + cur.wtp));
      if (o.id === 'golden') { Sim.setPrice(st.price * 1.2); golden = true; }
    }
  }
  return {
    name: 'competent', log,
    prep(st) {
      const lr = st.lastResult && st.lastResult.day === st.day - 1 ? st.lastResult : null, r = st.recipe;
      boost = 1;
      if (golden) { Sim.setPrice(st.price / 1.2); golden = false; }      // yesterday's Golden Lemons price was a one-off
      shop(st);
      if (lr) {
        const a = lr.advice;               // the results screen says what to change
        if (/one less lemon/.test(a)) Sim.setRecipe('lemons', r.lemons - 1);
        if (/add a lemon/.test(a)) Sim.setRecipe('lemons', r.lemons + 1);
        if (/add a scoop of sugar/.test(a)) Sim.setRecipe('sugar', r.sugar + 1);
        if (/scoop of sugar out/.test(a)) Sim.setRecipe('sugar', r.sugar - 1);
        // endgame: once the big goal is done, chase five stars by giving people a better deal
        const polishing = st.won && !st.milestonesDone.includes('rep5');
        if (polishing) {
          if (!polishFloor) polishFloor = st.price * 0.55;
          if (lr.topFeedback === 'pricey') Sim.setPrice(st.price * 0.9);
          else if (lr.satisfaction < 0.9 && lr.topFeedback !== 'quiet') Sim.setPrice(Math.max(polishFloor, st.price * 0.95));
        } else {
          switch (lr.topFeedback) {
            case 'pricey': Sim.setPrice(st.price * 0.9); break;
            case 'cheap': Sim.setPrice(st.price * 1.12); break;
            case 'great': Sim.setPrice(st.price * 1.05); break;
            case 'slow': Sim.setPrice(st.price * (lr.people.wait > lr.people.served * 1.5 ? 1.18 : 1.08)); break;
          }
        }
      }
      // dress the drink for the weather: nobody wants a warm cup in a heat wave or a slushie in the rain
      Sim.setRecipe('ice', st.forecast.type === 'heatwave' ? 3 : 2);     // forecasts miss sometimes: stay near the middle
      let want = 26;
      if (lr) {
        want = Math.max(20, (lr.cups + lr.people.soldout + 0.5 * lr.people.wait) * 1.25 + 6);
        want *= SS.clamp(wxPull(st.forecast.type) / wxPull(lr.weather.type), 0.45, 2.2) * boost;
        if (wxPull(st.forecast.type) >= 0.6) want = Math.max(want, 0.9 * st.stats.bestCups * (st.history.length && st.history[st.history.length - 1].location === st.location ? 1 : 0));
      }
      const capacity = SS.DAY_LENGTH / (Sim.serveTime() + Sim.brewTime() / Sim.cupsPerPitcher()) * 1.5;
      restock(st, Math.ceil(Math.min(want, capacity)));
    },
    tick(st, dt) {
      const td = st.today;
      if (!td) return;
      for (let i = td.tips.length - 1; i >= 0; i--) if (td.tips[i].ttl < 6) Sim.collectTip(td.tips[i].id);
      if (td.bell.cd <= 0) Sim.ringBell();
      if (td.pitcher.brew !== null) { tapAcc += dt; if (tapAcc >= 0.5) { tapAcc = 0; Sim.tapStand(); } }
    },
    after(st) {
      if (log.mogul === null && st.won) log.mogul = st.day;
    }
  };
}

/* ---------------------------------------------------------------- *
 * One full game
 * ---------------------------------------------------------------- */
const DTS = [1 / 30, 1 / 30, 1 / 60, 0.1, 0, 1 / 30, 0.05, 1 / 30];

function roundTrip(tag) {
  const before = JSON.parse(JSON.stringify(SS.state));
  ok(Sim.hasSave(), tag + ': hasSave() false after a save');
  const sum = Sim.saveSummary();
  ok(isObj(sum) && sum.day === before.day && sum.cash === before.cash && sum.location === before.location && isNum(sum.reputation), tag + ': saveSummary is off');
  SS.state = null;                       // wipe memory, as a page reload would
  Sim.init();
  ok(SS.state.phase === 'title', tag + ': init() must land on the title');
  ok(Sim.continueGame() === true, tag + ': continueGame() failed');
  const after = JSON.parse(JSON.stringify(SS.state));
  try { require('assert').deepStrictEqual(after, before); checks++; } catch (e) { ok(false, tag + ': save -> load changed the state: ' + String(e.message).slice(0, 300)); }
}

/* what happened to regulars, per bot (for the balance report) */
let regTally = null;
const tally = (k) => { if (regTally) regTally[k] = (regTally[k] || 0) + 1; };
SS.on('regular:new', () => tally('new'));
SS.on('regular:visit', () => tally('visit'));
SS.on('regular:streak', () => tally('streak'));
SS.on('regular:broken', (p) => tally(p.shielded ? 'saved' : p.reason));
SS.on('regular:lost', () => tally('lost'));

function playGame(seed, bot, days) {
  disk.clear();
  regTally = {};
  Sim.init();
  ok(SS.state.phase === 'title' && !Sim.hasSave(), 'fresh init should be on the title with no save');
  Sim.newGame(seed);
  const st0 = SS.state;
  ok(st0.phase === 'prep' && st0.day === 1 && st0.seed === seed, 'newGame should land in prep on day 1');
  const rows = [];
  for (let d = 1; d <= days; d++) {
    let st = SS.state;
    const tag = bot.name + '/' + seed + '/day' + d;
    ok(st.phase === 'prep' && st.day === d, tag + ': expected prep');
    checkState(tag + ' prep');
    ok(isWx(st.forecast) && isNum(st.forecast.confidence) && st.forecast.confidence >= 0 && st.forecast.confidence <= 1, tag + ': forecast');
    ok(isEvent(st.event) && (!st.event || st.event.known === true), tag + ': morning event must be a known one');
    ITEMS.forEach((it) => ok(isNum(st.market[it]) && st.market[it] > 0, tag + ': market.' + it));
    if (d >= 2) ok(st.dealer.offers.filter((o) => o.kind === 'boost' && !o.sold).length === 3, tag + ': Dex should open with 3 different boosts');
    if (d % 9 === 2) { roundTrip(tag + ' morning'); st = SS.state; }
    const morning = { market: Object.assign({}, st.market), forecast: Object.assign({}, st.forecast), event: st.event ? st.event.id : null };

    bot.prep(st);
    const info = Sim.prepInfo();
    ok(isNum(info.cost) && isNum(info.cashAfter) && info.cashAfter >= -1e-9 && isNum(info.maxCups) && isNum(info.costPerCup) && ITEMS.includes(info.limiting) && typeof info.canStart === 'boolean' && typeof info.reason === 'string', tag + ': prepInfo shape');
    ok(Sim.cartCost() <= st.cash - Sim.rent() + 1e-6 || Sim.cartCost() === 0, tag + ': cart costs more than cash allows');
    const cashBefore = st.cash;
    const res0 = Sim.startDay();
    if (!ok(res0 && res0.ok && st.phase === 'day', tag + ': could not start the day: ' + (res0 && res0.reason))) break;
    ok(isWx(st.weather), tag + ': weather not fixed at day start');
    morning.weather = Object.assign({}, st.weather);
    ok(Math.abs(st.cash - (cashBefore - info.cost - info.rent)) < 0.011, tag + ': cart + rent were not paid correctly');

    let steps = 0;
    while (SS.state.phase === 'day') {
      const dt = DTS[steps % DTS.length];
      Sim.update(dt);
      if (SS.state.phase !== 'day') break;
      bot.tick(SS.state, dt);
      if (steps % 40 === 0) checkState(tag + ' t=' + SS.state.today.clock.toFixed(1));
      if (++steps > 100000) { ok(false, tag + ': the day never ended'); break; }
    }
    st = SS.state;
    ok(st.phase === 'results' && st.today === null, tag + ': expected results');
    checkState(tag + ' results');
    const res = st.lastResult, bad = isResult(res);
    ok(bad === '', tag + ': DayResult ' + bad);
    ok(res.day === d && res.cashAfter === st.cash && res.repAfter === st.reputation, tag + ': DayResult does not match the state');
    ok(st.history.length <= 30 && st.history[st.history.length - 1].day === d, tag + ': history');
    if (bot.after) bot.after(st);
    rows.push(Object.assign(morning, { cups: res.cups, profit: res.profit, cash: st.cash, rep: st.reputation, top: res.topFeedback, loc: res.location, price: st.price, served: res.people.served,
      revenue: res.revenue, loyalty: res.loyalty, boostCost: res.boostCost, regs: st.regulars.length, best: st.stats.bestStreak }));
    if (VERBOSE && seed === (VERBOSE === 1 ? SEEDS[0] : VERBOSE)) {
      console.log([bot.name, 'd' + d, res.location, res.weather.type, res.event ? res.event.id : '-', 'cups ' + res.cups, 'price ' + st.price.toFixed(2),
        'profit ' + res.profit.toFixed(0), 'cash ' + st.cash.toFixed(0), 'rep ' + st.reputation.toFixed(2), res.topFeedback,
        'p/w/s/q ' + [res.people.pricey, res.people.wait, res.people.soldout, res.people.quit].join('/'), 'passed ' + res.people.passed,
        'recipe ' + [st.recipe.lemons, st.recipe.sugar, st.recipe.ice].join('-'), 'sat ' + res.satisfaction.toFixed(2), 'up ' + Object.values(st.upgrades).join(''),
        'regs ' + st.regulars.length + ' best ' + st.stats.bestStreak + ' loyal ' + res.loyalty.toFixed(0) + ' boosts ' + (res.boosts.join('+') || '-') + ' ' + res.boostCost].join('  '));
    }
    if (d % 9 === 5) roundTrip(tag + ' results');
    ok(Sim.nextDay() === true, tag + ': nextDay() refused');
  }
  const st = SS.state;
  return { bot: bot.name, seed, rows, log: bot.log, cash: st.cash, lifetime: st.lifetimeEarnings, rep: st.reputation, bestCups: st.stats.bestCups,
    done: st.milestonesDone.slice(), won: st.won, upgrades: Object.assign({}, st.upgrades), cups: st.lifetimeCups,
    regs: st.regulars.length, bestStreak: st.stats.bestStreak, tally: regTally };
}

/* ---------------------------------------------------------------- *
 * Run
 * ---------------------------------------------------------------- */
const t0 = Date.now();
const games = { naive: [], competent: [], greedy: [] };
SEEDS.forEach((seed) => {
  games.naive.push(playGame(seed, naiveBot(1.0), DAYS));
  games.competent.push(playGame(seed, competentBot(), DAYS));
  games.greedy.push(playGame(seed, naiveBot(5.0), DAYS));
});

/* phases only ever flow title -> prep -> day -> results -> prep */
const LEGAL = { 'title>prep': 1, 'prep>day': 1, 'day>results': 1, 'results>prep': 1, 'title>results': 1, 'prep>prep': 1 };
phaseLog.forEach((p) => ok(LEGAL[p] === 1, 'illegal phase change ' + p));
ok(phaseLog.filter((p) => p === 'prep>day').length === phaseLog.filter((p) => p === 'day>results').length, 'every day that started must end');

/* same seed, same mornings (and, with the same bot, the same game) */
const again = playGame(SEEDS[0], competentBot(), DAYS);
const strip = (rows) => rows.map((r) => ({ forecast: r.forecast, weather: r.weather }));
const plainMarket = (a, b) => a.map((r, i) => (r.event || b[i].event ? null : r.market));   // events move prices and depend on how you play
try { require('assert').deepStrictEqual(again.rows, games.competent[0].rows); checks++; } catch (e) { ok(false, 'same seed + same bot gave a different game: ' + String(e.message).slice(0, 300)); }
SEEDS.forEach((seed, i) => {
  try {
    require('assert').deepStrictEqual(strip(games.naive[i].rows), strip(games.competent[i].rows));
    require('assert').deepStrictEqual(strip(games.greedy[i].rows), strip(games.competent[i].rows));
    require('assert').deepStrictEqual(plainMarket(games.naive[i].rows, games.competent[i].rows), plainMarket(games.competent[i].rows, games.naive[i].rows)); checks++;
  } catch (e) { ok(false, 'seed ' + seed + ': market / forecast / weather differ between bots: ' + String(e.message).slice(0, 200)); }
});
const m1 = games.competent[0].rows, m2 = games.competent[1].rows;
ok(JSON.stringify(strip(m1)) !== JSON.stringify(strip(m2)), 'different seeds should give different mornings');
/* forecasts are right most of the time, and weather varies */
let right = 0, total = 0; const wxSeen = {}; const evSeen = {};
games.competent.forEach((g) => g.rows.forEach((r) => { total++; if (r.forecast.type === r.weather.type) right++; wxSeen[r.weather.type] = 1; if (r.event) evSeen[r.event] = 1; }));
ok(right / total > 0.7 && right / total < 0.93, 'forecast accuracy should be about 80%, got ' + (right / total).toFixed(2));
ok(Object.keys(wxSeen).length >= 4, 'weather barely varies: ' + Object.keys(wxSeen));
ok(Object.keys(evSeen).length >= 6, 'too few different events: ' + Object.keys(evSeen));

/* settings survive a new game; an unreadable save counts as no save; a partial one is repaired */
Sim.setSetting('music', false); Sim.setSetting('speed', 2);
Sim.newGame(5);
ok(SS.state.settings.music === false && SS.state.settings.speed === 2, 'settings must survive newGame');
disk.set(SS.SAVE_KEY, '{not json');
ok(Sim.hasSave() === false && Sim.saveSummary() === null && Sim.continueGame() === false, 'an unreadable save must count as no save');
disk.set(SS.SAVE_KEY, JSON.stringify({ v: 0, phase: 'prep', day: 7, cash: 'lots', upgrades: { pitcher: 99, bogus: 3 }, flavor: 'galaxy', stock: { lemons: -4 }, settings: { speed: 9, sfx: false } }));
Sim.init();
ok(SS.state.settings.sfx === false && SS.state.settings.speed === 1, 'init() should read valid settings from a save and ignore bad ones');
ok(Sim.continueGame() === true, 'a partial save should load');
checkState('repaired save');
ok(SS.state.day === 7 && SS.state.cash === D.startCash && SS.state.upgrades.pitcher === 3 && SS.state.flavor === 'classic' && SS.state.stock.lemons === 0 && SS.state.phase === 'prep', 'partial save was not repaired onto defaults');
ok(isNum(SS.state.market.lemons) && isWx(SS.state.forecast), 'repaired save needs a market and a forecast');
/* failures come back as plain sentences */
[Sim.buyUpgrade('helper'), Sim.buyUpgrade('nope'), Sim.unlockLocation('carnival'), Sim.setLocation('beach'), Sim.buyFlavor('galaxy'), Sim.setFlavor('mint')].forEach((r, i) => {
  ok(r && r.ok === false && isStr(r.reason) && r.reason.length > 12, 'shop failure #' + i + ' needs a readable reason');
});
ok(Sim.ringBell() === false && Sim.tapStand() === false && Sim.collectTip(1) === false, 'day actions must return false outside the day');
/* a broke player gets a hand, never a dead end */
Sim.newGame(9); SS.state.cash = 0; SS.state.stock = { lemons: 0, sugar: 0, ice: 0, cups: 0 };
SS.state.phase = 'results'; SS.state.lastResult = null; Sim.nextDay();
ok(SS.state.cash > 0, 'Grandma should help a broke player');
ITEMS.forEach((it) => Sim.setCart(it, 1));
ok(Sim.canStartDay().ok, 'after the loan the player must be able to open: ' + Sim.canStartDay().reason);
/* closing early and odd time steps */
Sim.startDay();
[NaN, -1, 0, 5, Infinity, undefined].forEach((dt) => Sim.update(dt));
checkState('odd dt');
for (let i = 0; i < 300; i++) Sim.update(0.1);
ok(Sim.closeEarly() === true && SS.state.phase === 'results' && isResult(SS.state.lastResult) === '', 'closeEarly() should end the day with a full result');
Sim.wipeSave();
ok(Sim.hasSave() === false, 'wipeSave() should remove the save');

/* ---------------------------------------------------------------- *
 * Regulars, boosts and Dex the Dealer, scripted
 * ---------------------------------------------------------------- */
function capture(names) {
  const log = [], fns = names.map((n) => SS.on(n, (p) => log.push([n, p])));
  return { of: (n) => log.filter((e) => e[0] === n).map((e) => e[1]), stop: () => names.forEach((n, i) => SS.off(n, fns[i])) };
}
function mkReg(n, kind, streak) {
  return { id: 'r' + n, name: D.regularNames[kind][n % 8], kind, seed: 1000 + n, streak, best: streak, visits: Math.max(1, streak), strikes: 0, since: 1, lastDay: 1 };
}
/** jump a fresh game to the morning of `day` */
function morningOf(seed, day) {
  disk.clear(); Sim.newGame(seed);
  const st = SS.state;
  st.day = day - 1; st.phase = 'results'; st.lastResult = null;
  Sim.nextDay();
  return SS.state;
}
/** set up a well-run stand: a recipe everyone likes, a full pantry and a fast counter */
function wellRun(st, regs, price) {
  if (regs) { st.regulars = regs; st.nextRegular = regs.length + 1; st.stats.bestStreak = Math.max(0, ...regs.map((g) => g.best)); }
  st.stock = { lemons: 300, sugar: 300, ice: 3000, cups: 600 };
  Object.assign(st.upgrades, { pitcher: 3, juicer: 3, helper: 2, speaker: 2, awning: 2, cooler: 0 });
  st.recipe = { lemons: 6, sugar: 5, ice: 2 };
  st.price = price; st.cash = Math.max(st.cash, 500);
}
/** run the day on a plain sunny 26C day; until(st) can stop it early (returns true) */
function runDay(until) {
  const start = Sim.startDay();
  ok(start.ok, 'scripted day should start: ' + start.reason);
  const st = SS.state;
  st.weather = { type: 'sunny', temp: 26 }; st.today.weatherNow = { type: 'sunny', temp: 26 };
  for (let i = 0; i < 20000 && SS.state.phase === 'day'; i++) {
    Sim.update(1 / 30);
    if (i % 10 === 0 && SS.state.phase === 'day') checkState('scripted t=' + SS.state.today.clock.toFixed(1));
    if (until && SS.state.phase === 'day' && until(SS.state)) return;
  }
  ok(SS.state.phase === 'results' && isResult(SS.state.lastResult) === '', 'scripted day should end with a full result: ' + isResult(SS.state.lastResult));
}
const rowOf = (id) => (SS.state.lastResult.regulars || []).find((r) => r.id === id);

/* a happy regular's streak grows day after day, and the bonus is exactly price x qty x (mult - 1) */
{
  let st = morningOf(4242, 4);
  wellRun(st, [mkReg(1, 'parent', 4)], 0.8);
  for (let n = 0; n < 3; n++) {
    st = SS.state;
    if (n) wellRun(st, null, 0.8);                 // restock: without a cooler the ice is gone by morning
    st.boosts = ['hype']; st.boostCost = 0;
    const cap = capture(['sale', 'loyalty', 'regular:streak', 'regular:visit']), before = st.regulars[0].streak, cashBefore = st.cash;
    runDay();
    cap.stop();
    const mine = (p) => p.c.regularId === 'r1';
    const sale = cap.of('sale').find(mine), bonus = cap.of('loyalty').find(mine), up = cap.of('regular:streak').find(mine);
    ok(cap.of('regular:visit').filter(mine).length === 1, 'hype: r1 should visit exactly once');
    if (ok(!!sale && !!bonus && !!up, 'a happy regular should buy, pay a bonus and grow the streak (day ' + n + ')')) {
      ok(bonus.mult === SS.loyaltyMult(before) && bonus.amount === r2(sale.price * sale.qty * (bonus.mult - 1)), 'loyalty bonus should be price x qty x (mult - 1): ' + JSON.stringify({ price: sale.price, qty: sale.qty, mult: bonus.mult, amount: bonus.amount }));
      ok(up.streak === before + 1 && up.mult === SS.loyaltyMult(before + 1), 'regular:streak should carry the new streak and multiplier');
      const row = rowOf('r1');
      ok(!!row && row.outcome === 'streak' && row.streak === before + 1 && row.bonus === bonus.amount, 'DayResult row for a happy regular: ' + JSON.stringify(row));
      ok(SS.state.lastResult.loyalty >= bonus.amount && SS.state.cash > cashBefore, 'the bonus should land in DayResult.loyalty and in cash');
    }
    const g = SS.state.regulars.find((x) => x.id === 'r1');
    ok(!!g && g.streak === before + 1 && g.best === before + 1 && g.strikes === 0 && g.lastDay === SS.state.day, 'r1 should be one step further: ' + JSON.stringify(g));
    ok(SS.state.boosts.length === 0 && SS.state.lastResult.boosts.includes('hype'), 'boosts clear at the end of the day and are listed on the result');
    Sim.nextDay();
  }
  ok(SS.state.regulars.find((x) => x.id === 'r1').streak === 7, 'three happy visits should take a streak of 4 to 7');
}

/* a bad visit breaks the streak, a second one in a row loses the regular */
{
  const st = morningOf(4242, 4);
  wellRun(st, [mkReg(1, 'parent', 6)], 9);
  st.boosts = ['hype'];
  let cap = capture(['regular:broken', 'regular:lost']);
  runDay(); cap.stop();
  let g = SS.state.regulars.find((x) => x.id === 'r1');
  ok(cap.of('regular:broken').length === 1 && cap.of('regular:broken')[0].reason === 'pricey' && cap.of('regular:broken')[0].shielded === false, 'a $9 cup should break the streak (pricey)');
  ok(!!g && g.streak === 0 && g.best === 6 && g.strikes === 1, 'one bad visit: streak 0, one strike: ' + JSON.stringify(g));
  ok(rowOf('r1') && rowOf('r1').outcome === 'broken' && rowOf('r1').reason === 'pricey', 'DayResult row should say broken');
  Sim.nextDay();
  wellRun(SS.state, null, 9);
  SS.state.boosts = ['hype'];
  cap = capture(['regular:broken', 'regular:lost']);
  runDay(); cap.stop();
  ok(cap.of('regular:lost').length === 1 && !SS.state.regulars.some((x) => x.id === 'r1'), 'two bad visits in a row should lose the regular');
  ok(rowOf('r1') && rowOf('r1').outcome === 'lost', 'DayResult row should say lost');
  ok(SS.state.stats.bestStreak === 6, 'the best streak is remembered after the regular is gone');
}

/* the Streak Shield saves exactly one regular */
{
  const st = morningOf(99, 5);
  wellRun(st, [mkReg(1, 'parent', 5), mkReg(2, 'elder', 5), mkReg(3, 'teen', 5)], 9);
  st.boosts = ['hype', 'shield'];
  const cap = capture(['regular:broken']);
  runDay(); cap.stop();
  const br = cap.of('regular:broken'), saved = br.filter((p) => p.shielded);
  ok(br.length === 3 && saved.length === 1, 'shield should save exactly one of three breaks (' + br.length + ' breaks, ' + saved.length + ' saved)');
  if (saved.length === 1) {
    const g = SS.state.regulars.find((x) => x.id === saved[0].regular.id);
    ok(g.streak === 5 && g.strikes === 0 && rowOf(g.id).outcome === 'saved', 'the shielded regular keeps streak and strikes');
  }
  ok(SS.state.regulars.filter((x) => x.streak === 0 && x.strikes === 1).length === 2, 'the other two lose their streak');
}

/* hype brings every regular, bought in the morning or in the middle of the day */
{
  const twelve = () => ['kid', 'teen', 'parent', 'jogger', 'elder', 'tourist', 'office', 'skater', 'kid', 'teen', 'parent', 'elder'].map((k, i) => mkReg(i + 1, k, 3));
  let st = morningOf(31337, 6);
  wellRun(st, twelve(), 0.8);
  let cap = capture(['regular:visit']);
  runDay(); cap.stop();
  const plain = new Set(cap.of('regular:visit').map((p) => p.regular.id)).size;
  ok(plain >= 4 && plain < 12, 'without hype only some regulars come by (' + plain + ' of 12)');

  st = morningOf(31337, 6);
  wellRun(st, twelve(), 0.8);
  st.boosts = ['hype'];
  cap = capture(['regular:visit', 'regular:streak', 'boost:on']);
  runDay(); cap.stop();
  ok(new Set(cap.of('regular:visit').map((p) => p.regular.id)).size === 12, 'hype: all 12 regulars should come by');
  ok(cap.of('regular:streak').length >= 10, 'regulars skip the interest roll: nearly all of them should be served (' + cap.of('regular:streak').length + ')');
  ok(cap.of('boost:on').some((p) => p.id === 'hype'), 'a boost carried in from the morning announces itself at the start of the day');

  // bought in the middle of the day: everyone not already coming turns up later
  st = morningOf(31337, 6);
  wellRun(st, twelve(), 0.8);
  st.dealer = { day: st.day, offers: [{ id: 'hype', kind: 'boost', sold: false }, { id: 'flyers', kind: 'boost', sold: false }, { id: 'lucky', kind: 'boost', sold: false }] };
  cap = capture(['regular:visit', 'boost:on', 'dealer:buy']);
  let early = 0, bought = null;
  runDay((s) => {
    if (bought || s.today.t < 0.3) return false;
    early = new Set(cap.of('regular:visit').map((p) => p.regular.id)).size;
    bought = Sim.buyDeal('hype');
    ok(!Sim.buyDeal('hype').ok, 'the same boost cannot be bought twice');
    return false;
  });
  cap.stop();
  ok(bought && bought.ok && cap.of('boost:on').length === 1 && cap.of('dealer:buy').length === 1, 'hype can be bought mid-day: ' + JSON.stringify(bought));
  ok(early < 12 && new Set(cap.of('regular:visit').map((p) => p.regular.id)).size === 12, 'mid-day hype: everyone not already coming turns up later (' + early + ' before)');
  ok(early < 12 && new Set(cap.of('regular:visit').map((p) => p.regular.id)).size === 12, 'mid-day hype: everyone not already coming turns up later (' + early + ' before)');
  ok(SS.state.lastResult.boostCost > 0 && Math.abs(SS.state.lastResult.profit - (SS.state.lastResult.revenue + SS.state.lastResult.tips + SS.state.lastResult.loyalty -
    SS.state.lastResult.ingredientCost - SS.state.lastResult.rent - SS.state.lastResult.boostCost)) < 0.011, 'boost cost is taken out of the day\'s profit');
}

/* Dex: boosts are priced for where you open, he never takes Grandma's money, and Hype is not sold too late */
{
  let st = morningOf(4242, 5);
  wellRun(st, [mkReg(1, 'elder', 4)], 0.8);
  st.unlockedLocations.push('carnival'); st.cash = 3000;
  st.dealer = { day: st.day, offers: [{ id: 'golden', kind: 'boost', sold: false }, { id: 'hype', kind: 'boost', sold: false }] };
  ok(Sim.buyDeal('golden').ok && !Sim.setLocation('carnival').ok && st.location === 'street', 'no moving the stand after buying a boost priced for this spot');

  st = morningOf(4243, 5);
  st.stock = { lemons: 0, sugar: 0, ice: 0, cups: 0 }; st.cash = 10;
  st.dealer = { day: st.day, offers: [{ id: 'turbo', kind: 'boost', sold: false }, { id: 'lucky', kind: 'boost', sold: false }] };
  const loans = capture(['cash']);
  Sim.buyDeal('turbo'); Sim.buyDeal('lucky');
  loans.stop();
  ok(!loans.of('cash').some((p) => p.reason === 'loan') && st.cash >= 0 && Sim.dealerInfo().offers.some((o) => !o.canBuy && /supplies/.test(o.reason)),
    'Dex should not sell what Grandma would have to pay back: cash ' + st.cash + ' ' + JSON.stringify(Sim.dealerInfo().offers.map((o) => o.reason)));

  st = morningOf(4244, 5);
  wellRun(st, [mkReg(1, 'elder', 4), mkReg(2, 'kid', 2)], 0.8);
  st.dealer = { day: st.day, offers: [{ id: 'hype', kind: 'boost', sold: false }] };
  let late = null;
  runDay((s) => { if (!late && s.today.t > 0.9) late = Sim.buyDeal('hype'); return false; });
  ok(late && !late.ok && SS.state.lastResult.boostCost === 0, 'Hype is not sold when regulars could no longer make it: ' + JSON.stringify(late));
}

/* a regular still walking up when the stand closes is not penalised */
{
  const st = morningOf(31337, 6);
  wellRun(st, [mkReg(1, 'elder', 4)], 0.8);
  st.boosts = ['hype'];
  let seenAt = -1;
  const fn = SS.on('regular:visit', () => { seenAt = 1; });
  runDay(() => seenAt > 0 && Sim.closeEarly());
  SS.off('regular:visit', fn);
  const g = SS.state.regulars[0];
  ok(SS.state.phase === 'results' && g.streak === 4 && g.strikes === 0 && rowOf('r1').outcome === 'closed' && g.lastDay === SS.state.day, 'closing on a regular should not cost them their streak, and they came: ' + JSON.stringify(g));
}

/* Frost Pack: no ice melts in the day, none spoils overnight */
{
  for (const frost of [true, false]) {
    const st = morningOf(777, 5);
    wellRun(st, [], 20);                   // nobody buys at $20, so only melt touches the ice
    st.stock.ice = 600;
    if (frost) st.boosts = ['frost'];
    runDay();
    const iceEnd = SS.state.stock.ice, spoiled = SS.state.lastResult.spoiled.ice;
    Sim.nextDay();
    if (frost) ok(iceEnd === 600 && spoiled === 0 && SS.state.stock.ice === 600, 'frost: ice should not melt or spoil (' + iceEnd + ', ' + spoiled + ', ' + SS.state.stock.ice + ')');
    else ok(iceEnd < 600 && spoiled > 0 && SS.state.stock.ice < iceEnd, 'without frost the ice melts and spoils');
  }
}

/* Turbo halves brew time, Golden Lemons and Flyer Blast change the crowd, Lucky Coin doubles tips */
{
  const st = morningOf(55, 4);
  wellRun(st, [], 1.0);
  const plain = Sim.brewTime();
  st.boosts = ['turbo'];
  ok(Sim.brewTime() === plain / 2, 'turbo should halve the brew time');
  st.boosts = [];
}
{
  const stats = {};
  for (const b of ['', 'flyers', 'golden', 'lucky']) {
    const st = morningOf(2468, 8);
    wellRun(st, [], 1.6);
    st.upgrades.tipjar = 1;
    if (b) st.boosts = [b];
    runDay();
    const r = SS.state.lastResult;
    stats[b || 'plain'] = { passed: r.people.passed, pricey: r.people.pricey, tips: r.tips, served: r.people.served };
  }
  ok(stats.flyers.passed > stats.plain.passed * 1.15, 'flyers should bring more people past: ' + JSON.stringify(stats));
  ok(stats.golden.pricey < stats.plain.pricey * 0.8, 'golden lemons should turn fewer people away on price: ' + JSON.stringify(stats));
  ok(stats.lucky.tips / Math.max(1, stats.lucky.served) > 1.5 * stats.plain.tips / Math.max(1, stats.plain.served), 'lucky coin should double tips: ' + JSON.stringify(stats));
}

/* limited flavors: only Dex sells them */
{
  const st = morningOf(12, 3);
  const info = Sim.flavorInfo('cotton');
  ok(info.owned === false && info.canBuy === false && /Dex/.test(info.reason), 'the shop must not sell a limited flavor: ' + JSON.stringify(info));
  st.cash = 300;
  ok(!Sim.buyFlavor('cotton').ok && !st.flavors.includes('cotton'), 'buyFlavor must refuse a limited flavor');
  ok(!Sim.setFlavor('cotton').ok, 'setFlavor must refuse a limited flavor you do not own');
  st.dealer = { day: st.day, offers: [{ id: 'flyers', kind: 'boost', sold: false }, { id: 'golden', kind: 'boost', sold: false }, { id: 'turbo', kind: 'boost', sold: false }, { id: 'cotton', kind: 'limited', sold: false }] };
  const cap = capture(['dealer:buy', 'flavor:buy', 'flavor:set', 'milestone']);
  const offer = Sim.dealerInfo().offers.find((o) => o.id === 'cotton');
  ok(offer && offer.kind === 'limited' && offer.cost === D.byId(D.flavors, 'cotton').cost && offer.color === D.byId(D.flavors, 'cotton').color && offer.canBuy, 'Dex offers the limited flavor at its price, in its colour');
  ok(Sim.buyDeal('cotton').ok && st.flavors.includes('cotton') && st.flavor === 'cotton', 'buying a limited flavor from Dex in the morning makes it yours and pours it');
  ok(cap.of('dealer:buy').length === 1 && cap.of('dealer:buy')[0].kind === 'limited' && cap.of('flavor:buy').length === 1 && cap.of('flavor:set').length === 1, 'dealer:buy, flavor:buy and flavor:set fire');
  ok(cap.of('milestone').some((m) => m.id === 'flavor'), 'a limited flavor counts for the Mixologist goal');
  cap.stop();
  ok(Sim.setFlavor('classic').ok && Sim.setFlavor('cotton').ok && Sim.flavorInfo('cotton').owned, 'an owned limited flavor can be switched to and from');
  ok(!Sim.buyDeal('cotton').ok, 'a limited flavor cannot be bought twice');
}

/* Dex: never on day 1, never re-rolled by a reload, deterministic, pity rule for limited flavors */
{
  let st = morningOf(8080, 1);
  ok(st.dealer === null && !Sim.dealerInfo().present, 'no Dex on day 1');
  const r1 = Sim.buyDeal('flyers');
  ok(!r1.ok && isStr(r1.reason), 'buyDeal on day 1 explains why not');
  st = morningOf(8080, 6);
  const first = JSON.stringify(st.dealer);
  st = morningOf(8080, 6);
  ok(JSON.stringify(st.dealer) === first, 'the same seed and day give the same stock');
  st.cash = 500;
  const pick = st.dealer.offers.find((o) => o.kind === 'boost' && Sim.dealerInfo().offers.find((x) => x.id === o.id).canBuy);
  ok(!!pick && Sim.buyDeal(pick.id).ok && Sim.boostActive(pick.id), 'buy a boost in the morning');
  const afterBuy = JSON.parse(JSON.stringify(SS.state));
  SS.state = null; Sim.init(); Sim.continueGame();
  ok(JSON.stringify(SS.state.dealer) === JSON.stringify(afterBuy.dealer) && SS.state.cash === afterBuy.cash && SS.state.boosts.includes(pick.id) &&
    SS.state.boostCost === afterBuy.boostCost, 'a reload must keep Dex\'s stock, what was sold, and the active boost');
  checkState('reloaded with a boost');
  // failure paths come back as plain sentences that say what is wrong
  const s = SS.state, fails = {};
  s.dealer.offers = [{ id: 'flyers', kind: 'boost', sold: true }, { id: 'golden', kind: 'boost', sold: false }, { id: 'shield', kind: 'boost', sold: false }, { id: 'turbo', kind: 'boost', sold: false }];
  s.boosts = ['golden']; s.boostCost = 8; s.regulars = [];
  fails.unknown = Sim.buyDeal('nope');
  fails.notToday = Sim.buyDeal('lucky');
  fails.sold = Sim.buyDeal('flyers');
  fails.active = Sim.buyDeal('golden');
  fails.useless = Sim.buyDeal('shield');
  s.cash = 0; fails.cash = Sim.buyDeal('turbo');
  s.cash = 500; s.phase = 'results'; fails.results = Sim.buyDeal('turbo');
  s.phase = 'prep';
  const want = { unknown: /Dex/, notToday: /Dex/, sold: /Sold out/, active: /Already/, useless: /regulars/, cash: /more/, results: /packed up/ };
  Object.keys(want).forEach((k) => ok(fails[k] && fails[k].ok === false && want[k].test(fails[k].reason), 'buyDeal failure "' + k + '" needs a reason that says what is wrong: ' + JSON.stringify(fails[k])));
  ok(s.cash === 500 && s.boosts.length === 1, 'failed deals must not touch cash or boosts');
  Sim.init();
  ok(!Sim.buyDeal('flyers').ok && !Sim.dealerInfo().present && Sim.regularsInfo().length === 0 && Sim.boostActive('flyers') === false, 'title screen: no Dex, no regulars');
  // over many days: 3 different boosts each day, a limited flavor about a third of the time and never more than 6 days apart
  st = morningOf(8080, 2);
  let last = 2, gap = 0, lim = 0, n = 0;
  for (let d = 3; d <= 150; d++) {
    st = SS.state; st.phase = 'results'; st.lastResult = null; Sim.nextDay();
    st = SS.state;
    const boosts = st.dealer.offers.filter((o) => o.kind === 'boost');
    ok(st.dealer.day === d && boosts.length === 3 && new Set(boosts.map((o) => o.id)).size === 3, 'day ' + d + ': Dex needs 3 different boosts');
    if (st.dealer.offers.some((o) => o.kind === 'limited')) { gap = Math.max(gap, d - last); last = d; lim++; }
    n++;
  }
  ok(gap <= 6 && lim / n > 0.25 && lim / n < 0.5, 'limited flavors: ' + lim + ' of ' + n + ' days, longest wait ' + gap + ' days');
  console.log('\nDex over days 3-150 (seed 8080): a limited flavor on ' + lim + ' days (' + (100 * lim / n).toFixed(0) + '%), longest wait ' + gap + ' days');
}

/* old saves without the new fields load; broken new fields are cleaned up */
{
  disk.set(SS.SAVE_KEY, JSON.stringify({ v: 1, phase: 'prep', day: 9, cash: 50, seed: 4, tutorial: { done: true } }));
  ok(Sim.continueGame() === true, 'an old save without regulars / boosts / dealer should load');
  checkState('old save');
  ok(SS.state.regulars.length === 0 && SS.state.boosts.length === 0 && SS.state.boostCost === 0 && SS.state.dealer && SS.state.dealer.day === 9 &&
    SS.state.stats.bestStreak === 0 && SS.state.nextRegular === 1, 'old save gets empty regulars, no boosts and a fresh Dex');
  const junkRegs = [];
  for (let i = 0; i < 16; i++) junkRegs.push({ id: 'r' + (i % 14 + 1), name: i === 3 ? 42 : 'X' + i, kind: i === 2 ? 'vip' : i === 5 ? 'ghost' : 'kid', seed: i === 4 ? 'abc' : 7 * i,
    streak: i === 6 ? NaN : i === 7 ? -3 : i + 0.5, best: 2, visits: i === 8 ? Infinity : 3, strikes: i === 9 ? 7 : 0, since: 99, lastDay: -1 });
  junkRegs.push({ id: 'x9', kind: 'kid' }, null, 'r3', { id: 'r99', kind: 'teen', name: 'Sky', streak: 4, best: 9 });
  disk.set(SS.SAVE_KEY, JSON.stringify({ v: 1, phase: 'prep', day: 9, cash: 50, seed: 4, regulars: junkRegs, nextRegular: 'abc', boosts: ['golden', 'bogus', 'golden'], boostCost: -5,
    dealer: { day: 9, offers: [{ id: 'golden', kind: 'boost', sold: 1 }, { id: 'galaxy', kind: 'limited' }, { id: 'bogus', kind: 'boost' }, { id: 'golden', kind: 'boost' }, { id: 'rainbow', kind: 'limited' }] },
    tutorial: { done: true, dex: true, junk: 'x' }, stats: { bestStreak: 3.7 },
    lastResult: { day: 8, regulars: [{ id: 'r1', name: 'Milo', kind: 'kid', outcome: 'streak', streak: 3, mult: 9, bonus: 1.5, reason: 'nope' }, { id: 'r2', kind: 'kid', outcome: 'bogus' }], boosts: ['lucky', 'zzz'], loyalty: 'x' } }));
  ok(Sim.continueGame() === true, 'a save with broken regulars / dealer should still load');
  checkState('junk save');
  const s2 = SS.state;
  ok(s2.regulars.length === 12 && new Set(s2.regulars.map((g) => g.id)).size === 12 && s2.regulars.every((g) => isRegular(g, true)), 'regulars repaired: 12 valid and unique (' + s2.regulars.length + ')');
  ok(s2.nextRegular > Math.max(...s2.regulars.map((g) => Number(g.id.slice(1)))), 'nextRegular never reuses an id');
  ok(JSON.stringify(s2.boosts) === '["golden"]' && s2.boostCost === 0, 'boosts repaired: ' + JSON.stringify(s2.boosts) + ' ' + s2.boostCost);
  ok(JSON.stringify(s2.dealer.offers) === JSON.stringify([{ id: 'golden', kind: 'boost', sold: true }, { id: 'rainbow', kind: 'limited', sold: false }]), 'dealer repaired: ' + JSON.stringify(s2.dealer));
  ok(s2.tutorial.done === true && s2.tutorial.dex === true && !('junk' in s2.tutorial), 'every boolean tutorial flag survives a repair');
  ok(Number.isInteger(s2.stats.bestStreak) && s2.stats.bestStreak >= 9, 'bestStreak repaired');
  const lr = s2.lastResult;
  ok(lr.regulars.length === 1 && lr.regulars[0].mult === SS.loyaltyMult(3) && lr.regulars[0].reason === '' && JSON.stringify(lr.boosts) === '["lucky"]' && lr.loyalty === 0, 'old DayResult rows repaired');
  roundTrip('junk save');
}

/* every documented event fired at least once somewhere */
Object.keys(SPEC).forEach((name) => ok(seen[name] > 0, 'event "' + name + '" was never emitted'));

/* ---------------------------------------------------------------- *
 * Balance
 * ---------------------------------------------------------------- */
const col = (v, n) => String(v).padStart(n);
console.log('\nBalance after ' + DAYS + ' days (DAY_LENGTH ' + SS.DAY_LENGTH + 's)');
console.log('bot        seed   1st-up  park  beach  downtown  carnival  mogul   cash@' + DAYS + '  sales@' + DAYS + '   rep  bestCups  goals');
['naive', 'competent', 'greedy'].forEach((name) => games[name].forEach((g) => {
  const L = g.log.loc || {};
  console.log(name.padEnd(10) + col(g.seed, 5) + col((g.log.canAfford || '-') + '/' + (g.log.firstUpgrade || '-'), 8) + col(L.park || '-', 6) + col(L.beach || '-', 7) + col(L.downtown || '-', 10) +
    col(L.carnival || '-', 10) + col(g.log.mogul || '-', 7) + col(Math.round(g.cash), 10) + col(Math.round(g.lifetime), 10) + col(g.rep.toFixed(2), 6) + col(g.bestCups, 10) +
    col(g.done.length + '/' + D.milestones.length, 7));
}));

games.naive.forEach((g) => {
  const first10 = avg(g.rows.slice(0, 10).map((r) => r.profit)), last = g.rows[g.rows.length - 1];
  ok(g.cash > D.startCash * 2, 'naive/' + g.seed + ': should stay solvent and grow (cash ' + g.cash + ')');
  ok(g.cash < 2500, 'naive/' + g.seed + ': grows too fast for someone who never changes anything (cash ' + g.cash + ')');
  ok(first10 > 0, 'naive/' + g.seed + ': the first ten days should turn a profit on average (' + first10.toFixed(1) + ')');
  ok(avg(g.rows.map((r) => r.cups)) >= 10, 'naive/' + g.seed + ': sells too little at $1.00 (' + avg(g.rows.map((r) => r.cups)).toFixed(1) + ' cups a day)');
  ok(last.loc === 'street', 'naive stays on Maple Street');
});
games.competent.forEach((g, i) => {
  const L = g.log.loc, tag = 'competent/' + g.seed + ': ';
  ok(g.log.canAfford !== null && g.log.canAfford <= 3, tag + 'first upgrade should be affordable by day 2-3 (got ' + g.log.canAfford + ')');
  ok(L.park >= 4 && L.park <= 10, tag + 'Meadow Park around day 5-9 (got ' + L.park + ')');
  ok(g.log.mogul !== null && g.log.mogul >= 32 && g.log.mogul <= 58, tag + 'mogul around day 35-55 (got ' + g.log.mogul + ')');
  ok(L.beach > L.park && L.downtown > L.beach && L.carnival > L.downtown, tag + 'locations should unlock in order');
  D.milestones.forEach((m) => ok(g.done.includes(m.id), tag + 'milestone "' + m.id + '" was never reached'));
  ok(g.bestCups >= 120, tag + 'top-end throughput must allow 120+ cups (best ' + g.bestCups + ')');
  ok(g.cash > games.naive[i].cash * 3, tag + 'should far out-earn the naive bot');
});
games.greedy.forEach((g, i) => {
  ok(g.cups <= games.naive[i].cups * 0.05, 'greedy/' + g.seed + ': $5 lemonade on Maple Street should not sell (' + g.cups + ' cups vs ' + games.naive[i].cups + ')');
  ok(g.rows.filter((r) => r.top === 'pricey').length >= DAYS * 0.5, 'greedy/' + g.seed + ': the feedback should say it is too pricey');
});
const cg = games.competent;
console.log('\ncompetent averages: first upgrade affordable day ' + avg(cg.map((g) => g.log.canAfford || 99)).toFixed(1) + ', park day ' + avg(cg.map((g) => g.log.loc.park || 99)).toFixed(1) +
  ', mogul day ' + avg(cg.map((g) => g.log.mogul || 99)).toFixed(1) + '; naive cups/day ' + avg(games.naive.map((g) => g.cups / DAYS)).toFixed(1) +
  ', greedy cups/day ' + avg(games.greedy.map((g) => g.cups / DAYS)).toFixed(2));
console.log('forecast accuracy ' + (100 * right / total).toFixed(0) + '%, events seen: ' + Object.keys(evSeen).sort().join(' '));

/* regulars, loyalty and Dex */
const sum = (a) => a.reduce((x, y) => x + y, 0);
const firstDay = (g, f) => { const i = g.rows.findIndex(f); return i < 0 ? 99 : i + 1; };
const share = (g, from, to) => { const rs = g.rows.slice(from, to); return sum(rs.map((r) => r.loyalty)) / Math.max(1, sum(rs.map((r) => r.revenue))); };
const tallyOf = (gs) => { const t = {}; gs.forEach((g) => Object.keys(g.tally).forEach((k) => { t[k] = (t[k] || 0) + g.tally[k]; })); return t; };
const dealsOf = (gs) => { const t = {}; gs.forEach((g) => Object.keys(g.log.deals || {}).forEach((k) => { t[k] = (t[k] || 0) + g.log.deals[k]; })); return t; };
console.log('\nRegulars and Dex (competent)');
console.log('seed   5 regs  streak10  regs@' + DAYS + '  best  loyalty/revenue d1-30  d31-' + DAYS + '  boosts/day  boost cost/profit');
cg.forEach((g) => {
  console.log(col(g.seed, 5) + col(firstDay(g, (r) => r.regs >= 5), 8) + col(firstDay(g, (r) => r.best >= 10), 10) + col(g.regs, 9) + col(g.bestStreak, 6) +
    col((100 * share(g, 0, 30)).toFixed(1) + '%', 21) + col((100 * share(g, 30, DAYS)).toFixed(1) + '%', 8) +
    col((sum(Object.values(g.log.deals)) / DAYS).toFixed(2), 12) + col((100 * sum(g.rows.map((r) => r.boostCost)) / Math.max(1, sum(g.rows.map((r) => r.profit)))).toFixed(1) + '%', 19));
});
console.log('outcomes (all competent games): ' + JSON.stringify(tallyOf(cg)));
console.log('Dex deals bought: ' + JSON.stringify(dealsOf(cg)) + '; naive regulars@' + DAYS + ' ' + avg(games.naive.map((g) => g.regs)).toFixed(1) +
  ', naive loyalty share ' + (100 * avg(games.naive.map((g) => share(g, 0, DAYS)))).toFixed(1) + '%');

console.log('\n' + checks + ' checks in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
if (failures.length) {
  console.log('\nFAILED (' + failures.length + (failures.length >= 40 ? '+' : '') + '):');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('all good');
