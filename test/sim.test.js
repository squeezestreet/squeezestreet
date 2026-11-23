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

/* ---------------------------------------------------------------- *
 * Shape checks
 * ---------------------------------------------------------------- */
function isCustomer(c) {
  return isObj(c) && isNum(c.id) && !!D.kinds[c.kind] && isNum(c.seed) && isNum(c.x) && isNum(c.lane) && c.lane >= 0 && c.lane <= 1 &&
    (c.dir === 1 || c.dir === -1) && isNum(c.speed) && c.speed >= 0 && STATES.includes(c.state) && isNum(c.stateT) &&
    typeof c.hasDrink === 'boolean' && isNum(c.mood) && c.mood >= -1 && c.mood <= 1 && isNum(c.patience) && c.patience >= 0 && c.patience <= 1 &&
    (c.bubble === null || (isObj(c.bubble) && BUBBLES.includes(c.bubble.type) && isNum(c.bubble.ttl) && c.bubble.ttl > 0 && isNum(c.bubble.max))) &&
    Number.isInteger(c.qty) && c.qty >= 1 && c.qty <= 4;
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
  if (Math.abs(r.profit - (r.revenue + r.tips - r.ingredientCost - r.rent)) > 0.011) return 'profit does not add up';
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
  'save': (p) => isObj(p)
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
  const log = { firstUpgrade: null, canAfford: null, loc: {}, mogul: null };
  let polishFloor = 0;
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
  }
  return {
    name: 'competent', log,
    prep(st) {
      const lr = st.lastResult && st.lastResult.day === st.day - 1 ? st.lastResult : null, r = st.recipe;
      boost = 1;
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

function playGame(seed, bot, days) {
  disk.clear();
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
    rows.push(Object.assign(morning, { cups: res.cups, profit: res.profit, cash: st.cash, rep: st.reputation, top: res.topFeedback, loc: res.location, price: st.price, served: res.people.served }));
    if (VERBOSE && seed === (VERBOSE === 1 ? SEEDS[0] : VERBOSE)) {
      console.log([bot.name, 'd' + d, res.location, res.weather.type, res.event ? res.event.id : '-', 'cups ' + res.cups, 'price ' + st.price.toFixed(2),
        'profit ' + res.profit.toFixed(0), 'cash ' + st.cash.toFixed(0), 'rep ' + st.reputation.toFixed(2), res.topFeedback,
        'p/w/s/q ' + [res.people.pricey, res.people.wait, res.people.soldout, res.people.quit].join('/'), 'passed ' + res.people.passed,
        'recipe ' + [st.recipe.lemons, st.recipe.sugar, st.recipe.ice].join('-'), 'sat ' + res.satisfaction.toFixed(2), 'up ' + Object.values(st.upgrades).join('')].join('  '));
    }
    if (d % 9 === 5) roundTrip(tag + ' results');
    ok(Sim.nextDay() === true, tag + ': nextDay() refused');
  }
  const st = SS.state;
  return { bot: bot.name, seed, rows, log: bot.log, cash: st.cash, lifetime: st.lifetimeEarnings, rep: st.reputation, bestCups: st.stats.bestCups,
    done: st.milestonesDone.slice(), won: st.won, upgrades: Object.assign({}, st.upgrades), cups: st.lifetimeCups };
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

/* every documented event fired at least once somewhere */
Object.keys(SPEC).forEach((name) => ok(seen[name] > 0, 'event "' + name + '" was never emitted'));

/* ---------------------------------------------------------------- *
 * Balance
 * ---------------------------------------------------------------- */
const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
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

console.log('\n' + checks + ' checks in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
if (failures.length) {
  console.log('\nFAILED (' + failures.length + (failures.length >= 40 ? '+' : '') + '):');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('all good');
