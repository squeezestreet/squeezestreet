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
  if (!isNum(r.standProfit) || Math.abs(r.standProfit - (r.revenue + r.tips + r.loyalty - r.ingredientCost - r.rent - r.boostCost)) > 0.011) return 'stand profit does not add up';
  if (r.truck !== null && isTruckDay(r.truck) !== '') return 'truck ' + isTruckDay(r.truck);
  if (Math.abs(r.profit - r.standProfit - (r.truck ? r.truck.profit : 0)) > 0.011) return 'profit is not stand + truck';
  if (r.groceries !== null && !(isObj(r.groceries) && ITEMS.every((it) => isCount(r.groceries[it])))) return 'groceries';
  return '';
}
const TRUCK_STATUS = ['trading', 'travelling', 'arrived', 'parked'];
function isTruckDay(t) {
  if (!isObj(t) || !D.byId(D.cities, t.city) || !TRUCK_STATUS.includes(t.status) || !isCount(t.cups) || !isWx(t.weather)) return 'shape ' + JSON.stringify(t);
  if (!['revenue', 'supplies', 'rent', 'fuel'].every((k) => isNum(t[k]) && t[k] >= 0)) return 'money';
  if (Math.abs(t.profit - (t.revenue - t.supplies - t.rent - t.fuel)) > 0.011) return 'profit does not add up';
  if (t.status !== 'trading' && (t.cups || t.revenue || t.supplies || t.rent)) return t.status + ' with sales or rent';
  if (t.status === 'trading' && t.fuel) return 'fuel on a trading day';
  return '';
}
const lookDef = (target, slot, id) => { const l = D.custom[target] && D.custom[target][slot]; return Array.isArray(l) ? D.byId(l, id) : null; };

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
  'dealer:buy': (p) => (p.kind === 'boost' ? !!D.byId(D.boosts, p.id) : p.kind === 'limited' && !!(D.byId(D.flavors, p.id) || {}).limited) && isNum(p.cost) && p.cost > 0 &&
    !!SS.state.dealer && SS.state.dealer.day === SS.state.day,          // only ever bought on a day Dex is in town
  'boost:on': (p) => !!D.byId(D.boosts, p.id),
  'truck:buy': (p) => isObj(p) && isObj(SS.state.truck),
  'truck:set': (p) => isObj(p),
  'truck:depart': (p) => !!D.byId(D.cities, p.from) && !!D.byId(D.cities, p.to) && p.from !== p.to && Number.isInteger(p.days) && p.days >= 1,
  'truck:arrive': (p) => !!D.byId(D.cities, p.city) && SS.state.truck.at === p.city,
  'truck:day': (p) => isTruckDay(p.result) === '',
  'custom:buy': (p) => !!lookDef(p.target, p.slot, p.id),
  'custom:set': (p) => !!D.customSlots[p.target] && D.customSlots[p.target].includes(p.slot) && p.value !== undefined,
  'groceries:incoming': (p) => isNum(p.eta) && p.eta >= 0,
  'groceries': (p) => isObj(p.items) && ITEMS.every((it) => isCount(p.items[it])) && ITEMS.filter((it) => p.items[it] > 0).length >= 2
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
    else if (st.dealer === null) {                        // a day Dex stays away
      const info = Sim.dealerInfo(), no = Sim.buyDeal('flyers');
      ok(info.present === false && info.line === '' && info.offers.length === 0 && Array.isArray(info.active), tag + ': dealerInfo on a day Dex stays away');
      ok(!no.ok && no.reason === 'Dex is not in town today.', tag + ': buyDeal on a day Dex stays away: ' + JSON.stringify(no));
    } else {
      const dl = st.dealer, info = Sim.dealerInfo();
      ok(isObj(dl) && dl.day === st.day && Array.isArray(dl.offers) && dl.offers.length <= 4 && dl.offers.filter((o) => o.kind === 'boost').length <= 3, tag + ': dealer stock');
      ok(new Set(dl.offers.map((o) => o.id)).size === dl.offers.length && dl.offers.every((o) => typeof o.sold === 'boolean' &&
        (o.kind === 'boost' ? !!D.byId(D.boosts, o.id) : o.kind === 'limited' && !!(D.byId(D.flavors, o.id) || {}).limited)), tag + ': dealer offers');
      ok(info.present && isStr(info.line) && info.offers.length === dl.offers.length && info.offers.every((o) => isStr(o.name) && isStr(o.desc) && isStr(o.icon) &&
        /^#[0-9A-Fa-f]{6}$/.test(o.color) && isNum(o.cost) && o.cost > 0 && typeof o.sold === 'boolean' && typeof o.canBuy === 'boolean' &&
        typeof o.reason === 'string' && o.canBuy === (o.reason === '')), tag + ': dealerInfo shape');
    }
  }
  // food truck, looks, Mom
  const T = st.truck;
  ok(T === null || (isObj(T) && !!D.byId(D.cities, T.at) && typeof T.open === 'boolean' && isNum(T.price) && T.price >= D.price.min && T.price <= D.price.max &&
    isCount(T.daysAt) && Array.isArray(T.visited) && T.visited.includes(T.at) && T.visited.every((id) => !!D.byId(D.cities, id)) && new Set(T.visited).size === T.visited.length &&
    (T.route === null || (T.route.from === T.at && T.route.to !== T.at && !!D.byId(D.cities, T.route.to) && Number.isInteger(T.route.left) && T.route.left >= 1 && T.route.left <= T.route.total && T.route.fuel >= 0)) &&
    ['days', 'cups'].every((k) => isCount(T.total[k])) && isNum(T.total.revenue) && isNum(T.total.costs) && isNum(T.total.profit)), tag + ': truck ' + JSON.stringify(T));
  const C = st.custom;
  ok(isObj(C) && Array.isArray(C.owned) && C.owned.every((k) => { const p = k.split('.'); const d = lookDef(p[0], p[1], p[2]); return !!d && d.cost > 0; }) &&
    ['stand', 'truck'].every((t) => D.customSlots[t].every((slot) => {
      const v = C[t][slot], has = (id) => !!lookDef(t, slot, id) && (!(lookDef(t, slot, id).cost > 0) || C.owned.includes(t + '.' + slot + '.' + id));
      if (slot === 'name') return typeof v === 'string' && /^[A-Z0-9 &'!.\-]+$/.test(v) && v === v.trim() && v.length <= D.custom.nameMax[t];
      if (slot === 'decor') return Array.isArray(v) && v.length <= 4 && new Set(v).size === v.length && v.every(has);
      return has(v);
    })), tag + ': custom ' + JSON.stringify(C));
  ok(isCount(st.groceriesLast) && st.groceriesLast <= st.day, tag + ': groceriesLast');
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
  const g = td.groceries;
  ok(g === null || (isNum(g.at) && isNum(g.eta) && typeof g.done === 'boolean' && ITEMS.every((it) => isCount(g.items[it]))), tag + ': today.groceries');
}

/* ---------------------------------------------------------------- *
 * Bots
 * ---------------------------------------------------------------- */
