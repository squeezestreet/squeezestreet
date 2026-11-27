/* Squeeze Street — debug.js (development only; does nothing unless the URL hash has debug=)
 *
 * index.html#debug=cmd,cmd:arg,...   commands run in order after boot:
 *   scene            fake a busy day WITHOUT the sim (art modules can be previewed alone)
 *   new              SS.Sim.newGame()
 *   cash:500  rep:4  day:12
 *   loc:beach        street | park | beach | downtown | carnival
 *   up:all=2         or up:stand=3
 *   flavor:mint
 *   stock            fill the pantry       buy   put two packs of everything in the cart
 *   start            SS.Sim.startDay()     adv:20  run the sim 20 seconds     finish  run to the end of the day
 *   next             SS.Sim.nextDay()
 *   open:shop        shop | map | goals | settings
 *   dayT:0.5         freeze time of day (0 sunrise, 0.5 noon, 1 sunset, 1.3 night)
 *   weather:rainy    sunny | heatwave | cloudy | rainy | storm (full intensity at once)
 *   t:12.5           freeze the visual clock      wind:0.8
 *   pause  speed:3  reduced
 *   emit:name        SS.emit(name, {})     fx:confetti | fx:sale | fx:coins
 *   regs:5           give the player 5 regulars with assorted streaks (works with or without 'scene')
 *   dealer           stock Dex the Dealer for today with 3 boosts and a limited flavor
 *   arrive  leave    replay Dex rolling in and setting up / play him packing up and rolling off (he stays away until
 *                    the next phase or 'arrive'); in the console: SS.Actors.replay('arrive' | 'leave')
 *   boost:golden     make a boost active
 *   truck            own the food truck (parked at home) and get +$3000
 *   city:harbor      the truck (owned if needed) stands and trades at that city; put it before 'start'
 *   groceries        Mom's car arrives ~3 s into the running day (before 'start': 3 s after it starts)
 *   look:stand.decor=costume   equip a look, owning it first (decor adds one; look:truck.name=ZESTY sets a name)
 *   ownall           own every customisation option
 * e.g. index.html#debug=new,truck,city:neon,stock,start,groceries   or   #debug=new,ownall,look:stand.paint=squeezy
 */
