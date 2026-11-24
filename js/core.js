/* Squeeze Street — core.js
 * Namespace, event bus, helpers, data tables and the state shape.
 * THIS FILE IS THE CONTRACT every other module builds against.
 * Classic script (no ES modules) so the game runs from file:// and loads in node for tests.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var SS = (root.SS = root.SS || {});

  SS.VERSION = '1.0.0';
  SS.CURRENCY = '$';
  SS.SAVE_KEY = 'squeeze-street-save-v1';

  /* ------------------------------------------------------------------ *
   * World geometry (world units; the renderer maps them to pixels)
   * x grows to the right. "lane" is depth on the sidewalk: 0 = back (by the
   * buildings), 1 = front (by the curb, nearest the camera).
   * ------------------------------------------------------------------ */
  SS.W = {
    STAND_X: 500,        // centre of the stand counter
    STAND_W: 180,        // counter width (410..590)
    STAND_LANE: 0.3,     // depth of the stand's base; lower lanes pass behind it
    SERVE_X: 372,        // where the customer being served stands (queue slot 0)
    QUEUE_GAP: 44,       // slot i stands at SERVE_X - i * QUEUE_GAP
    QUEUE_LANE: 0.55,    // everyone in line stands on this lane
    SIDEWALK_H: 90,      // depth of the walkable band, world units
    CHAR_H: 110,         // an adult is about this tall, world units
    // Passers-by keep to these lanes so nobody walks through the line:
    PASS_LANES: [[0.04, 0.2], [0.72, 1.0]],
    // Dex the Dealer stands here, beside the stand, between the back lanes and the line
    DEALER_X: 735,
    DEALER_LANE: 0.3
  };

  /* Regulars ----------------------------------------------------------
   * A regular's loyalty multiplier from their streak (happy visits in a row).
   * Shared so the sim, the art and the screens always show the same number. */
  SS.LOYALTY = { step: 0.1, max: 2 };        // x1.1 per happy visit in a row, topping out at x2.0 (a 10-visit streak)
  // The multiplier is a bonus paid on top of the price; it does not raise the most a regular will pay per cup.
  SS.loyaltyMult = function (streak) {
    return Math.min(SS.LOYALTY.max, 1 + SS.LOYALTY.step * Math.max(0, Math.floor(Number(streak) || 0)));
  };
  /** "x1.4" style label for a multiplier */
  SS.fmtMult = function (m) { return 'x' + (Math.round((Number(m) || 1) * 10) / 10).toFixed(1); };

  /* Sim time ---------------------------------------------------------- */
  SS.DAY_LENGTH = 75;    // seconds of sim time in one business day (speed 1x)
  SS.OPEN_HOUR = 9;
  SS.CLOSE_HOUR = 18;
  /** "9:00 AM" style clock label for day progress t in 0..1 */
  SS.clockText = function (t) {
    var mins = Math.round((SS.OPEN_HOUR + (SS.CLOSE_HOUR - SS.OPEN_HOUR) * SS.clamp(t, 0, 1)) * 60 / 5) * 5;
    var h = Math.floor(mins / 60), m = mins % 60;
    return ((h + 11) % 12 + 1) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
  };

  /* ------------------------------------------------------------------ *
   * Math helpers
   * ------------------------------------------------------------------ */
  SS.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  SS.lerp = function (a, b, t) { return a + (b - a) * t; };
  SS.remap = function (v, a, b, c, d) { return c + (d - c) * SS.clamp((v - a) / (b - a), 0, 1); };
  SS.smooth = function (t) { t = SS.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  /** frame-rate independent approach: value moves toward target */
  SS.damp = function (v, target, rate, dt) { return SS.lerp(v, target, 1 - Math.exp(-rate * dt)); };
  SS.ease = {
    inCubic: function (t) { return t * t * t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outQuint: function (t) { return 1 - Math.pow(1 - t, 5); },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    outBack: function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outElastic: function (t) {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
    },
    outBounce: function (t) {
      var n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    }
  };
  /** deterministic 0..1 hash of an integer (visual variety that never flickers) */
  SS.hash = function (n) {
    n = (n | 0) + 0x6D2B79F5 | 0;
    var t = Math.imul(n ^ (n >>> 15), 1 | n);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** seeded PRNG: const rnd = SS.mulberry32(seed); rnd() -> 0..1 */
  SS.mulberry32 = function (a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** Shared lighting curve so every art layer agrees on when it is dark.
   *  dayT is cyclic 0..1.6 (0 sunrise, 0.5 noon, 1.0 sunset, 1.3 deep night).
   *  -> { night: 0..1 (lamps and windows switch on above ~0.3),
   *       warm: 0..1 (golden-hour glow, peaks at sunrise and sunset),
   *       sun: 0..1 (sun height, 0 below the horizon) } */
  SS.light = function (dayT) {
    var d = ((dayT % 1.6) + 1.6) % 1.6, night, warm;
    if (d < 0.06) night = SS.lerp(0.35, 0, SS.smooth(d / 0.06));
    else if (d < 0.96) night = 0;
    else if (d < 1.3) night = SS.smooth((d - 0.96) / 0.34);
    else if (d < 1.5) night = 1;
    else night = SS.lerp(1, 0.35, SS.smooth((d - 1.5) / 0.1));
    var set = Math.max(0, 1 - Math.abs(d - 1.0) / 0.24), rise = Math.max(0, 1 - Math.min(d, 1.6 - d) / 0.13);
    warm = Math.max(SS.smooth(set), 0.8 * SS.smooth(rise));
    return { night: night, warm: warm, sun: d <= 1 ? Math.sin(Math.PI * d) : 0 };
  };

  /* Formatting -------------------------------------------------------- */
  SS.fmtMoney = function (n) {
    n = Number(n) || 0;
    var neg = n < -0.004, a = Math.abs(n);
    var s = a.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + SS.CURRENCY + s;
  };
  SS.fmtInt = function (n) { return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  SS.fmtTemp = function (c) { return Math.round(c) + '°C'; };

  /* ------------------------------------------------------------------ *
   * Event bus. Handlers are isolated: one throwing never breaks the rest.
   * ------------------------------------------------------------------ */
  var handlers = {};
  SS.on = function (evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); return fn; };
  SS.off = function (evt, fn) { var l = handlers[evt]; if (l) { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } };
  SS.emit = function (evt, payload) {
    var l = handlers[evt];
    if (!l) return;
    l = l.slice();
    for (var i = 0; i < l.length; i++) {
      try { l[i](payload); } catch (e) { if (root.console) console.error('[SS] handler for "' + evt + '" threw', e); }
    }
  };

  /* Bus events (payloads) ----------------------------------------------
   * Sim -> everyone
   *   'phase'            {from, to}            to: 'title'|'prep'|'day'|'results'
   *   'day:start'        {day, weather, event}
   *   'day:end'          {result}              result is a DayResult (see below)
   *   'customer:spawn'   {c}
   *   'customer:join'    {c}                   joined the line
   *   'customer:balk'    {c, reason}           'pricey'|'wait'|'soldout'  (walked on without buying)
   *   'customer:quit'    {c}                   ran out of patience in line
   *   'pour'             {c, duration}         vendor starts pouring for c
   *   'sale'             {c, price, qty, x, lane}
   *   'review'           {c, text, mood, kind} mood -1..1, kind = feedback key
   *   'tip:drop'         {tip}                 tip = {id, x, lane, amount, ttl}
   *   'tip:collect'      {tip, auto}
   *   'brew:start'       {duration}
   *   'brew:done'        {cups}
   *   'brew:tap'         {}                    player tapped the stand to squeeze faster
   *   'soldout'          {missing}             'lemons'|'sugar'|'ice'|'cups'
   *   'bell'             {}
   *   'weather:change'   {type, temp}
   *   'event:trigger'    {id, title, desc, icon}   mid-day surprise or morning news
   *   'cash'             {amount, delta, reason}   reason: 'sale'|'tip'|'loyalty'|'milestone'|'loan' (money in)
   *                                            'supplies'|'flavor'|'upgrade'|'location'|'dealer' (money out)
   *   'reputation'       {value, delta}
   *   'milestone'        {id, title, reward}
   *   'win'              {}                    final milestone reached
   *   'upgrade:buy'      {id, level}
   *   'flavor:buy'       {id}        'flavor:set' {id}
   *   'location:unlock'  {id}        'location:set' {id}
   *   'cart'  'recipe'  'price'      {}        prep values changed (re-read state)
   *   'settings'         {key, value}
   *   'toast'            {text, kind, icon}    kind: 'info'|'good'|'bad'
   *   'save'             {}
   *   -- regulars --
   *   'regular:new'      {regular, c}          a happy customer decided to come back (c = that customer)
   *   'regular:visit'    {regular, c}          a regular has turned up today and is walking in
   *   'regular:streak'   {regular, c, streak, mult}   served and happy: streak went up (streak/mult are the NEW values)
   *   'regular:broken'   {regular, c, reason, shielded}   reason: 'taste'|'pricey'|'slow'|'wait'|'soldout'|'quit'
   *                                            shielded true = a Streak Shield boost saved it (streak unchanged)
   *   'regular:lost'     {regular}             two bad visits in a row: they stopped coming
   *   'loyalty'          {c, amount, mult}     a regular paid a loyalty bonus on top of the price
   *   -- Dex the Dealer --
   *   'dealer:buy'       {id, kind, cost}      kind 'boost' | 'limited'
   *   'boost:on'         {id}                  a boost became active (bought, or carried into the day)
   * Actors -> everyone (Dex's show; purely visual, the sim never listens)
   *   'dealer:setup'     {step, i?, quiet?}    Dex setting up / packing up in the scene, in this order:
   *       'arrive'  he starts rolling his trunk in from off the right edge (morning prep on a day he visits)
   *       'park'    he reaches his spot and kicks the wheel brake
   *       'open'    the trunk lid swings open
   *       'bottle'  one bottle pops up onto the display, i = 0.. in offer order
   *       'sign'    the pole shoots up and the DEX'S DEALS sign drops in on its chains
   *       'ready'   fully set up: tappable, Deals button may show, banners and tips may run
   *       'leave'   closing time: he packs up and rolls off to the right (in the day's last seconds; at 'results' if he could not)
   *       'gone'    off screen
   *     Reduced motion goes from 'arrive' straight to 'ready' in the same frame. 'ready' listeners already see dealerReady()
   *     true and his parked dealerPos(). quiet: true = he snapped in or out with no show (loading into phase 'day', opening
   *     for business mid-show, the game moving on): 'ready', or 'leave' then 'gone', with no fanfare.
   * UI -> everyone
   *   'pause'            {paused}
   *   'ui:open' / 'ui:close' {name}
   */

  /* Pause flag (UI owns it, main loop obeys it) ----------------------- */
  SS.paused = false;
  SS.setPaused = function (p) {
    p = !!p;
    if (p === SS.paused) return;
    SS.paused = p;
    SS.emit('pause', { paused: p });
  };

  /** Play a named sound if the audio module is present. UI modules call this for
   *  pure-UI sounds only: click, tick, open, close, error, tally, whoosh.
   *  Sim-driven sounds (coin, pour, bell, ...) are played by audio.js from bus events. */
  SS.sfx = function (name, opts) { if (SS.Audio && SS.Audio.play) { try { SS.Audio.play(name, opts); } catch (e) { /* audio is optional */ } } };

  /** true when animation should be toned down (setting or OS preference) */
  SS.reduced = function () {
    if (SS.state && SS.state.settings && SS.state.settings.reducedMotion) return true;
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  /* ------------------------------------------------------------------ *
   * DATA TABLES
   * ids, field names and structure are frozen. Only the sim author may tune
   * the numbers (costs, multipliers, targets).
   * ------------------------------------------------------------------ */
  var DATA = (SS.DATA = {});

  // Ingredients are bought in packs each morning. base = pack price on a normal day.
  DATA.items = {
    lemons: { name: 'Lemons', unit: 'lemon', pack: 12, base: 2.6, icon: 'lemon' },
    sugar: { name: 'Sugar', unit: 'scoop', pack: 12, base: 1.8, icon: 'sugar' },
    ice: { name: 'Ice', unit: 'cube', pack: 60, base: 1.2, icon: 'ice' },
    cups: { name: 'Cups', unit: 'cup', pack: 30, base: 1.5, icon: 'cup' }
  };
  DATA.itemOrder = ['lemons', 'sugar', 'ice', 'cups'];

  // Recipe: lemons and sugar are "per 10 cups"; ice is cubes per cup.
  DATA.recipe = {
    lemons: { min: 1, max: 12, step: 1, start: 4, label: 'Lemons', per: 'per 10 cups' },
    sugar: { min: 0, max: 12, step: 1, start: 4, label: 'Sugar', per: 'per 10 cups' },
    ice: { min: 0, max: 5, step: 1, start: 2, label: 'Ice', per: 'per cup' }
  };
  DATA.price = { min: 0.25, max: 20, step: 0.05, start: 1.0 };
  DATA.startCash = 20;
  DATA.startReputation = 2.0;      // 0..5 stars

  DATA.weather = {
    sunny: { name: 'Sunny', icon: 'sun', traffic: 1.0, thirst: 1.0, temp: [22, 30] },
    heatwave: { name: 'Heat wave', icon: 'heat', traffic: 0.95, thirst: 1.6, temp: [33, 39] },
    cloudy: { name: 'Cloudy', icon: 'cloud', traffic: 0.85, thirst: 0.72, temp: [16, 23] },
    rainy: { name: 'Rainy', icon: 'rain', traffic: 0.45, thirst: 0.42, temp: [13, 19] },
    storm: { name: 'Thunderstorm', icon: 'storm', traffic: 0.25, thirst: 0.3, temp: [14, 20] }
  };

  // Who walks by. wtp = willingness-to-pay multiplier, sweet = recipe taste lean (-1 tart .. +1 sweet).
  DATA.kinds = {
    kid: { name: 'Kid', wtp: 0.7, patience: 0.8, speed: 1.1, sweet: 1.0, tip: 0.04, thirst: 1.1 },
    teen: { name: 'Teen', wtp: 0.9, patience: 0.7, speed: 1.05, sweet: 0.4, tip: 0.07, thirst: 1.0 },
    parent: { name: 'Parent', wtp: 1.1, patience: 1.0, speed: 0.9, sweet: 0.0, tip: 0.15, thirst: 1.0 },
    jogger: { name: 'Jogger', wtp: 1.2, patience: 0.5, speed: 1.75, sweet: -0.5, tip: 0.1, thirst: 1.5 },
    elder: { name: 'Neighbor', wtp: 1.0, patience: 1.5, speed: 0.6, sweet: -0.2, tip: 0.25, thirst: 0.9 },
    tourist: { name: 'Tourist', wtp: 1.5, patience: 0.9, speed: 0.8, sweet: 0.2, tip: 0.3, thirst: 1.1 },
    office: { name: 'Office worker', wtp: 1.7, patience: 0.45, speed: 1.3, sweet: -0.6, tip: 0.2, thirst: 1.0 },
    skater: { name: 'Skater', wtp: 0.85, patience: 0.6, speed: 2.0, sweet: 0.3, tip: 0.05, thirst: 1.2 },
    vip: { name: 'Food critic', wtp: 3.0, patience: 1.2, speed: 0.8, sweet: 0.0, tip: 0.9, thirst: 2.0 }
  };

  DATA.locations = [
    { id: 'street', name: 'Maple Street', blurb: 'Your own front yard. Quiet, friendly and free.',
      rent: 0, unlockCost: 0, repReq: 0, traffic: 1.0, wtp: 1.0,
      mix: { kid: 4, parent: 3, elder: 2, teen: 2, jogger: 1 } },
    { id: 'park', name: 'Meadow Park', blurb: 'Joggers, picnics and a steady stream of families.',
      rent: 6, unlockCost: 60, repReq: 2.2, traffic: 1.5, wtp: 1.15,
      mix: { jogger: 4, parent: 3, kid: 3, teen: 2, elder: 1, skater: 2 } },
    { id: 'beach', name: 'Driftwood Beach', blurb: 'Packed when it is hot. Empty when it rains.',
      rent: 15, unlockCost: 220, repReq: 3.0, traffic: 2.1, wtp: 1.35,
      mix: { tourist: 5, teen: 3, kid: 2, parent: 2, skater: 1 } },
    { id: 'downtown', name: 'Downtown Plaza', blurb: 'Busy people with deep pockets and no time to wait.',
      rent: 32, unlockCost: 600, repReq: 3.6, traffic: 2.8, wtp: 1.7,
      mix: { office: 6, tourist: 2, teen: 1, elder: 1, jogger: 1 } },
    { id: 'carnival', name: 'Starlight Carnival', blurb: 'Lights, music and the longest lines in town.',
      rent: 60, unlockCost: 1500, repReq: 4.2, traffic: 3.8, wtp: 2.1,
      mix: { tourist: 4, kid: 4, teen: 4, parent: 3, office: 1 } }
  ];

  // Upgrade level 0 = not bought ("base" value applies). levels[i] is level i+1.
  DATA.upgrades = [
    { id: 'pitcher', name: 'Pitcher', icon: 'pitcher', desc: 'Holds more cups, so you stop to mix less often.', base: 8,
      levels: [{ cost: 25, value: 12, label: 'Glass jug · 12 cups' }, { cost: 90, value: 18, label: 'Party dispenser · 18 cups' }, { cost: 260, value: 26, label: 'Mega tank · 26 cups' }] },
    { id: 'juicer', name: 'Juicer', icon: 'juicer', desc: 'Mixes each new batch faster.', base: 6,
      levels: [{ cost: 30, value: 4.2, label: 'Hand press · 4.2s a batch' }, { cost: 110, value: 2.8, label: 'Electric juicer · 2.8s' }, { cost: 320, value: 1.4, label: 'Turbo squeezer · 1.4s' }] },
    { id: 'cooler', name: 'Cooler', icon: 'cooler', desc: 'Stops ice melting in the sun and overnight.', base: 0,
      levels: [{ cost: 20, value: 0.4, label: 'Picnic cooler · saves 40% of ice' }, { cost: 85, value: 0.75, label: 'Ice chest · saves 75%' }, { cost: 240, value: 1, label: 'Mini freezer · ice never melts' }] },
    { id: 'stand', name: 'Stand', icon: 'stand', desc: 'A better-looking stand turns more heads.', base: 0,
      levels: [{ cost: 45, value: 0.15, label: 'Wooden stand · +15% customers' }, { cost: 180, value: 0.32, label: 'Painted kiosk · +32%' }, { cost: 520, value: 0.55, label: 'Deluxe cart · +55%' }] },
    { id: 'awning', name: 'Shade', icon: 'awning', desc: 'Keeps the line comfortable in heat and rain.', base: 0,
      levels: [{ cost: 35, value: 0.35, label: 'Beach umbrella' }, { cost: 140, value: 0.7, label: 'Striped awning' }] },
    { id: 'sign', name: 'Signs', icon: 'sign', desc: 'People notice you from further away.', base: 0,
      levels: [{ cost: 15, value: 0.1, label: 'Hand-painted sign · +10% notice' }, { cost: 70, value: 0.22, label: 'Sandwich board · +22%' }, { cost: 230, value: 0.4, label: 'Neon sign · +40%' }] },
    { id: 'tipjar', name: 'Tip jar', icon: 'tipjar', desc: 'Happy customers leave a little extra.', base: 0,
      levels: [{ cost: 25, value: 1, label: 'Tip jar · tips collect themselves' }, { cost: 120, value: 2, label: 'Golden jar · bigger tips' }] },
    { id: 'helper', name: 'Helper', icon: 'helper', desc: 'An extra pair of hands at the counter.', base: 0,
      levels: [{ cost: 150, value: 1, label: 'Little sibling · serve 40% faster' }, { cost: 480, value: 2, label: 'Best friend · serve 80% faster' }] },
    { id: 'speaker', name: 'Music', icon: 'speaker', desc: 'Good tunes keep the line waiting longer.', base: 0,
      levels: [{ cost: 55, value: 0.25, label: 'Pocket radio · +25% patience' }, { cost: 210, value: 0.5, label: 'Boombox · +50% patience' }] }
  ];

  // wtp = extra willingness to pay (fraction). extraCost = added cost per 10 cups.
  DATA.flavors = [
    { id: 'classic', name: 'Classic Lemon', color: '#FFE14D', cost: 0, repReq: 0, wtp: 0, extraCost: 0, blurb: 'The one that started it all.' },
    { id: 'pink', name: 'Pink Berry', color: '#FF8FB3', cost: 80, repReq: 2.4, wtp: 0.15, extraCost: 0.4, blurb: 'A swirl of strawberry.' },
    { id: 'mint', name: 'Cool Mint', color: '#9DEBA5', cost: 200, repReq: 3.0, wtp: 0.25, extraCost: 0.6, blurb: 'Extra refreshing on hot days.' },
    { id: 'mango', name: 'Mango Sunset', color: '#FFAE42', cost: 450, repReq: 3.7, wtp: 0.4, extraCost: 0.9, blurb: 'Tropical and golden.' },
    { id: 'galaxy', name: 'Blue Galaxy', color: '#7FB8FF', cost: 1000, repReq: 4.4, wtp: 0.6, extraCost: 1.3, blurb: 'Nobody knows what is in it. Everybody wants it.' },
    // limited: true = never sold in the shop. Only Dex the Dealer offers them, one day at a time; once bought they are yours.
    { id: 'cotton', name: 'Cotton Candy Fizz', color: '#FFB3E6', cost: 70, repReq: 0, wtp: 0.2, extraCost: 0.5, limited: true, blurb: 'Pink, fizzy and gone before you know it.' },
    { id: 'watermelon', name: 'Watermelon Wave', color: '#FF6F7D', cost: 140, repReq: 0, wtp: 0.3, extraCost: 0.6, limited: true, blurb: 'Tastes like the best day of summer.' },
    { id: 'sunrise', name: 'Sunrise Punch', color: '#FF9A3C', cost: 260, repReq: 0, wtp: 0.4, extraCost: 0.8, limited: true, blurb: 'Orange, peach and a little bit of magic.' },
    { id: 'midnight', name: 'Midnight Grape', color: '#9B6BFF', cost: 480, repReq: 0, wtp: 0.55, extraCost: 1.0, limited: true, blurb: 'Dark, sparkly and very mysterious.' },
    { id: 'rainbow', name: 'Rainbow Swirl', color: '#7CE0C3', cost: 900, repReq: 0, wtp: 0.75, extraCost: 1.4, limited: true, blurb: 'Every sip is a different colour.' }
  ];

  /* Dex the Dealer's boosts. A boost lasts for one business day: bought in the morning it
   * covers the day ahead, bought during the day it covers the rest of that day.
   * cost = base price at Maple Street; the sim scales it up at richer locations. color = accent for cards and chips. */
  DATA.boosts = [
    { id: 'flyers', color: '#FF7A59', name: 'Flyer Blast', icon: 'newspaper', cost: 6, desc: '35% more people walk past today.' },
    { id: 'golden', color: '#FFC83D', name: 'Golden Lemons', icon: 'lemon', cost: 8, desc: 'People will pay up to 25% more today.' },
    { id: 'turbo', color: '#4CC3F0', name: 'Turbo Gloves', icon: 'juicer', cost: 5, desc: 'Every batch mixes twice as fast today.' },
    { id: 'frost', color: '#9FE7FF', name: 'Frost Pack', icon: 'ice', cost: 4, desc: 'No ice melts today, not even overnight.' },
    { id: 'lucky', color: '#35C977', name: 'Lucky Coin', icon: 'coin', cost: 6, desc: 'Every tip is doubled today.' },
    { id: 'shield', color: '#FF5D8F', name: 'Streak Shield', icon: 'shield', cost: 7, desc: 'The first regular who leaves unhappy today keeps their streak.' },
    { id: 'hype', color: '#7A5CFF', name: 'Hype Squad', icon: 'people', cost: 9, desc: 'Every one of your regulars shows up today.' }
  ];

  /* Names for regulars, by kind (the vip food critic never becomes a regular). */
  DATA.regularNames = {
    kid: ['Milo', 'Ruby', 'Theo', 'Zoe', 'Leo', 'Ivy', 'Finn', 'Nora'],
    teen: ['Jaden', 'Priya', 'Max', 'Luna', 'Kai', 'Ava', 'Rico', 'Sky'],
    parent: ['Dana', 'Marcus', 'Elena', 'Tom', 'Grace', 'Omar', 'Hana', 'Ben'],
    jogger: ['Speedy Sam', 'Tess', 'Andre', 'Mia', 'Jo', 'Rafael', 'Kim', 'Lars'],
    elder: ['Mr. Patel', 'Mrs. Rossi', 'Grandpa Joe', 'Miss Ada', 'Mr. Okafor', 'Aunt May', 'Mr. Lin', 'Mrs. Bell'],
    tourist: ['Hiro', 'Ingrid', 'Paolo', 'Amara', 'Sven', 'Lucia', 'Yuki', 'Pierre'],
    office: ['Ms. Grant', 'Raj', 'Chloe', 'Mr. Harris', 'Nadia', 'Victor', 'Jess', 'Mr. Chen'],
    skater: ['Ollie', 'Dash', 'Rae', 'Zed', 'Kit', 'Bo', 'Juno', 'Flip']
  };

  // Daily specials. known:true shows in the morning news, false is a mid-day surprise.
  DATA.events = [
    { id: 'fair', title: 'Street fair', desc: 'Crowds everywhere today.', icon: 'people', known: true },
    { id: 'lemonSale', title: 'Lemon truck spill', desc: 'Lemons are half price this morning.', icon: 'lemon', known: true },
    { id: 'sugarShort', title: 'Sugar shortage', desc: 'Sugar costs nearly double today.', icon: 'sugar', known: true },
    { id: 'iceTruck', title: 'Ice truck broke down', desc: 'Ice costs double today.', icon: 'ice', known: true },
    { id: 'marathon', title: 'Fun run', desc: 'Thirsty joggers all day long.', icon: 'heart', known: true },
    { id: 'school', title: 'School trip', desc: 'A busload of kids arrives around noon.', icon: 'people', known: true },
    { id: 'critic', title: 'Food critic in town', desc: 'Impress them and the whole town hears about it.', icon: 'newspaper', known: true },
    { id: 'rival', title: 'Rival stand', desc: 'A competitor set up nearby. People are pickier about price.', icon: 'tag', known: true },
    { id: 'payday', title: 'Payday', desc: 'Everyone feels generous today.', icon: 'coin', known: true },
    { id: 'viral', title: 'You went viral', desc: 'Yesterday\'s fans brought their friends.', icon: 'star', known: true },
    { id: 'shower', title: 'Pop-up shower', desc: 'Rain rolls through. Hang in there.', icon: 'rain', known: false },
    { id: 'heatSpike', title: 'Scorcher', desc: 'The afternoon turns blazing hot.', icon: 'heat', known: false }
  ];

  // kind + target let both sim and UI compute progress (SS.Sim.milestoneProgress).
  DATA.milestones = [
    { id: 'first', title: 'First sale', desc: 'Sell your first cup.', kind: 'cups', target: 1, reward: 2 },
    { id: 'cups25', title: 'Lunch rush', desc: 'Sell 25 cups in one day.', kind: 'dayCups', target: 25, reward: 8 },
    { id: 'profit20', title: 'In the black', desc: 'Make $20 profit in one day.', kind: 'dayProfit', target: 20, reward: 10 },
    { id: 'rep3', title: 'Neighborhood favorite', desc: 'Reach 3 stars.', kind: 'rep', target: 3, reward: 15 },
    { id: 'tinker', title: 'Tinkerer', desc: 'Buy 3 upgrades.', kind: 'upgrades', target: 3, reward: 15 },
    { id: 'park', title: 'Fresh air', desc: 'Open your stand in Meadow Park.', kind: 'location', target: 'park', reward: 25 },
    { id: 'cups60', title: 'Squeeze machine', desc: 'Sell 60 cups in one day.', kind: 'dayCups', target: 60, reward: 30 },
    { id: 'flavor', title: 'Mixologist', desc: 'Unlock a new flavor.', kind: 'flavors', target: 2, reward: 25 },
    { id: 'profit100', title: 'Big day', desc: 'Make $100 profit in one day.', kind: 'dayProfit', target: 100, reward: 50 },
    { id: 'beach', title: 'Sand between your toes', desc: 'Open your stand at Driftwood Beach.', kind: 'location', target: 'beach', reward: 40 },
    { id: 'rep4', title: 'Local legend', desc: 'Reach 4 stars.', kind: 'rep', target: 4, reward: 60 },
    { id: 'life1000', title: 'Four figures', desc: 'Earn $1,000 in total sales.', kind: 'lifetime', target: 1000, reward: 100 },
    { id: 'downtown', title: 'Big city', desc: 'Open your stand in Downtown Plaza.', kind: 'location', target: 'downtown', reward: 80 },
    { id: 'cups120', title: 'Line around the block', desc: 'Sell 120 cups in one day.', kind: 'dayCups', target: 120, reward: 120 },
    { id: 'carnival', title: 'Under the lights', desc: 'Open your stand at Starlight Carnival.', kind: 'location', target: 'carnival', reward: 150 },
    { id: 'rep5', title: 'Five-star stand', desc: 'Reach 4.8 stars.', kind: 'rep', target: 4.8, reward: 200 },
    { id: 'regulars5', title: 'Familiar faces', desc: 'Have 5 regulars at once.', kind: 'regulars', target: 5, reward: 20 },
    { id: 'streak10', title: 'On a roll', desc: 'Get a regular to a 10-visit streak.', kind: 'streak', target: 10, reward: 60 },
    { id: 'mogul', title: 'Lemonade mogul', desc: 'Earn $10,000 in total sales.', kind: 'lifetime', target: 10000, reward: 0, final: true }
  ];

  DATA.byId = function (list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; };

  /* ------------------------------------------------------------------ *
   * STATE SHAPE (SS.state). Created and owned by sim.js; everyone else reads.
   * ------------------------------------------------------------------
   * SS.state = {
   *   v: 1, seed: int,
   *   phase: 'title'|'prep'|'day'|'results',
   *   day: 1,
   *   cash: 20, lifetimeEarnings: 0, lifetimeCups: 0,
   *   reputation: 2.0,                          // 0..5
   *   location: 'street', unlockedLocations: ['street'],
   *   upgrades: { pitcher:0, juicer:0, cooler:0, stand:0, awning:0, sign:0, tipjar:0, helper:0, speaker:0 },
   *   flavor: 'classic', flavors: ['classic'],
   *   stock: { lemons, sugar, ice, cups },      // units (may be fractional inside; UI shows Math.floor)
   *   cart:  { lemons, sugar, ice, cups },      // PACKS to buy this morning; paid when the day starts
   *   recipe: { lemons: 4, sugar: 4, ice: 2 },
   *   price: 1.00,
   *   market: { lemons, sugar, ice, cups },     // today's PACK prices
   *   forecast: { type, temp, confidence },     // morning forecast (confidence 0..1); actual weather may differ
   *   weather: { type, temp },                  // actual; valid from day start
   *   event: null | { id, title, desc, icon, known },
   *   milestonesDone: [ids],
   *   stats: { days, bestProfit, bestCups, tips, served },
   *   history: [ { day, profit, revenue, cups, weather, location } ],   // most recent 30
   *   today: null | DayRuntime,                 // only during phase 'day'
   *   lastResult: null | DayResult,             // set when the day ends
   *   settings: { sfx: true, music: true, speed: 1, reducedMotion: false },
   *   tutorial: { done: false },
   *   won: false,
   *   regulars: [Regular],                      // at most 12, oldest first
   *   boosts: [boostId],                        // Dex's boosts active for the coming day (prep) or the current day (day); cleared when the day ends
   *   dealer: null | { day, offers: [ { id, kind, sold } ] },  // Dex's stock for state.day (kind 'boost' | 'limited'); null on day 1 and on days he does not visit
   *   boostCost: 0,                             // what the boosts in state.boosts cost (goes on that day's DayResult)
   *   nextRegular: 1                            // number for the next regular's id ('r' + n)
   * }
   * stats also holds bestStreak: the longest streak any regular ever reached (for the 'streak' milestone).
   *
   * Regular -------------------------------------------------------------
   * {
   *   id,                       // 'r1', 'r2', ... never reused
   *   name, kind, seed,         // kind and seed are fixed, so a regular looks the same every visit
   *   streak,                   // happy visits in a row; multiplier = SS.loyaltyMult(streak)
   *   best,                     // longest streak they ever had
   *   visits,                   // total visits
   *   strikes,                  // unhappy visits in a row; two and they stop coming
   *   since, lastDay            // day they became a regular, last day they visited
   * }
   *
   * DayRuntime (state.today) -------------------------------------------
   * {
   *   clock, t,                 // seconds elapsed, and clock / SS.DAY_LENGTH in 0..1
   *   customers: [Customer],
   *   queue: [customerId],      // index 0 is being served
   *   serving: null | { id, p },            // p = pour progress 0..1
   *   pitcher: { cups, max, brew },         // brew = null, or 0..1 progress of the batch being mixed
   *   sold, revenue, tipsEarned,
   *   tips: [ { id, x, lane, amount, ttl } ],   // coins on the ground waiting to be collected
   *   bell: { cd, max, active },            // cd = cooldown seconds left; active = seconds of effect left
   *   soldOut: null | 'lemons'|'sugar'|'ice'|'cups',
   *   weatherNow: { type, temp },           // can change mid-day
   *   missed: { pricey, wait, soldout, quit },
   *   hourly: [9 numbers],                  // cups sold per hour bucket
   *   loyalty                               // loyalty bonus money regulars have paid today
   * }
   *
   * Customer ------------------------------------------------------------
   * {
   *   id, kind, seed,           // seed drives the look (renderer derives colours/hair/outfit from it)
   *   x, lane, dir,             // dir: 1 walking right, -1 walking left
   *   speed,                    // world units / second right now (0 when standing)
   *   state: 'walk'|'approach'|'queue'|'order'|'leave',
   *   stateT,                   // seconds in the current state
   *   hasDrink,                 // carrying a cup (after buying)
   *   mood,                     // -1..1
   *   patience,                 // 0..1 left while waiting in line
   *   bubble: null | { type, ttl, max },
   *     // bubble types: thirsty pricey wait soldout happy love meh angry sour sweet watery warm tip star
   *   qty,                      // cups this customer orders (1..4)
   *   regularId,                // null, or the Regular id this customer is
   *   streak, mult              // for regulars: streak and SS.loyaltyMult(streak) as they walk in (0 and 1 otherwise)
   * }
   *
   * DayResult (state.lastResult) ---------------------------------------
   * {
   *   day, location, weather: {type, temp}, event,
   *   cups, revenue, tips, ingredientCost, rent, profit,
   *   people: { passed, served, pricey, wait, soldout, quit },
   *   satisfaction,             // 0..1
   *   repBefore, repAfter,
   *   reviews: [ { text, mood, kind, who } ],   // up to 6, who = customer kind
   *   topFeedback,              // 'great'|'sour'|'sweet'|'watery'|'warm'|'pricey'|'slow'|'cheap'|'quiet'
   *   advice,                   // one plain sentence the player can act on tomorrow
   *   hourly: [9 numbers],
   *   spoiled: { lemons, ice }, // lost overnight
   *   milestones: [ids],        // completed today
   *   bestDay: bool, cashAfter,
   *   loyalty,                  // loyalty bonus regulars paid today (included in profit)
   *   boostCost,                // what Dex's boosts for this day cost (included in profit)
   *   boosts: [boostId],        // boosts that were active
   *   regulars: [ { id, name, kind, outcome, streak, mult, bonus, reason } ]
   *     // everyone who was or became a regular today. outcome: 'new' | 'streak' | 'broken' | 'saved' | 'lost' | 'closed' | 'away'
   *     // ('closed' = came by but the stand closed before they were served: streak kept, the visit counts)
   *     // ('away' = a regular who did not come today; listed only when they had a streak of 3 or more, so the player notices)
   * }
   */

  /* ------------------------------------------------------------------ *
   * MODULE APIS
   * ------------------------------------------------------------------
   * SS.Sim  (js/sim.js — pure logic, no DOM)
   *   init()                      create SS.state (phase 'title'); read settings from any save
   *   hasSave() -> bool           saveSummary() -> {day, cash, reputation, location} | null
   *   newGame()                   fresh state, then startPrep()
   *   continueGame()              restore the save into phase 'prep'
   *   save()  wipeSave()
   *   setSetting(key, value)      'sfx'|'music'|'speed'|'reducedMotion'; emits 'settings'
   *   setBounds(minX, maxX)       visible world range, used for spawn / despawn
   *   -- prep --
   *   startPrep()                 roll market, forecast and event for state.day; phase 'prep'
   *   setCart(item, packs)        clamps to what cash allows; emits 'cart'
   *   cartCost() -> number
   *   prepInfo() -> { cost, cashAfter, rent, stockAfter:{...units}, maxCups, limiting, costPerCup, canStart, reason }
   *   setRecipe(key, value)       emits 'recipe'
   *   setPrice(p)                 allowed in prep and during the day; emits 'price'
   *   setFlavor(id)
   *   canStartDay() -> {ok, reason}
   *   startDay()                  pays cart + rent, fixes the weather, phase 'day'
   *   -- day --
   *   update(dt)                  advance the day by dt sim-seconds; ends the day itself
   *   ringBell() -> bool          pulls in passers-by for a few seconds (cooldown)
   *   tapStand() -> bool          speeds up the batch being mixed
   *   collectTip(id) -> bool
   *   closeEarly()                end the day now
   *   -- results --
   *   nextDay()                   overnight spoilage, day + 1, startPrep()
   *   -- shop (prep or results) --
   *   upgradeInfo(id) -> { level, max, next: {cost,label,value}|null, canAfford }
   *   buyUpgrade(id) -> { ok, reason }
   *   locationInfo(id) -> { unlocked, current, canUnlock, reason }
   *   unlockLocation(id) -> { ok, reason }      setLocation(id) -> { ok, reason }   (refused in prep once Dex's boosts are bought: they are priced for this spot)
   *   flavorInfo(id) -> { owned, current, canBuy, reason }
   *   buyFlavor(id) -> { ok, reason }
   *   milestoneProgress(id) -> { value, target, pct, done }
   *   cupsPerPitcher()  brewTime()  serveTime()  rent()
   *   -- regulars --
   *   regularsInfo() -> [ { id, name, kind, seed, streak, best, visits, mult, since, lastDay } ]   best streaks first
   *   -- Dex the Dealer: he visits SOME days only (never day 1, always day 2, then about 45% of days and never more than
   *      3 days in a row away; TUNE.dexChance / dexGap in sim.js). A limited flavor comes on about half his visits from day 3
   *      (never more than 3 visits in a row without one, while you still lack some; TUNE.limitedChance / limitedGap).
   *      On a visit day he is open in 'prep' and 'day'; gone in 'results', on day 1 and on days he stays away.
   *      Whether he comes is fixed by (seed, day): a reload never changes it. --
   *   dealerInfo() -> { present, line, offers: [ { id, kind, name, desc, icon, color, cost, sold, canBuy, reason } ], active: [boostId] }
   *       line = one short thing Dex says today (changes daily). kind 'limited' offers carry the flavor's color.
   *       On a day he stays away: present false, line '', offers [] (active still lists boosts already working).
   *   buyDeal(id) -> { ok, reason }   id is a boost id or a limited flavor id from today's offers ('Dex is not in town today.' when he stays away)
   *       In the morning Dex never takes the cash Grandma would have to replace (keep enough for a few cups of supplies).
   *       Hype Squad is not sold late in the day, when regulars could no longer reach the stand.
   *   boostActive(id) -> bool
   *
   * SS.Render (js/render.js)  owns both canvases, SS.view and SS.env, and calls, in order:
   *   SS.Sky.draw(ctx, view, env)            full-canvas sky: gradient, stars, sun, moon, clouds
   *   SS.Backdrops.drawBack(ctx, view, env)  everything behind the actors, including the ground
   *   SS.Actors.draw(ctx, view, env)         stand, vendor, customers, tips, speech bubbles
   *   SS.Backdrops.drawFront(ctx, view, env) props in front of the actors
   *   SS.Sky.drawWeather(ctx, view, env)     rain, wind, heat haze, light grade, lightning, vignette
   *   SS.FX.draw(fxCtx, view, env)           particles on the overlay canvas ABOVE the DOM UI
   * Each module may also expose update(dt, view, env); Render calls it once per frame before drawing.
   *
   * SS.view = {
   *   w, h, dpr,                 // canvas size in CSS px; contexts are pre-scaled by dpr
   *   scale,                     // px per world unit
   *   camX,                      // world x at the centre of the free area
   *   x0, x1,                    // world x at the left / right canvas edge (draw at least this range)
   *   groundY,                   // px y of the BACK edge of the sidewalk (where walls meet the ground)
   *   sidewalkH,                 // px depth of the sidewalk band (SS.W.SIDEWALK_H * scale)
   *   toX(wx) -> px,  toWorldX(px) -> wx,
   *   laneY(lane) -> px          // feet position for that lane
   *   laneScale(lane) -> px per world unit for something standing on that lane (fake perspective)
   * }
   * SS.env = {
   *   loc,                       // location id
   *   phase,
   *   dayT,                      // cyclic 0..1.6 : 0 sunrise, 0.5 noon, 1.0 sunset, 1.12 dusk, 1.3 deep night, 1.6 = 0
   *   weather: { type, temp, wet, heat, cloud, storm },  // wet/heat/cloud/storm are smoothed 0..1 intensities
   *   wind,                      // -1..1
   *   t, dt,                     // visual clock seconds and frame delta (both 0-safe; frozen while paused)
   *   reduced                    // true = tone motion down
   * }
   *
   * SS.Actors.hit(sx, sy) -> null | {type:'tip', id} | {type:'dealer'} | {type:'stand'}   // screen-space hit test, in that priority
   *   ('dealer' only once he is set up, from 'ready': not while he is rolling in or setting up, not while packing up)
   * SS.Actors.dealerPos() -> null | {x, y, h, tx, ty}   where Dex and his trunk are drawn right now (moves during his entrance/exit)
   * SS.Actors.dealerReady() -> bool   true once Dex is fully set up today (after 'dealer:setup' 'ready'); false while absent or mid-show
   *
   * SS.FX   (js/fx.js)   listens to the bus by itself. Also:
   *   shake(magPx, seconds)  shakeOffset() -> {x, y}
   *   floatText(text, sx, sy, {color, size})   confetti({x, y, count})   burst(kind, sx, sy, opts)
   *   coinsTo(sx, sy, target, count)           target = DOM element or {x, y}
   *
   * SS.Audio (js/audio.js)  listens to the bus by itself. Also:
   *   unlock()  call from the first user gesture     play(name, opts)
   *
   * SS.UI   (js/ui.js)  shell: HUD, title, day bar, modals, toasts, banners, tutorial, settings, win screen
   *   init()
   *   openModal({ id, title, icon, body: HTMLElement, wide: bool, onClose }) -> close()
   *   closeModal()
   *   toast(text, kind, icon)
   *   confirm({ title, text, yes, no }) -> Promise<bool>
   *
   * SS.Screens (js/screens.js)  renders prep and results into #sheet, plus shop / map / goals modals
   *   init()
   *   open(name)                 'shop' | 'map' | 'goals' | 'dealer'
   *
   * SS.ICONS (js/icons.js)  { name: '<svg viewBox="0 0 48 48" ...>...</svg>' }
   *
   * DOM contract (index.html holds the containers; `hidden` attribute shows / hides them)
   *   #hud #daybar #title #modal-root #toast-root #banner-root #coach-root   -> ui.js
   *   #sheet (data-mode "dock" | "center"; children .sheet-body + .sheet-foot) -> screens.js
   *   #hud-cash, #hud-rep     ids ui.js gives the cash and reputation readouts (FX flies coins / stars to them)
   *   #game[data-phase]       set by main.js on every phase change, for CSS
   *   data-tut="market|recipe|price|open|next"  anchors screens.js puts on prep / results sections,
   *   data-tut="bell|speed"                     anchors ui.js puts on day-bar controls (tutorial bubbles point at them)
   */

  /* ------------------------------------------------------------------ *
   * DOM helpers (only touch `document` when called, so node can load this file)
   * ------------------------------------------------------------------ */
  /** hyperscript: SS.h('button', {class:'btn', onclick: fn}, 'Label', childEl) */
  SS.h = function (tag, props) {
    var el = document.createElement(tag), k, v;
    if (props) {
      for (k in props) {
        v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;            // trusted markup only (icons)
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    var kids = Array.prototype.slice.call(arguments, 2).flat(Infinity);
    for (var i = 0; i < kids.length; i++) {
      var kid = kids[i];
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };

  /** icon markup: SS.icon('lemon') -> '<span class="ico" aria-hidden="true"><svg…></span>' */
  SS.icon = function (name, cls) {
    var svg = (SS.ICONS && SS.ICONS[name]) ||
      '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="14" fill="currentColor" opacity=".35"/></svg>';
    return '<span class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + svg + '</span>';
  };
  SS.iconEl = function (name, cls) { var t = document.createElement('template'); t.innerHTML = SS.icon(name, cls); return t.content.firstChild; };

  /** five-star rating markup with partial fill; value 0..5 */
  SS.starsHTML = function (value) {
    var pct = SS.clamp(value / 5, 0, 1) * 100, row = '';
    for (var i = 0; i < 5; i++) row += SS.icon('star');
    return '<span class="stars" role="img" aria-label="' + (Math.round(value * 10) / 10) + ' out of 5 stars">' +
      '<span class="stars-off">' + row + '</span><span class="stars-on" style="width:' + pct.toFixed(1) + '%">' + row + '</span></span>';
  };

  /** animate a number inside el toward `to`. fmt defaults to SS.fmtMoney. */
  SS.countTo = function (el, to, opts) {
    opts = opts || {};
    var fmt = opts.fmt || SS.fmtMoney, ms = opts.ms == null ? 600 : opts.ms;
    var from = typeof el._ssv === 'number' ? el._ssv : (opts.from == null ? to : opts.from);
    if (el._ssRaf) cancelAnimationFrame(el._ssRaf);
    if (SS.reduced() || ms <= 0 || from === to) { el._ssv = to; el.textContent = fmt(to); return; }
    var t0 = performance.now();
    (function tick(now) {
      var p = SS.clamp((now - t0) / ms, 0, 1), v = SS.lerp(from, to, SS.ease.outCubic(p));
      el._ssv = v; el.textContent = fmt(v);
      if (p < 1) el._ssRaf = requestAnimationFrame(tick); else { el._ssv = to; el.textContent = fmt(to); el._ssRaf = 0; }
    })(t0);
  };

  /** − value + control. Returns the element; el.set(v) updates it silently.
   *  SS.stepper({ value, min, max, step, fmt, label, onChange(v) }) */
  SS.stepper = function (o) {
    var step = o.step || 1, fmt = o.fmt || String, v = o.value;
    var out = SS.h('output', { class: 'stepper-val', 'aria-live': 'polite' }, fmt(v));
    var timer = 0;
    function snap(n) { return SS.clamp(Math.round(n / step) * step, o.min, o.max); }
    function bump(d) {
      var n = snap(v + d * step);
      if (n === v) return false;
      v = n; out.textContent = fmt(v); sync();
      out.classList.remove('bump'); void out.offsetWidth; out.classList.add('bump');
      SS.sfx('tick');
      if (o.onChange) o.onChange(v);
      return true;
    }
    function hold(d) {
      return function (e) {
        e.preventDefault();
        if (!bump(d)) return;
        var delay = 340;
        (function again() { timer = setTimeout(function () { if (bump(d)) { delay = Math.max(45, delay * 0.78); again(); } }, delay); })();
      };
    }
    function stop() { clearTimeout(timer); }
    function key(d) { return function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bump(d); } }; }
    var minus = SS.h('button', { class: 'stepper-btn', type: 'button', 'aria-label': 'Less ' + (o.label || ''), onpointerdown: hold(-1), onkeydown: key(-1) }, '−');
    var plus = SS.h('button', { class: 'stepper-btn', type: 'button', 'aria-label': 'More ' + (o.label || ''), onpointerdown: hold(1), onkeydown: key(1) }, '+');
    function sync() { minus.disabled = v <= o.min; plus.disabled = v >= o.max; }
    var el = SS.h('div', { class: 'stepper', role: 'group', 'aria-label': o.label || '' }, minus, out, plus);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (n) { minus.addEventListener(n, stop); plus.addEventListener(n, stop); });
    el.set = function (n, max) { if (max != null) o.max = max; v = SS.clamp(n, o.min, o.max); out.textContent = fmt(v); sync(); };
    el.get = function () { return v; };
    sync();
    return el;
  };

  SS.state = SS.state || null;
})();