function naiveBot(price) {
  return {
    name: price > 2 ? 'greedy' : 'naive', log: {},
    prep(st) {
      Sim.setPrice(price);                  // and takes the cart the morning fills in, as it is
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
      Sim.restock(Math.min(want, capacity));
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
    if (st.dealer) ok(st.dealer.offers.filter((o) => o.kind === 'boost' && !o.sold).length === 3, tag + ': Dex should open with 3 different boosts');
    if (d % 9 === 2) { roundTrip(tag + ' morning'); st = SS.state; }
    const morning = { market: Object.assign({}, st.market), forecast: Object.assign({}, st.forecast), event: st.event ? st.event.id : null, dex: !!st.dealer };

    bot.prep(st);
    const info = Sim.prepInfo();
    ok(isNum(info.cost) && isNum(info.cashAfter) && info.cashAfter >= -1e-9 && isNum(info.maxCups) && isNum(info.costPerCup) && ITEMS.includes(info.limiting) && typeof info.canStart === 'boolean' && typeof info.reason === 'string', tag + ': prepInfo shape');
    ok(Sim.cartCost() <= st.cash - Sim.rent() + 1e-6 || Sim.cartCost() === 0, tag + ': cart costs more than cash allows');
    const cashBefore = st.cash, paidAtOpen = capture(['cash']);
    const res0 = Sim.startDay();
    paidAtOpen.stop();
    const flavorPaid = -paidAtOpen.of('cash').filter((p) => p.reason === 'flavor').reduce((a, p) => a + p.delta, 0);   // the first pitcher is mixed at opening
    if (!ok(res0 && res0.ok && st.phase === 'day', tag + ': could not start the day: ' + (res0 && res0.reason))) break;
    ok(isWx(st.weather), tag + ': weather not fixed at day start');
    morning.weather = Object.assign({}, st.weather);
    ok(Math.abs(st.cash - (cashBefore - info.cost - info.rent - flavorPaid)) < 0.011, tag + ': cart + rent were not paid correctly');

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
const strip = (rows) => rows.map((r) => ({ forecast: r.forecast, weather: r.weather, dex: r.dex }));     // Dex's visits depend on (seed, day) only
const plainMarket = (a, b) => a.map((r, i) => (r.event || b[i].event ? null : r.market));   // events move prices and depend on how you play
try { require('assert').deepStrictEqual(again.rows, games.competent[0].rows); checks++; } catch (e) { ok(false, 'same seed + same bot gave a different game: ' + String(e.message).slice(0, 300)); }
SEEDS.forEach((seed, i) => {
  try {
    require('assert').deepStrictEqual(strip(games.naive[i].rows), strip(games.competent[i].rows));
    require('assert').deepStrictEqual(strip(games.greedy[i].rows), strip(games.competent[i].rows));
    require('assert').deepStrictEqual(plainMarket(games.naive[i].rows, games.competent[i].rows), plainMarket(games.competent[i].rows, games.naive[i].rows)); checks++;
  } catch (e) { ok(false, 'seed ' + seed + ': market / forecast / weather / Dex\'s visits differ between bots: ' + String(e.message).slice(0, 200)); }
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
  ITEMS.forEach((it) => Sim.setCart(it, 0));          // scripted mornings set their own pantry; the pre-filled cart has its own test
  return SS.state;
}
/** set up a well-run stand: a recipe everyone likes, a full pantry and a fast counter */
function wellRun(st, regs, price) {
  if (regs) { st.regulars = regs; st.nextRegular = regs.length + 1; st.stats.bestStreak = Math.max(0, ...regs.map((g) => g.best)); }
  st.stock = { lemons: 300, sugar: 300, ice: 3000, cups: 600 };
  ITEMS.forEach((it) => Sim.setCart(it, 0));
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

/* The first minute: a filled cart, a full pitcher, a quick first sale that pays its goal on the spot, and a tap that always helps */
{
  disk.clear(); Sim.newGame(31);
  let st = SS.state;
  ok(ITEMS.every((it) => st.cart[it] === 2) && Sim.prepInfo().canStart, 'day 1 opens with two packs of each in the cart: ' + JSON.stringify(st.cart));
  const cap = capture(['milestone']);
  let firstAt = -1, goalPhase = null, tapped = false;
  const fs = SS.on('sale', () => { if (firstAt < 0) firstAt = SS.state.today.clock; });
  const fm = SS.on('milestone', (p) => { if (p.id === 'first') goalPhase = SS.state.phase; });
  ok(Sim.startDay().ok && SS.state.today.pitcher.brew === null && SS.state.today.pitcher.cups === SS.state.today.pitcher.max, 'the stand opens with a full pitcher');
  while (SS.state.phase === 'day') {
    const td = SS.state.today;
    if (!tapped && td.serving && td.pitcher.brew === null && td.serving.p < 0.5) { const p0 = td.serving.p; tapped = Sim.tapStand() && td.serving.p > p0; }
    Sim.update(1 / 30);
  }
  SS.off('sale', fs); SS.off('milestone', fm); cap.stop();
  const res = SS.state.lastResult, texts = res.reviews.map((r) => r.text);
  ok(firstAt >= 0 && firstAt < 8, 'the first sale comes seconds after opening (' + firstAt.toFixed(1) + ' s)');
  ok(goalPhase === 'day' && res.milestones.filter((id) => id === 'first').length === 1 && cap.of('milestone').filter((p) => p.id === 'first').length === 1, 'First sale pays during the day, once, and is still on the results');
  ok(tapped, 'tapping the stand while a cup is poured speeds up the pour');
  ok(new Set(texts).size === texts.length, 'no quote twice on one results card: ' + JSON.stringify(texts));
  Sim.nextDay();
  st = SS.state;
  ok(Sim.prepInfo().maxCups >= 12 && Sim.cartCost() <= st.cash - Sim.rent() + 1e-9, 'the next morning the cart covers about yesterday\'s crowd: ' + JSON.stringify([st.cart, Sim.prepInfo().maxCups, res.cups]));
  Sim.startDay(); Sim.closeEarly();
  ok(Sim.restock(10) === null, 'restock only in the morning');
}

/* The morning cart leaves an open truck its rent, Grandma's loan goes into it, and the first pitcher's flavor cost waits for the truck's rent */
{
  const morning = (cash, truck) => {
    disk.clear(); Sim.newGame(9);
    const st = SS.state;
    st.day = 4; st.phase = 'results'; st.cash = cash; st.stock = { lemons: 0, sugar: 0, ice: 0, cups: 0 };
    if (truck) st.truck = { at: 'maple', route: null, open: true, price: 2, daysAt: 0, visited: ['home', 'maple'], total: { days: 0, cups: 0, revenue: 0, costs: 0, profit: 0 } };
    st.lastResult = { cups: 120, people: { soldout: 0, wait: 0, quit: 0 }, weather: { type: 'sunny', temp: 26 }, day: 4 };
    Sim.nextDay();
    return Sim.prepInfo();
  };
  let pi = morning(40, true);
  ok(pi.canStart && !pi.truckShut && pi.truckRent === 20, 'the pre-filled cart leaves the truck its rent: ' + JSON.stringify(pi));
  pi = morning(22, true);
  ok(pi.canStart && pi.truckShut, 'when the rent would leave the stand nothing, the stand still gets a cart: ' + JSON.stringify(pi));
  pi = morning(3, false);
  ok(SS.state.cash > 3 && pi.canStart, 'a morning Grandma helps out opens with a cart that can start: ' + JSON.stringify([SS.state.cart, pi.reason]));

  morning(500, true);
  const st = SS.state, pink = D.byId(D.flavors, 'pink');
  st.flavors.push(pink.id); st.flavor = pink.id;
  ITEMS.forEach((it) => Sim.setCart(it, 2));
  st.cash = r2(Sim.cartCost() + Sim.rent() + 20 + 0.3);
  ok(!Sim.prepInfo().truckShut, 'prep says the truck opens');
  Sim.startDay(); Sim.closeEarly();
  ok(SS.state.lastResult.truck.status === 'trading', 'the first pitcher\'s flavor cost does not shut a truck prep said would open: ' + JSON.stringify(SS.state.lastResult.truck));
}

/* Trust the cart: a player who opens every day with the morning cart as it comes, at the starting price, and never changes the recipe.
 * A wet day, even one closed early, must not leave the next dry day short; the tip explains price walkaways and does not nag. */
{
  let outAt = null;
  const onOut = SS.on('soldout', () => { if (outAt === null) outAt = SS.state.today.t; });
  const wet = (w) => w === 'rainy' || w === 'storm', quiet = [], nags = [];
  for (const closeWet of [false, true]) {
    const after = { days: 0, out: 0, t: 0 }, other = { days: 0, out: 0, t: 0 };
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 11, 2024]) {
      disk.clear(); Sim.newGame(seed);
      let prevWx = null, prevAdvice = null;
      for (let d = 1; d <= 30; d++) {
        if (!ok(Sim.startDay().ok, 'trust the cart ' + seed + '/' + d + ': the morning cart should open: ' + Sim.canStartDay().reason)) break;
        const wx = SS.state.weather.type;
        outAt = null;
        for (let i = 0; i < 20000 && SS.state.phase === 'day'; i++) {
          Sim.update(1 / 30);
          const td = SS.state.today;
          if (closeWet && td && wet(wx) && td.t > 0.45 && !td.queue.length) Sim.closeEarly();
        }
        const r = SS.state.lastResult, p = r.people;
        if (d > 1 && (wx === 'sunny' || wx === 'heatwave')) { const a = wet(prevWx) ? after : other; a.days++; a.t += outAt === null ? 1 : outAt; if (outAt !== null) a.out++; }
        if (r.topFeedback === 'great' && p.pricey > 0 && p.pricey >= 0.2 * (p.served + p.pricey) && !/walked away|ran out/.test(r.advice)) quiet.push(seed + '/' + d + ': ' + r.advice);
        if (/to make it perfect/.test(r.advice) && r.advice === prevAdvice) nags.push(seed + '/' + d + ': ' + r.advice);
        prevWx = wx; prevAdvice = r.advice;
        Sim.nextDay();
      }
    }
    const share = (a) => a.out / Math.max(1, a.days), when = (a) => a.t / Math.max(1, a.days);
    ok(after.days >= 10 && share(after) <= share(other) + 0.15 && when(after) >= when(other) - 0.04,
      'trust the cart' + (closeWet ? ', wet days closed early' : '') + ': a dry day after a wet one sells out about as often as other dry days: ' + JSON.stringify([after, other]));
    console.log('trust the cart' + (closeWet ? ' (wet days closed early)' : '') + ': dry days after a wet day sold out ' + after.out + '/' + after.days + ', other dry days ' + other.out + '/' + other.days);
  }
  SS.off('soldout', onOut);
  ok(!quiet.length, 'a happy day where 20%+ walked away on price says so: ' + quiet.slice(0, 3).join(' | '));
  ok(!nags.length, 'the same recipe tip is not repeated the day after it was ignored: ' + nags.slice(0, 3).join(' | '));
}

/* A broke morning at a spot with rent: Grandma covers the rent too; cash that pays the rent but not a cup points at the free spot, and moving there refills the cart */
{
  disk.clear(); Sim.newGame(9);
  let st = SS.state;
  st.unlockedLocations.push('park'); st.location = 'park';
  st.day = 4; st.phase = 'results'; st.cash = 0.4; st.stock = { lemons: 0, sugar: 0, ice: 0, cups: 0 }; st.lastResult = null;
  Sim.nextDay();
  st = SS.state;
  let pi = Sim.prepInfo();
  ok(Sim.rent() > 0 && pi.canStart && pi.maxCups >= 1, 'Grandma\'s loan pays the park\'s rent and a cup: ' + JSON.stringify([st.cash, st.cart, pi.reason]));
  ITEMS.forEach((it) => Sim.setCart(it, 0));
  st.cash = r2(Sim.rent() + 0.3);
  pi = Sim.prepInfo();
  ok(!pi.canStart && /Maple Street today, it is free/.test(pi.reason), 'rent leaves too little for a cup: prep says where it is free: ' + pi.reason);
  ok(Sim.setLocation('street').ok && Sim.prepInfo().canStart, 'moving to Maple Street refills the cart so the stand can open: ' + JSON.stringify([st.cart, st.cash, Sim.prepInfo().reason]));
}

/* A morning saved before the filled cart (v1, empty cart) gets one on Continue, with Grandma's help when broke; a newer save keeps an empty cart as it was */
{
  for (const cash of [20, 0.5]) {
    disk.clear();
    disk.set(SS.SAVE_KEY, JSON.stringify({ v: 1, phase: 'prep', day: 2, cash, seed: 5, recipe: { lemons: 4, sugar: 4, ice: 2 }, cart: { lemons: 0, sugar: 0, ice: 0, cups: 0 }, tutorial: { done: false } }));
    SS.state = null; Sim.init();
    ok(Sim.continueGame() === true && Sim.cartCost() > 0 && Sim.prepInfo().canStart && SS.state.recipe.lemons === 4,
      'an old morning with $' + cash + ' gets a cart that opens: ' + JSON.stringify([SS.state.cart, SS.state.cash, Sim.prepInfo().reason]));
    checkState('old morning, $' + cash);
  }
  disk.clear(); Sim.newGame(5);
  ITEMS.forEach((it) => Sim.setCart(it, 0));
  Sim.save(); SS.state = null; Sim.init(); Sim.continueGame();
  ok(Sim.cartCost() === 0, 'a save from this version keeps the empty cart the player chose: ' + JSON.stringify(SS.state.cart));
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
    const s = stats[b || 'plain'] = { passed: 0, pricey: 0, tips: 0, served: 0 };
    for (const seed of [2468, 2469, 2470]) {           // a few days, so one lucky crowd cannot decide it
      const st = morningOf(seed, 8);
      wellRun(st, [], 1.6);
      st.upgrades.tipjar = 1;
      if (b) st.boosts = [b];
      runDay();
      const r = SS.state.lastResult;
      s.passed += r.people.passed; s.pricey += r.people.pricey; s.tips = r2(s.tips + r.tips); s.served += r.people.served;
    }
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

/* Dex: never on day 1, never re-rolled by a reload, deterministic */
{
  let st = morningOf(8080, 1);
  ok(st.dealer === null && !Sim.dealerInfo().present, 'no Dex on day 1');
  const r1 = Sim.buyDeal('flyers');
  ok(!r1.ok && isStr(r1.reason), 'buyDeal on day 1 explains why not');
  let visitDay = 0, awayDay = 0;                         // a day he comes and a day he stays away, after day 3
  for (let d = 4; d < 40 && !(visitDay && awayDay); d++) { st = morningOf(8080, d); if (st.dealer && !visitDay) visitDay = d; if (!st.dealer && !awayDay) awayDay = d; }
  ok(visitDay > 0 && awayDay > 0, 'seed 8080 needs a day with Dex and a day without him (' + visitDay + ', ' + awayDay + ')');
  st = morningOf(8080, visitDay);
  const first = JSON.stringify(st.dealer);
  st = morningOf(8080, visitDay);
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
  // a day he stays away: nothing for sale, all day, and a reload does not bring him
  st = morningOf(8080, awayDay);
  checkState('a day without Dex');
  const away = Sim.buyDeal('flyers');
  ok(st.dealer === null && !away.ok && away.reason === 'Dex is not in town today.', 'no deals on a day Dex stays away: ' + JSON.stringify(away));
  SS.state = null; Sim.init(); Sim.continueGame();
  ok(SS.state.day === awayDay && SS.state.dealer === null && !Sim.dealerInfo().present, 'a reload on a day Dex stays away does not bring him');
  Sim.restock(12);
  const open = Sim.startDay();
  ok(open.ok, 'a day without Dex opens as usual: ' + open.reason);
  for (let i = 0; i < 200; i++) Sim.update(0.1);
  checkState('a day without Dex, open');
  Sim.closeEarly();
  ok(SS.state.phase === 'results' && SS.state.dealer === null, 'and closes as usual');
  Sim.init();
  ok(!Sim.buyDeal('flyers').ok && !Sim.dealerInfo().present && Sim.regularsInfo().length === 0 && Sim.boostActive('flyers') === false, 'title screen: no Dex, no regulars');
}

/* Dex's calendar over many seeds x 200 days: always day 2, about 45% of days, never more than 3 days in a row away;
 * a limited flavor only when he comes, on about half his visits from day 3, never more than 3 visits in a row without one */
{
  const N = 30, LAST = 200;
  let days = 0, visits = 0, day2 = 0, worstAway = 0, visits3 = 0, limVisits = 0, worstDry = 0, reloads = 0;
  for (let k = 0; k < N; k++) {
    const seed = 1000 + 7919 * k;
    let st = morningOf(seed, 2), away = 0, dry = 0;
    if (st.dealer) day2++;
    for (let d = 2; d <= LAST; d++) {
      if (d > 2) { st.phase = 'results'; st.lastResult = null; Sim.nextDay(); st = SS.state; }
      const tag = 'dex ' + seed + '/day' + d;
      checkState(tag);                                   // away days: dealer null, nothing offered, buyDeal refused
      if (k < 3 && d % 17 === 0) {                       // a reload never changes whether he came or what he brought
        const before = JSON.stringify(st.dealer);
        SS.state = null; Sim.init(); Sim.continueGame(); st = SS.state; reloads++;
        ok(JSON.stringify(st.dealer) === before && st.day === d, tag + ': a reload changed Dex');
      }
      days++;
      if (!st.dealer) { away++; worstAway = Math.max(worstAway, away); continue; }
      visits++; away = 0;
      const boosts = st.dealer.offers.filter((o) => o.kind === 'boost'), lim = st.dealer.offers.some((o) => o.kind === 'limited');
      ok(st.dealer.day === d && boosts.length === 3 && new Set(boosts.map((o) => o.id)).size === 3, tag + ': Dex needs 3 different boosts');
      if (d < 3) { ok(!lim, tag + ': no limited flavor on day 2'); continue; }
      visits3++;
      if (lim) { limVisits++; dry = 0; } else worstDry = Math.max(worstDry, ++dry);
    }
  }
  ok(day2 === N, 'Dex always comes on day 2 (' + day2 + ' of ' + N + ' games)');
  ok(visits / days >= 0.35 && visits / days <= 0.6, 'Dex should come on about 45% of days, got ' + (100 * visits / days).toFixed(1) + '%');
  ok(worstAway <= 3, 'never more than 3 days in a row without Dex, got ' + worstAway);
  ok(worstDry <= 3 && limVisits / visits3 > 0.38 && limVisits / visits3 < 0.62, 'limited flavors: ' + limVisits + ' of ' + visits3 + ' visits, longest run without one ' + worstDry);
  console.log('\nDex over days 2-' + LAST + ' (' + N + ' seeds, ' + reloads + ' reloads): in town ' + (100 * visits / days).toFixed(1) + '% of days, longest time away ' + worstAway +
    ' days; a limited flavor on ' + (100 * limVisits / visits3).toFixed(0) + '% of visits from day 3, longest run without one ' + worstDry + ' visits');
}

/* old saves without the new fields load; broken new fields are cleaned up */
{
  disk.set(SS.SAVE_KEY, JSON.stringify({ v: 1, phase: 'prep', day: 9, cash: 50, seed: 4, tutorial: { done: true } }));
  ok(Sim.continueGame() === true, 'an old save without regulars / boosts / dealer should load');
  checkState('old save');
  ok(SS.state.regulars.length === 0 && SS.state.boosts.length === 0 && SS.state.boostCost === 0 &&
    SS.state.stats.bestStreak === 0 && SS.state.nextRegular === 1, 'old save gets empty regulars and no boosts');
  // ...and today's Dex, exactly as a fresh game on that seed and day would have him (or not)
  const dexOn = (seed, day) => JSON.stringify(morningOf(seed, day).dealer);
  for (let day = 3; day <= 12; day++) {
    const wantDex = dexOn(4, day);
    disk.set(SS.SAVE_KEY, JSON.stringify({ v: 1, phase: 'prep', day, cash: 50, seed: 4 }));
    ok(Sim.continueGame() === true && JSON.stringify(SS.state.dealer) === wantDex, 'old save on day ' + day + ' gets today\'s Dex: ' + JSON.stringify(SS.state.dealer) + ' vs ' + wantDex);
    disk.set(SS.SAVE_KEY, JSON.stringify({ v: 1, phase: 'prep', day, cash: 50, seed: 4, dealer: { day: day - 1, offers: [{ id: 'golden', kind: 'boost', sold: true }] } }));
    ok(Sim.continueGame() === true && JSON.stringify(SS.state.dealer) === wantDex, 'a save with yesterday\'s Dex gets today\'s on day ' + day);
    checkState('old save day ' + day);
    if (wantDex !== 'null') continue;
    // a save that already holds Dex for today keeps him, even on a day the calendar would leave him away
    const kept = { day, offers: [{ id: 'golden', kind: 'boost', sold: true }, { id: 'lucky', kind: 'boost', sold: false }] };
    disk.set(SS.SAVE_KEY, JSON.stringify({ v: 1, phase: 'prep', day, cash: 50, seed: 4, dealer: kept }));
    ok(Sim.continueGame() === true && JSON.stringify(SS.state.dealer) === JSON.stringify(kept) && Sim.dealerInfo().present, 'a save holding today\'s Dex keeps him on day ' + day);
  }
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
  ok(JSON.stringify(s2.dealer && s2.dealer.offers) === JSON.stringify([{ id: 'golden', kind: 'boost', sold: true }, { id: 'rainbow', kind: 'limited', sold: false }]), 'dealer repaired: ' + JSON.stringify(s2.dealer));
  ok(s2.tutorial.done === true && s2.tutorial.dex === true && !('junk' in s2.tutorial), 'every boolean tutorial flag survives a repair');
  ok(Number.isInteger(s2.stats.bestStreak) && s2.stats.bestStreak >= 9, 'bestStreak repaired');
  const lr = s2.lastResult;
  ok(lr.regulars.length === 1 && lr.regulars[0].mult === SS.loyaltyMult(3) && lr.regulars[0].reason === '' && JSON.stringify(lr.boosts) === '["lucky"]' && lr.loyalty === 0, 'old DayResult rows repaired');
  roundTrip('junk save');
}

/* ---------------------------------------------------------------- *
 * Expansion: food truck, customisation, Mom's groceries
 * ---------------------------------------------------------------- */
const deq = (a, b) => { try { require('assert').deepStrictEqual(a, b); return true; } catch (e) { return false; } };
const sumDelta = (cap) => r2(cap.of('cash').reduce((a, p) => a + p.delta, 0));
const dist = (a, b) => { const A = D.byId(D.cities, a), B = D.byId(D.cities, b); return Math.sqrt((A.x - B.x) ** 2 + (A.y - B.y) ** 2); };
const cupCostOf = (st) => D.byId(D.flavors, st.flavor).extraCost / 10 + ITEMS.reduce((a, it) => a + (it === 'cups' ? 1 : it === 'ice' ? st.recipe.ice : st.recipe[it] / 10) * st.market[it] / D.items[it].pack, 0);

/* an old save (before the expansion) loads unchanged and plays a full day */
{
  disk.clear();
  const old = { v: 1, phase: 'prep', day: 14, cash: 300, seed: 31, reputation: 3.8, lifetimeEarnings: 900, lifetimeCups: 700, location: 'beach',
    unlockedLocations: ['street', 'park', 'beach'], flavor: 'mint', flavors: ['classic', 'pink', 'mint'], upgrades: { pitcher: 2, juicer: 2, helper: 1 },
    stock: { lemons: 30, sugar: 30, ice: 200, cups: 90 }, recipe: { lemons: 6, sugar: 5, ice: 2 }, price: 2.2, milestonesDone: ['first', 'park'],
    stats: { days: 13, bestProfit: 80, bestCups: 50, tips: 10, served: 400, bestStreak: 0 }, tutorial: { done: true } };
  disk.set(SS.SAVE_KEY, JSON.stringify(old));
  ok(Sim.continueGame() === true, 'an old save without truck / custom / groceriesLast should load');
  const st = SS.state;
  checkState('pre-expansion save');
  ok(st.truck === null && deq(st.custom, D.customDefaults()) && st.groceriesLast === 0, 'old save gets no truck, default looks and no grocery run: ' + JSON.stringify([st.truck, st.custom, st.groceriesLast]));
  ok(st.day === 14 && st.cash === 300 && st.reputation === 3.8 && st.location === 'beach' && st.flavor === 'mint' && st.upgrades.pitcher === 2 && st.price === 2.2 &&
    deq(st.recipe, old.recipe) && deq(st.stock, old.stock) && deq(st.milestonesDone, old.milestonesDone), 'old save otherwise unchanged');
  ok(Sim.customAppeal('stand') === 0 && Sim.customAppeal('truck') === 0 && !Sim.truckUnlocked(), 'old save: no appeal, no truck yet');
  ITEMS.forEach((it) => Sim.setCart(it, 1));
  runDay();
  const res = st.lastResult;
  ok(res.truck === null && res.standProfit === res.profit, 'no truck: DayResult.truck is null and profit is the stand\'s');
  roundTrip('pre-expansion save results');
  ok(Sim.nextDay() === true && SS.state.phase === 'prep', 'old save plays on');
}

/* broken expansion fields are cleaned up */
{
  disk.set(SS.SAVE_KEY, JSON.stringify({ v: 1, phase: 'prep', day: 9, cash: 50, seed: 4,
    truck: { at: 'atlantis', route: { from: 'home', to: 'neon', left: 99, total: 2, fuel: -5 }, open: 'yes', price: 999, daysAt: -2, visited: ['neon', 'bogus', 'neon'], total: { days: 'x', profit: -40 } },
    custom: { owned: ['stand.decor.flowers', 'stand.decor.flowers', 'stand.paint.bogus', 'truck.wrap.squeezy', 'stand.paint.classic', 42, 'a.b'],
      stand: { paint: 'mint', trim: 'nope', decor: ['flowers', 'balloons', 'flowers', 'nope'], layout: 'flipped', name: '  hello <b>world</b>!! 123456789 ' },
      truck: { wrap: 'squeezy', name: '', bogus: 1 } },
    groceriesLast: 50, lastResult: { day: 8, profit: 12, truck: { city: 'maple', status: 'zoom', cups: 3.7, revenue: 9, supplies: 2, rent: 35, fuel: 0 }, groceries: { lemons: 40.6, ice: -3 } } }));
  ok(Sim.continueGame() === true, 'a save with broken truck / custom should load');
  checkState('junk expansion save');
  const st = SS.state, T = st.truck;
  ok(T.at === 'home' && deq(T.route, { from: 'home', to: 'neon', left: 2, total: 2, fuel: 0 }) && T.open === true && T.price === D.price.max && T.daysAt === 0 &&
    deq(T.visited, ['home', 'neon']) && T.total.days === 0 && T.total.profit === -40, 'truck repaired: ' + JSON.stringify(T));
  ok(deq(st.custom.owned, ['stand.decor.flowers', 'truck.wrap.squeezy']) && st.custom.stand.paint === 'classic' && st.custom.stand.trim === 'classic' &&
    deq(st.custom.stand.decor, ['flowers']) && st.custom.stand.layout === 'flipped' && st.custom.stand.name === 'HELLO BWORLDB!' &&
    st.custom.truck.wrap === 'squeezy' && st.custom.truck.name === 'SQUEEZE STREET' && !('bogus' in st.custom.truck), 'custom repaired: ' + JSON.stringify(st.custom));
  ok(st.groceriesLast === 9, 'groceriesLast is never after today');
  const lt = st.lastResult.truck;
  ok(lt.status === 'parked' && lt.cups === 3 && lt.profit === r2(9 - 2 - 35) && deq(st.lastResult.groceries, { lemons: 40, sugar: 0, ice: 0, cups: 0 }) && st.lastResult.standProfit === 12, 'old DayResult truck / groceries repaired');
  roundTrip('junk expansion save');
}

/* food truck: unlock, buy, plan a trip, travel, arrive, trade */
{
  let st = morningOf(77, 20);
  st.cash = 100;
  ok(!Sim.truckUnlocked() && !Sim.buyTruck().ok && st.truck === null, 'the truck is locked at first');
  ok(!Sim.truckGo('maple').ok && !Sim.truckSetOpen(true).ok, 'no truck, no trips');
  st.lifetimeEarnings = D.truck.unlockLifetime;
  ok(Sim.truckUnlocked(), 'lifetime sales unlock the truck');
  st.lifetimeEarnings = 0; st.unlockedLocations.push(D.truck.unlockLocation);
  ok(Sim.truckUnlocked(), D.truck.unlockLocation + ' unlocks the truck');
  const poor = Sim.buyTruck();
  ok(!poor.ok && /more/.test(poor.reason) && st.truck === null && st.cash === 100, 'the truck costs money: ' + poor.reason);
  st.cash = D.truck.cost + 1000;
  let cap = capture(['truck:buy', 'cash', 'truck:set']);
  ok(Sim.buyTruck().ok && isObj(st.truck) && st.truck.at === 'home' && st.cash === 1000 && st.truck.price === D.truck.priceStart, 'buying the truck');
  ok(cap.of('truck:buy').length === 1 && cap.of('cash').some((p) => p.reason === 'truck' && p.delta === -D.truck.cost), 'truck:buy and a cash event with reason truck');
  ok(!Sim.buyTruck().ok, 'only one truck');
  // fuel and days follow the map
  const days = (to) => Math.ceil(dist('home', to) / D.truck.mapPerDay - 1e-9), fuel = (to) => r2(dist('home', to) * D.truck.fuelPerMap);
  const est = Sim.truckEstimate('harbor');
  ok(est.days === days('harbor') && est.fuel === fuel('harbor') && est.rent === D.byId(D.cities, 'harbor').rent && est.cupsLo <= est.cupsHi && est.lo <= est.hi, 'truckEstimate: ' + JSON.stringify(est));
  ok(deq(Sim.truckEstimate('home'), { cupsLo: 0, cupsHi: 0, lo: 0, hi: 0, rent: 0, fuel: 0, days: 0, sure: 1 }), 'home: nothing to sell, nothing to pay');
  let go = Sim.truckGo('maple');
  ok(go.ok && go.fuel === fuel('maple') && st.cash === r2(1000 - fuel('maple')) && st.truck.route.to === 'maple', 'fuel is paid when the trip is planned');
  go = Sim.truckGo('harbor');
  ok(go.ok && go.days === days('harbor') && go.fuel === fuel('harbor') && st.cash === r2(1000 - fuel('harbor')) && deq(st.truck.route, { from: 'home', to: 'harbor', left: go.days, total: go.days, fuel: go.fuel }), 'a new plan refunds the old fuel: ' + JSON.stringify(st.truck.route));
  ok(Sim.truckGo('home').ok && st.truck.route === null && st.cash === 1000, 'choosing where it stands cancels the trip');
  ok(Sim.truckGo('nowhere').ok === false, 'unknown city');
  go = Sim.truckGo('harbor');
  cap.stop();
  ok(sumDelta(cap) === r2(st.cash - D.truck.cost - 1000), 'every truck cash change has a cash event: ' + sumDelta(cap) + ' vs ' + r2(st.cash - D.truck.cost - 1000));
  ok(go.days >= 2, 'harbor is at least two days from home');
  // on the road: no sales, no rent; it arrives at a day end
  for (let d = 1; d <= go.days; d++) {
    st = SS.state;
    wellRun(st, null, 1.2);
    st.cash = 600;
    if (d > 1) { const no = Sim.truckGo('maple'); ok(!no.ok && /on the road/.test(no.reason), 'no new plans on the road: ' + no.reason); }
    cap = capture(['truck:depart', 'truck:arrive', 'truck:day', 'cash']);
    const c0 = st.cash;
    runDay((s) => { if (s.today.clock > 1 && !s._probe) { s._probe = 1; ok(!Sim.truckGo('maple').ok, 'trips are planned in the morning only'); } return false; });
    delete SS.state._probe;
    cap.stop();
    const t = SS.state.lastResult.truck, last = d === go.days;
    ok(t.status === (last ? 'arrived' : 'travelling') && t.city === 'harbor' && t.cups === 0 && t.rent === 0 && t.fuel === (d === 1 ? go.fuel : 0), 'travel day ' + d + ': ' + JSON.stringify(t));
    ok(cap.of('truck:depart').length === (d === 1 ? 1 : 0) && cap.of('truck:arrive').length === (last ? 1 : 0) && cap.of('truck:day').length === 1, 'depart once, arrive once');
    ok(Math.abs(SS.state.cash - c0 - sumDelta(cap)) < 0.011, 'travel day cash events add up');
    ok(SS.state.truck.route === null ? last : SS.state.truck.route.left === go.days - d, 'route counts down');
    Sim.nextDay();
  }
  st = SS.state;
  ok(st.truck.at === 'harbor' && st.truck.visited.includes('harbor') && st.truck.daysAt === 0, 'arrived in Harbor City');
  // prices: same bounds as the stand
  ok(Sim.truckSetPrice(3.333) === 3.35 && Sim.truckSetPrice(999) === D.price.max && Sim.truckSetPrice(-1) === D.price.min && Sim.truckSetPrice(3.5) === 3.5, 'truck price bounds');
  // a trading day: rent at the start, sales at the end, all of it in DayResult and lifetime sales
  const harbor = D.byId(D.cities, 'harbor');
  let tradeDays = 0;
  for (let n = 0; n < 3; n++) {
    st = SS.state;
    wellRun(st, null, 1.2);
    st.cash = 800; st.reputation = 4;          // a truck owner is well known by now
    const e = Sim.truckEstimate('harbor'), life0 = st.lifetimeEarnings, best0 = st.stats.bestProfit, daysAt0 = st.truck.daysAt, per = cupCostOf(st) * harbor.supply;
    ok(e.fuel === 0 && e.days === 0 && Sim.prepInfo().truckRent === harbor.rent, 'estimate where the truck stands');
    cap = capture(['cash', 'truck:day']);
    const c0 = st.cash;
    ok(Sim.startDay().ok && SS.state.cash === r2(c0 - harbor.rent) && cap.of('cash').some((p) => p.reason === 'rent' && p.delta === -harbor.rent), 'truck rent is paid when the day starts');
    for (let i = 0; i < 20000 && SS.state.phase === 'day'; i++) Sim.update(1 / 30);
    cap.stop();
    st = SS.state;
    const res = st.lastResult, t = res.truck;
    ok(t.status === 'trading' && t.rent === harbor.rent && t.fuel === 0 && t.revenue === r2(t.cups * 3.5) && Math.abs(t.supplies - t.cups * per) < 0.011 + t.cups * 0.0001 &&
      t.cups <= D.truck.capacity, 'trading day: ' + JSON.stringify(t));
    ok(t.cups >= Math.floor(e.cupsLo * 0.9) - 1 && t.cups <= Math.ceil(e.cupsHi * 1.1) + 1, 'the estimate brackets the day: ' + t.cups + ' in ' + e.cupsLo + '-' + e.cupsHi);
    ok(res.profit === r2(res.standProfit + t.profit) && deq(cap.of('truck:day')[0].result, t), 'DayResult.profit includes the truck, truck:day carries the row');
    ok(Math.abs(st.lifetimeEarnings - life0 - (res.revenue + res.loyalty + t.revenue)) < 0.05, 'lifetime sales include the truck');
    ok(st.stats.bestProfit === Math.max(best0, res.standProfit), 'best-day stats stay about the stand');
    ok(Math.abs(st.cash - c0 - sumDelta(cap)) < 0.011 && res.cashAfter === st.cash, 'trading day cash events add up');
    ok(st.truck.daysAt === daysAt0 + 1 && st.truck.total.days === ++tradeDays, 'daysAt and total.days count trading days');
    Sim.nextDay();
  }
  st = SS.state;
  ok(st.truck.total.revenue > 0 && Math.abs(st.truck.total.profit - (st.truck.total.revenue - st.truck.total.costs)) < 0.05, 'truck totals: ' + JSON.stringify(st.truck.total));
  // crowds thin out the longer it stays, overpricing scares people off
  Sim.truckSetPrice(1.5);                    // a price the crowd takes in any forecast, so the counts are big enough to compare
  const e3 = Sim.truckEstimate('harbor');
  st.truck.daysAt = 0;
  const e0 = Sim.truckEstimate('harbor');
  st.truck.daysAt = 20;
  const eFloor = Sim.truckEstimate('harbor');
  st.truck.daysAt = 3;
  ok(e3.cupsHi < e0.cupsHi && Math.abs(eFloor.cupsHi / e0.cupsHi - Sim.TUNE.truckFatFloor) < 0.03, 'fatigue: ' + [e0.cupsHi, e3.cupsHi, eFloor.cupsHi]);
  Sim.truckSetPrice(12);
  ok(Sim.truckEstimate('harbor').cupsHi < e3.cupsHi * 0.3, 'a $12 cup barely sells');
  Sim.truckSetPrice(3.5);
  // parked: no rent, no sales, the crowd forgets a little
  ok(Sim.truckSetOpen(false).ok && st.truck.open === false && Sim.prepInfo().truckRent === 0, 'close the truck');
  wellRun(st, null, 1.2);
  runDay();
  ok(SS.state.lastResult.truck.status === 'parked' && SS.state.lastResult.truck.rent === 0 && SS.state.truck.daysAt === 2, 'a parked day: ' + JSON.stringify(SS.state.lastResult.truck));
  Sim.nextDay();
  // too poor for the rent: it stays shut, with a toast
  st = SS.state;
  Sim.truckSetOpen(true);
  wellRun(st, null, 1.2);
  st.cash = harbor.rent - 1;
  cap = capture(['toast']);
  runDay();
  cap.stop();
  ok(SS.state.lastResult.truck.status === 'parked' && cap.of('toast').some((p) => /stays shut/.test(p.text)), 'no rent money: the truck stays shut');
  roundTrip('truck results');
  Sim.nextDay();
  roundTrip('truck morning');
  // going home parks it
  st = SS.state;
  go = Sim.truckGo('home');
  ok(go.ok && go.days >= 1 && st.truck.route.to === 'home', 'heading home');
  for (let d = 1; d <= go.days; d++) { wellRun(SS.state, null, 1.2); runDay(); Sim.nextDay(); }
  ok(SS.state.truck.at === 'home' && SS.state.truck.route === null, 'back home');
  wellRun(SS.state, null, 1.2); runDay();
  ok(SS.state.lastResult.truck.status === 'parked' && SS.state.lastResult.truck.city === 'home', 'parked at home');
}

/* review fixes: the city forecast can miss, truck rent shows in prep, a below-cost day is paid in full, a cancelled trip is no gift, appeal works on full days */
{
  let st = morningOf(9, 30);
  st.unlockedLocations.push('downtown'); st.cash = 5000; Sim.buyTruck();
  // forecasts: the real weather once the day is under way; before that it misses now and then, more often further ahead, never by more than one step
  let miss0 = 0, miss3 = 0, far = 0, n = 0;
  const ORDER = ['storm', 'rainy', 'cloudy', 'sunny', 'heatwave'];
  for (let d = 30; d < 630; d++) {
    st.day = d - 3; n++;
    const f3 = Sim.cityForecast('harbor', d);                 // seen three days ahead
    st.day = d;
    const a = Sim.cityWeather('harbor', d), f = Sim.cityForecast('harbor', d);
    if (a.type !== f.type) miss0++;
    if (a.type !== f3.type) miss3++;
    if (Math.abs(ORDER.indexOf(a.type) - ORDER.indexOf(f.type)) > 1) far++;
    if (!(f.confidence > 0 && f.confidence <= 1 && f3.confidence <= f.confidence + 1e-9) || (a.type !== f.type && f3.type !== f.type)) far += 100;   // it only firms up
  }
  ok(miss0 / n > 0.08 && miss0 / n < 0.3 && miss3 > miss0 && far === 0, 'city forecasts miss sometimes: today ' + miss0 + ', 3 days out ' + miss3 + ' of ' + n + ', far ' + far);
  st.day = 30; st.phase = 'day';
  ok(deq(Sim.cityForecast('neon', 30), Object.assign({ confidence: 1 }, Sim.cityWeather('neon', 30))), 'once open, today is the real weather');
  st.phase = 'prep';
  // the estimate runs on the forecast and its range is in order even below cost
  st.truck.at = 'sunport'; st.truck.visited.push('sunport'); st.reputation = 4.5; st.recipe = { lemons: 12, sugar: 12, ice: 5 };
  Sim.truckSetPrice(0.25);
  let e = Sim.truckEstimate('sunport');
  ok(e.lo <= e.hi && e.hi < 0 && e.sure === Sim.cityForecast('sunport', 30).confidence, 'below cost: lo <= hi: ' + JSON.stringify(e));
  // ... and the day is paid in full: it stops selling when the cash for supplies runs out
  st.stock = { lemons: 20, sugar: 20, ice: 100, cups: 20 }; st.price = 1;
  st.cash = D.byId(D.cities, 'sunport').rent;
  let cap = capture(['cash']);
  const c0 = st.cash;
  runDay();
  cap.stop();
  let t = SS.state.lastResult.truck;
  ok(t.status === 'trading' && SS.state.cash >= 0 && Math.abs(SS.state.cash - c0 - sumDelta(cap)) < 0.011 && t.supplies - t.revenue <= c0 - t.rent + SS.state.lastResult.standProfit + 1000,
    'a below-cost truck day: cash events add up, nothing forgiven: ' + JSON.stringify(t));
  const rw = SS.state.lastResult.milestones.reduce((a, id) => a + (D.byId(D.milestones, id).reward || 0), 0);
  ok(Math.abs(SS.state.cash - (c0 + SS.state.lastResult.profit + rw)) < 0.02, 'cash moved by exactly the profit: ' + [c0, SS.state.lastResult.profit, rw, SS.state.cash]);
  Sim.nextDay();
  // prep counts the truck's rent, and says when the cart leaves too little for it
  st = SS.state; st.truck.at = 'neon'; st.truck.visited.push('neon'); st.truck.open = true; Sim.truckSetPrice(5);
  st.stock = { lemons: 0, sugar: 0, ice: 0, cups: 0 }; st.cash = 1000;
  ITEMS.forEach((it) => Sim.setCart(it, 0));
  let pi = Sim.prepInfo();
  ok(pi.truckRent === 900 && !pi.truckShut && pi.cashAfter === r2(1000 - pi.rent - 900), 'cash left takes off the truck rent: ' + JSON.stringify(pi));
  ['lemons', 'sugar', 'ice', 'cups'].forEach((it) => Sim.setCart(it, 30));
  pi = Sim.prepInfo();
  ok(pi.truckShut && pi.cashAfter === r2(1000 - pi.cost - pi.rent) && pi.canStart, 'a cart that leaves too little: the truck will stay shut: ' + JSON.stringify(pi));
  // Grandma does not pay for fuel you can get back
  st.cart = { lemons: 0, sugar: 0, ice: 0, cups: 0 }; st.truck.at = 'home'; st.truck.route = null; st.cash = 52;
  let loans = 0; cap = capture(['cash']);
  Sim.truckGo('maple'); Sim.truckGo('home');
  cap.stop();
  ok(st.cash === 52 && !cap.of('cash').some((p) => p.reason === 'loan'), 'planning and cancelling a trip gives nothing: ' + st.cash);
  Sim.truckGo('maple');
  ok(/fuel back/.test(Sim.canStartDay().reason), 'stuck with fuel paid: the reason says cancelling gives it back: ' + Sim.canStartDay().reason);
  Sim.truckGo('home');
}
/* stand appeal still counts on a full, busy day (the interest roll is capped at 95%) */
{
  const dayAt = (dressed, price) => {
    let sum = 0;
    for (const seed of [1, 2, 3, 4]) {
      const st = morningOf(seed, 40);
      st.unlockedLocations = D.locations.map((l) => l.id); st.location = 'carnival';
      st.stock = { lemons: 400, sugar: 400, ice: 4000, cups: 800 }; st.flavors.push('mango'); st.flavor = 'mango';
      Object.assign(st.upgrades, { pitcher: 3, juicer: 3, helper: 2, speaker: 2, awning: 2, stand: 3, sign: 3 });
      st.recipe = { lemons: 6, sugar: 5, ice: 2 }; st.price = price; st.cash = 5000; st.reputation = 4.9;
      if (dressed) { st.custom.owned = ['stand.decor.costume', 'stand.decor.cutout', 'stand.sign.squeezy', 'stand.decor.lights']; st.custom.stand.decor = ['costume', 'cutout', 'lights']; st.custom.stand.sign = 'squeezy'; }
      Sim.startDay();
      SS.state.weather = { type: 'cloudy', temp: 20 }; SS.state.today.weatherNow = { type: 'cloudy', temp: 20 };
      for (let i = 0; i < 20000 && SS.state.phase === 'day'; i++) Sim.update(1 / 30);
      sum += SS.state.lastResult.standProfit;
    }
    return sum / 4;
  };
  const plain = dayAt(false, 4.6), dressed = dayAt(true, 4.95);
  ok(dressed > plain + 20, 'a dressed stand earns more on a busy carnival day: ' + plain.toFixed(0) + ' -> ' + dressed.toFixed(0));
}

/* city weather: deterministic, leaning to each climate */
{
  morningOf(321, 5);
  const share = (id, types) => { let n = 0; for (let d = 1; d <= 600; d++) if (types.includes(Sim.cityWeather(id, d).type)) n++; return n / 600; };
  const avgT = (id) => { let s = 0; for (let d = 1; d <= 600; d++) s += Sim.cityWeather(id, d).temp; return s / 600; };
  ok(deq(Sim.cityWeather('neon', 17), Sim.cityWeather('neon', 17)) && isWx(Sim.cityWeather('neon', 17)), 'cityWeather is deterministic');
  let differ = 0;
  for (let d = 1; d <= 30; d++) if (Sim.cityWeather('harbor', d).type !== Sim.cityWeather('capitol', d).type) differ++;
  ok(differ >= 5, 'cities have their own weather');
  ok(share('dust', ['heatwave']) > share('pines', ['heatwave']) + 0.15 && share('pines', ['rainy', 'storm']) > share('dust', ['rainy', 'storm']) + 0.1 && avgT('dust') > avgT('pines') + 5,
    'climates lean: dust hot, pines cool');
}

/* customisation: buy, equip, decor limit, names, appeal */
{
  let st = morningOf(5, 6);
  st.cash = 1000;
  ok(Sim.customOwned('stand', 'paint', 'classic') && Sim.customOwned('stand', 'layout', 'flipped') && !Sim.customOwned('stand', 'paint', 'mint'), 'free options are owned');
  ok(!Sim.customSet('stand', 'paint', 'mint').ok && st.custom.stand.paint === 'classic', 'cannot wear what you do not own');
  ok(!Sim.customBuy('stand', 'paint', 'bogus').ok && !Sim.customSet('stand', 'bogus', 'x').ok, 'unknown options');
  let cap = capture(['custom:buy', 'custom:set', 'cash']);
  const mint = lookDef('stand', 'paint', 'mint').cost;
  ok(Sim.customBuy('stand', 'paint', 'mint').ok && st.cash === 1000 - mint && st.custom.owned.includes('stand.paint.mint'), 'buy a paint');
  ok(deq(cap.of('custom:buy')[0], { target: 'stand', slot: 'paint', id: 'mint' }) && cap.of('cash').some((p) => p.reason === 'custom' && p.delta === -mint), 'custom:buy and a cash event');
  ok(st.custom.stand.paint === 'classic', 'buying does not equip by itself');
  ok(!Sim.customBuy('stand', 'paint', 'mint').ok, 'no buying twice');
  ok(Sim.customSet('stand', 'paint', 'mint').ok && st.custom.stand.paint === 'mint' && deq(cap.of('custom:set')[0], { target: 'stand', slot: 'paint', value: 'mint' }), 'equip a paint');
  cap.stop();
  let r = Sim.customBuy('stand', 'decor', 'costume');
  ok(!r.ok && /goal/.test(r.reason), 'the mascot suit needs a goal first: ' + r.reason);
  st.milestonesDone.push('rep3');
  ok(Sim.customBuy('stand', 'decor', 'costume').ok, 'the goal unlocks it');
  r = Sim.customBuy('truck', 'wrap', 'stripes');
  ok(!r.ok && /truck/.test(r.reason), 'truck looks need the truck: ' + r.reason);
  st.cash = 5;
  r = Sim.customBuy('stand', 'decor', 'lights');
  ok(!r.ok && /more/.test(r.reason) && st.cash === 5, 'too poor: ' + r.reason);
  st.cash = 1000;
  ['flowers', 'bunting', 'lights', 'balloons', 'plant'].forEach((id) => ok(Sim.customBuy('stand', 'decor', id).ok, 'buy decor ' + id));
  ['flowers', 'bunting', 'lights', 'balloons'].forEach((id) => ok(Sim.customSet('stand', 'decor', id).ok, 'hang ' + id));
  r = Sim.customSet('stand', 'decor', 'plant');
  ok(!r.ok && deq(st.custom.stand.decor, ['flowers', 'bunting', 'lights', 'balloons']), 'four decorations at most');
  ok(Sim.customSet('stand', 'decor', 'flowers').ok && Sim.customSet('stand', 'decor', 'plant').ok && deq(st.custom.stand.decor, ['bunting', 'lights', 'balloons', 'plant']), 'decor toggles');
  ok(Sim.customAppeal('stand') === 0.1, 'appeal adds up: ' + Sim.customAppeal('stand'));
  ['sign.squeezy', 'layout.showcase'].forEach((k) => { const [slot, id] = k.split('.'); Sim.customBuy('stand', slot, id); Sim.customSet('stand', slot, id); });
  ok(Sim.customAppeal('stand') === 0.15, 'appeal ' + Sim.customAppeal('stand'));
  Sim.customSet('stand', 'decor', 'plant'); Sim.customSet('stand', 'decor', 'costume');
  ok(Sim.customAppeal('stand') === D.custom.appealCap, 'appeal is capped');
  // names
  const name = (t, v) => { Sim.customSet(t, 'name', v); return SS.state.custom[t].name; };
  ok(name('stand', "  joe's  <lemon> stand!!! ") === "JOE'S LEMON ST" && name('stand', '@@@') === 'LEMONADE' && name('truck', 'émile ✓  truck') === 'MILE TRUCK' &&
    name('truck', 'x'.repeat(40)) === 'X'.repeat(D.custom.nameMax.truck), 'names are cleaned: ' + JSON.stringify(SS.state.custom));
  roundTrip('custom morning');
  st = SS.state;
  // shop rules: buying waits for the shop, wearing does not
  wellRun(st, null, 1.2);
  runDay((s) => {
    if (s.today.clock > 2 && !s._probe) {
      s._probe = 1;
      ok(!Sim.customBuy('stand', 'paint', 'sky').ok && Sim.customSet('stand', 'decor', 'lights').ok, 'no shopping mid-day, but the look can change');
    }
    return false;
  });
  delete SS.state._probe;
  // the look brings people in the way stand upgrades do
  const interested = (seed, look) => {
    let n = 0;
    for (let day = 4; day <= 9; day++) {
      const s = morningOf(seed, day);
      wellRun(s, null, 1.2);
      if (look) { s.custom.owned = ['stand.decor.costume', 'stand.decor.cutout', 'stand.sign.squeezy', 'stand.paint.squeezy']; s.custom.stand.decor = ['costume', 'cutout']; s.custom.stand.sign = 'squeezy'; s.custom.stand.paint = 'squeezy'; }
      runDay();
      const p = SS.state.lastResult.people;
      n += p.served + p.pricey + p.wait + p.soldout + p.quit;
    }
    return n;
  };
  let plain = 0, dressed = 0;
  [3, 8, 13].forEach((seed) => { plain += interested(seed, false); dressed += interested(seed, true); });
  ok(dressed > plain * 1.05, 'a dressed-up stand draws more customers: ' + plain + ' -> ' + dressed);
}

/* "Mom Got Groceries!" */
{
  const G = D.groceries;
  // how often she comes, over long chains (her gap depends on her last run)
  let hits = 0, days = 0, worstGap = 99;
  for (let seed = 1; seed <= 25; seed++) {
    disk.clear(); Sim.newGame(seed);
    let last = 0;
    for (let d = 1; d <= 60; d++) {
      const st = SS.state;
      st.stock = { lemons: 50, sugar: 50, ice: 300, cups: 100 };
      ok(Sim.startDay().ok, 'grocery chain day');
      const g = st.today.groceries;
      days++;
      if (g) {
        hits++;
        ok(d >= G.firstDay && (!last || d - last >= G.gap), 'Mom too soon: day ' + d + ' after ' + last);
        if (last) worstGap = Math.min(worstGap, d - last);
        ok(g.at >= 0.2 * SS.DAY_LENGTH && g.at <= 0.7 * SS.DAY_LENGTH && g.eta === G.eta && g.done === false, 'grocery timing ' + JSON.stringify(g));
        const kinds = ITEMS.filter((it) => g.items[it] > 0);
        ok(kinds.length >= 2 && kinds.every((it) => Number.isInteger(g.items[it]) && g.items[it] >= G.items[it][0] && g.items[it] <= G.items[it][1]), 'grocery bags ' + JSON.stringify(g.items));
        st.today.clock = g.at - 0.01;
        Sim.update(0.05);
        ok(g.done && st.groceriesLast === d, 'delivered on the clock');
        last = d;
      }
      Sim.closeEarly();
      ok(deq(SS.state.lastResult.groceries, g ? g.items : null), 'DayResult.groceries');
      Sim.nextDay();
    }
  }
  const rate = hits / days;
  console.log('\nMom Got Groceries: ' + hits + ' runs in ' + days + ' days (' + (100 * rate).toFixed(1) + '%), shortest gap ' + worstGap + ' days');
  ok(rate > 0.06 && rate < 0.13 && worstGap >= G.gap, 'Mom comes about every 8-14 days: ' + rate.toFixed(3));

  // one run in detail: a sold-out stand is back in business, at any speed, never while paused
  let found = null;
  for (let seed = 1; seed < 400 && !found; seed++) {
    const st = morningOf(seed, 6);
    st.stock = { lemons: 3, sugar: 300, ice: 3000, cups: 600 };
    Sim.startDay();
    const g = SS.state.today.groceries;
    if (g && g.items.lemons > 0 && g.at > 25) found = seed;
    Sim.closeEarly();
  }
  ok(!!found, 'some seed brings lemons on day 6');
  [1 / 30, 0.1].forEach((dt) => {
    const st = morningOf(found, 6);
    wellRun(st, null, 1.0);
    st.stock.lemons = 0.6;                     // enough to open
    const cap = capture(['groceries:incoming', 'groceries', 'soldout']);
    let warnAt = -1, landAt = -1, snap = null, before = null;
    const fn = SS.on('groceries', () => { landAt = SS.state.today.clock; snap = { stock: Object.assign({}, SS.state.stock), soldOut: SS.state.today.soldOut }; });
    const fw = SS.on('groceries:incoming', () => { warnAt = SS.state.today.clock; });
    Sim.startDay();
    SS.state.weather = { type: 'sunny', temp: 26 }; SS.state.today.weatherNow = { type: 'sunny', temp: 26 };
    SS.state.stock.lemons = 0;                 // the first pitcher finds no lemons: sold out from the start
    const g = SS.state.today.groceries;
    for (let i = 0; i < 20000 && SS.state.phase === 'day'; i++) {
      if (!g.done) {
        before = Object.assign({}, SS.state.stock);
        const c0 = SS.state.today.clock;
        Sim.update(0);
        ok(SS.state.today.clock === c0 && !g.done, 'paused: nothing moves');
      }
      Sim.update(dt);
    }
    SS.off('groceries', fn); SS.off('groceries:incoming', fw);
    cap.stop();
    ok(cap.of('soldout').length >= 1 && cap.of('soldout')[0].missing === 'lemons', 'the stand ran out of lemons first');
    ok(cap.of('groceries:incoming').length === 1 && Math.abs(cap.of('groceries:incoming')[0].eta - g.eta) <= dt + 1e-6 && warnAt >= g.at - g.eta && warnAt < g.at - g.eta + dt + 1e-6, 'incoming ' + g.eta + 's ahead (dt ' + dt + ')');
    ok(cap.of('groceries').length === 1 && landAt >= g.at && landAt < g.at + dt + 1e-6 && deq(cap.of('groceries')[0].items, g.items), 'the bags land on time');
    ok(!!snap && ITEMS.every((it) => Math.abs(snap.stock[it] - before[it] - g.items[it]) < 1e-6) && snap.soldOut === null, 'stock goes up by the bags and sold-out clears');
    ok(SS.state.lastResult.groceries && deq(SS.state.lastResult.groceries, g.items) && SS.state.groceriesLast === 6, 'DayResult.groceries and groceriesLast');
    ok(SS.state.lastResult.cups > 2, 'the stand sold again after Mom came: ' + SS.state.lastResult.cups);
    // her gap: none of the next few mornings
    for (let d = 1; d < G.gap; d++) { Sim.nextDay(); wellRun(SS.state, null, 1.0); Sim.startDay(); ok(SS.state.today.groceries === null, 'no groceries ' + d + ' days after'); Sim.closeEarly(); }
  });
  // a hand-set run (debug 'groceries') is announced and delivered the same way
  const st = morningOf(9, 4);
  wellRun(st, null, 1.0);
  Sim.startDay();
  for (let i = 0; i < 30; i++) Sim.update(1 / 30);
  const t0 = SS.state.today.clock, cap = capture(['groceries:incoming', 'groceries']);
  SS.state.today.groceries = { at: t0 + 3, eta: G.eta, done: false, items: { lemons: 50, sugar: 0, ice: 100, cups: 0 } };
  for (let i = 0; i < 120; i++) Sim.update(1 / 30);
  cap.stop();
  ok(cap.of('groceries:incoming').length === 1 && Math.abs(cap.of('groceries:incoming')[0].eta - 3) < 0.05 && cap.of('groceries').length === 1, 'a forced run 3 s out');
  Sim.closeEarly();
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