(function () {
  'use strict';
  var SS = window.SS, W = SS.W;
  var WX = {
    sunny: { wet: 0, heat: 0.1, cloud: 0.22, storm: 0 }, heatwave: { wet: 0, heat: 1, cloud: 0.05, storm: 0 },
    cloudy: { wet: 0, heat: 0, cloud: 0.75, storm: 0 }, rainy: { wet: 0.7, heat: 0, cloud: 0.9, storm: 0 },
    storm: { wet: 1, heat: 0, cloud: 1, storm: 1 }
  };

  var REG_KINDS = ['jogger', 'elder', 'kid', 'office', 'teen', 'parent', 'tourist', 'skater'];
  function fakeRegulars(n) {
    var st = SS.state, out = [], i, k;
    for (i = 0; i < n; i++) {
      k = REG_KINDS[i % REG_KINDS.length];
      out.push({ id: 'r' + (i + 1), name: SS.DATA.regularNames[k][i % 8], kind: k, seed: 4242 + i * 977,
        streak: [7, 3, 1, 12, 0, 5, 2, 9][i % 8], best: 12, visits: 4 + i, strikes: 0, since: 1, lastDay: Math.max(1, (st.day || 2) - 1) });
    }
    st.regulars = out;
    return out;
  }
  function fakeDealer() {
    var st = SS.state;
    st.dealer = { day: st.day, offers: [
      { id: 'flyers', kind: 'boost', sold: false }, { id: 'golden', kind: 'boost', sold: true },
      { id: 'shield', kind: 'boost', sold: false }, { id: 'cotton', kind: 'limited', sold: false }] };
    st.boosts = st.boosts || [];
    if (st.boosts.indexOf('golden') < 0) st.boosts.push('golden');
  }

  // same shape as sim.js freshTruck(); set directly so it works in any phase (buyTruck needs the shop open)
  function ownTruck(st) {
    if (!st.truck) st.truck = { at: 'home', route: null, open: true, price: SS.DATA.truck.priceStart, daysAt: 0, visited: ['home'],
      total: { days: 0, cups: 0, revenue: 0, costs: 0, profit: 0 } };
    return st.truck;
  }
  function momIn3s() {
    var td = SS.state.today;
    if (td) td.groceries = { at: td.clock + 3, eta: SS.DATA.groceries.eta, done: false, items: { lemons: 70, sugar: 50, ice: 180, cups: 110 } };
  }
  function custom(st) { return st.custom || (st.custom = SS.DATA.customDefaults()); }
  function own(st, target, slot, id) {
    var list = SS.DATA.custom[target] && SS.DATA.custom[target][slot], d = Array.isArray(list) ? SS.DATA.byId(list, id) : null, key = target + '.' + slot + '.' + id;
    if (d && d.cost > 0 && custom(st).owned.indexOf(key) < 0) st.custom.owned.push(key);
    return d;
  }

  function fakeScene() {
    var st = SS.state || (SS.state = {});
    var keep = { location: st.location, upgrades: st.upgrades, flavor: st.flavor };
    Object.assign(st, {
      v: 1, seed: 7, phase: 'day', day: 3, cash: 57.5, lifetimeEarnings: 120, lifetimeCups: 96, reputation: 3.4,
      location: keep.location || 'street', unlockedLocations: ['street'],
      upgrades: keep.upgrades || { pitcher: 1, juicer: 1, cooler: 1, stand: 1, awning: 1, sign: 1, tipjar: 1, helper: 0, speaker: 0 },
      flavor: keep.flavor || 'classic', flavors: ['classic'],
      stock: { lemons: 30, sugar: 30, ice: 100, cups: 60 }, cart: { lemons: 0, sugar: 0, ice: 0, cups: 0 },
      recipe: { lemons: 4, sugar: 4, ice: 2 }, price: 1.25,
      market: { lemons: 2.6, sugar: 1.8, ice: 1.2, cups: 1.5 },
      forecast: { type: 'sunny', temp: 27, confidence: 0.8 }, weather: { type: 'sunny', temp: 27 }, event: null,
      milestonesDone: ['first'], stats: { days: 2, bestProfit: 14, bestCups: 22, tips: 2, served: 40 }, history: [],
      lastResult: null, settings: { sfx: false, music: false, speed: 1, reducedMotion: false }, tutorial: { done: true }, won: false,
      regulars: [], boosts: [], dealer: null
    });
    fakeRegulars(4);
    fakeDealer();
    var id = 0;
    function c(kind, x, lane, dir, state, extra) {
      return Object.assign({ id: ++id, kind: kind, seed: id * 7919, x: x, lane: lane, dir: dir, speed: state === 'queue' || state === 'order' ? 0 : 55,
        state: state, stateT: 1.3, hasDrink: false, mood: 0.2, patience: 0.8, bubble: null, qty: 1, regularId: null, streak: 0, mult: 1 }, extra || {});
    }
    var q = [
      c('parent', W.SERVE_X, W.QUEUE_LANE, 1, 'order'),
      c('jogger', W.SERVE_X - W.QUEUE_GAP, W.QUEUE_LANE, 1, 'queue', { seed: 4242, regularId: 'r1', streak: 7, mult: SS.loyaltyMult(7) }),
      c('jogger', W.SERVE_X - 2 * W.QUEUE_GAP, W.QUEUE_LANE, 1, 'queue', { patience: 0.25, bubble: { type: 'wait', ttl: 2, max: 2.5 } }),
      c('elder', W.SERVE_X - 3 * W.QUEUE_GAP, W.QUEUE_LANE, 1, 'queue')
    ];
    var others = [
      c('teen', 640, 0.82, 1, 'leave', { hasDrink: true, mood: 0.9, bubble: { type: 'love', ttl: 2, max: 2.5 }, seed: 4242 + 4 * 977, regularId: 'r5', streak: 1, mult: SS.loyaltyMult(1) }),
      c('tourist', 760, 0.92, -1, 'walk', { bubble: { type: 'pricey', ttl: 2, max: 2.5 } }),
      c('office', 120, 0.1, 1, 'walk'),
      c('skater', 860, 0.12, -1, 'walk', { speed: 120 }),
      c('kid', 40, 0.9, 1, 'approach', { bubble: { type: 'thirsty', ttl: 2, max: 2.5 } }),
      c('vip', 930, 0.78, -1, 'approach', { bubble: { type: 'star', ttl: 2, max: 2.5 } }),
      c('parent', 700, 0.16, 1, 'leave', { hasDrink: true, mood: -0.6, bubble: { type: 'sour', ttl: 2, max: 2.5 } }),
      c('jogger', 220, 0.95, -1, 'walk', { speed: 105 })
    ];
    st.today = {
      clock: 30, t: 0.4, customers: q.concat(others), queue: q.map(function (x) { return x.id; }),
      serving: { id: q[0].id, p: 0.55 }, pitcher: { cups: 5, max: 12, brew: null },
      sold: 14, revenue: 17.5, tipsEarned: 1.2,
      tips: [{ id: 1, x: 300, lane: 0.82, amount: 0.5, ttl: 5 }, { id: 2, x: 610, lane: 0.7, amount: 0.25, ttl: 3 }],
      bell: { cd: 6, max: 20, active: 0 }, soldOut: null, weatherNow: { type: 'sunny', temp: 27 },
      missed: { pricey: 2, wait: 1, soldout: 0, quit: 0 }, hourly: [1, 2, 3, 4, 2, 1, 1, 0, 0], loyalty: 2.4
    };
    SS.debugNoSim = true;
  }

  function run(k, a) {
    var st = SS.state, Sim = SS.Sim, dbg = SS.debugEnv, kv, i;
    switch (k) {
      case 'scene': fakeScene(); break;
      case 'new': Sim.newGame(); break;
      case 'cash': st.cash = Number(a); break;
      case 'regs': fakeRegulars(Number(a) || 5); break;
      case 'dealer': fakeDealer(); break;
      case 'arrive': case 'leave': setTimeout(function () { if (SS.Actors && SS.Actors.replay) SS.Actors.replay(k); }, 60); break;
      case 'boost': st.boosts = st.boosts || []; if (st.boosts.indexOf(a) < 0) st.boosts.push(a); break;
      case 'truck': ownTruck(st); st.cash = (st.cash || 0) + 3000; break;
      case 'city':
        if (!SS.DATA.byId(SS.DATA.cities, a)) { console.warn('[SS.Debug] unknown city', a); break; }
        kv = ownTruck(st);
        kv.at = a; kv.route = null; kv.open = true; kv.daysAt = 0;
        if (kv.visited.indexOf(a) < 0) kv.visited.push(a);
        break;
      case 'groceries':
        if (st.phase === 'day' && st.today) momIn3s();
        else SS.on('day:start', function once() { SS.off('day:start', once); momIn3s(); });
        break;
      case 'look':
        kv = a.split('=');
        i = kv[0].split('.');
        if (i[1] !== 'name' && !own(st, i[0], i[1], kv[1])) { console.warn('[SS.Debug] unknown look', a); break; }
        if (i[1] === 'decor' && custom(st).stand.decor.indexOf(kv[1]) >= 0) break;     // already up: customSet would take it down
        if (Sim.customSet) Sim.customSet(i[0], i[1], kv[1]);
        break;
      case 'ownall':
        Object.keys(SS.DATA.customSlots).forEach(function (t) {
          SS.DATA.customSlots[t].forEach(function (slot) {
            (Array.isArray(SS.DATA.custom[t][slot]) ? SS.DATA.custom[t][slot] : []).forEach(function (d) { own(st, t, slot, d.id); });
          });
        });
        break;
      case 'rep': st.reputation = Number(a); break;
      case 'day': st.day = Number(a); break;
      case 'loc':
        st.location = a; dbg.loc = a;
        if (st.unlockedLocations && st.unlockedLocations.indexOf(a) < 0) st.unlockedLocations.push(a);
        break;
      case 'up':
        kv = a.split('=');
        if (kv[0] === 'all') for (i in st.upgrades) { var d = SS.DATA.byId(SS.DATA.upgrades, i); st.upgrades[i] = Math.min(Number(kv[1]), d ? d.levels.length : 0); }
        else st.upgrades[kv[0]] = Number(kv[1]);
        break;
      case 'flavor': st.flavor = a; if (st.flavors.indexOf(a) < 0) st.flavors.push(a); break;
      case 'stock': st.stock = { lemons: 80, sugar: 80, ice: 300, cups: 150 }; break;
      case 'buy': SS.DATA.itemOrder.forEach(function (it) { Sim.setCart(it, 2); }); break;
      case 'start': Sim.startDay(); break;
      case 'adv': for (i = 0; i < Number(a) * 30 && SS.state.phase === 'day'; i++) Sim.update(1 / 30); break;
      case 'finish': for (i = 0; i < 20000 && SS.state.phase === 'day'; i++) Sim.update(1 / 30); break;
      case 'next': Sim.nextDay(); break;
      case 'open':
        setTimeout(function () {
          if (a === 'settings') { if (SS.UI && SS.UI.openSettings) SS.UI.openSettings(); }
          else if (SS.Screens) SS.Screens.open(a);
        }, 60);
        break;
      case 'dayT': dbg.dayT = Number(a); break;
      case 'weather':
        dbg.weather = Object.assign({ type: a }, WX[a] || WX.sunny);
        if (st && st.today) st.today.weatherNow.type = a;
        break;
      case 't': dbg.t = Number(a); break;
      case 'wind': dbg.wind = Number(a); break;
      case 'pause': SS.setPaused(true); break;
      case 'speed': st.settings.speed = Number(a); break;
      case 'reduced': st.settings.reducedMotion = true; break;
      case 'emit': setTimeout(function () { SS.emit(a, {}); }, 60); break;
      case 'fx':
        setTimeout(function () {
          var v = SS.view, FX = SS.FX;
          if (!FX) return;
          if (a === 'confetti') FX.confetti({ x: v.w / 2, y: v.h * 0.3, count: 160 });
          else if (a === 'coins') FX.coinsTo(v.toX(W.SERVE_X), v.laneY(0.5) - 80, { x: 120, y: 30 }, 12);
          else if (a === 'sale') {
            var c0 = SS.state.today && SS.state.today.customers[0];
            SS.emit('sale', { c: c0, price: 1.25, qty: 1, x: W.SERVE_X, lane: W.QUEUE_LANE });
          }
        }, 400);
        break;
      default: console.warn('[SS.Debug] unknown command', k);
    }
  }

  SS.Debug = {
    run: function () {
      var m = /debug=([^&]*)/.exec(decodeURIComponent(location.hash || ''));
      if (!m) return;
      SS.debugEnv = {};
      m[1].split(',').forEach(function (cmd) {
        if (!cmd) return;
        var i = cmd.indexOf(':'), k = i < 0 ? cmd : cmd.slice(0, i), a = i < 0 ? '' : cmd.slice(i + 1);
        try { run(k, a); } catch (e) { console.error('[SS.Debug] "' + cmd + '" failed', e); }
      });
    }
  };
})();
