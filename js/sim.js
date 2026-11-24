/* Squeeze Street — sim.js
 * The whole game simulation: mornings, the business day, customers, shop, save.
 * Pure logic. No DOM and no canvas, so it also loads in node for test/sim.test.js.
 * Builds SS.state and SS.Sim exactly as the contract in core.js describes.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var SS = root.SS;
  if (!SS || !SS.DATA) return;
  var D = SS.DATA, W = SS.W, clamp = SS.clamp, lerp = SS.lerp;
  var ITEMS = D.itemOrder;

  /* Balance knobs that are not part of the DATA tables. test/sim.test.js checks the result. */
  var TUNE = {
    rate: 1.0,            // passers-by per second at traffic 1.0, before the time-of-day curve
    cap: 70,              // live crowd limit
    walk: 58,             // adult walking speed, world units a second
    notice: 210,          // how far from the stand people make up their minds
    interest: 0.5,        // chance a passer-by fancies a drink on a plain sunny day
    wtp: 1.3,             // dollars a plain customer will pay for a cup on a plain day
    serve: 1.3,           // seconds to pour one order with no helper
    helper: 0.4,          // each helper level serves this much faster
    multiPour: 0.08,      // extra pour time for each extra cup in an order
    patience: 17,         // seconds a patience-1.0 customer will stand in line
    discomfort: 0.6,      // extra patience drain in heat or rain with no shade
    lineTolerance: 0.95,  // share of their patience people will risk on the line they can see
    maxQueue: 9,
    gouge: 1.15,          // raise the price past this much of their limit and people in line walk off
    bellCd: 20, bellActive: 4.5, bellReach: 2.2, bellBoost: 1.5,
    tapBoost: 0.125, tapGap: 0.12,
    meltBase: 0.2, lemonSpoil: 0.25,
    idealLemons: 6, idealSugar: 5, sweetLean: 1.2,
    value0: 0.4,
    star0: 0.4, star1: 0.84,              // satisfaction that maps to 0 and to 5 stars
    repPull: 0.18, repN: 25, repVip: 0.3, // a full day of reviews moves the stars at most ~repPull of the way
    quitRep: 0.03,
    tipTtl: 7,
    loanCups: 6,          // Grandma steps in when you cannot make this many cups
    maxPacks: 99,
    closeGrace: 2.5,      // seconds the last pour and last reviews get after closing time
    // regulars
    regChance: 0.3,       // chance a delighted customer becomes a regular (shrinks as the list fills)
    regMood: 0.45,        // review mood needed to become one
    regCap: 12, regPerDay: 1,
    regHappy: 0.15,       // a regular's review mood at or above this keeps the streak going
    visit: 0.75, visitWet: 0.5, visitStorm: 0.3,   // chance a regular comes by, by weather
    regPatience: 0.08,    // extra patience per streak step (up to 10 steps)
    regLine: 2,           // regulars will join a line this many people longer than anyone else
    regLast: 0.8,         // regulars turn up by this point of the day, so they reach the stand before closing
    // Dex the Dealer
    flyers: 1.35, golden: 1.25, lucky: 2,
    dealerScale: [1, 2, 3.5, 6, 9],                  // boost prices by location, Maple Street .. carnival
    limitedChance: 0.3, limitedPity: 6               // a limited flavor some days, never more than 6 days apart
  };
  var OUTCOMES = ['new', 'streak', 'broken', 'saved', 'lost', 'closed', 'away'];
  var BREAKS = ['taste', 'pricey', 'slow', 'wait', 'soldout', 'quit'];

  var WX_ORDER = ['storm', 'rainy', 'cloudy', 'sunny', 'heatwave'];
  var WX_WEIGHT = { storm: 5, rainy: 14, cloudy: 22, sunny: 43, heatwave: 16 };
  // Extra traffic swing by place: the beach lives and dies by the weather.
  var LOC_WX = { beach: { heatwave: 1.35, cloudy: 0.8, rainy: 0.5, storm: 0.4 } };

  /* Review lines, by feedback kind ------------------------------------- */
  var LINES = {
    great: ['Best lemonade on the block.', 'That hit the spot.', 'Tastes like summer in a cup.', 'I am telling everyone about this place.',
      'Perfectly sweet, perfectly tart.', 'Worth every cent.', 'Ice cold and just right.', 'Same time tomorrow, then.'],
    sour: ['Whoa. My whole face just puckered.', 'So sour my eyes are watering.', 'This needs a lot more sugar.', 'That is one angry lemon.',
      'My teeth are tingling.', 'Too tart for me.', 'I think the lemon won.'],
    sweet: ['It is like drinking syrup.', 'My dentist would faint.', 'Way too sugary.', 'Where did the lemon go?',
      'Sweet enough to glue my lips shut.', 'Tasty, but go easy on the sugar.', 'I can feel the sugar rush already.'],
    watery: ['Is this lemonade or lemon-scented water?', 'I can barely taste the lemon.', 'A bit thin for my taste.',
      'Did the lemons just wave at the pitcher?', 'Refreshing, but weak.', 'Mostly water, I think.', 'It needs more of everything.'],
    warm: ['Could use a lot more ice.', 'Lukewarm, on a day like this?', 'Tasty, but not cold enough.', 'Warm lemonade. Hmm.',
      'I wanted something to cool me down.', 'The ice gave up before I got it.', 'Is the ice on holiday?'],
    pricey: ['Good, but that price stings.', 'My wallet is crying.', 'A bit steep for one cup.', 'I paid it, but I winced.',
      'Nice drink. Ouch on the price.', 'For that much I expected a bigger cup.', 'Lovely, though I will not make a habit of it.'],
    cheap: ['What a bargain!', 'Only that much? I would have paid more.', 'Best deal in town.', 'You could charge more for this, you know.',
      'I feel like I got away with something.', 'So cheap I did not even think about it.', 'A steal at that price.'],
    slow: ['Good, but that line took forever.', 'I almost gave up waiting.', 'Tasty. Slow, but tasty.', 'My break is nearly over.',
      'Worth it, though my feet hurt from standing.', 'You need more hands back there.', 'I aged a year in that line.'],
    quiet: ['Hardly a soul out today.', 'Quiet out here, isn\'t it?', 'I had the whole sidewalk to myself.',
      'Not many people about in this weather.', 'You will have more luck on a sunnier day.', 'Slow day. Tomorrow will be better.']
  };

  /* What Dex the Dealer says, one line a day. {name} = today's limited flavor. */
  var DEX = {
    any: ['Step right up! Fresh deals, today only.', 'Psst. Want a busier day? I can make that happen.',
      'Everything in the van is one day only. Tomorrow it is gone.', 'Best deals on the street, and I am the only one selling.',
      'Your stand looks ready for a little extra sparkle.', 'Trust me, friend. These practically sell themselves.',
      'Fresh from the back of my van. Get them while they last.', 'I have got just the thing for a day like today.',
      'Business is good? Let us make it great.', 'Dex\'s deals: tested by me, loved by everyone.',
      'Pick one, pick two. I will not tell anyone.', 'Big day ahead? Do not go into it empty-handed.'],
    limited: ['Something rare in the van today: {name}. No shop in town has it.', 'Limited edition, just for you: {name}. Once it is gone, it is gone.',
      'Shh. I found a crate of {name}. You did not hear it from me.'],
    sold: ['You cleaned me out! Back tomorrow with fresh stock.', 'Sold out, and proud of it. See you tomorrow, partner.']
  };

  /* Module state ------------------------------------------------------- */
  var rt = null;                       // private runtime for the day in progress (never saved)
  var bounds = { min: -100, max: 1100 };
  var pendingMilestones = [];          // completed outside a day (shop), listed on the next DayResult
  var tasteOut = { score: 1, pen: 0, issue: 'great', mag: 0, iceHeavy: false };

  function r2(n) { return Math.round(n * 100) / 100; }
  function r05(n) { return Math.round(n * 20) / 20; }
  function fin(v, def) { return typeof v === 'number' && isFinite(v) ? v : def; }
  function sq(x) { return x * x; }
  function emit(e, p) { SS.emit(e, p); }
  function toast(text, kind, icon) { emit('toast', { text: text, kind: kind || 'info', icon: icon || 'star' }); }
  function zeros() { return { lemons: 0, sugar: 0, ice: 0, cups: 0 }; }
  function money(n) { return SS.fmtMoney(n); }
  function stars(n) { return (Math.round(n * 10) / 10).toFixed(1); }

  function upDef(id) { return D.byId(D.upgrades, id); }
  function upLevel(id) {
    var st = SS.state, d = upDef(id);
    if (!st || !st.upgrades || !d) return 0;
    return clamp(st.upgrades[id] | 0, 0, d.levels.length);
  }
  function upVal(id) { var d = upDef(id), l = upLevel(id); return !d ? 0 : l > 0 ? d.levels[l - 1].value : d.base; }
  function locDef(id) { return D.byId(D.locations, id) || D.locations[0]; }
  function locIndex(id) { for (var i = 0; i < D.locations.length; i++) if (D.locations[i].id === id) return i; return 0; }
  function flavorDef(id) { return D.byId(D.flavors, id) || D.flavors[0]; }
  function shopOpen(st) { return !!st && (st.phase === 'prep' || st.phase === 'results'); }
  var SHOP_CLOSED = 'You can shop before you open or after you close, not while the stand is open.';
  function boostDef(id) { return D.byId(D.boosts, id); }
  function boostOn(id) { var st = SS.state; return !!st && Array.isArray(st.boosts) && st.boosts.indexOf(id) >= 0; }
  function isLimited(id) { var f = D.byId(D.flavors, id); return !!f && !!f.limited; }
  function cnt(v, max) { return clamp(Math.floor(fin(v, 0)), 0, max); }
  function idNum(id) { return parseInt(String(id).slice(1), 10) || 0; }
  function regById(id) {
    var l = SS.state && SS.state.regulars, i;
    if (l) for (i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }

  function cupsPerPitcher() { return upVal('pitcher') || 8; }
  function brewTime() { return (upVal('juicer') || 6) * (boostOn('turbo') ? 0.5 : 1); }
  function serveTime() { return TUNE.serve / (1 + TUNE.helper * upLevel('helper')); }
  function rent() { var st = SS.state; return st ? locDef(st.location).rent : 0; }

  /* ------------------------------------------------------------------ *
   * State, save and load
   * ------------------------------------------------------------------ */
  function newSeed() { return ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) % 0x7fffffff || 1; }
  function defaultSettings() { return { sfx: true, music: true, speed: 1, reducedMotion: false }; }
  function cleanSettings(raw) {
    var s = defaultSettings();
    if (raw && typeof raw === 'object') {
      if (typeof raw.sfx === 'boolean') s.sfx = raw.sfx;
      if (typeof raw.music === 'boolean') s.music = raw.music;
      if (raw.speed === 1 || raw.speed === 2 || raw.speed === 3) s.speed = raw.speed;
      if (typeof raw.reducedMotion === 'boolean') s.reducedMotion = raw.reducedMotion;
    }
    return s;
  }
  function baseMarket() { var m = {}; ITEMS.forEach(function (it) { m[it] = D.items[it].base; }); return m; }

  function freshState(seed, settings) {
    var ups = {};
    D.upgrades.forEach(function (u) { ups[u.id] = 0; });
    return {
      v: 1, seed: seed | 0, phase: 'title', day: 1,
      cash: D.startCash, lifetimeEarnings: 0, lifetimeCups: 0, reputation: D.startReputation,
      location: D.locations[0].id, unlockedLocations: [D.locations[0].id],
      upgrades: ups, flavor: D.flavors[0].id, flavors: [D.flavors[0].id],
      stock: zeros(), cart: zeros(),
      recipe: { lemons: D.recipe.lemons.start, sugar: D.recipe.sugar.start, ice: D.recipe.ice.start },
      price: D.price.start,
      market: baseMarket(), forecast: { type: 'sunny', temp: 26, confidence: 0.9 }, weather: { type: 'sunny', temp: 26 },
      event: null, milestonesDone: [],
      stats: { days: 0, bestProfit: 0, bestCups: 0, tips: 0, served: 0, bestStreak: 0 },
      history: [], today: null, lastResult: null,
      settings: cleanSettings(settings), tutorial: { done: false }, won: false,
      regulars: [], nextRegular: 1, boosts: [], boostCost: 0, dealer: null
    };
  }

  function store() { try { return root.localStorage || null; } catch (e) { return null; } }
  function readRaw() {
    try {
      var s = store(), txt = s && s.getItem(SS.SAVE_KEY);
      if (!txt) return null;
      var o = JSON.parse(txt);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
    } catch (e) { return null; }
  }
  function isGame(raw) { return !!raw && (raw.phase === 'prep' || raw.phase === 'results'); }

  /** Write the save. Whole games are only written from 'prep' and 'results'; on the
   *  title screen and mid-day just the settings are patched into what is already there,
   *  so a reload during the day goes back to that morning. */
  function persist(announce) {
    var st = SS.state, blob, k;
    if (!st) return false;
    if (st.phase === 'prep' || st.phase === 'results') {
      blob = {};
      for (k in st) if (k !== 'today') blob[k] = st[k];
      blob.today = null;
    } else {
      blob = readRaw() || { v: 1, phase: 'title' };
      blob.settings = st.settings;
      if (st.phase === 'day' && st.tutorial) blob.tutorial = st.tutorial;
    }
    try {
      var s = store();
      if (!s) return false;
      s.setItem(SS.SAVE_KEY, JSON.stringify(blob));
    } catch (e) { return false; }
    if (announce) emit('save', {});
    return true;
  }

  function cleanWx(raw, withConf) {
    if (!raw || typeof raw !== 'object' || !D.weather[raw.type]) return null;
    var o = { type: raw.type, temp: Math.round(clamp(fin(raw.temp, 24), -10, 50)) };
    if (withConf) o.confidence = clamp(fin(raw.confidence, 0.8), 0, 1);
    return o;
  }
  function cleanEvent(raw) {
    var e = raw && typeof raw === 'object' ? D.byId(D.events, raw.id) : null;
    return e ? { id: e.id, title: e.title, desc: e.desc, icon: e.icon, known: e.known } : null;
  }
  function cleanResult(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var p = raw.people && typeof raw.people === 'object' ? raw.people : {}, sp = raw.spoiled && typeof raw.spoiled === 'object' ? raw.spoiled : {};
    var hourly = [], i;
    for (i = 0; i < 9; i++) hourly.push(Math.max(0, fin(raw.hourly && raw.hourly[i], 0)));
    var reviews = (Array.isArray(raw.reviews) ? raw.reviews : []).filter(function (r) {
      return r && typeof r.text === 'string' && LINES[r.kind];
    }).slice(0, 6).map(function (r) {
      return { text: r.text, mood: clamp(fin(r.mood, 0), -1, 1), kind: r.kind, who: D.kinds[r.who] ? r.who : 'parent' };
    });
    return {
      day: Math.max(1, fin(raw.day, 1) | 0), location: locDef(raw.location).id,
      weather: cleanWx(raw.weather) || { type: 'sunny', temp: 26 }, event: cleanEvent(raw.event),
      cups: Math.max(0, fin(raw.cups, 0)), revenue: fin(raw.revenue, 0), tips: fin(raw.tips, 0),
      ingredientCost: fin(raw.ingredientCost, 0), rent: fin(raw.rent, 0), profit: fin(raw.profit, 0),
      people: { passed: fin(p.passed, 0), served: fin(p.served, 0), pricey: fin(p.pricey, 0), wait: fin(p.wait, 0), soldout: fin(p.soldout, 0), quit: fin(p.quit, 0) },
      satisfaction: clamp(fin(raw.satisfaction, 0.5), 0, 1),
      repBefore: clamp(fin(raw.repBefore, 2), 0, 5), repAfter: clamp(fin(raw.repAfter, 2), 0, 5),
      reviews: reviews, topFeedback: LINES[raw.topFeedback] ? raw.topFeedback : 'quiet',
      advice: typeof raw.advice === 'string' ? raw.advice : '',
      hourly: hourly, spoiled: { lemons: Math.max(0, fin(sp.lemons, 0)), ice: Math.max(0, fin(sp.ice, 0)) },
      milestones: (Array.isArray(raw.milestones) ? raw.milestones : []).filter(function (id) { return !!D.byId(D.milestones, id); }),
      bestDay: !!raw.bestDay, cashAfter: fin(raw.cashAfter, 0),
      loyalty: Math.max(0, fin(raw.loyalty, 0)), boostCost: Math.max(0, fin(raw.boostCost, 0)),
      boosts: (Array.isArray(raw.boosts) ? raw.boosts : []).filter(function (id, i, a) { return !!boostDef(id) && a.indexOf(id) === i; }),
      regulars: (Array.isArray(raw.regulars) ? raw.regulars : []).filter(function (r) {
        return r && typeof r === 'object' && typeof r.id === 'string' && !!D.regularNames[r.kind] && OUTCOMES.indexOf(r.outcome) >= 0;
      }).slice(0, 24).map(function (r) {
        var streak = cnt(r.streak, 9999);
        return { id: r.id, name: typeof r.name === 'string' ? r.name : '', kind: r.kind, outcome: r.outcome, streak: streak, mult: SS.loyaltyMult(streak),
          bonus: Math.max(0, fin(r.bonus, 0)), reason: BREAKS.indexOf(r.reason) >= 0 ? r.reason : '' };
      })
    };
  }

  /** Saved regulars: known kinds only, unique ids, whole non-negative numbers, at most regCap. */
  function cleanRegulars(raw, day) {
    var out = [], ids = [];
    (Array.isArray(raw) ? raw : []).forEach(function (r) {
      if (out.length >= TUNE.regCap || !r || typeof r !== 'object' || !D.regularNames[r.kind]) return;
      if (typeof r.id !== 'string' || !/^r\d{1,9}$/.test(r.id) || ids.indexOf(r.id) >= 0) return;
      ids.push(r.id);
      var streak = cnt(r.streak, 9999), since = clamp(Math.floor(fin(r.since, day)), 1, day);
      out.push({ id: r.id, name: typeof r.name === 'string' && r.name ? r.name.slice(0, 40) : D.regularNames[r.kind][0], kind: r.kind,
        seed: cnt(r.seed, 2147483646), streak: streak, best: Math.max(streak, cnt(r.best, 9999)), visits: Math.max(1, cnt(r.visits, 1e6)),
        strikes: cnt(r.strikes, 1), since: since, lastDay: clamp(Math.floor(fin(r.lastDay, since)), since, day) });
    });
    return out;
  }
  /** Dex's saved stock: known boosts and limited flavors only, no repeats. */
  function cleanDealer(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.offers)) return null;
    var offers = [], ids = [];
    raw.offers.forEach(function (o) {
      if (!o || typeof o !== 'object' || ids.indexOf(o.id) >= 0 || offers.length >= 4) return;
      if (o.kind === 'boost' ? !boostDef(o.id) : o.kind !== 'limited' || !isLimited(o.id)) return;
      ids.push(o.id);
      offers.push({ id: o.id, kind: o.kind, sold: !!o.sold });
    });
    return { day: Math.max(1, Math.floor(fin(raw.day, 1))), offers: offers };
  }

  /** Append the known, not-yet-present ids from a saved list, keeping the saved order. */
  function addIds(into, saved, table) {
    if (!Array.isArray(saved)) return;
    saved.forEach(function (id) { if (typeof id === 'string' && D.byId(table, id) && into.indexOf(id) < 0) into.push(id); });
  }

  /** Rebuild a full, valid state from whatever was saved (older, partial or hand-edited). */
  function repair(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    var st = freshState(fin(raw.seed, newSeed()), raw.settings), k, i;
    st.day = Math.max(1, Math.floor(fin(raw.day, 1)));
    st.cash = r2(Math.max(0, fin(raw.cash, D.startCash)));
    st.lifetimeEarnings = Math.max(0, fin(raw.lifetimeEarnings, 0));
    st.lifetimeCups = Math.max(0, Math.floor(fin(raw.lifetimeCups, 0)));
    st.reputation = clamp(fin(raw.reputation, D.startReputation), 0, 5);
    addIds(st.unlockedLocations, raw.unlockedLocations, D.locations);
    if (st.unlockedLocations.indexOf(raw.location) >= 0) st.location = raw.location;
    if (raw.upgrades && typeof raw.upgrades === 'object') {
      D.upgrades.forEach(function (u) { st.upgrades[u.id] = clamp(Math.floor(fin(raw.upgrades[u.id], 0)), 0, u.levels.length); });
    }
    addIds(st.flavors, raw.flavors, D.flavors);
    if (st.flavors.indexOf(raw.flavor) >= 0) st.flavor = raw.flavor;
    ITEMS.forEach(function (it) {
      st.stock[it] = Math.max(0, fin(raw.stock && raw.stock[it], 0));
      st.cart[it] = clamp(Math.floor(fin(raw.cart && raw.cart[it], 0)), 0, TUNE.maxPacks);
    });
    for (k in D.recipe) st.recipe[k] = clamp(Math.round(fin(raw.recipe && raw.recipe[k], D.recipe[k].start)), D.recipe[k].min, D.recipe[k].max);
    st.price = r2(clamp(r05(fin(raw.price, D.price.start)), D.price.min, D.price.max));
    var marketOk = !!raw.market && typeof raw.market === 'object';
    ITEMS.forEach(function (it) { if (!marketOk || !(fin(raw.market[it], 0) > 0)) marketOk = false; });
    st.market = marketOk ? { lemons: raw.market.lemons, sugar: raw.market.sugar, ice: raw.market.ice, cups: raw.market.cups } : null;
    st.forecast = cleanWx(raw.forecast, true);
    st.weather = cleanWx(raw.weather) || (st.forecast ? { type: st.forecast.type, temp: st.forecast.temp } : { type: 'sunny', temp: 26 });
    st.event = cleanEvent(raw.event);
    addIds(st.milestonesDone, raw.milestonesDone, D.milestones);
    if (raw.stats && typeof raw.stats === 'object') for (k in st.stats) st.stats[k] = Math.max(0, fin(raw.stats[k], 0));
    if (Array.isArray(raw.history)) {
      for (i = Math.max(0, raw.history.length - 30); i < raw.history.length; i++) {
        var h = raw.history[i];
        if (!h || typeof h !== 'object') continue;
        st.history.push({ day: fin(h.day, 0), profit: fin(h.profit, 0), revenue: fin(h.revenue, 0), cups: fin(h.cups, 0),
          weather: D.weather[h.weather] ? h.weather : 'sunny', location: locDef(h.location).id });
      }
    }
    st.lastResult = cleanResult(raw.lastResult);
    if (raw.tutorial && typeof raw.tutorial === 'object') for (k in raw.tutorial) if (typeof raw.tutorial[k] === 'boolean') st.tutorial[k] = raw.tutorial[k];
    st.won = !!raw.won;
    st.regulars = cleanRegulars(raw.regulars, st.day);
    st.nextRegular = Math.max(1, Math.min(1e9, Math.floor(fin(raw.nextRegular, 1))));
    st.regulars.forEach(function (g) {
      st.nextRegular = Math.max(st.nextRegular, idNum(g.id) + 1);          // ids are never reused
      st.stats.bestStreak = Math.max(st.stats.bestStreak, g.best);
    });
    st.stats.bestStreak = Math.floor(st.stats.bestStreak);
    addIds(st.boosts, raw.boosts, D.boosts);
    st.boostCost = st.boosts.length ? r2(Math.max(0, fin(raw.boostCost, 0))) : 0;
    st.dealer = cleanDealer(raw.dealer);
    return st;
  }

  /* ------------------------------------------------------------------ *
   * Mornings. Everything rolled here depends on (seed, day) only, so a
   * reload in the morning can never re-roll the market or the weather.
   * ------------------------------------------------------------------ */
  function dayRng(seed, day, salt) {
    var h = (seed | 0) ^ Math.imul(day | 0, 0x9E3779B1) ^ Math.imul(salt | 0, 0x85EBCA6B);
    return SS.mulberry32(Math.floor(SS.hash(h) * 4294967296));
  }
  function pickWeather(u) {
    var total = 0, i, acc = 0;
    for (i = 0; i < WX_ORDER.length; i++) total += WX_WEIGHT[WX_ORDER[i]];
    for (i = 0; i < WX_ORDER.length; i++) { acc += WX_WEIGHT[WX_ORDER[i]] / total; if (u < acc) return WX_ORDER[i]; }
    return 'sunny';
  }
  /** The real weather for a day: a chain from day 1, so it comes in gentle streaks. */
  function actualType(seed, day) {
    var type = 'sunny', from = Math.max(2, day - 400), d, r;
    if (day <= 1) return type;
    for (d = from; d <= day; d++) {
      r = dayRng(seed, d, 11);
      if (r() >= 0.38) type = pickWeather(r());                         // otherwise yesterday's weather stays
      if (d <= 3 && (type === 'storm' || type === 'rainy')) type = 'cloudy';   // a soft first few days
    }
    return type;
  }
  function tempIn(type, u) { var t = D.weather[type].temp; return Math.round(lerp(t[0], t[1], u)); }

  function eventAllowed(e, st, actual) {
    var lr = st.lastResult && st.lastResult.day === st.day - 1 ? st.lastResult : null;
    if (lr && lr.event && lr.event.id === e.id) return false;             // never two days running
    switch (e.id) {
      case 'viral': return !!lr && lr.satisfaction >= 0.72 && lr.cups >= 20;
      case 'critic': return st.reputation >= 3;
      case 'shower': return actual === 'sunny' || actual === 'cloudy';
      case 'heatSpike': return actual === 'sunny';
      case 'fair': case 'marathon': case 'school': return actual !== 'storm';
      default: return true;
    }
  }

  function rollMorning(st) {
    var r = dayRng(st.seed, st.day, 1), market = {}, i;
    ITEMS.forEach(function (it) { market[it] = D.items[it].base * (0.75 + 0.6 * r()); });
    var type = actualType(st.seed, st.day);
    var actual = { type: type, temp: tempIn(type, r()) };
    var conf = 0.5 + 0.45 * Math.sqrt(r()), missRoll = r(), sideRoll = r(), tempRoll = r();
    var forecast = { type: type, temp: actual.temp, confidence: Math.round(conf * 20) / 20 };
    if (st.day > 1 && missRoll > conf) {                                   // the forecast is off by one step
      var idx = WX_ORDER.indexOf(type), to = idx + (sideRoll < 0.5 ? -1 : 1);
      if (to < 0 || to >= WX_ORDER.length) to = idx + (to < 0 ? 1 : -1);
      forecast.type = WX_ORDER[to];
      forecast.temp = tempIn(forecast.type, tempRoll);
    } else {
      var range = D.weather[type].temp;
      forecast.temp = clamp(actual.temp + Math.round((tempRoll - 0.5) * 4), range[0], range[1]);
    }
    var event = null, evRoll = r(), pickRoll = r();
    if (st.day >= 3 && evRoll < 0.36) {
      var pool = [], total = 0;
      for (i = 0; i < D.events.length; i++) {
        if (!eventAllowed(D.events[i], st, type)) continue;
        var w = D.events[i].id === 'viral' ? 2 : 1;
        pool.push([D.events[i], w]); total += w;
      }
      var at = pickRoll * total;
      for (i = 0; i < pool.length; i++) { at -= pool[i][1]; if (at < 0) { event = cleanEvent(pool[i][0]); break; } }
    }
    if (event) {
      if (event.id === 'lemonSale') market.lemons *= 0.5;
      if (event.id === 'sugarShort') market.sugar *= 1.9;
      if (event.id === 'iceTruck') market.ice *= 2;
    }
    ITEMS.forEach(function (it) { market[it] = Math.max(0.05, r05(market[it])); });
    return { market: market, forecast: forecast, actual: actual, event: event };
  }

  /** What one cup needs of each item with today's recipe. */
  function perCup(st) { return { lemons: st.recipe.lemons / 10, sugar: st.recipe.sugar / 10, ice: st.recipe.ice, cups: 1 }; }

  /** If the player cannot buy enough to make a few cups, Grandma covers the difference. */
  function loanNeed(st) {
    var need = 0, per = perCup(st);
    if (st.market) ITEMS.forEach(function (it) { if (per[it] > 0 && st.stock[it] < per[it] * TUNE.loanCups) need += st.market[it]; });
    return need;
  }
  function grandma(st) {
    if (st.phase !== 'prep' || !st.market) return;
    var need = loanNeed(st);
    if (need <= 0 || st.cash >= need) return;
    var loan = Math.ceil(need - st.cash) + 2;
    st.cash = r2(st.cash + loan);
    toast('Grandma slipped you ' + money(loan) + ' to keep the stand going.', 'good', 'heart');
    emit('cash', { amount: st.cash, delta: loan, reason: 'loan' });
  }

  function cartCost() {
    var st = SS.state, c = 0;
    if (!st || !st.cart || !st.market) return 0;
    ITEMS.forEach(function (it) { c += (st.cart[it] || 0) * st.market[it]; });
    return r2(c);
  }
  /** Shrink the cart until it fits the budget (cash after rent). -> true when it changed */
  function trimCart(st) {
    var budget = st.cash - rent(), changed = false, guard = 0;
    while (cartCost() > budget + 1e-9 && guard++ < 1000) {
      var big = null;
      ITEMS.forEach(function (it) { if (st.cart[it] > 0 && (!big || st.cart[it] > st.cart[big])) big = it; });
      if (!big) break;
      st.cart[big]--; changed = true;
    }
    return changed;
  }
  /** After spending in the morning: keep the cart affordable and never leave the player stuck. */
  function afterPrepSpend(st) {
    if (st.phase !== 'prep') return;
    if (trimCart(st)) {
      emit('cart', {});
      toast('Your cart was trimmed to fit what you have left.', 'info', 'coin');
    }
    grandma(st);
  }

  function startPrep() {
    var st = SS.state;
    if (!st || st.phase === 'day') return;
    var from = st.phase, m = rollMorning(st);
    rt = null;
    st.today = null;
    st.market = m.market;
    st.forecast = m.forecast;
    st.weather = { type: m.forecast.type, temp: m.forecast.temp };   // placeholder until the day starts
    st.event = m.event && m.event.known ? m.event : null;
    st.cart = zeros();
    rollDealer(st);
    st.phase = 'prep';
    emit('phase', { from: from, to: 'prep' });
    if (st.event) emit('event:trigger', { id: st.event.id, title: st.event.title, desc: st.event.desc, icon: st.event.icon });
    grandma(st);
    persist(true);
  }

  function setCart(item, packs) {
    var st = SS.state;
    if (!st || st.phase !== 'prep' || !D.items[item] || !st.market) return 0;
    packs = clamp(Math.round(fin(Number(packs), 0)), 0, TUNE.maxPacks);
    var others = cartCost() - st.cart[item] * st.market[item];
    var max = Math.floor((st.cash - rent() - others + 1e-6) / st.market[item]);
    st.cart[item] = clamp(packs, 0, Math.max(0, max));
    emit('cart', {});
    persist(false);
    return st.cart[item];
  }

  function stockAfter(st) {
    var o = {};
    ITEMS.forEach(function (it) { o[it] = (st.stock[it] || 0) + (st.cart[it] || 0) * D.items[it].pack; });
    return o;
  }
  /** -> { cups, limiting } for a given pantry and the current recipe */
  function cupsFrom(st, stock) {
    var per = perCup(st), best = Infinity, limiting = 'lemons';
    ITEMS.forEach(function (it) {
      if (!(per[it] > 0)) return;
      var n = Math.floor(stock[it] / per[it] + 1e-9);
      if (n < best) { best = n; limiting = it; }
    });
    return { cups: best === Infinity ? 0 : best, limiting: limiting };
  }

  function canStartDay() {
    var st = SS.state;
    if (!st) return { ok: false, reason: 'Start a game first.' };
    if (st.phase !== 'prep') return { ok: false, reason: st.phase === 'day' ? 'The stand is already open.' : 'Get ready for the day first.' };
    var loc = locDef(st.location), cost = cartCost();
    if (st.cash + 1e-9 < loc.rent) {
      return { ok: false, reason: 'Rent at ' + loc.name + ' is ' + money(loc.rent) + ' and you have ' + money(st.cash) + '. Set up on ' + D.locations[0].name + ' today, it is free.' };
    }
    if (st.cash + 1e-9 < loc.rent + cost) return { ok: false, reason: 'Your cart costs more than you have. Take something out.' };
    var can = cupsFrom(st, stockAfter(st));
    if (can.cups < 1) {
      var name = D.items[can.limiting].name.toLowerCase();
      return { ok: false, reason: 'You do not have enough ' + name + ' for a single cup. Add a pack of ' + name + ' to your cart.' };
    }
    return { ok: true, reason: '' };
  }

  function prepInfo() {
    var st = SS.state;
    if (!st || !st.market) return { cost: 0, cashAfter: 0, rent: 0, stockAfter: zeros(), maxCups: 0, limiting: 'lemons', costPerCup: 0, canStart: false, reason: 'Start a game first.' };
    var cost = cartCost(), after = stockAfter(st), can = cupsFrom(st, after), per = perCup(st), cpc = flavorDef(st.flavor).extraCost / 10;
    ITEMS.forEach(function (it) { cpc += per[it] * st.market[it] / D.items[it].pack; });
    var ok = canStartDay();
    return { cost: cost, cashAfter: r2(st.cash - cost - rent()), rent: rent(), stockAfter: after, maxCups: can.cups, limiting: can.limiting,
      costPerCup: r2(cpc), canStart: ok.ok, reason: ok.reason };
  }

  function setRecipe(key, value) {
    var st = SS.state, d = D.recipe[key];
    if (!st || !d || st.phase !== 'prep') return st && d ? st.recipe[key] : 0;
    st.recipe[key] = clamp(Math.round(fin(Number(value), d.start) / d.step) * d.step, d.min, d.max);
    emit('recipe', {});
    persist(false);
    return st.recipe[key];
  }
  function setPrice(p) {
    var st = SS.state;
    if (!st || (st.phase !== 'prep' && st.phase !== 'day')) return st ? st.price : 0;
    st.price = r2(clamp(r05(fin(Number(p), st.price)), D.price.min, D.price.max));
    emit('price', {});
    persist(false);
    return st.price;
  }
  function setFlavor(id) {
    var st = SS.state, f = D.byId(D.flavors, id);
    if (!st || !f) return { ok: false, reason: 'That flavor does not exist.' };
    if (!shopOpen(st)) return { ok: false, reason: 'You can change flavor before you open, not while the stand is open.' };
    if (st.flavors.indexOf(id) < 0) return { ok: false, reason: 'You have not unlocked ' + f.name + ' yet.' };
    if (st.flavor !== id) { st.flavor = id; emit('flavor:set', { id: id }); persist(false); }
    return { ok: true, reason: '' };
  }

  /* ------------------------------------------------------------------ *
   * The business day
   * ------------------------------------------------------------------ */
  function eventMods(id) {
    var m = { traffic: 1, interest: 1, wtp: 1, tips: 1, joggers: 0, school: false, critic: false };
    switch (id) {
      case 'fair': m.traffic = 1.6; break;
      case 'marathon': m.traffic = 1.2; m.joggers = 0.9; break;
      case 'school': m.school = true; break;
      case 'critic': m.critic = true; break;
      case 'rival': m.wtp = 0.82; m.interest = 0.9; break;
      case 'payday': m.wtp = 1.2; m.tips = 1.8; break;
      case 'viral': m.traffic = 1.45; m.interest = 1.15; break;
    }
    return m;
  }

  function startDay() {
    var st = SS.state, can = canStartDay();
    if (!can.ok) return can;
    var m = rollMorning(st), cost = cartCost(), rentPaid = rent(), loc = locDef(st.location);
    if (!Array.isArray(st.regulars)) st.regulars = [];          // states built by hand (debug tools) may lack these
    if (!Array.isArray(st.boosts)) { st.boosts = []; st.boostCost = 0; }
    st.cash = r2(Math.max(0, st.cash - cost - rentPaid));
    ITEMS.forEach(function (it) { st.stock[it] += st.cart[it] * D.items[it].pack; st.cart[it] = 0; });
    st.weather = { type: m.actual.type, temp: m.actual.temp };
    st.today = {
      clock: 0, t: 0, customers: [], queue: [], serving: null,
      pitcher: { cups: 0, max: cupsPerPitcher(), brew: null },
      sold: 0, revenue: 0, tipsEarned: 0, tips: [],
      bell: { cd: 0, max: TUNE.bellCd, active: 0 },
      soldOut: null, weatherNow: { type: st.weather.type, temp: st.weather.temp },
      missed: { pricey: 0, wait: 0, soldout: 0, quit: 0 },
      hourly: [0, 0, 0, 0, 0, 0, 0, 0, 0], loyalty: 0
    };
    var rng = dayRng(st.seed, st.day, 777), ev = eventMods(st.event ? st.event.id : null);
    var mix = [], total = 0, k;
    for (k in loc.mix) if (D.kinds[k]) { mix.push([k, loc.mix[k]]); total += loc.mix[k]; }
    if (ev.joggers) { mix.push(['jogger', total * ev.joggers]); total += total * ev.joggers; }
    rt = {
      today: st.today, rng: rng, ev: ev, loc: loc, locIdx: locIndex(loc.id), mix: mix, mixTotal: total,
      nextId: 1, tipId: 1, map: new Map(), busy: false, wantClose: false,
      closing: false, closeT: 0, batch: 0, pourDur: 1, tapT: -1,
      cost: cost, flavorCost: 0, rent: rentPaid, iceStart: st.stock.ice, repBefore: st.reputation, repPend: 0,
      reviews: [], vipReview: null, satSum: 0, satN: 0, sweetSum: 0, kinds: {}, lastLine: {},
      passed: 0, served: 0, soldOutAt: null, approaching: 0, patMul: 1,
      surprise: m.event && !m.event.known ? { ev: m.event, at: 0.38 + 0.25 * rng(), done: false, until: 0 } : null,
      vipAt: ev.critic ? 0.3 + 0.3 * rng() : -1, vipSeen: false, vipServed: false,
      sched: [], regRows: [], newRegs: 0, shieldUsed: false
    };
    // which regulars come by today, and when: fixed by (seed, day, regular)
    var wxId = st.weather.type, come = boostOn('hype') ? 1 : wxId === 'storm' ? TUNE.visitStorm : wxId === 'rainy' ? TUNE.visitWet : TUNE.visit;
    st.regulars.forEach(function (g) {
      var r = dayRng(st.seed, st.day, 1000 + idNum(g.id)), roll = r(), at = lerp(0.06, TUNE.regLast, r()), dir = r() < 0.5 ? 1 : -1;
      if (roll < come) rt.sched.push({ id: g.id, at: at, dir: dir, cid: 0, done: false });
    });
    st.phase = 'day';
    if (cost + rentPaid > 0) emit('cash', { amount: st.cash, delta: -r2(cost + rentPaid), reason: 'supplies' });
    emit('phase', { from: 'prep', to: 'day' });
    emit('day:start', { day: st.day, weather: st.weather, event: st.event });
    st.boosts.forEach(function (id) { emit('boost:on', { id: id }); });
    // a few people are already out and about, so the street is not empty at opening time
    var n = Math.min(14, Math.round(spawnRate(st, st.today) * 7));
    for (var i = 0; i < n && rt; i++) {
      var x = lerp(bounds.min, bounds.max, rng());
      if (Math.abs(x - W.STAND_X) < TUNE.notice + 60) continue;
      spawn(pickKind(), x, rng() < 0.5 ? 1 : -1);
    }
    return { ok: true, reason: '' };
  }

  function curve(t, locId) {
    var lunch = Math.exp(-sq((t - 0.36) / 0.1)), tea = Math.exp(-sq((t - 0.7) / 0.08));
    if (locId === 'downtown') return 0.5 + 1.7 * lunch + 0.35 * tea;          // everyone at once, at lunch
    if (locId === 'carnival') return 0.7 + 0.5 * lunch + 0.7 * SS.smooth((t - 0.5) / 0.4);   // busiest as evening comes
    return 0.62 + 0.85 * lunch + 0.4 * tea;
  }
  function spawnRate(st, td) {
    var wxId = td.weatherNow.type, wx = D.weather[wxId] || D.weather.sunny, lw = LOC_WX[rt.loc.id];
    return TUNE.rate * rt.loc.traffic * wx.traffic * (lw && lw[wxId] || 1) * rt.ev.traffic * curve(td.t, rt.loc.id) * (0.85 + 0.06 * st.reputation) *
      (boostOn('flyers') ? TUNE.flyers : 1);
  }
  function pickKind() {
    var at = rt.rng() * rt.mixTotal, i;
    for (i = 0; i < rt.mix.length; i++) { at -= rt.mix[i][1]; if (at < 0) return rt.mix[i][0]; }
    return rt.mix.length ? rt.mix[0][0] : 'parent';
  }
  function setBubble(c, type, ttl) { c.bubble = { type: type, ttl: ttl, max: ttl }; }

  /** reg = the Regular this customer is (they keep their own look and get their loyalty perks) */
  function spawn(kind, x, dir, reg) {
    var td = rt.today, rng = rt.rng, k = D.kinds[kind] || D.kinds.parent;
    var band = W.PASS_LANES[rng() < 0.36 ? 0 : 1], lane = lerp(band[0], band[1], rng());
    var walk = TUNE.walk * k.speed * (0.88 + 0.24 * rng());
    var qty = 1;
    if ((kind === 'parent' || kind === 'tourist') && rng() < 0.22 + 0.1 * rt.locIdx) qty = 2 + (rng() < 0.4 ? 1 : 0) + (rng() < 0.25 ? 1 : 0);
    var c = {
      id: rt.nextId++, kind: kind, seed: Math.floor(rng() * 2147483647), x: x, lane: lane, dir: dir, speed: walk,
      state: 'walk', stateT: 0, hasDrink: false, mood: 0, patience: 1, bubble: null, qty: qty,
      regularId: null, streak: 0, mult: 1,
      _walk: walk, _lane0: lane, _laneT: lane, _dir0: dir, _decided: false, _cold: false, _retry: false, _hover: false,
      _wtp: 0, _pat: TUNE.patience * k.patience, _warned: false, _rev: null, _bonus: 0
    };
    if (reg) {
      c.seed = reg.seed; c.regularId = reg.id; c.streak = reg.streak; c.mult = SS.loyaltyMult(reg.streak);
      c._pat *= 1 + TUNE.regPatience * Math.min(reg.streak, 10);
    }
    td.customers.push(c);
    rt.map.set(c.id, c);
    rt.passed++;
    emit('customer:spawn', { c: c });
    return c;
  }

  function sendAway(c) {
    var td = rt.today, qi = td.queue.indexOf(c.id);
    if (qi >= 0) td.queue.splice(qi, 1);
    if (td.serving && td.serving.id === c.id) td.serving = null;
    c.state = 'leave'; c.stateT = 0; c.dir = c._dir0;
    // heading right from in front of the stand: stay in front of it
    if (c.dir > 0 && c.lane > W.STAND_LANE && c._lane0 < W.PASS_LANES[1][0]) c._laneT = lerp(W.PASS_LANES[1][0], W.PASS_LANES[1][1], SS.hash(c.seed));
    else c._laneT = c._lane0;
  }
  function balk(c, reason) {
    var td = rt.today;
    td.missed[reason]++;
    c.mood = Math.min(c.mood, -0.3);
    setBubble(c, reason, 1.9);
    if (c.state !== 'walk') sendAway(c);
    if (c.kind === 'vip') rt.vipSeen = true;
    emit('customer:balk', { c: c, reason: reason });
    if (c.regularId) regularBad(c, reason);
  }

  function linePerPerson() { return serveTime() * 1.15 + brewTime() / cupsPerPitcher(); }
  function decide(c, belled) {
    var st = SS.state, td = rt.today, rng = rt.rng, k = D.kinds[c.kind] || D.kinds.parent;
    var wx = D.weather[td.weatherNow.type] || D.weather.sunny, fl = flavorDef(st.flavor);
    c._decided = true;
    var p = TUNE.interest * wx.thirst * k.thirst * (1 + upVal('stand')) * (1 + upVal('sign')) *
      (0.75 + 0.1 * st.reputation) * (1 + 0.4 * fl.wtp) * rt.ev.interest * (belled ? TUNE.bellBoost : 1);
    // regulars came for you: they skip the "am I thirsty" roll
    if (c.kind !== 'vip' && !c.regularId && rng() >= Math.min(0.95, p)) { c._cold = true; return; }   // not thirsty: walks on
    c._cold = false;
    if (td.soldOut) { balk(c, 'soldout'); return; }
    var wxWtp = wx.thirst >= 1 ? 1 + 0.4 * (wx.thirst - 1) : 1 - 0.3 * (1 - wx.thirst);
    c._wtp = TUNE.wtp * rt.loc.wtp * k.wtp * wxWtp * (1 + fl.wtp) * (0.85 + 0.075 * st.reputation) * rt.ev.wtp * (0.62 + 0.45 * (rng() + rng())) *
      (boostOn('golden') ? TUNE.golden : 1);
    if (st.price > c._wtp) { balk(c, 'pricey'); return; }
    if (!roomFor(c)) { c._hover = true; return; }          // long line: they eye it as they walk up
    c.state = 'approach'; c.stateT = 0; c.mood = 0.2;
    rt.approaching++;
    if (rng() < 0.45) setBubble(c, 'thirsty', 1.6);
  }
  /** Is the line short enough for this customer's patience? */
  function roomFor(c) {
    var extra = c.regularId ? TUNE.regLine : 0;
    var most = clamp(Math.floor(c._pat * rt.patMul * TUNE.lineTolerance / linePerPerson()) + extra, 1, TUNE.maxQueue + extra);
    return rt.today.queue.length + 0.5 * rt.approaching < most;      // people still walking over only half count
  }
  /** Wanted a drink but the line was too long: join if it has shrunk, give up once they have walked past it. */
  function hover(c) {
    var st = SS.state, td = rt.today;
    if (td.soldOut) { c._hover = false; balk(c, 'soldout'); }
    else if (st.price > c._wtp) { c._hover = false; balk(c, 'pricey'); }
    else if (roomFor(c)) { c._hover = false; c.state = 'approach'; c.stateT = 0; c.mood = 0.2; rt.approaching++; }
    else if (c.dir > 0 ? c.x > W.SERVE_X : c.x < W.SERVE_X - td.queue.length * W.QUEUE_GAP - 20) { c._hover = false; balk(c, 'wait'); }
  }

  function setSoldOut(missing) {
    var td = rt.today, i, c;
    if (td.soldOut) return;
    td.soldOut = missing;
    rt.soldOutAt = td.t;
    emit('soldout', { missing: missing });
    for (i = td.customers.length - 1; i >= 0; i--) {
      c = td.customers[i];
      if (c.state === 'queue' || c.state === 'order' || c.state === 'approach') balk(c, 'soldout');
    }
  }

  function startBrew() {
    var st = SS.state, td = rt.today, can = cupsFrom(st, st.stock);
    if (can.cups < 1) { setSoldOut(can.limiting); return; }
    var batch = Math.min(cupsPerPitcher(), can.cups), fl = flavorDef(st.flavor);
    st.stock.lemons = Math.max(0, st.stock.lemons - batch * st.recipe.lemons / 10);
    st.stock.sugar = Math.max(0, st.stock.sugar - batch * st.recipe.sugar / 10);
    var extra = Math.min(st.cash, r2(batch * fl.extraCost / 10));
    if (extra > 0) {
      st.cash = r2(st.cash - extra); rt.flavorCost = r2(rt.flavorCost + extra);
      emit('cash', { amount: st.cash, delta: -extra, reason: 'flavor' });
    }
    rt.batch = batch;
    td.pitcher.brew = 0;
    emit('brew:start', { duration: brewTime() });
  }

  function idealIce(temp) { return clamp((temp - 8) / 8, 1, 4.5); }
  /** How the current recipe tastes to someone with this sweet tooth at this temperature. */
  function taste(sweet, temp) {
    var r = SS.state.recipe;
    var dL = (r.lemons - TUNE.idealLemons) / 3, dS = (r.sugar - (TUNE.idealSugar + sweet * TUNE.sweetLean)) / 3;
    var dI = (r.ice - idealIce(temp)) / 2.2;
    var b = dL - dS, s = (dL + dS) / 2;                    // tart-vs-sweet balance, and overall strength
    tasteOut.pen = 0.45 * b * b + (s < 0 ? 1.3 : 0.7) * s * s + 0.6 * dI * dI;
    tasteOut.score = clamp(1 - tasteOut.pen, 0, 1);
    var sour = Math.max(0, b) + (b >= 0 ? Math.max(0, s) * 0.6 : 0);
    var sweetM = Math.max(0, -b) + (b < 0 ? Math.max(0, s) * 0.6 : 0);
    var watery = Math.max(0, -s) * 1.2 + Math.max(0, dI) * 0.9, warm = Math.max(0, -dI);
    var issue = 'sour', mag = sour;
    if (sweetM > mag) { issue = 'sweet'; mag = sweetM; }
    if (watery > mag) { issue = 'watery'; mag = watery; }
    if (warm > mag) { issue = 'warm'; mag = warm; }
    tasteOut.issue = issue; tasteOut.mag = mag;
    tasteOut.iceHeavy = Math.max(0, dI) * 0.9 > Math.max(0, -s) * 1.2;
    return tasteOut;
  }

  function line(kind) {
    var pool = LINES[kind] || LINES.great, i = Math.floor(rt.rng() * pool.length) % pool.length;
    if (i === rt.lastLine[kind]) i = (i + 1) % pool.length;
    rt.lastLine[kind] = i;
    return pool[i];
  }

  function completeSale(c) {
    var st = SS.state, td = rt.today, rng = rt.rng, k = D.kinds[c.kind] || D.kinds.parent;
    var qty = Math.max(1, Math.min(c.qty, Math.floor(td.pitcher.cups + 1e-9))), price = st.price, paid = r2(price * qty);
    td.pitcher.cups = Math.max(0, td.pitcher.cups - qty);
    st.stock.cups = Math.max(0, st.stock.cups - qty);
    st.stock.ice = Math.max(0, st.stock.ice - qty * st.recipe.ice);
    td.sold += qty; td.revenue = r2(td.revenue + paid);
    td.hourly[Math.min(8, Math.floor(td.t * 9))] += qty;
    st.cash = r2(st.cash + paid);
    st.lifetimeEarnings = r2(st.lifetimeEarnings + paid);
    st.lifetimeCups += qty;
    rt.served++;
    c.qty = qty; c.hasDrink = true;
    var bonus = c.regularId && c.mult > 1 ? r2(price * qty * (c.mult - 1)) : 0;
    // what they will say about it in a moment
    var t = taste(k.sweet, td.weatherNow.temp), tScore = clamp(t.score + (rng() - 0.5) * 0.1, 0, 1), issue = t.issue;
    var ratio = c._wtp / Math.max(0.01, price);
    var value = clamp(TUNE.value0 + (ratio - 1), 0, 1);                  // paid right at their limit: grudging
    var wait = 1 - Math.pow(clamp(1 - c.patience, 0, 1), 3);            // only a nearly-lost temper really hurts
    var sat = clamp(0.6 * tScore + 0.25 * value + 0.15 * wait + (rng() - 0.5) * 0.06, 0, 1);
    var dT = 1 - tScore, dW = (1 - wait) * 0.7, dV = (1 - value) * 0.6, kind;
    if (Math.max(dT, dW, dV) < 0.25) kind = ratio > 1.55 && rng() < 0.6 ? 'cheap' : 'great';
    else if (dT >= dW && dT >= dV) kind = issue;
    else kind = dW >= dV ? 'slow' : 'pricey';
    var mood = clamp((sat - 0.55) / 0.35, -1, 1);
    var bubble = kind === 'great' ? (mood > 0.6 ? 'love' : 'happy') : kind === 'cheap' ? 'love' : kind === 'slow' ? 'meh' : kind;
    if (c.kind === 'vip') { rt.vipSeen = true; rt.vipServed = true; if (mood > 0.3) bubble = 'star'; }
    c._rev = { t: 0.9 + 0.5 * rng(), sat: sat, mood: mood, kind: kind, bubble: bubble, text: line(kind), paid: paid,
      stars: 5 * clamp((sat - TUNE.star0) / (TUNE.star1 - TUNE.star0), 0, 1) };
    c.mood = mood;
    var x = c.x, lane = c.lane;
    sendAway(c);
    emit('sale', { c: c, price: price, qty: qty, x: x, lane: lane });
    emit('cash', { amount: st.cash, delta: paid, reason: 'sale' });
    if (bonus > 0) {                                  // a regular's loyalty bonus, on top of the price
      c._bonus = bonus;
      st.cash = r2(st.cash + bonus);
      st.lifetimeEarnings = r2(st.lifetimeEarnings + bonus);
      td.loyalty = r2(td.loyalty + bonus);
      emit('loyalty', { c: c, amount: bonus, mult: c.mult });
      emit('cash', { amount: st.cash, delta: bonus, reason: 'loyalty' });
    }
  }

  function flushRep() {
    if (Math.abs(rt.repPend) > 1e-6) emit('reputation', { value: SS.state.reputation, delta: rt.repPend });
    rt.repPend = 0;
  }
  function nudgeRep(delta) {
    var st = SS.state, before = st.reputation;
    st.reputation = clamp(before + delta, 0, 5);
    rt.repPend += st.reputation - before;
    if (Math.abs(rt.repPend) >= 0.02) flushRep();           // batched, so the stars do not flicker on every cup
  }

  function collect(tip, auto) {
    var st = SS.state, td = rt.today;
    st.cash = r2(st.cash + tip.amount);
    td.tipsEarned = r2(td.tipsEarned + tip.amount);
    emit('tip:collect', { tip: tip, auto: !!auto });
    emit('cash', { amount: st.cash, delta: tip.amount, reason: 'tip' });
  }

  function deliverReview(c, closing) {
    var st = SS.state, td = rt.today, rng = rt.rng, rv = c._rev, k = D.kinds[c.kind] || D.kinds.parent, vip = c.kind === 'vip';
    c._rev = null;
    c.mood = rv.mood;
    if (!closing) setBubble(c, rv.bubble, 2.4);
    var entry = { text: rv.text, mood: rv.mood, kind: rv.kind, who: c.kind };
    rt.reviews.push(entry);
    if (vip) rt.vipReview = entry;
    rt.satSum += rv.sat; rt.satN++; rt.sweetSum += k.sweet;
    rt.kinds[rv.kind] = (rt.kinds[rv.kind] || 0) + 1;
    nudgeRep((rv.stars - st.reputation) * (vip ? TUNE.repVip : TUNE.repPull * TUNE.repN / sq(rt.satN + TUNE.repN)));
    emit('review', { c: c, text: rv.text, mood: rv.mood, kind: rv.kind });
    if (vip) {
      flushRep();
      if (rv.mood > 0.3) toast('The food critic loved it. Word is getting around.', 'good', 'newspaper');
      else if (rv.mood < -0.1) toast('The food critic was not impressed.', 'bad', 'newspaper');
      else toast('The food critic thought it was fine. Just fine.', 'info', 'newspaper');
    }
    var jar = upLevel('tipjar');
    if (rv.mood > 0.25 && rng() < k.tip * (0.6 + rv.mood) * rt.ev.tips * (jar ? 1.25 : 1)) {
      var amount = Math.max(0.05, r05(rv.paid * (0.1 + 0.2 * rng()) * (jar >= 2 ? 1.6 : 1) * (vip ? 2 : 1) * (boostOn('lucky') ? TUNE.lucky : 1)));
      var tip = { id: rt.tipId++, x: c.x, lane: c.lane, amount: amount, ttl: TUNE.tipTtl };
      if (jar || closing) collect(tip, true);
      else { td.tips.push(tip); emit('tip:drop', { tip: tip }); }
    }
    if (c.regularId) {
      if (rv.mood >= TUNE.regHappy || rv.kind === 'great' || rv.kind === 'cheap') regularGood(c);
      else regularBad(c, rv.kind === 'pricey' || rv.kind === 'slow' ? rv.kind : 'taste');
    } else if (!vip) maybeRegular(c, rv);
  }

  /* ------------------------------------------------------------------ *
   * Regulars
   * ------------------------------------------------------------------ */
  function schedFor(id) { for (var i = 0; i < rt.sched.length; i++) if (rt.sched[i].id === id) return rt.sched[i]; return null; }
  function nextRegId(st) {
    var n = Math.max(1, Math.floor(fin(st.nextRegular, 1)));
    st.regulars.forEach(function (g) { n = Math.max(n, idNum(g.id) + 1); });
    st.nextRegular = n + 1;
    return 'r' + n;
  }
  /** One row per regular on today's results; settled visits only ever write it once. */
  function regRow(g, outcome, reason, c) {
    var row = { id: g.id, name: g.name, kind: g.kind, outcome: outcome, streak: g.streak, mult: SS.loyaltyMult(g.streak), bonus: c ? c._bonus : 0, reason: reason };
    for (var i = 0; i < rt.regRows.length; i++) if (rt.regRows[i].id === g.id) { rt.regRows[i] = row; return; }
    rt.regRows.push(row);
  }
  /** The Regular whose visit this customer is, if that visit is still open (each regular settles once a day). */
  function openVisit(c) {
    var e = c.regularId && rt ? schedFor(c.regularId) : null, g = e && !e.done && e.cid === c.id ? regById(c.regularId) : null;
    if (g) e.done = true;
    return g;
  }
  function regularGood(c) {
    var st = SS.state, g = openVisit(c);
    if (!g) return;
    g.streak++; g.best = Math.max(g.best, g.streak); g.visits++; g.strikes = 0; g.lastDay = st.day;
    st.stats.bestStreak = Math.max(st.stats.bestStreak || 0, g.best);
    regRow(g, 'streak', '', c);
    emit('regular:streak', { regular: g, c: c, streak: g.streak, mult: SS.loyaltyMult(g.streak) });
  }
  function regularBad(c, reason) {
    var st = SS.state, g = openVisit(c);
    if (!g) return;
    var shielded = boostOn('shield') && !rt.shieldUsed;
    g.visits++; g.lastDay = st.day;
    if (shielded) rt.shieldUsed = true;
    else { g.streak = 0; g.strikes++; }
    var lost = g.strikes >= 2;
    regRow(g, shielded ? 'saved' : lost ? 'lost' : 'broken', reason, c);
    emit('regular:broken', { regular: g, c: c, reason: reason, shielded: shielded });
    if (lost) {
      st.regulars.splice(st.regulars.indexOf(g), 1);
      emit('regular:lost', { regular: g });
    }
  }
  /** A delighted customer may decide to come back on other days. */
  function maybeRegular(c, rv) {
    var st = SS.state, regs = st.regulars, names = D.regularNames[c.kind], rng = rt.rng;
    if (!names || rv.mood < TUNE.regMood || (rv.kind !== 'great' && rv.kind !== 'cheap')) return;
    if (regs.length >= TUNE.regCap || rt.newRegs >= TUNE.regPerDay || rng() >= TUNE.regChance * (1 - regs.length / TUNE.regCap)) return;
    var free = names.filter(function (n) { return !regs.some(function (g) { return g.name === n; }); });
    if (!free.length) return;
    var g = { id: nextRegId(st), name: free[Math.floor(rng() * free.length) % free.length], kind: c.kind, seed: c.seed,
      streak: 1, best: 1, visits: 1, strikes: 0, since: st.day, lastDay: st.day };
    regs.push(g);
    rt.newRegs++;
    rt.sched.push({ id: g.id, at: rt.today.t, dir: c.dir, cid: c.id, done: true });
    st.stats.bestStreak = Math.max(st.stats.bestStreak || 0, 1);
    c.regularId = g.id; c.streak = 1; c.mult = SS.loyaltyMult(1);
    regRow(g, 'new', '', null);
    emit('regular:new', { regular: g, c: c });
  }
  /** A scheduled regular walks in from the edge of the street. */
  function arriveRegular(e) {
    var g = regById(e.id);
    e.cid = -1;                                    // one arrival per day, even if they are gone
    if (!g) return;
    var c = spawn(g.kind, e.dir > 0 ? bounds.min : bounds.max, e.dir, g);
    e.cid = c.id;
    emit('regular:visit', { regular: g, c: c });
  }
  /** Hype Squad bought mid-day: everyone not already coming today turns up later on. */
  function hypeRest(st) {
    var td = rt.today, from = Math.min(0.93, td.t + 0.02);
    st.regulars.forEach(function (g) {
      if (!schedFor(g.id)) rt.sched.push({ id: g.id, at: lerp(from, Math.max(from, TUNE.regLast), rt.rng()), dir: rt.rng() < 0.5 ? 1 : -1, cid: 0, done: false });
    });
  }

  function triggerSurprise() {
    var st = SS.state, td = rt.today, s = rt.surprise, e = s.ev, to;
    s.done = true;
    if (e.id === 'shower') { to = { type: 'rainy', temp: Math.min(td.weatherNow.temp, D.weather.rainy.temp[1]) }; s.until = td.t + 0.22; }
    else to = { type: 'heatwave', temp: Math.max(td.weatherNow.temp + 5, D.weather.heatwave.temp[0]) };
    st.event = e;
    td.weatherNow = to;
    emit('event:trigger', { id: e.id, title: e.title, desc: e.desc, icon: e.icon });
    emit('weather:change', { type: to.type, temp: to.temp });
  }

  function beginClose() {
    var td = rt.today, i, c;
    rt.closing = true; rt.closeT = 0;
    for (i = td.customers.length - 1; i >= 0; i--) {
      c = td.customers[i];
      if (td.serving && td.serving.id === c.id) continue;       // the pour in progress gets finished
      if (c.state === 'queue' || c.state === 'order' || c.state === 'approach') sendAway(c);   // no hard feelings
    }
    rt.approaching = 0;
  }

  function update(dt) {
    var st = SS.state;
    if (!st || st.phase !== 'day' || !st.today || !rt || rt.today !== st.today || rt.busy) return;
    dt = Number(dt);
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    rt.busy = true;
    try { step(st, st.today, dt); } finally { if (rt) rt.busy = false; }
    if (rt && rt.wantClose) finalize();
  }

  function step(st, td, dt) {
    var rng = rt.rng, DAY = SS.DAY_LENGTH, i, c, list = td.customers;
    /* clock ----------------------------------------------------------- */
    if (!rt.closing) {
      td.clock = Math.min(DAY, td.clock + dt);
      td.t = clamp(td.clock / DAY, 0, 1);
      if (td.clock >= DAY) beginClose();
    } else rt.closeT += dt;

    /* weather, ice, bell, tips ---------------------------------------- */
    if (rt.surprise && !rt.closing) {
      if (!rt.surprise.done && td.t >= rt.surprise.at) triggerSurprise();
      else if (rt.surprise.done && rt.surprise.until && td.t >= rt.surprise.until) {
        rt.surprise.until = 0;
        td.weatherNow = { type: st.weather.type, temp: st.weather.temp };
        emit('weather:change', { type: td.weatherNow.type, temp: td.weatherNow.temp });
      }
    }
    var wxId = td.weatherNow.type, temp = td.weatherNow.temp;
    if (st.stock.ice > 0 && !boostOn('frost')) {
      var melt = clamp(TUNE.meltBase + (temp - 22) * 0.012, 0.06, 0.45) * (1 - clamp(upVal('cooler'), 0, 1));
      st.stock.ice = Math.max(0, st.stock.ice - rt.iceStart * melt * dt / DAY);
    }
    td.bell.cd = Math.max(0, td.bell.cd - dt);
    td.bell.active = Math.max(0, td.bell.active - dt);
    for (i = td.tips.length - 1; i >= 0; i--) { td.tips[i].ttl -= dt; if (td.tips[i].ttl <= 0) td.tips.splice(i, 1); }
    var rough = wxId === 'heatwave' || wxId === 'storm' ? 1 : wxId === 'rainy' ? 0.8 : 0;
    rt.patMul = (1 + upVal('speaker')) / (1 + TUNE.discomfort * rough * (1 - clamp(upVal('awning'), 0, 1)));

    /* arrivals -------------------------------------------------------- */
    if (!rt.closing) {
      var lam = spawnRate(st, td) * dt;
      while (lam > 0) {
        if (rng() < lam && list.length < TUNE.cap) { var d0 = rng() < 0.5 ? 1 : -1; spawn(pickKind(), d0 > 0 ? bounds.min : bounds.max, d0); }
        lam -= 1;
      }
      if (rt.ev.school && td.t > 0.3 && td.t < 0.42 && rng() < 1.7 * dt && list.length < TUNE.cap) {
        var d1 = rng() < 0.5 ? 1 : -1; spawn(rng() < 0.85 ? 'kid' : 'parent', d1 > 0 ? bounds.min : bounds.max, d1);
      }
      if (rt.vipAt >= 0 && td.t >= rt.vipAt) { rt.vipAt = -1; var d2 = rng() < 0.5 ? 1 : -1; spawn('vip', d2 > 0 ? bounds.min : bounds.max, d2); }
      for (i = 0; i < rt.sched.length; i++) if (!rt.sched[i].cid && td.t >= rt.sched[i].at && list.length < TUNE.cap + 8) arriveRegular(rt.sched[i]);
    }

    /* pitcher --------------------------------------------------------- */
    var P = td.pitcher;
    if (P.brew != null) {
      P.brew += dt / brewTime();
      if (P.brew >= 1) { P.brew = null; P.cups = rt.batch; emit('brew:done', { cups: rt.batch }); }
    } else if (P.cups < 1 && !td.soldOut && !rt.closing) startBrew();

    /* everyone on the sidewalk ---------------------------------------- */
    var belled = td.bell.active > 0, reach = TUNE.notice * (1 + upVal('sign')) * (belled ? TUNE.bellReach : 1);
    var laneStep = dt * 0.75, endX = W.SERVE_X - td.queue.length * W.QUEUE_GAP, approaching = 0;
    for (i = list.length - 1; i >= 0; i--) {
      c = list[i];
      c.stateT += dt;
      if (c.bubble) { c.bubble.ttl -= dt; if (c.bubble.ttl <= 0) c.bubble = null; }
      if (c._rev) { c._rev.t -= dt; if (c._rev.t <= 0) deliverReview(c, false); }
      if (c.state === 'walk') {
        c.speed = c._walk;
        c.x += c.dir * c.speed * dt;
        if (rt.closing) c._hover = false;
        else if (c._hover) hover(c);
        else if (Math.abs(c.x - W.STAND_X) <= reach) {
          if (!c._decided) { if (belled || c.dir * (W.STAND_X - c.x) > 0) decide(c, belled); }
          else if (belled && c._cold && !c._retry) { c._retry = true; decide(c, true); }   // the bell gets a second look
        }
      } else if (c.state === 'approach') {
        endX = W.SERVE_X - td.queue.length * W.QUEUE_GAP;
        var dx = endX - c.x, adx = Math.abs(dx);
        if (adx > 1) {
          var mv = Math.min(adx, Math.min(c._walk * 1.15, adx * 5 + 14) * dt);
          c.dir = dx > 0 ? 1 : -1; c.x += c.dir * mv; c.speed = mv / dt;
        } else { c.x = endX; c.speed = 0; }
        if (adx < 48) c.lane += clamp(W.QUEUE_LANE - c.lane, -laneStep, laneStep);       // step into the line at its end
        if (adx <= 1 && Math.abs(c.lane - W.QUEUE_LANE) < 0.012) {
          c.lane = W.QUEUE_LANE; c.dir = 1; c.speed = 0; c.state = 'queue'; c.stateT = 0; c.patience = 1;
          td.queue.push(c.id);
          emit('customer:join', { c: c });
        }
      } else if (c.state === 'leave') {
        c.speed = c._walk * lerp(0.2, 1, SS.smooth(c.stateT / 0.5));
        c.x += c.dir * c.speed * dt;
        c.lane += clamp(c._laneT - c.lane, -laneStep * 1.3, laneStep * 1.3);
      }
      if ((c.state === 'walk' || c.state === 'leave') && (c.dir > 0 ? c.x > bounds.max : c.x < bounds.min)) {
        if (c._rev) deliverReview(c, true);
        rt.map.delete(c.id);
        list.splice(i, 1);
      } else if (c.state === 'approach') approaching++;
    }
    rt.approaching = approaching;

    /* the line: close up smoothly, lose patience ---------------------- */
    var q = td.queue;
    for (i = 0; i < q.length; i++) {
      c = rt.map.get(q[i]);
      if (!c) { q.splice(i--, 1); continue; }
      var tx = W.SERVE_X - i * W.QUEUE_GAP, gap = tx - c.x, agap = Math.abs(gap);
      if (agap > 0.4) {
        var mq = Math.min(agap, Math.min(c._walk * 1.2, agap * 7 + 8) * dt);
        c.x += (gap > 0 ? 1 : -1) * mq; c.speed = mq / dt;
      } else { c.x = tx; c.speed = 0; }
      c.dir = 1; c.lane = W.QUEUE_LANE;
      if (i === 0 && c.state === 'queue') { c.state = 'order'; c.stateT = 0; }      // next up: the pour starts while they step forward
      if (td.serving && td.serving.id === c.id) continue;                    // being poured for: happy to wait
      c.patience -= dt / Math.max(0.5, c._pat * rt.patMul);
      c.mood = clamp(c.patience * 1.4 - 0.7, -1, 1);
      if (c.patience <= 0) {
        c.patience = 0;
        td.missed.quit++;
        c.mood = -0.8;
        setBubble(c, 'angry', 2.2);
        sendAway(c);
        nudgeRep(-TUNE.quitRep);
        if (c.kind === 'vip') rt.vipSeen = true;
        emit('customer:quit', { c: c });
        if (c.regularId) regularBad(c, 'quit');
        i--;
      } else if (c.patience < 0.33 && !c._warned) { c._warned = true; if (!c.bubble) setBubble(c, 'wait', 1.8); }
    }

    /* the counter ----------------------------------------------------- */
    if (!td.serving && q.length && !rt.closing && P.brew == null && P.cups >= 1) {
      c = rt.map.get(q[0]);
      if (c && c.state === 'order') {
        var iceCan = st.recipe.ice > 0 ? Math.floor(st.stock.ice / st.recipe.ice + 1e-9) : Infinity;
        var limit = Math.min(Math.floor(P.cups + 1e-9), Math.floor(st.stock.cups + 1e-9), iceCan);
        if (limit < 1) setSoldOut(iceCan < 1 ? 'ice' : 'cups');
        else if (st.price > c._wtp * TUNE.gouge) balk(c, 'pricey');             // the price went up while they waited
        else {
          c.qty = clamp(c.qty | 0, 1, limit);
          rt.pourDur = serveTime() * (1 + TUNE.multiPour * (c.qty - 1));
          td.serving = { id: c.id, p: 0 };
          emit('pour', { c: c, duration: rt.pourDur });
        }
      }
    }
    if (td.serving) {
      c = rt.map.get(td.serving.id);
      if (!c) td.serving = null;
      else {
        td.serving.p = Math.min(1, td.serving.p + dt / Math.max(0.05, rt.pourDur));
        if (td.serving.p >= 1) completeSale(c);
      }
    }

    /* closing time ---------------------------------------------------- */
    if (rt.closing && !rt.wantClose) {
      var waiting = !!td.serving;
      if (!waiting) for (i = 0; i < list.length; i++) if (list[i]._rev) { waiting = true; break; }
      if (!waiting || rt.closeT >= TUNE.closeGrace) rt.wantClose = true;
    }
  }

  /* ------------------------------------------------------------------ *
   * Results
   * ------------------------------------------------------------------ */
  /** A Frost Pack covers the night after the day it was used. */
  function frostNight(st) {
    if (st.phase === 'day') return boostOn('frost');
    var lr = st.lastResult;
    return !!lr && lr.day === st.day && Array.isArray(lr.boosts) && lr.boosts.indexOf('frost') >= 0;
  }
  function spoilage(st) {
    return { lemons: Math.floor(st.stock.lemons * TUNE.lemonSpoil),
      ice: frostNight(st) ? 0 : Math.floor(st.stock.ice * (1 - clamp(upVal('cooler'), 0, 1)) + 1e-9) };
  }

  function milestoneValue(m, st) {
    switch (m.kind) {
      case 'cups': return st.lifetimeCups;
      case 'dayCups': return st.stats.bestCups;
      case 'dayProfit': return st.stats.bestProfit;
      case 'rep': return Math.round(st.reputation * 10) / 10;       // the stars as the player sees them
      case 'upgrades': var n = 0; D.upgrades.forEach(function (u) { n += upLevel(u.id); }); return n;
      case 'location': return st.unlockedLocations.indexOf(m.target) >= 0 ? 1 : 0;
      case 'flavors': return st.flavors.length;
      case 'lifetime': return st.lifetimeEarnings;
      case 'regulars': return st.regulars ? st.regulars.length : 0;
      case 'streak': return st.stats.bestStreak || 0;
    }
    return 0;
  }
  function milestoneTarget(m) { return m.kind === 'location' ? 1 : m.target; }
  /** Pay every newly completed milestone (optionally only some kinds). -> the milestone rows */
  function payMilestones(kinds) {
    var st = SS.state, done = [];
    D.milestones.forEach(function (m) {
      if (st.milestonesDone.indexOf(m.id) >= 0 || (kinds && kinds.indexOf(m.kind) < 0)) return;
      if (milestoneValue(m, st) + 1e-9 < milestoneTarget(m)) return;
      st.milestonesDone.push(m.id);
      if (m.reward > 0) st.cash = r2(st.cash + m.reward);
      if (m.final) st.won = true;
      done.push(m);
    });
    return done;
  }
  function announceMilestones(done) {
    var st = SS.state;
    done.forEach(function (m) {
      emit('milestone', { id: m.id, title: m.title, reward: m.reward });
      if (m.reward > 0) emit('cash', { amount: st.cash, delta: m.reward, reason: 'milestone' });
      if (m.final) emit('win', {});
    });
  }
  /** Goals that complete in the shop pay out on the spot. */
  function shopMilestones() {
    var done = payMilestones(['upgrades', 'flavors', 'location']);
    done.forEach(function (m) { pendingMilestones.push(m.id); });
    announceMilestones(done);
  }

  function topFeedback(td, considered) {
    var n = rt.satN, kn = rt.kinds, served = rt.served, m = td.missed;
    if (considered < 6) return 'quiet';
    var tasteTop = 'sour';
    ['sweet', 'watery', 'warm'].forEach(function (k) { if ((kn[k] || 0) > (kn[tasteTop] || 0)) tasteTop = k; });
    if (n > 0 && (kn[tasteTop] || 0) >= 0.3 * n) return tasteTop;
    var slow = m.wait + m.quit + (kn.slow || 0), priceyShare = m.pricey / Math.max(1, served + m.pricey);
    var pricey = priceyShare > 0.5 || (n > 0 && (kn.pricey || 0) >= 0.35 * n);
    if (slow >= 0.3 * considered && (!pricey || m.wait + m.quit >= m.pricey)) return 'slow';
    if (pricey) return 'pricey';
    if (priceyShare < 0.15 && n > 0 && (kn.cheap || 0) >= 0.2 * n) return 'cheap';
    return 'great';
  }

  var TWEAKS = [['lemons', 1, 'add a lemon to the recipe'], ['lemons', -1, 'use one less lemon in the recipe'],
    ['sugar', 1, 'add a scoop of sugar to the recipe'], ['sugar', -1, 'take a scoop of sugar out of the recipe']];
  /** The one-step recipe change that today's crowd would have liked best, as words (or '' if none helps). */
  function bestTweak(st, sweet, temp) {
    var base = taste(sweet, temp).pen, best = '', gain = 0.012, i, key, old, v, g;
    for (i = 0; i < TWEAKS.length; i++) {
      key = TWEAKS[i][0]; old = st.recipe[key]; v = old + TWEAKS[i][1];
      if (v < D.recipe[key].min || v > D.recipe[key].max) continue;
      st.recipe[key] = v; g = base - taste(sweet, temp).pen; st.recipe[key] = old;
      if (g > gain) { gain = g; best = TWEAKS[i][2]; }
    }
    return best;
  }

  function adviceFor(top, st, td, res) {
    var m = td.missed, price = st.price, loc = locDef(st.location), wxId = st.weather.type, temp = st.weather.temp, itemName;
    var sweet = rt.satN ? rt.sweetSum / rt.satN : 0, cubes = Math.round(idealIce(temp)), tweak = bestTweak(st, sweet, temp);
    // taste first: a bad recipe costs stars, which costs more than one short day
    if (top === 'sour') return 'Too tart for most people: ' + (tweak || 'use one less lemon in the recipe') + '.';
    if (top === 'sweet') return 'Too sugary for most people: ' + (tweak || 'take a scoop of sugar out of the recipe') + '.';
    if (top === 'watery') {
      if (!taste(sweet, temp).iceHeavy) return 'It tastes thin: ' + (tweak || 'add a lemon to the recipe') + '.';
      cubes = clamp(cubes, 0, Math.max(0, st.recipe.ice - 1));
      return 'All that ice watered it down: at ' + SS.fmtTemp(temp) + ', ' + cubes + (cubes === 1 ? ' cube' : ' cubes') + ' in each cup is plenty.';
    }
    if (top === 'warm') {
      cubes = clamp(cubes, Math.min(D.recipe.ice.max, st.recipe.ice + 1), D.recipe.ice.max);
      return 'People wanted it colder: at ' + SS.fmtTemp(temp) + ', put ' + cubes + ' cubes in each cup and buy enough ice to last all day.';
    }
    if (td.soldOut && rt.soldOutAt != null && rt.soldOutAt < 0.9) {
      itemName = D.items[td.soldOut].name.toLowerCase();
      return 'You ran out of ' + itemName + ' at ' + SS.clockText(rt.soldOutAt) + ', so buy more ' + itemName + ' tomorrow.';
    }
    switch (top) {
      case 'pricey':
        return (m.pricey > 0 ? SS.fmtInt(m.pricey) + ' people walked away at ' + money(price) : 'People winced at ' + money(price)) +
          ': try about ' + money(Math.max(D.price.min, r05(price * 0.88))) + ' tomorrow.';
      case 'cheap': return 'People called ' + money(price) + ' a bargain: they would happily pay about ' + money(r05(price * 1.15)) + '.';
      case 'slow':
        return SS.fmtInt(m.wait + m.quit) + ' people gave up on the line: a bigger pitcher, a faster juicer or a helper keeps it moving, and a higher price thins it out.';
      case 'quiet':
        if (wxId === 'rainy' || wxId === 'storm') return 'Hardly anyone was out in that weather: buy less on wet days and save your cash.';
        if (res.cups < 1 && m.pricey > 0) return 'Nobody would pay ' + money(price) + ': drop the price and people will stop.';
        return loc.name + ' was quiet today: ring the bell, put up a sign, or try a busier spot.';
    }
    if (tweak) return 'Customers loved it: to make it perfect, ' + tweak + '.';
    return 'Customers loved it: keep the recipe, and see if they will pay a little more than ' + money(price) + '.';
  }

  function pickReviews(top) {
    var out = [], byKind = {}, kinds = [], i, k, guard = 0, rng = rt.rng;
    if (rt.vipReview) out.push(rt.vipReview);
    rt.reviews.forEach(function (r) { if (r !== rt.vipReview) { if (!byKind[r.kind]) { byKind[r.kind] = []; kinds.push(r.kind); } byKind[r.kind].push(r); } });
    kinds.sort(function (a, b) { return (a === top ? -1 : 0) - (b === top ? -1 : 0) || byKind[b].length - byKind[a].length; });
    while (out.length < 6 && kinds.length && guard++ < 60) {              // round-robin, most common first
      for (i = 0; i < kinds.length && out.length < 6; i++) {
        k = byKind[kinds[i]];
        out.push(k.splice(Math.floor(rng() * k.length) % k.length, 1)[0]);
        if (!k.length) kinds.splice(i--, 1);
      }
    }
    if (!out.length && top === 'quiet') out.push({ text: line('quiet'), mood: 0, kind: 'quiet', who: 'elder' });
    return out;
  }

  function finalize() {
    var st = SS.state, td = st && st.today, i, c;
    if (!st || !td || !rt || rt.today !== td) return;
    rt.wantClose = false;
    // settle whatever is still in flight
    if (td.serving) { c = rt.map.get(td.serving.id); td.serving = null; if (c && c.state !== 'leave') sendAway(c); }
    for (i = 0; i < td.customers.length; i++) if (td.customers[i]._rev) deliverReview(td.customers[i], true);
    if (rt.ev.critic && !rt.vipServed && rt.vipSeen) {
      nudgeRep(-0.1);
      toast('The food critic left without a drink.', 'bad', 'newspaper');
    }
    while (td.tips.length) collect(td.tips.pop(), true);
    flushRep();

    var m = td.missed, considered = rt.served + m.pricey + m.wait + m.soldout + m.quit;
    var revenue = r2(td.revenue), tips = r2(td.tipsEarned), cost = r2(rt.cost + rt.flavorCost);
    var loyalty = r2(td.loyalty), boostCost = r2(st.boostCost || 0);
    var profit = r2(revenue + tips + loyalty - cost - rt.rent - boostCost);
    // regulars still on their way in or in line at closing came by (streak kept);
    // those who stayed away are listed when they had a streak worth noticing
    st.regulars.forEach(function (g) {
      var listed = false, e = schedFor(g.id);
      rt.regRows.forEach(function (r) { if (r.id === g.id) listed = true; });
      if (listed) return;
      if (e && !e.done && e.cid > 0) { e.done = true; g.visits++; g.lastDay = st.day; regRow(g, 'closed', '', null); }
      else if (g.streak >= 3) regRow(g, 'away', '', null);
    });
    var top = topFeedback(td, considered);
    var res = {
      day: st.day, location: st.location, weather: { type: st.weather.type, temp: st.weather.temp }, event: st.event,
      cups: td.sold, revenue: revenue, tips: tips, ingredientCost: cost, rent: rt.rent, profit: profit,
      people: { passed: rt.passed, served: rt.served, pricey: m.pricey, wait: m.wait, soldout: m.soldout, quit: m.quit },
      satisfaction: rt.satN ? clamp(rt.satSum / rt.satN, 0, 1) : clamp(st.reputation / 5, 0, 1),
      repBefore: rt.repBefore, repAfter: st.reputation,
      reviews: pickReviews(top), topFeedback: top, advice: '',
      hourly: td.hourly.slice(), spoiled: spoilage(st), milestones: [],
      bestDay: st.stats.days > 0 && profit > 0 && profit > st.stats.bestProfit, cashAfter: 0,
      loyalty: loyalty, boostCost: boostCost, boosts: st.boosts.slice(), regulars: rt.regRows
    };
    res.advice = adviceFor(top, st, td, res);
    st.boosts = [];
    st.boostCost = 0;

    st.stats.days++;
    st.stats.bestProfit = Math.max(st.stats.bestProfit, profit);
    st.stats.bestCups = Math.max(st.stats.bestCups, td.sold);
    st.stats.tips = r2(st.stats.tips + tips);
    st.stats.served += rt.served;
    var done = payMilestones(null);
    res.milestones = pendingMilestones.concat(done.map(function (x) { return x.id; }));
    pendingMilestones = [];
    res.cashAfter = st.cash;
    st.history.push({ day: st.day, profit: profit, revenue: revenue, cups: td.sold, weather: st.weather.type, location: st.location });
    if (st.history.length > 30) st.history.splice(0, st.history.length - 30);
    st.lastResult = res;
    st.today = null;
    rt = null;
    st.phase = 'results';
    emit('day:end', { result: res });
    emit('phase', { from: 'day', to: 'results' });
    announceMilestones(done);        // after the phase change, so banners land on the results screen
    persist(true);
  }

  function closeEarly() {
    var st = SS.state;
    if (!st || st.phase !== 'day' || !st.today || !rt || rt.today !== st.today) return false;
    if (rt.busy) { rt.wantClose = true; return true; }      // called from inside a bus handler: finish the step first
    finalize();
    return true;
  }

  function ringBell() {
    var st = SS.state, td = st && st.today;
    if (!st || st.phase !== 'day' || !td || !rt || rt.today !== td || rt.closing || td.bell.cd > 0) return false;
    td.bell.cd = td.bell.max = TUNE.bellCd;
    td.bell.active = TUNE.bellActive;
    emit('bell', {});
    return true;
  }
  function tapStand() {
    var st = SS.state, td = st && st.today;
    if (!st || st.phase !== 'day' || !td || !rt || rt.today !== td || td.pitcher.brew == null) return false;
    if (rt.tapT >= 0 && td.clock - rt.tapT < TUNE.tapGap) return false;
    rt.tapT = td.clock;
    td.pitcher.brew = Math.min(1, td.pitcher.brew + TUNE.tapBoost);
    emit('brew:tap', {});
    return true;
  }
  function collectTip(id) {
    var st = SS.state, td = st && st.today, i;
    if (!st || st.phase !== 'day' || !td || !rt || rt.today !== td) return false;
    for (i = 0; i < td.tips.length; i++) {
      if (td.tips[i].id === id) { collect(td.tips.splice(i, 1)[0], false); return true; }
    }
    return false;
  }

  function nextDay() {
    var st = SS.state;
    if (!st || st.phase !== 'results') return false;
    var sp = spoilage(st);
    st.stock.lemons = Math.max(0, st.stock.lemons - sp.lemons);
    st.stock.ice = Math.max(0, st.stock.ice - sp.ice);
    if (st.lastResult) st.lastResult.spoiled = sp;
    st.day++;
    startPrep();
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Shop
   * ------------------------------------------------------------------ */
  function upgradeInfo(id) {
    var st = SS.state, d = upDef(id);
    if (!st || !d) return { level: 0, max: 0, next: null, canAfford: false };
    var l = upLevel(id), nx = l < d.levels.length ? d.levels[l] : null;
    return { level: l, max: d.levels.length, next: nx ? { cost: nx.cost, label: nx.label, value: nx.value } : null, canAfford: !!nx && st.cash + 1e-9 >= nx.cost };
  }
  function buyUpgrade(id) {
    var st = SS.state, d = upDef(id);
    if (!st || !d) return { ok: false, reason: 'That upgrade does not exist.' };
    if (!shopOpen(st)) return { ok: false, reason: SHOP_CLOSED };
    var l = upLevel(id), nx = d.levels[l];
    if (!nx) return { ok: false, reason: 'Your ' + d.name.toLowerCase() + ' is already the best there is.' };
    if (st.cash + 1e-9 < nx.cost) return { ok: false, reason: 'You need ' + money(nx.cost - st.cash) + ' more for that.' };
    st.cash = r2(st.cash - nx.cost);
    st.upgrades[id] = l + 1;
    if (id === 'cooler' && st.phase === 'results' && st.lastResult) st.lastResult.spoiled = spoilage(st);   // it saves tonight's ice too
    emit('upgrade:buy', { id: id, level: l + 1 });
    emit('cash', { amount: st.cash, delta: -nx.cost, reason: 'upgrade' });
    shopMilestones();
    afterPrepSpend(st);
    persist(true);
    return { ok: true, reason: '' };
  }

  function locationInfo(id) {
    var st = SS.state, d = D.byId(D.locations, id);
    if (!st || !d) return { unlocked: false, current: false, canUnlock: false, reason: 'That place does not exist.' };
    var unlocked = st.unlockedLocations.indexOf(id) >= 0, reason = '';
    if (!unlocked) {
      if (st.reputation + 1e-9 < d.repReq) reason = d.name + ' needs ' + stars(d.repReq) + ' stars. You have ' + stars(Math.floor(st.reputation * 10) / 10) + '.';
      else if (st.cash + 1e-9 < d.unlockCost) reason = 'You need ' + money(d.unlockCost - st.cash) + ' more to set up at ' + d.name + '.';
    }
    return { unlocked: unlocked, current: st.location === id, canUnlock: !unlocked && !reason, reason: reason };
  }
  function unlockLocation(id) {
    var st = SS.state, d = D.byId(D.locations, id);
    if (!st || !d) return { ok: false, reason: 'That place does not exist.' };
    if (!shopOpen(st)) return { ok: false, reason: SHOP_CLOSED };
    var info = locationInfo(id);
    if (info.unlocked) return { ok: false, reason: 'You can already set up at ' + d.name + '.' };
    if (!info.canUnlock) return { ok: false, reason: info.reason };
    st.cash = r2(st.cash - d.unlockCost);
    st.unlockedLocations.push(id);
    emit('location:unlock', { id: id });
    if (d.unlockCost > 0) emit('cash', { amount: st.cash, delta: -d.unlockCost, reason: 'location' });
    shopMilestones();
    afterPrepSpend(st);
    persist(true);
    return { ok: true, reason: '' };
  }
  function setLocation(id) {
    var st = SS.state, d = D.byId(D.locations, id);
    if (!st || !d) return { ok: false, reason: 'That place does not exist.' };
    if (!shopOpen(st)) return { ok: false, reason: 'You can move the stand before you open, not while it is open.' };
    if (st.unlockedLocations.indexOf(id) < 0) return { ok: false, reason: 'Unlock ' + d.name + ' first.' };
    if (st.location !== id && st.phase === 'prep' && st.boosts && st.boosts.length) {
      return { ok: false, reason: 'Dex priced your boosts for ' + locDef(st.location).name + ', so you open there today.' };
    }
    if (st.location !== id) {
      st.location = id;
      emit('location:set', { id: id });
      afterPrepSpend(st);
      persist(false);
    }
    return { ok: true, reason: '' };
  }

  function flavorInfo(id) {
    var st = SS.state, f = D.byId(D.flavors, id);
    if (!st || !f) return { owned: false, current: false, canBuy: false, reason: 'That flavor does not exist.' };
    var owned = st.flavors.indexOf(id) >= 0, reason = '';
    if (!owned) {
      if (f.limited) reason = 'Only Dex the Dealer sells this, and only on some days.';
      else if (st.reputation + 1e-9 < f.repReq) reason = f.name + ' needs ' + stars(f.repReq) + ' stars. You have ' + stars(Math.floor(st.reputation * 10) / 10) + '.';
      else if (st.cash + 1e-9 < f.cost) reason = 'You need ' + money(f.cost - st.cash) + ' more for ' + f.name + '.';
    }
    return { owned: owned, current: st.flavor === id, canBuy: !owned && !reason, reason: reason };
  }
  function buyFlavor(id) {
    var st = SS.state, f = D.byId(D.flavors, id);
    if (!st || !f) return { ok: false, reason: 'That flavor does not exist.' };
    if (!shopOpen(st)) return { ok: false, reason: SHOP_CLOSED };
    var info = flavorInfo(id);
    if (info.owned) return { ok: false, reason: 'You already have ' + f.name + '.' };
    if (!info.canBuy) return { ok: false, reason: info.reason };
    st.cash = r2(st.cash - f.cost);
    st.flavors.push(id);
    st.flavor = id;                                   // you bought it to pour it
    emit('flavor:buy', { id: id });
    if (f.cost > 0) emit('cash', { amount: st.cash, delta: -f.cost, reason: 'flavor' });
    emit('flavor:set', { id: id });
    shopMilestones();
    afterPrepSpend(st);
    persist(true);
    return { ok: true, reason: '' };
  }

  /* ------------------------------------------------------------------ *
   * Regulars and Dex the Dealer
   * ------------------------------------------------------------------ */
  function regularsInfo() {
    var st = SS.state;
    if (!st || !Array.isArray(st.regulars)) return [];
    return st.regulars.map(function (g) {
      return { id: g.id, name: g.name, kind: g.kind, seed: g.seed, streak: g.streak, best: g.best, visits: g.visits,
        mult: SS.loyaltyMult(g.streak), since: g.since, lastDay: g.lastDay };
    }).sort(function (a, b) { return b.streak - a.streak || b.best - a.best || a.since - b.since; });
  }

  /** Does Dex carry a limited flavor today? Pure (seed, day): about limitedChance of days, never more than limitedPity apart. */
  function limitedDay(seed, day) {
    if (day < 3) return false;
    var from = Math.max(3, day - 400), last = from - 3, d;
    for (d = from; d <= day; d++) if (d - last >= TUNE.limitedPity || dayRng(seed, d, 37)() < TUNE.limitedChance) last = d;
    return last === day;
  }
  /** '' or why a boost would do nothing for this player right now */
  function boostUseless(id, st) {
    if ((id === 'shield' || id === 'hype') && !(st.regulars && st.regulars.length)) return 'You do not have any regulars yet, so this would do nothing.';
    if (id === 'frost' && upVal('cooler') >= 1) return 'Your mini freezer already keeps every cube frozen.';
    if (id === 'hype' && st.phase === 'day' && rt && rt.today && rt.today.t > TUNE.regLast - 0.05) return 'Too late in the day. Your regulars could not get here before closing.';
    if (id === 'hype' && st.phase === 'day' && rt && rt.sched && st.regulars.every(function (g) { return !!schedFor(g.id); })) return 'All your regulars are already coming by today.';
    return '';
  }
  /** Dex restocks once a day, from day 2; a reload never re-rolls today's stock. */
  function rollDealer(st) {
    if (st.day < 2) { st.dealer = null; return; }
    if (st.dealer && st.dealer.day === st.day) return;
    var r = dayRng(st.seed, st.day, 31), pool = [], offers = [], i;
    D.boosts.forEach(function (b) { if (!boostUseless(b.id, st)) pool.push(b.id); });
    for (i = 0; i < 3 && pool.length; i++) offers.push({ id: pool.splice(Math.floor(r() * pool.length) % pool.length, 1)[0], kind: 'boost', sold: false });
    if (limitedDay(st.seed, st.day)) {
      var lim = D.flavors.filter(function (f) { return f.limited && st.flavors.indexOf(f.id) < 0; }).sort(function (a, b) { return a.cost - b.cost; });
      var u = r(), k = Math.min(lim.length - 1, u < 0.6 ? 0 : u < 0.88 ? 1 : 2);      // usually the cheapest you do not have yet
      if (lim.length) offers.push({ id: lim[k].id, kind: 'limited', sold: false });
    }
    st.dealer = { day: st.day, offers: offers };
  }
  function dealerHere(st) {
    return !!st && (st.phase === 'prep' || st.phase === 'day') && st.day >= 2 && !!st.dealer && st.dealer.day === st.day && Array.isArray(st.dealer.offers);
  }
  function dealCost(st, o) {
    if (o.kind === 'limited') return flavorDef(o.id).cost;
    var s = TUNE.dealerScale[locIndex(st.location)] || 1;
    return Math.max(0.5, Math.round(boostDef(o.id).cost * s * 2) / 2);
  }
  function dealReason(st, o) {
    if (!dealerHere(st)) return 'Dex is not around right now.';
    if (st.phase === 'day' && (!rt || rt.closing)) return 'The stand is closing. Dex will be back tomorrow.';
    if (o.sold) return 'Sold out. Dex will have fresh stock tomorrow.';
    if (o.kind === 'boost') {
      if (boostOn(o.id)) return 'Already working for you today.';
      var why = boostUseless(o.id, st);
      if (why) return why;
    } else if (st.flavors.indexOf(o.id) >= 0) return 'You already have ' + flavorDef(o.id).name + '.';
    var cost = dealCost(st, o), keep = st.phase === 'prep' ? loanNeed(st) : 0;
    if (st.cash + 1e-9 < cost) return 'You need ' + money(cost - st.cash) + ' more for that.';
    return st.cash - cost + 1e-9 < keep ? 'Keep ' + money(keep) + ' for supplies first. You would have ' + money(st.cash - cost) + ' left.' : '';
  }
  function dexLine(st) {
    var left = 0, lim = null, pool;
    st.dealer.offers.forEach(function (o) { if (!o.sold) { left++; if (o.kind === 'limited') lim = flavorDef(o.id).name; } });
    pool = !left && st.dealer.offers.length ? DEX.sold : lim ? DEX.limited : DEX.any;
    return pool[Math.floor(dayRng(st.seed, st.day, 41)() * pool.length) % pool.length].replace('{name}', lim || '');
  }
  function dealerInfo() {
    var st = SS.state, active = st && Array.isArray(st.boosts) ? st.boosts.slice() : [];
    if (!dealerHere(st)) return { present: false, line: '', offers: [], active: active };
    return {
      present: true, line: dexLine(st), active: active,
      offers: st.dealer.offers.map(function (o) {
        var lim = o.kind === 'limited', d = lim ? flavorDef(o.id) : boostDef(o.id), why = dealReason(st, o);
        return { id: o.id, kind: o.kind, name: d.name, icon: lim ? 'drink' : d.icon, color: d.color, cost: dealCost(st, o), sold: o.sold, canBuy: !why, reason: why,
          desc: lim ? d.blurb + ' People pay about ' + Math.round(d.wtp * 100) + '% more for it, and it is yours to keep.' : d.desc };
      })
    };
  }
  function buyDeal(id) {
    var st = SS.state, o = null;
    if (!st) return { ok: false, reason: 'Start a game first.' };
    if (!dealerHere(st)) return { ok: false, reason: st.phase === 'results' ? 'Dex has packed up for the night. He will be back in the morning.' : 'Dex is not around right now.' };
    st.dealer.offers.forEach(function (x) { if (x.id === id) o = x; });
    if (!o) return { ok: false, reason: 'Dex does not have that today.' };
    var why = dealReason(st, o), cost = dealCost(st, o);
    if (why) return { ok: false, reason: why };
    st.cash = r2(st.cash - cost);
    o.sold = true;
    emit('dealer:buy', { id: id, kind: o.kind, cost: cost });
    if (o.kind === 'boost') {
      if (!Array.isArray(st.boosts)) st.boosts = [];
      st.boosts.push(id);
      st.boostCost = r2((st.boostCost || 0) + cost);
      if (id === 'hype' && st.phase === 'day') hypeRest(st);
      emit('boost:on', { id: id });
    } else {
      st.flavors.push(id);
      emit('flavor:buy', { id: id });
      if (st.phase === 'prep') { st.flavor = id; emit('flavor:set', { id: id }); }     // you bought it to pour it
    }
    emit('cash', { amount: st.cash, delta: -cost, reason: 'dealer' });
    shopMilestones();
    afterPrepSpend(st);
    persist(true);
    return { ok: true, reason: '' };
  }
  function boostActive(id) { return boostOn(id); }

  function milestoneProgress(id) {
    var st = SS.state, m = D.byId(D.milestones, id);
    if (!st || !m) return { value: 0, target: 1, pct: 0, done: false };
    var done = st.milestonesDone.indexOf(id) >= 0, target = milestoneTarget(m), value = milestoneValue(m, st);
    if (m.kind === 'dayCups' && st.today) value = Math.max(value, st.today.sold);
    if (done) value = Math.max(value, target);
    return { value: value, target: target, pct: done ? 100 : clamp(value / target, 0, 1) * 100, done: done };
  }

  /* ------------------------------------------------------------------ *
   * Game lifecycle and settings
   * ------------------------------------------------------------------ */
  function init() {
    var raw = readRaw();
    rt = null; pendingMilestones = [];
    SS.state = freshState(newSeed(), raw ? raw.settings : null);
  }
  function hasSave() { return isGame(readRaw()); }
  function saveSummary() {
    var raw = readRaw(), st = isGame(raw) ? repair(raw) : null;
    return st ? { day: st.day, cash: st.cash, reputation: st.reputation, location: st.location } : null;
  }
  function newGame(seed) {
    var old = SS.state, from = old ? old.phase : 'title';
    rt = null; pendingMilestones = [];
    SS.state = freshState(typeof seed === 'number' && isFinite(seed) ? seed : newSeed(), old ? old.settings : null);
    SS.state.phase = from === 'day' ? 'title' : from;      // so the 'phase' event reports where we came from
    startPrep();
  }
  function continueGame() {
    var raw = readRaw(), st = isGame(raw) ? repair(raw) : null;
    if (!st) return false;
    var from = SS.state ? SS.state.phase : 'title';
    rt = null; pendingMilestones = [];
    st.phase = raw.phase === 'results' && st.lastResult ? 'results' : 'prep';
    SS.state = st;
    if (!st.market || !st.forecast) {                       // older save: the morning is rolled again, identically
      var m = rollMorning(st);
      st.market = m.market; st.forecast = m.forecast;
      st.event = m.event && m.event.known ? m.event : null;
      if (st.phase === 'prep') st.weather = { type: m.forecast.type, temp: m.forecast.temp };
    }
    if (st.phase === 'prep') { trimCart(st); rollDealer(st); }     // older saves have no dealer yet
    emit('phase', { from: from, to: st.phase });
    return true;
  }
  function wipeSave() {
    try { var s = store(); if (s) s.removeItem(SS.SAVE_KEY); } catch (e) { /* nothing to wipe */ }
  }
  function setSetting(key, value) {
    var st = SS.state;
    if (!st) return false;
    if (key === 'speed') { value = Number(value); if (value !== 1 && value !== 2 && value !== 3) return false; }
    else if (key === 'sfx' || key === 'music' || key === 'reducedMotion') value = !!value;
    else return false;
    st.settings[key] = value;
    emit('settings', { key: key, value: value });
    persist(false);
    return true;
  }
  function setBounds(minX, maxX) {
    minX = Number(minX); maxX = Number(maxX);
    if (!isFinite(minX) || !isFinite(maxX) || maxX - minX < 200) return;
    bounds.min = minX; bounds.max = maxX;
  }

  SS.Sim = {
    init: init, hasSave: hasSave, saveSummary: saveSummary, newGame: newGame, continueGame: continueGame,
    save: function () { return persist(true); }, wipeSave: wipeSave, setSetting: setSetting, setBounds: setBounds,
    startPrep: startPrep, setCart: setCart, cartCost: cartCost, prepInfo: prepInfo, setRecipe: setRecipe, setPrice: setPrice,
    setFlavor: setFlavor, canStartDay: canStartDay, startDay: startDay,
    update: update, ringBell: ringBell, tapStand: tapStand, collectTip: collectTip, closeEarly: closeEarly,
    nextDay: nextDay,
    upgradeInfo: upgradeInfo, buyUpgrade: buyUpgrade, locationInfo: locationInfo, unlockLocation: unlockLocation, setLocation: setLocation,
    flavorInfo: flavorInfo, buyFlavor: buyFlavor, milestoneProgress: milestoneProgress,
    regularsInfo: regularsInfo, dealerInfo: dealerInfo, buyDeal: buyDeal, boostActive: boostActive,
    cupsPerPitcher: cupsPerPitcher, brewTime: brewTime, serveTime: serveTime, rent: rent,
    TUNE: TUNE
  };
})();
