/* Squeeze Street — screens.js
 * The two big phase screens (morning prep, end-of-day results) rendered into #sheet,
 * and the shop / map / goals modals. Reads SS.state, calls SS.Sim, never owns game rules.
 * Prep is built once per morning and then patched in place, so steppers keep focus and
 * hold-to-repeat keeps working while the numbers around them change.
 *
 * SS.Screens = { init(), open(name) }      name: 'shop' | 'map' | 'goals' | 'dealer' (Dex the Dealer) | 'legal' (Privacy & Terms)
 * The goals modal also has a Regulars tab; the results card links to it.
 */
(function () {
  'use strict';
  var SS = window.SS;
  if (!SS || !SS.DATA) return;
  var D = SS.DATA, h = SS.h;

  var sheet = null, body = null, foot = null;
  var prep = null;        // live references for the prep screen
  var res = null;         // live references and reveal state for the results screen
  var modal = null;       // { name, close, refresh }
  var shopTab = 'upgrades';

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  function sim() { return SS.Sim || null; }
  function I(name, cls) { return SS.iconEl(name, cls); }
  function money(n) { return SS.fmtMoney(n); }
  function moneyShort(n) { return money(n).replace(/\.00$/, ''); }
  function int(n) { return SS.fmtInt(n); }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function stars1(n) { return (Math.round(num(n) * 10) / 10).toFixed(1); }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }
  function txt(el, s) { s = String(s); if (el && el._t !== s) { el._t = s; el.textContent = s; } }
  function cls(el, name, on) { if (el) el.classList.toggle(name, !!on); }
  function restart(el, name) { if (!el) return; el.classList.remove(name); void el.offsetWidth; el.classList.add(name); }
  function safe(what, fn) { try { return fn(); } catch (e) { if (window.console) console.error('[SS.Screens] ' + what + ' failed', e); } }
  function listJoin(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function tinted(icon, color, c) { return h('span', { class: c, style: 'color:' + color, html: SS.icon(icon) }); }
  /** today's Dex the Dealer info, or null when the sim cannot say */
  function dex() { var S = sim(); var d = S && S.dealerInfo ? safe('dealerInfo', S.dealerInfo) : null; return d && Array.isArray(d.offers) ? d : null; }
  function boostDef(id) { return (D.boosts && D.byId(D.boosts, id)) || null; }
  function kindName(k) { return D.kinds[k] ? D.kinds[k].name : 'Customer'; }
  function hasLimited(d) { return !!d && d.present && d.offers.some(function (o) { return o.kind === 'limited' && !o.sold; }); }
  var DEX_WAIT = 6000;    // ms: his Deals button never waits on his entrance longer than this
  /** ms on the scene's clock: it stops with the frames (hidden tab, slow phone) just as his show does */
  function sceneMs() { return SS.env ? SS.env.t * 1000 : Date.now(); }
  /** Dex has finished setting up in the scene (his 'ready' came, or actors.js cannot say, or his show is running too long) */
  function dexSetUp() {
    var A = SS.Actors;
    if (!A || typeof A.dealerReady !== 'function' || (prep && sceneMs() - prep.t0 >= DEX_WAIT)) return true;
    try { return !!A.dealerReady(); } catch (e) { return true; }
  }
  /** a boost's icon on a disc of its own colour */
  function boostDot(b, c) { return h('span', { class: 'boost-dot' + (c ? ' ' + c : ''), style: 'background:' + mixHex(b.color, '#ffffff', 0.45), html: SS.icon(b.icon) }); }

  var WX_NOTE = {
    sunny: 'Good lemonade weather. Expect a steady crowd all day.',
    heatwave: 'Scorching. Everyone will be thirsty, so stock up and pack extra ice.',
    cloudy: 'Grey and mild. Fewer people out, and they are not as thirsty.',
    rainy: 'Wet. Less than half the usual crowd, so buy light.',
    storm: 'Stormy. Hardly anyone will be out. Buy very little today.'
  };
  var SAID = {
    great: 'it was just right', sour: 'a bit sour', sweet: 'a bit too sweet', watery: 'a bit watery', warm: 'not cold enough',
    pricey: 'too pricey', cheap: 'what a bargain', slow: 'the line was too slow', quiet: 'hardly anything. It was a quiet day'
  };
  var RUNS_OUT = { lemons: 'Lemons run out first', sugar: 'Sugar runs out first', ice: 'Ice runs out first', cups: 'Cups run out first' };
  var HOURS = ['9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm'];

  /* ------------------------------------------------------------------ *
   * Sheet plumbing
   * ------------------------------------------------------------------ */
  function showSheet(mode) {
    var was = sheet.hidden || sheet.dataset.mode !== mode;
    sheet.dataset.mode = mode;
    sheet.hidden = false;
    toTop();
    if (was) restart(sheet, mode === 'center' ? 'res-sheet-in' : 'prep-sheet-in');
  }
  function toTop() {
    body.scrollTop = 0;
    // a results-reveal smooth scroll still running on the compositor hands its progress back on the next frame
    requestAnimationFrame(function () { body.scrollTop = 0; });
  }
  function hideSheet() {
    stopReveal();
    prep = null; res = null;
    if (!sheet) return;
    sheet.hidden = true;
    sheet.classList.remove('prep-sheet-in', 'res-sheet-in');
    body.textContent = ''; foot.textContent = '';
  }
  function navBtn(name, label, icon) {
    return h('button', { class: 'btn prep-nav', type: 'button', 'aria-label': label, onclick: function () { SS.sfx('click'); open(name); } },
      I(icon), h('span', { class: 'prep-nav-l' }, label));
  }
  function secHead(title, icon, aside) {
    return h('div', { class: 'prep-sec-head' }, h('h3', { class: 'display prep-sec-title' }, I(icon), title), aside);
  }

  /* ------------------------------------------------------------------ *
   * PREP
   * ------------------------------------------------------------------ */
  function mixHex(hex, to, t) {
    var a = parseInt(String(hex).replace('#', ''), 16), b = parseInt(to.replace('#', ''), 16);
    if (!isFinite(a)) a = 0xffe14d;
    var r = Math.round(SS.lerp(a >> 16 & 255, b >> 16 & 255, t)), g = Math.round(SS.lerp(a >> 8 & 255, b >> 8 & 255, t)), bl = Math.round(SS.lerp(a & 255, b & 255, t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  /* The little glass: liquid colour follows the flavor, slices follow lemons, cubes follow ice, specks follow sugar. */
  function buildGlass() {
    var INK = '#1b1f3b', s = '', i;
    var cubes = [[34, 44, -12], [56, 40, 8], [74, 47, 20], [44, 62, 14], [65, 63, -9]];
    var slices = [[50, 104], [71, 90], [60, 121], [41, 82]];
    s += '<svg class="prep-glass-svg" viewBox="0 0 120 150" aria-hidden="true">' +
      '<defs><clipPath id="prep-glass-clip"><path d="M23 22 L33 130 Q34 138 42 138 L78 138 Q86 138 87 130 L97 22 Z"/></clipPath></defs>' +
      '<ellipse cx="60" cy="144" rx="38" ry="5" fill="' + INK + '" opacity=".14"/>' +
      '<g transform="rotate(13 78 70)"><rect x="73" y="-2" width="10" height="128" rx="5" fill="#ff6257" stroke="' + INK + '" stroke-width="3"/>' +
      '<path d="M73 14h10M73 30h10M73 46h10" stroke="#fff" stroke-width="4"/></g>' +
      '<path d="M19 14 L30 131 Q31 142 42 142 L78 142 Q89 142 90 131 L101 14 Z" fill="#f4fbff"/>' +
      '<g clip-path="url(#prep-glass-clip)"><g class="prep-glass-liq">' +
      '<rect class="prep-glass-fill" x="14" y="36" width="92" height="110"/>' +
      '<rect class="prep-glass-deep" x="14" y="112" width="92" height="34" opacity=".5"/>';
    for (i = 0; i < 12; i++) s += '<circle class="prep-glass-bit prep-glass-speck" cx="' + (39 + (i * 17) % 43) + '" cy="' + (133 - (i * 7) % 12) + '" r="2" fill="#fff"/>';
    for (i = 0; i < slices.length; i++) {
      s += '<g transform="translate(' + slices[i][0] + ' ' + slices[i][1] + ')"><g class="prep-glass-bit prep-glass-slice">' +
        '<circle r="11" fill="#ffd83d" stroke="' + INK + '" stroke-width="2.5"/><circle r="7" fill="#fff6b0"/>' +
        '<path d="M0 -7V7M-6 -3.5L6 3.5M-6 3.5L6 -3.5" stroke="#f2ae00" stroke-width="1.6" stroke-linecap="round"/></g></g>';
    }
    for (i = 0; i < cubes.length; i++) {
      s += '<g transform="translate(' + cubes[i][0] + ' ' + cubes[i][1] + ') rotate(' + cubes[i][2] + ')"><g class="prep-glass-bit prep-glass-cube">' +
        '<rect x="-9" y="-9" width="18" height="18" rx="5" fill="#fff" fill-opacity=".8" stroke="' + INK + '" stroke-width="2.5"/>' +
        '<path d="M-4 -4h4" stroke="' + INK + '" stroke-opacity=".3" stroke-width="2.5" stroke-linecap="round"/></g></g>';
    }
    s += '<rect x="14" y="36" width="92" height="5" fill="#fff" opacity=".5"/></g></g>' +
      '<path d="M19 14 L30 131 Q31 142 42 142 L78 142 Q89 142 90 131 L101 14 Z" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M31 30 L38 112" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".75"/>' +
      '<g transform="translate(26 15)"><g class="prep-glass-bit prep-glass-wedge"><path d="M-13 0A13 13 0 0 1 13 0Z" fill="#ffd83d" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M-8 -1A8 8 0 0 1 8 -1Z" fill="#fff6b0"/></g></g></svg>';
    var name = h('span', { class: 'prep-glass-name' });
    var el = h('div', { class: 'prep-glass' }, h('div', { class: 'prep-glass-art', html: s }), name);
    var svg = el.querySelector('svg'), liq = el.querySelector('.prep-glass-liq');
    var qs = function (q) { return Array.prototype.slice.call(el.querySelectorAll(q)); };
    var eCubes = qs('.prep-glass-cube'), eSlices = qs('.prep-glass-slice'), eSpecks = qs('.prep-glass-speck'), eWedge = qs('.prep-glass-wedge')[0];
    var last = '';
    el.update = function (recipe, flavor) {
      var lem = num(recipe.lemons), sug = num(recipe.sugar), ice = num(recipe.ice), key = lem + '|' + sug + '|' + ice + '|' + flavor.id;
      if (key === last) return;
      var t = SS.clamp((lem - D.recipe.lemons.min) / Math.max(1, D.recipe.lemons.max - D.recipe.lemons.min), 0, 1);
      svg.style.setProperty('--liq', mixHex(flavor.color, '#ffffff', 0.6 * (1 - t)));
      svg.style.setProperty('--liq-deep', mixHex(flavor.color, '#7a4a12', 0.08 + 0.3 * t));
      var nSl = SS.clamp(Math.round(lem / 3), 1, eSlices.length);
      eSlices.forEach(function (e, i) { cls(e, 'is-on', i < nSl); });
      eCubes.forEach(function (e, i) { cls(e, 'is-on', i < ice); });
      eSpecks.forEach(function (e, i) { cls(e, 'is-on', i < sug); });
      cls(eWedge, 'is-on', lem >= 8);
      txt(name, flavor.name);
      if (last) restart(liq, 'prep-slosh');
      last = key;
    };
    return el;
  }

  function buildPrep(st) {
    var S = sim();
    prep = { st: st, day: st.day, items: {}, rec: {}, flavorKey: '', t0: sceneMs() };
    body.textContent = ''; foot.textContent = '';

    /* header */
    prep.loc = h('button', { class: 'chip prep-loc', type: 'button', title: 'Change where you set up', onclick: function () { SS.sfx('click'); open('map'); } });
    var head = h('header', { class: 'prep-head prep-in', style: '--i:0' },
      h('div', { class: 'prep-head-main' }, h('span', { class: 'label prep-day' }, 'Day ' + int(st.day)), h('h2', { class: 'display prep-title' }, 'Morning prep')),
      prep.loc);

    /* forecast + news */
    var fc = st.forecast || {}, type = D.weather[fc.type] ? fc.type : 'sunny', wx = D.weather[type], conf = SS.clamp(num(fc.confidence) || 0.8, 0, 1);
    var forecast = h('section', { class: 'panel prep-forecast prep-wx--' + type + ' prep-in', style: '--i:1' },
      h('div', { class: 'prep-forecast-ico', html: SS.icon(wx.icon) }),
      h('div', { class: 'prep-forecast-main' },
        h('span', { class: 'label' }, 'Today\'s forecast'),
        h('div', { class: 'prep-forecast-row' },
          h('strong', { class: 'display prep-forecast-name' }, wx.name),
          h('span', { class: 'display num prep-forecast-temp' }, SS.fmtTemp(num(fc.temp) || wx.temp[0])),
          h('span', { class: 'chip prep-forecast-sure' }, 'about ' + Math.round(conf * 100) + '% sure')),
        h('p', { class: 'prep-forecast-note' }, WX_NOTE[type] + (conf < 0.65 ? ' The forecast is shaky, so keep a little cash back.' : ''))));
    var ev = st.event, news = !ev ? null : h('section', { class: 'panel prep-news prep-in', style: '--i:2' },
      h('div', { class: 'prep-news-ico', html: SS.icon(ev.icon || 'newspaper') }),
      h('div', { class: 'prep-news-main' }, h('span', { class: 'label' }, 'Today\'s news'), h('strong', { class: 'prep-news-title' }, ev.title || 'Something is up'), h('p', { class: 'prep-news-desc' }, ev.desc || '')));

    /* market */
    prep.cartTotal = h('span', { class: 'chip chip--lemon num prep-cart-total' });
    var items = h('div', { class: 'panel prep-items' });
    D.itemOrder.forEach(function (id) {
      var it = D.items[id], row = {}, price = num(st.market && st.market[id]) || it.base, ratio = price / it.base;
      row.price = price;
      row.stepper = SS.stepper({ value: num(st.cart && st.cart[id]), min: 0, max: 99, step: 1, label: 'packs of ' + it.name.toLowerCase(),
        onChange: function (v) { if (S && S.setCart) S.setCart(id, v); patchPrep(); } });
      row.stock = h('b', { class: 'num' });
      row.add = h('span', { class: 'num prep-item-add' });
      row.sub = h('span', { class: 'num prep-item-sub' });
      var chip = ratio <= 0.88 ? h('span', { class: 'chip chip--good prep-item-chip', title: Math.round((1 - ratio) * 100) + '% under the usual price' }, 'Cheap')
        : ratio >= 1.18 ? h('span', { class: 'chip chip--bad prep-item-chip', title: Math.round((ratio - 1) * 100) + '% over the usual price' }, 'Pricey') : null;
      row.el = h('div', { class: 'prep-item' },
        h('div', { class: 'prep-item-info' },
          h('div', { class: 'prep-item-top' }, h('span', { class: 'prep-item-ico', html: SS.icon(it.icon) }), h('strong', { class: 'prep-item-name' }, it.name), chip),
          h('div', { class: 'prep-item-price' }, h('b', { class: 'num' }, money(price)), ' for ' + it.pack + ' ' + plural(it.pack, it.unit)),
          h('div', { class: 'prep-item-stock' }, 'In the pantry ', row.stock, ' ', row.add)),
        h('div', { class: 'prep-item-buy' }, row.stepper, row.sub));
      prep.items[id] = row;
      items.append(row.el);
    });
    var market = h('section', { class: 'prep-sec prep-market prep-in', style: '--i:3', 'data-tut': 'market' }, secHead('Market', 'shop', prep.cartTotal), items);

    /* recipe */
    prep.glass = buildGlass();
    var recRows = h('div', { class: 'prep-rec-rows' });
    ['lemons', 'sugar', 'ice'].forEach(function (key) {
      var d = D.recipe[key];
      var stepper = SS.stepper({ value: num(st.recipe && st.recipe[key]), min: d.min, max: d.max, step: d.step, label: d.label.toLowerCase() + ' ' + d.per,
        onChange: function (v) { if (S && S.setRecipe) S.setRecipe(key, v); patchPrep(); } });
      prep.rec[key] = stepper;
      recRows.append(h('div', { class: 'prep-rec-row' },
        h('span', { class: 'prep-rec-ico', html: SS.icon(D.items[key].icon) }),
        h('div', { class: 'prep-rec-text' }, h('strong', null, d.label), h('span', { class: 'prep-rec-per' }, d.per)),
        stepper));
    });
    prep.flavors = h('div', { class: 'prep-flavors', role: 'group', 'aria-label': 'Flavor', hidden: true });
    var last = st.lastResult, top = last && SAID[last.topFeedback] ? last.topFeedback : null, priceHint = top === 'pricey' || top === 'cheap';
    function hint() {
      return h('div', { class: 'prep-hint' }, I(top === 'great' ? 'faceHappy' : 'info'),
        h('p', null, h('strong', null, 'Yesterday people said: ' + SAID[top] + '.'), last.advice ? ' ' + last.advice : ''));
    }
    var recipe = h('section', { class: 'prep-sec prep-recipe prep-in', style: '--i:4', 'data-tut': 'recipe' }, secHead('Recipe', 'recipe'),
      h('div', { class: 'panel prep-rec' }, prep.glass, recRows), prep.flavors, top && !priceHint ? hint() : null);

    /* price */
    prep.price = SS.stepper({ value: num(st.price) || D.price.start, min: D.price.min, max: D.price.max, step: D.price.step, fmt: money, label: 'price per cup',
      onChange: function (v) { if (S && S.setPrice) S.setPrice(v); patchPrep(); } });
    prep.price.classList.add('prep-price-stepper');
    prep.cpc = h('b', { class: 'num' }); prep.ppc = h('b', { class: 'num' });
    var price = h('section', { class: 'prep-sec prep-price prep-in', style: '--i:5', 'data-tut': 'price' }, secHead('Price per cup', 'tag'),
      h('div', { class: 'panel prep-price-box' }, prep.price,
        h('dl', { class: 'prep-price-stats' },
          h('div', null, h('dt', null, 'Costs you'), h('dd', null, prep.cpc, ' a cup')),
          h('div', null, h('dt', null, 'You keep'), h('dd', null, prep.ppc, ' a cup')))),
      top && priceHint ? hint() : null);

    /* summary */
    prep.cups = h('strong', { class: 'display num prep-sum-n' }, '0');
    prep.cupsWord = h('strong', null, 'cups you can make');
    prep.limit = h('span', { class: 'prep-sum-limit' });
    prep.sumCost = h('dd', { class: 'num' }); prep.sumRentL = h('dt'); prep.sumRent = h('dd', { class: 'num' }); prep.sumLeft = h('dd', { class: 'num' });
    prep.sumTruckL = h('dt'); prep.sumTruck = h('dd', { class: 'num' }); prep.sumTruckRow = h('div', { hidden: true }, prep.sumTruckL, prep.sumTruck);
    prep.boosts = h('div', { class: 'prep-boosts', role: 'list', 'aria-label': 'Boosts working for you today', hidden: true });
    var sum = h('section', { class: 'well prep-sum prep-in', style: '--i:6' },
      h('div', { class: 'prep-sum-cups' }, h('span', { class: 'prep-sum-ico', html: SS.icon('pitcher') }), prep.cups, h('div', { class: 'prep-sum-text' }, prep.cupsWord, prep.limit)),
      h('dl', { class: 'prep-sum-rows' },
        h('div', null, h('dt', null, 'Shopping'), prep.sumCost),
        h('div', null, prep.sumRentL, prep.sumRent),
        prep.sumTruckRow,
        h('div', { class: 'prep-sum-total' }, h('dt', null, 'Cash left after'), prep.sumLeft)),
      prep.boosts);

    // day 1 with a cart that can open the stand: shopping and recipe fold away, so the first screen is the forecast, the price and Open
    var info0 = S && S.prepInfo ? safe('prepInfo', S.prepInfo) : null;
    var more = st.day === 1 && info0 && info0.canStart ?h('details', { class: 'prep-more prep-in', style: '--i:3', ontoggle: function () { SS.sfx('click'); } },
      h('summary', { class: 'prep-more-sum' }, I('check', 'prep-more-ico'), h('span', null, h('b', null, 'Shopping and recipe: ready'), ' (tap to change)')),
      market, recipe) : null;
    if (more) [market, recipe].forEach(function (s) { s.removeAttribute('data-tut'); });   // coach tips must not point into the closed fold
    body.append(h('div', { class: 'prep' }, head,
      h('div', { class: 'prep-cols' }, h('div', { class: 'prep-col' }, forecast, news, more || market), h('div', { class: 'prep-col' }, more ? null : recipe, price, sum))));
    prep.truck = safe('truck card', truckPrepSlot);
    if (prep.truck) (news || forecast).after(prep.truck.el);

    /* footer */
    prep.reasonText = h('span');
    prep.reasonIco = h('span', { class: 'prep-reason-ico' });
    prep.reason = h('p', { class: 'prep-reason', role: 'status' }, prep.reasonIco, prep.reasonText);
    prep.go = h('button', { class: 'btn btn--go btn--lg prep-go', type: 'button', 'data-tut': 'open', onclick: function () {
      var r = S && S.startDay ? S.startDay() : null;
      if (r && r.ok === false && prep) { SS.sfx('error'); patchPrep(); prep.reason.classList.add('is-bad'); restart(prep.reason, 'prep-shake'); }
    } }, h('span', { class: 'prep-go-long' }, 'Open for business'), h('span', { class: 'prep-go-short' }, 'Open!'));
    prep.deals = navBtn('dealer', 'Deals', 'dealer');
    prep.deals.classList.add('prep-deals');
    prep.deals.setAttribute('data-tut', 'deals');
    prep.deals.hidden = true;
    prep.deals.append(h('i', { class: 'prep-deals-badge', 'aria-hidden': 'true' }));
    prep.foot = h('div', { class: 'prep-foot' }, h('div', { class: 'prep-foot-in' }, prep.reason,
      h('div', { class: 'prep-foot-row' }, navBtn('shop', 'Shop', 'shop'), navBtn('map', 'Map', 'map'), navBtn('custom', 'Style', 'brush'), prep.deals, prep.go)));
    foot.append(prep.foot);

    patchPrep();
    prep.live = true;                                       // from here on, Dex's button arrives with a flourish
    dexLate(prep);                                          // in case his 'ready' never comes
    showSheet('dock');
  }

  /** look again every 500 ms until his 'ready' or DEX_WAIT has run on the scene's clock */
  function dexLate(p) { setTimeout(function () { if (prep !== p) return; if (dexSetUp()) onChange(); else dexLate(p); }, 500); }

  function renderFlavors(st) {
    var owned = D.flavors.filter(function (f) { return st.flavors && st.flavors.indexOf(f.id) >= 0; });
    var key = owned.map(function (f) { return f.id; }).join(',') + '|' + st.flavor;
    if (key === prep.flavorKey) return;
    prep.flavorKey = key;
    prep.flavors.textContent = '';
    prep.flavors.hidden = owned.length < 2;
    if (owned.length < 2) return;
    prep.flavors.append(h('span', { class: 'label prep-flavors-l' }, 'Flavor'));
    owned.forEach(function (f) {
      var on = f.id === st.flavor;
      prep.flavors.append(h('button', { class: 'prep-flavor' + (on ? ' is-on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false',
        onclick: function () { var S = sim(); SS.sfx('click'); if (S && S.setFlavor) S.setFlavor(f.id); patchPrep(); } },
        tinted('drink', f.color, 'prep-flavor-ico'), f.name));
    });
  }

  function patchPrep() {
    var st = SS.state, S = sim();
    if (!prep || !st || st.phase !== 'prep' || !st.market) return;
    var info = (S && S.prepInfo && safe('prepInfo', S.prepInfo)) ||
      { cost: 0, cashAfter: num(st.cash), rent: 0, stockAfter: {}, maxCups: 0, limiting: 'lemons', costPerCup: 0, canStart: false, reason: 'The stand is not ready yet.' };
    var loc = D.byId(D.locations, st.location) || D.locations[0];

    if (prep.locKey !== loc.id) {
      prep.locKey = loc.id;
      prep.loc.textContent = '';
      prep.loc.append(I('loc' + loc.id.charAt(0).toUpperCase() + loc.id.slice(1)), h('span', null, loc.name));
    }

    D.itemOrder.forEach(function (id) {
      // the stand's budget: the truck's rent is not held back, the summary says when the cart leaves it parked
      var row = prep.items[id], it = D.items[id], cart = num(st.cart[id]), more = Math.floor((info.cashAfter + (info.truckShut ? 0 : num(info.truckRent)) + 1e-6) / row.price);
      var max = SS.clamp(cart + more, cart, 99);
      row.stepper.set(cart, max);
      txt(row.stock, int(Math.floor(num(st.stock[id]) + 1e-9)));
      txt(row.add, cart > 0 ? '+' + int(cart * it.pack) : '');
      var broke = max <= cart && cart < 99;
      txt(row.sub, cart > 0 ? int(cart) + ' ' + plural(cart, 'pack') + ' · ' + money(cart * row.price) : broke ? 'Not enough cash' : 'packs to buy');
      cls(row.sub, 'is-on', cart > 0);
      cls(row.sub, 'is-broke', broke && cart === 0);
      cls(row.el, 'is-in-cart', cart > 0);
    });
    txt(prep.cartTotal, info.cost > 0 ? 'Cart ' + money(info.cost) : 'Cart is empty');
    cls(prep.cartTotal, 'chip--lemon', info.cost > 0);

    ['lemons', 'sugar', 'ice'].forEach(function (key) { if (prep.rec[key].get() !== st.recipe[key]) prep.rec[key].set(num(st.recipe[key])); });
    var flavor = D.byId(D.flavors, st.flavor) || D.flavors[0];
    prep.glass.update(st.recipe, flavor);
    renderFlavors(st);

    if (Math.abs(prep.price.get() - st.price) > 1e-9) prep.price.set(num(st.price));
    var keep = Math.round((st.price - info.costPerCup) * 100) / 100;
    txt(prep.cpc, money(info.costPerCup));
    txt(prep.ppc, money(keep));
    cls(prep.ppc, 'good', keep > 0); cls(prep.ppc, 'bad', keep <= 0);

    var item = D.items[info.limiting] || D.items.lemons;
    SS.countTo(prep.cups, info.maxCups, { fmt: int, ms: 260, from: 0 });
    txt(prep.cupsWord, plural(info.maxCups, 'cup') + ' you can make');
    txt(prep.limit, info.maxCups > 0 ? RUNS_OUT[info.limiting] || '' : 'You need ' + item.name.toLowerCase() + ' first');
    cls(prep.cups, 'is-zero', info.maxCups < 1);
    txt(prep.sumCost, info.cost > 0 ? '-' + money(info.cost) : money(0));
    txt(prep.sumRentL, 'Rent at ' + loc.name);
    txt(prep.sumRent, info.rent > 0 ? '-' + money(info.rent) : 'Free');
    prep.sumTruckRow.hidden = !(num(info.truckRent) > 0);
    txt(prep.sumTruckL, 'Truck rent in ' + (info.truckCity || 'town'));
    txt(prep.sumTruck, info.truckShut ? 'Short: it stays shut' : '-' + money(num(info.truckRent)));
    cls(prep.sumTruck, 'bad', !!info.truckShut);
    txt(prep.sumLeft, money(info.cashAfter));
    cls(prep.sumLeft, 'bad', info.cashAfter < -0.004);

    prep.go.disabled = !info.canStart;
    // an empty cart is where every morning starts, not a mistake: a calm nudge. Red is kept for an Open press that fails.
    // "none" only when stock is the one thing missing: short on rent or an over-budget cart keeps the sim's own words (e.g. "set up on Maple Street")
    var why = info.reason || 'Not ready yet.', ly = st.lastResult;
    var ok = !!info.canStart, none = !ok && info.maxCups < 1 && info.cashAfter > -0.005 && why.indexOf('it is free') < 0;   // broke after rent: the sim names the free spot
    var want = ok && ly && ly.day === st.day - 1 ? Math.round(num(ly.cups) + num(ly.people && ly.people.soldout)) : 0;   // yesterday's cups plus sold-out turn-aways
    // judged against today's forecast and spot, so a stormy morning after a sunny day never asks for more stock
    var k = want > 0 ? Math.min(1, pull((st.forecast || {}).type, st.location) / pull(ly.weather && ly.weather.type, ly.location)) : 0;
    var low = want > 0 && info.maxCups < 0.8 * want * k;
    var msg = none ? 'Add ' + item.name.toLowerCase() + ' to your cart to open.' + (why.indexOf('Cancelling') >= 0 ? why.slice(why.indexOf('Cancelling')) : '')   // keep sim's truck fuel hint
      : !ok ? why
      : low ? 'Only ' + int(info.maxCups) + ' ' + plural(info.maxCups, 'cup') + '. About ' + int(want) + ' people wanted one yesterday, so you may sell out early.'
      : int(info.maxCups) + ' ' + plural(info.maxCups, 'cup') + ' ready to sell at ' + money(st.price) + ' each.';
    var ico = none ? item.icon : ok && !low ? 'check' : 'warning';
    if (prep.reasonKey !== ico) { prep.reasonKey = ico; prep.reasonIco.innerHTML = SS.icon(ico); }
    if (prep.reasonText._t !== msg) cls(prep.reason, 'is-bad', false);
    txt(prep.reasonText, msg);
    cls(prep.reason, 'is-ok', ok && !low);
    cls(prep.reason, 'is-warn', low || (!ok && !none));
    patchPrepDex(st);
    if (prep.truck) safe('truck card', prep.truck.refresh);
  }

  /** how many buyers a spot draws in that weather, relative (the sim's crowd scales with traffic, and buying with thirst) */
  function pull(wx, loc) { var w = D.weather[wx], l = D.byId(D.locations, loc); return w && l ? w.traffic * w.thirst * l.traffic : 0; }

  /** the Deals button (with a badge while a limited edition is unsold) and today's boost chips */
  function patchPrepDex(st) {
    var d = dex(), here = !!(d && d.present), lim = hasLimited(d), show = here && (!prep.deals.hidden || dexSetUp());   // once in, it stays in
    if (prep.deals.hidden === show) {
      prep.deals.hidden = !show;
      if (show && prep.live) dealsArrive(prep.deals);
    }
    cls(prep.deals, 'has-limited', lim);
    prep.deals.setAttribute('aria-label', lim ? 'Dex\'s deals. A limited edition is in today' : 'Dex\'s deals');
    cls(prep.foot, 'has-deals', here);
    var act = ((d && d.active) || st.boosts || []).filter(boostDef), key = act.join(',');
    if (prep.boostKey === key) return;
    prep.boostKey = key;
    prep.boosts.textContent = '';
    prep.boosts.hidden = !act.length;
    act.forEach(function (id) {
      var b = boostDef(id);
      prep.boosts.append(h('span', { class: 'chip prep-boost', role: 'listitem', title: b.desc }, boostDot(b), h('span', null, b.name + ' · today')));
    });
  }
  /** Dex is set up: his button springs into the footer with a glow ring (CSS) and a few twinkles on the FX layer */
  function dealsArrive(b) {
    restart(b, 'is-arriving');
    setTimeout(function () { b.classList.remove('is-arriving'); }, 1500);
    if (SS.reduced()) return;
    setTimeout(function () {
      var FX = SS.FX, cv = document.getElementById('fx');
      if (!FX || !FX.burst || !cv || !b.isConnected || b.hidden || document.querySelector('#modal-root > *')) return;
      var r = b.getBoundingClientRect(), c = cv.getBoundingClientRect();
      safe('deals twinkle', function () { FX.burst('twinkle', r.left + r.width / 2 - c.left, r.top + r.height / 2 - c.top, { count: 9, power: 1.5 }); });
    }, 330);
  }

  /* ------------------------------------------------------------------ *
   * RESULTS
   * ------------------------------------------------------------------ */
  function safeResult(r, st) {
    r = r || {};
    var p = r.people || {}, wx = r.weather || st.weather || {}, sp = r.spoiled || {}, hourly = [], i;
    for (i = 0; i < 9; i++) hourly.push(Math.max(0, num(r.hourly && r.hourly[i])));
    return {
      day: num(r.day) || num(st.day) || 1, location: r.location || st.location || 'street',
      weather: { type: D.weather[wx.type] ? wx.type : 'sunny', temp: num(wx.temp) || 24 }, event: r.event || null,
      cups: num(r.cups), revenue: num(r.revenue), tips: num(r.tips), ingredientCost: num(r.ingredientCost), rent: num(r.rent), profit: num(r.profit),
      people: { passed: num(p.passed), served: num(p.served), pricey: num(p.pricey), wait: num(p.wait), soldout: num(p.soldout), quit: num(p.quit) },
      satisfaction: SS.clamp(num(r.satisfaction), 0, 1), repBefore: SS.clamp(num(r.repBefore), 0, 5), repAfter: SS.clamp(num(r.repAfter), 0, 5),
      reviews: Array.isArray(r.reviews) ? r.reviews.filter(Boolean).slice(0, 6) : [], advice: r.advice || '',
      hourly: hourly, spoiled: { lemons: num(sp.lemons), ice: num(sp.ice) }, milestones: Array.isArray(r.milestones) ? r.milestones : [],
      bestDay: !!r.bestDay,
      loyalty: Math.max(0, num(r.loyalty)), boostCost: Math.max(0, num(r.boostCost)),
      boosts: (Array.isArray(r.boosts) ? r.boosts : []).filter(boostDef),
      regulars: (Array.isArray(r.regulars) ? r.regulars : []).filter(function (g) { return g && REG_OUT[g.outcome]; }).map(function (g) {
        return { id: g.id, name: String(g.name || 'A regular'), kind: g.kind, outcome: g.outcome, streak: Math.max(0, Math.floor(num(g.streak))),
          mult: num(g.mult) || SS.loyaltyMult(g.streak), bonus: Math.max(0, num(g.bonus)), reason: g.reason || '' };
      }).sort(function (a, b) { return REG_OUT[a.outcome] - REG_OUT[b.outcome] || b.streak - a.streak; })
    };
  }
  /* regulars on the results card: display order, and why a streak broke, in words */
  var REG_OUT = { streak: 1, 'new': 2, saved: 3, broken: 4, lost: 5, closed: 6, away: 7 };
  var REG_WHY = {
    taste: 'they did not like the taste', pricey: 'it cost too much for them', slow: 'they waited too long for their cup',
    wait: 'the line was too long', soldout: 'you had sold out', quit: 'they gave up waiting in line'
  };
  var REG_FACE = { streak: 'faceHappy', 'new': 'faceLove', saved: 'shield', broken: 'faceSad', lost: 'faceSad', closed: 'clock', away: 'regular' };
  function regLine(g) {
    switch (g.outcome) {
      case 'new': return 'New regular! Back tomorrow for a loyalty bonus';
      case 'streak': return g.bonus > 0.004 ? 'Streak ' + int(g.streak) + ' · paid ' + SS.fmtMult(SS.loyaltyMult(g.streak - 1)) + ' (+' + money(g.bonus) + ')'
        : 'Streak ' + int(g.streak) + ' · pays ' + SS.fmtMult(g.mult) + ' next visit';
      case 'broken': return 'Streak lost: ' + (REG_WHY[g.reason] || 'they left unhappy') + '. One more bad visit and they stop coming';
      case 'saved': return 'Your Streak Shield saved this streak';
      case 'lost': return 'Stopped coming after two bad visits';
      case 'closed': return 'Came by just as you closed. Streak kept';
      default: return 'Didn\'t come today. Streak kept';
    }
  }
  /** flame + streak number, cold when the streak is gone */
  function streakBadge(n, c) {
    return h('span', { class: 'reg-streak' + (n > 0 ? '' : ' is-cold') + (c ? ' ' + c : ''), title: 'Streak: ' + int(n) + ' happy ' + plural(n, 'visit') + ' in a row' },
      I('flame'), h('b', { class: 'num' }, int(n)), h('span', { class: 'hud-sr' }, ' visit streak'));
  }
  /** next = label it as the next visit's multiplier (results rows also mention what was paid today) */
  function multChip(m, next) {
    return h('span', { class: 'chip reg-mult num' + (m > 1.001 ? '' : ' is-flat'), title: (next ? 'Next visit: ' : 'Loyalty bonus: ') + 'pays ' + SS.fmtMult(m) + ' the price' },
      next ? h('span', { class: 'reg-mult-next' }, 'next ') : null, SS.fmtMult(m));
  }
  function moodFace(m) { return m > 0.6 ? 'faceLove' : m > 0.15 ? 'faceHappy' : m > -0.25 ? 'faceMeh' : m > -0.65 ? 'faceSad' : 'faceAngry'; }
  function signed(n) { return (n > 0.004 ? '+' : '') + money(n); }

  function stopReveal() {
    if (!res) return;
    res.timers.forEach(clearTimeout);
    res.timers = [];
  }
  function runStep(s, instant) {
    if (s.ran) return;
    s.ran = true;
    safe('results reveal', function () { s.fn(instant); });
    // a closed "Day details" still reports layout boxes for what is inside it: never scroll after those
    if (!instant && s.el && res && res.follow && !s.el.closest('details:not([open])')) {
      var b = body.getBoundingClientRect(), r = s.el.getBoundingClientRect();
      if (r.bottom > b.bottom - 8) body.scrollTo({ top: body.scrollTop + Math.min(r.bottom - b.bottom + 20, r.top - b.top - 8), behavior: 'smooth' });
    }
  }
  function revealDone() {
    res.done = true;
    res.root.classList.add('is-done');
    if (res.skip) res.skip.remove();
  }
  function finishReveal() {
    if (!res || res.done) return;
    stopReveal();
    res.root.classList.add('res--instant');
    // every step again, instantly: steps are idempotent, and this snaps counters that were still ticking
    res.steps.forEach(function (s) { s.ran = true; safe('results reveal', function () { s.fn(true); }); });
    revealDone();
    toTop();                                                // land on "Day N done" and the profit, not where the reveal had scrolled
  }
  function playReveal() {
    if (SS.reduced()) { finishReveal(); return; }
    var lastAt = 0;
    res.steps.forEach(function (s) {
      lastAt = Math.max(lastAt, s.at);
      res.timers.push(setTimeout(function () { if (res) runStep(s, false); }, s.at));
    });
    res.timers.push(setTimeout(function () {
      if (!res) return;
      revealDone();
      if (res.follow) body.scrollTo({ top: 0, behavior: 'smooth' });   // back up to the headline, unless the player took over the scrolling
    }, lastAt + 700));
  }

  function spoilText(sp, st) {
    var parts = [];
    if (sp.lemons > 0) parts.push(int(sp.lemons) + ' ' + plural(sp.lemons, 'lemon') + ' will go soft');
    if (sp.ice > 0) parts.push(int(sp.ice) + ' ice ' + plural(sp.ice, 'cube') + ' will melt');
    if (!parts.length) return 'Nothing in the pantry will spoil overnight.';
    var cooler = st.upgrades && st.upgrades.cooler | 0;
    return 'Overnight, ' + parts.join(' and ') + '.' + (sp.ice > 0 && cooler < 1 ? ' A cooler from the shop saves ice.' : '');
  }

  function buildResults(st) {
    stopReveal();
    var raw = st.lastResult, r = safeResult(raw, st), S = sim();
    res = { st: st, raw: raw, r: r, timers: [], steps: [], done: false, follow: true, root: null };
    body.textContent = ''; foot.textContent = '';
    var at = 0;
    /** reveal `el` at the running clock, then advance the clock by `gap` */
    function step(el, gap, fn, followEl) {
      if (el) el.classList.add('res-step');
      res.steps.push({ at: at, el: followEl || el, ran: false, fn: function (instant) { if (el) el.classList.add('is-in'); if (fn) fn(instant); } });
      at += gap;
    }

    /* header */
    var wx = D.weather[r.weather.type], loc = D.byId(D.locations, r.location) || D.locations[0];
    var head = h('header', { class: 'res-head' },
      h('div', { class: 'res-head-main' }, h('span', { class: 'label' }, loc.name), h('h2', { class: 'display res-title' }, 'Day ' + int(r.day) + ' done')),
      h('div', { class: 'res-head-chips' },
        h('span', { class: 'chip chip--sky' }, I(wx.icon), wx.name + ' ' + SS.fmtTemp(r.weather.temp)),
        r.event && r.event.title ? h('span', { class: 'chip' }, I(r.event.icon || 'newspaper'), r.event.title) : null));
    step(head, 260);                 // a short beat for the title before the numbers roll

    /* hero + tally */
    var profit = r.profit, tone = profit > 0.004 ? 'good' : profit < -0.004 ? 'bad' : '';
    var heroN = h('strong', { class: 'display num res-hero-n ' + tone + (money(profit).length > 8 ? ' is-long' : '') }, money(0));
    var ribbon = r.bestDay && profit > 0.004 ? h('span', { class: 'res-ribbon' }, I('medal'), 'Best day yet') : null;
    var hero = h('div', { class: 'res-hero-top' }, h('span', { class: 'label' }, tone === 'bad' ? 'Today\'s loss' : tone === 'good' ? 'Today\'s profit' : 'You broke even'), heroN, ribbon);
    var tally = h('dl', { class: 'res-tally' });
    var rows = [
      ['cup', 'Cups sold', int(r.cups), ''],
      ['coin', 'Sales', signed(r.revenue), r.revenue > 0 ? 'good' : ''],
      ['tipjar', 'Tips', signed(r.tips), r.tips > 0 ? 'good' : ''],
      r.loyalty > 0.004 ? ['regular', 'Loyalty bonus', signed(r.loyalty), 'good'] : null,
      ['lemon', 'Ingredients', r.ingredientCost > 0 ? '-' + money(r.ingredientCost) : money(0), r.ingredientCost > 0 ? 'bad' : ''],
      ['locStreet', 'Rent', r.rent > 0 ? '-' + money(r.rent) : 'Free', r.rent > 0 ? 'bad' : ''],
      r.boostCost > 0.004 ? ['dealer', 'Dex\'s deals', '-' + money(r.boostCost), 'bad', r.boosts] : null
    ].filter(Boolean).map(function (d) {
      var dots = d[4] && d[4].length ? h('span', { class: 'res-row-dots', 'aria-hidden': 'true' }, d[4].map(function (id) { return boostDot(boostDef(id)); })) : null;
      return h('div', { class: 'res-row' }, h('dt', null, I(d[0]), d[1], dots), h('dd', { class: 'num ' + d[3] }, d[2]));
    });
    var totalRow = h('div', { class: 'res-row res-row--total' }, h('dt', null, tone === 'bad' ? 'Loss' : 'Profit'), h('dd', { class: 'num ' + tone }, money(profit)));
    var truckRows = safe('truck results', function () { return truckResultRows(raw, st); }) || [];
    if (truckRows.length) { rows = rows.concat(truckRows); totalRow.firstChild.textContent = tone === 'bad' ? 'Total loss' : 'Total profit'; }
    res.cash = h('b', { class: 'num' }, money(st.cash));
    var cashLine = h('p', { class: 'res-cash' }, I('cash'), 'Cash on hand ', res.cash);
    rows.concat([totalRow]).forEach(function (el) { tally.append(el); });
    var heroBox = h('section', { class: 'panel res-hero res-hero--' + (tone || 'even') }, hero, tally, cashLine);
    hero.append(squeezyReact(r, raw));
    step(heroBox, 260, function (instant) {
      SS.countTo(heroN, profit, { from: 0, ms: instant ? 0 : 1000 });
      if (!instant) SS.sfx('whoosh');
    }, hero);
    rows.forEach(function (el) { step(el, 190, function (instant) { if (!instant) SS.sfx('tally'); if (el._in) el._in(instant); }); });
    step(totalRow, 240, function (instant) { if (!instant) { SS.sfx('tally'); restart(heroN, 'res-pop'); } });
    if (ribbon) step(ribbon, 200);
    step(cashLine, 260);

    /* hourly chart */
    var peak = Math.max.apply(null, r.hourly), topAt = r.hourly.indexOf(peak);
    var chart = h('div', { class: 'res-chart', role: 'img', 'aria-label': 'Cups sold each hour: ' + r.hourly.map(function (n, i) { return HOURS[i] + ' ' + int(n); }).join(', ') });
    r.hourly.forEach(function (n, i) {
      chart.append(h('div', { class: 'res-bar' + (peak > 0 && i === topAt ? ' is-top' : '') + (n > 0 ? '' : ' is-empty'), style: '--v:' + (peak > 0 && n > 0 ? Math.max(0.07, n / peak).toFixed(3) : 0) + ';--i:' + i },
        h('span', { class: 'res-bar-col' }, h('b', { class: 'num res-bar-n' }, n > 0 ? int(n) : ''), h('i')),
        h('span', { class: 'res-bar-l' }, HOURS[i])));
    });
    var hours = h('section', { class: 'res-sec res-hours' }, h('h3', { class: 'display res-sec-title' }, I('chart'), 'Cups by the hour'),
      h('div', { class: 'well res-chart-box' }, chart, peak > 0 ? null : h('p', { class: 'res-empty' }, 'No cups sold today.')),
      peak > 0 ? h('p', { class: 'res-note' }, 'Your busiest hour was ' + HOURS[topAt] + ' with ' + int(peak) + ' ' + plural(peak, 'cup') + '.') : null);
    // hours, crowd, rep and regulars sit in the closed "Day details": they get set up with no wait and no sound
    step(hours, 0);

    /* the crowd */
    var p = r.people, lost = p.pricey + p.wait + p.soldout + p.quit, passed = Math.max(p.passed, p.served + lost), rest = passed - p.served - lost;
    var segs = [
      ['served', 'Bought a drink', p.served], ['pricey', 'Thought it cost too much', p.pricey], ['wait', 'Saw the line and walked on', p.wait],
      ['quit', 'Gave up waiting in line', p.quit], ['soldout', 'Came by after you sold out', p.soldout], ['rest', 'Were not thirsty', rest]
    ].filter(function (s, i) { return s[2] > 0 || i === 0; });
    var bar = h('div', { class: 'res-crowd-bar', role: 'img', 'aria-label': segs.map(function (s) { return int(s[2]) + ' ' + s[1].toLowerCase(); }).join(', ') });
    var legend = h('ul', { class: 'res-legend' });
    segs.forEach(function (s) {
      if (s[2] > 0) bar.append(h('i', { class: 'res-seg res-seg--' + s[0], style: 'flex-grow:' + s[2] }));
      legend.append(h('li', null, h('i', { class: 'res-dot res-seg--' + s[0] }), h('span', null, s[1]), h('b', { class: 'num' }, int(s[2]))));
    });
    var crowd = h('section', { class: 'res-sec res-crowd' }, h('h3', { class: 'display res-sec-title' }, I('people'), 'The crowd'),
      h('p', { class: 'res-crowd-line' }, passed > 0
        ? [h('b', { class: 'num' }, int(passed)), ' ' + plural(passed, 'person', 'people') + ' walked by and ', h('b', { class: 'num' }, int(p.served)), ' bought a drink' +
          (lost > 0 ? '. You lost ' + int(lost) + ' who wanted one.' : '.')]
        : 'Nobody walked by today.'),
      h('div', { class: 'res-crowd-track' }, bar), legend);
    step(crowd, 0);

    /* satisfaction + reputation */
    var sat = r.satisfaction, asked = p.served > 0;
    var meter = h('div', { class: 'meter res-sat-meter', style: '--v:0;--meter-fill:' + (sat >= 0.7 ? 'var(--leaf)' : sat >= 0.45 ? 'var(--lemon)' : 'var(--coral)') }, h('i'));
    var satN = h('b', { class: 'num res-sat-n' }, asked ? '0%' : 'Nobody to ask');
    var starsBox = h('span', { class: 'res-stars-row', html: SS.starsHTML(r.repBefore) });
    var starsN = h('b', { class: 'display num res-stars-n' }, stars1(r.repBefore));
    var d = r.repAfter - r.repBefore, flat = Math.abs(d) < 0.005;
    var delta = h('span', { class: 'chip res-stars-delta ' + (flat ? '' : d > 0 ? 'chip--good' : 'chip--bad') },
      flat ? 'No change' : [I(d > 0 ? 'arrowUp' : 'arrowDown'), (d > 0 ? '+' : '-') + (Math.abs(d) < 0.095 ? Math.abs(d).toFixed(2) : Math.abs(d).toFixed(1))]);
    var rep = h('section', { class: 'res-sec res-rep' },
      h('div', { class: 'well res-rep-box' },
        h('div', { class: 'res-sat' }, h('div', { class: 'res-rep-top' }, h('span', { class: 'label' }, 'Happy customers'), satN),
          h('div', { class: 'res-sat-row' }, I(asked ? moodFace(sat * 2 - 1.05) : 'faceMeh', 'res-sat-face'), meter)),
        h('div', { class: 'res-stars' }, h('div', { class: 'res-rep-top' }, h('span', { class: 'label' }, 'Reputation'), delta),
          h('div', { class: 'res-stars-line' }, starsBox, starsN))));
    step(rep, 0, function (instant) {
      if (asked) { meter.style.setProperty('--v', sat.toFixed(3)); SS.countTo(satN, sat * 100, { from: 0, ms: instant ? 0 : 700, fmt: function (v) { return Math.round(v) + '%'; } }); }
      var on = starsBox.querySelector('.stars-on'), wrap = starsBox.querySelector('.stars');
      if (on) on.style.width = (r.repAfter / 5 * 100).toFixed(1) + '%';
      if (wrap) wrap.setAttribute('aria-label', stars1(r.repAfter) + ' out of 5 stars');
      SS.countTo(starsN, r.repAfter, { from: r.repBefore, ms: instant ? 0 : 700, fmt: stars1 });
      delta.classList.add('is-in');
    });

    /* regulars */
    var regsNow = Array.isArray(st.regulars) ? st.regulars.length : 0, regEls = [];
    var regsHead = h('div', { class: 'res-regs-head' }, h('h3', { class: 'display res-sec-title' }, I('regular'), 'Regulars'),
      regsNow > 0 ? h('button', { class: 'btn btn--sm res-regs-all', type: 'button', onclick: function () { SS.sfx('click'); openRegulars(); } },
        'See all ' + int(regsNow)) : null);
    var regsGrid = h('div', { class: 'res-regs-grid' });
    r.regulars.forEach(function (g, i) {
      var el = h('article', { class: 'res-reg res-reg--' + g.outcome, style: '--i:' + i },
        h('span', { class: 'res-reg-face' }, I(REG_FACE[g.outcome] || 'regular')),
        h('div', { class: 'res-reg-main' },
          h('div', { class: 'res-reg-top' },
            h('strong', { class: 'res-reg-name' }, g.name), h('span', { class: 'label res-reg-kind' }, kindName(g.kind)),
            g.outcome === 'new' ? h('span', { class: 'chip res-reg-new' }, 'New') : null),
          h('p', { class: 'res-reg-line' }, regLine(g))),
        g.outcome === 'lost' ? null : h('div', { class: 'res-reg-side' }, streakBadge(g.streak), multChip(g.mult, true)));
      regEls.push(el); regsGrid.append(el);
    });
    var regsEmpty = r.regulars.length ? null : h('p', { class: 'well res-regs-empty' }, I(regsNow ? 'calendar' : 'regular'),
      h('span', null, regsNow ? 'Your regulars took the day off. Their streaks are safe.' : 'Make someone really happy and they might come back tomorrow.'));
    var regs = h('section', { class: 'res-sec res-regs' }, regsHead, r.regulars.length ? regsGrid : regsEmpty);
    step(regsHead, 0);
    if (regEls.length) regEls.forEach(function (el) { step(el, 0); }); else step(regsEmpty, 0);

    /* reviews: three cards are plenty to read */
    var cards = h('div', { class: 'res-reviews-grid' }), reviewEls = [];
    r.reviews.slice(0, 3).forEach(function (rv) {
      var mood = SS.clamp(num(rv.mood), -1, 1), kind = D.kinds[rv.who];
      if (rv.kind !== 'great' && rv.kind !== 'cheap') mood = Math.min(mood, 0.1);   // a complaint never gets a smiling face
      var el = h('article', { class: 'res-review res-review--' + (mood > 0.15 ? 'good' : mood > -0.25 ? 'meh' : 'bad') },
        I(moodFace(mood), 'res-review-face'),
        h('div', { class: 'res-review-main' }, h('p', { class: 'res-review-text' }, '“' + (rv.text || '...') + '”'), h('span', { class: 'label res-review-who' }, kind ? kind.name : 'Customer')));
      reviewEls.push(el); cards.append(el);
    });
    var reviewsHead = h('h3', { class: 'display res-sec-title' }, I('heart'), 'What people said');
    var advice = r.advice ? h('div', { class: 'res-advice' }, h('span', { class: 'res-advice-ico', html: SS.icon('sparkle') }),
      h('div', null, h('span', { class: 'label' }, 'Tip for tomorrow'), h('p', null, r.advice))) : null;
    var reviews = h('section', { class: 'res-sec res-reviews' }, reviewsHead,
      r.reviews.length ? cards : h('p', { class: 'well res-empty' }, 'No reviews today. Nobody stopped for a cup.'), advice);
    step(reviewsHead, 160);
    if (r.reviews.length) reviewEls.forEach(function (el) { step(el, 110); }); else step(reviews.querySelector('.res-empty'), 160);
    if (advice) step(advice, 360);

    /* overnight + milestones */
    res.spoil = h('span');
    var badges = r.milestones.map(function (id) { return D.byId(D.milestones, id); }).filter(Boolean).map(function (m) {
      return h('span', { class: 'res-badge' }, I('medal'), h('b', null, m.title), m.reward > 0 ? h('span', { class: 'num res-badge-r' }, '+' + moneyShort(m.reward)) : null);
    });
    var after = h('section', { class: 'res-sec res-after' },
      badges.length ? h('div', { class: 'res-badges' }, h('span', { class: 'label' }, plural(badges.length, 'Goal') + ' reached today'), h('div', { class: 'res-badges-row' }, badges)) : null,
      h('p', { class: 'res-spoil' }, I('ice'), res.spoil));
    step(after, 300, function (instant) { if (!instant && badges.length) SS.sfx('tally'); });
    var more = h('details', { class: 'res-sec res-more', ontoggle: function () { SS.sfx('click'); } },
      h('summary', { class: 'res-more-sum' }, I('chart'), 'Day details'), hours, crowd, rep, regs);
    step(more, 0);

    res.root = h('div', { class: 'res', onclick: function (e) { if (!e.target.closest('button, a')) finishReveal(); } },
      head, h('div', { class: 'res-grid' }, heroBox, reviews, after, more));
    body.append(res.root);
    ['wheel', 'touchmove'].forEach(function (n) { res.root.addEventListener(n, function () { if (res) res.follow = false; }, { passive: true }); });

    /* footer: the skip hint lives here, off the card, until the reveal ends */
    res.skip = h('button', { class: 'res-skip', type: 'button', onclick: finishReveal }, 'Tap to skip');
    foot.append(res.skip, h('div', { class: 'res-foot' }, navBtn('shop', 'Shop', 'shop'), navBtn('map', 'Map', 'map'), navBtn('goals', 'Goals', 'trophy'),
      h('button', { class: 'btn btn--go btn--lg res-next', type: 'button', 'data-tut': 'next', onclick: function () { if (S && S.nextDay) S.nextDay(); } }, 'Next day', I('arrowRight'))));

    patchResults();
    showSheet('center');
    playReveal();
  }

  function patchResults() {
    var st = SS.state;
    if (!res || !st || st.phase !== 'results') return;
    SS.countTo(res.cash, num(st.cash), { ms: 400 });
    var sp = (st.lastResult && st.lastResult.spoiled) || res.r.spoiled;      // a cooler bought tonight changes this
    txt(res.spoil, spoilText({ lemons: num(sp.lemons), ice: num(sp.ice) }, st));
  }

  /* ------------------------------------------------------------------ *
   * Bus wiring
   * ------------------------------------------------------------------ */
  function onPhase() {
    var st = SS.state, to = st ? st.phase : 'title';
    if (!sheet) return;
    if (st && to === 'prep' && st.market) {
      if (prep && prep.st === st && prep.day === st.day && !sheet.hidden) patchPrep();
      else { res = (stopReveal(), null); safe('prep screen', function () { buildPrep(st); }); }
    } else if (st && to === 'results') {
      if (!(res && res.st === st && res.raw === st.lastResult && !sheet.hidden)) { prep = null; safe('results screen', function () { buildResults(st); }); }
    } else hideSheet();
    if (modal) safe('modal refresh', modal.refresh);
  }
  function onChange() {
    var st = SS.state;
    if (!st) return;
    if (st.phase === 'prep') safe('prep patch', patchPrep);
    else if (st.phase === 'results') safe('results patch', patchResults);
    if (modal) safe('modal refresh', modal.refresh);
  }

  /* ------------------------------------------------------------------ *
   * MODALS: shared bits
   * ------------------------------------------------------------------ */
  /** cash and stars, kept current while the modal is open */
  function cashStrip() {
    var cash = h('b', { class: 'display num shop-cash-n' });
    var starsBox = h('span', { class: 'shop-cash-stars' }), repN = h('b', { class: 'num' }), lastRep = null;
    var el = h('div', { class: 'shop-cash' },
      h('div', { class: 'shop-cash-box' }, I('coin', 'shop-cash-ico'), h('div', { class: 'shop-cash-text' }, h('span', { class: 'label' }, 'Cash on hand'), cash)),
      h('div', { class: 'shop-cash-box shop-cash-rep' }, h('div', { class: 'shop-cash-text' }, h('span', { class: 'label' }, 'Reputation'), h('span', { class: 'shop-cash-row' }, starsBox, repN))));
    return { el: el, refresh: function () {
      var st = SS.state;
      if (!st) return;
      SS.countTo(cash, num(st.cash), { ms: 450 });
      var rep = stars1(st.reputation);
      if (rep !== lastRep) { lastRep = rep; starsBox.innerHTML = SS.starsHTML(num(st.reputation)); txt(repN, rep); }
    } };
  }
  function refuse(card, why, reason) {
    SS.sfx('error');
    restart(card, 'shop-shake');
    if (why) { txt(why, reason || 'That did not work. Try again in a moment.'); why.hidden = false; }
  }
  function stamp(card, text) {
    var el = card.querySelector('.shop-stamp');
    if (el) el.textContent = text;
    restart(card, 'shop-stamped');
    clearTimeout(card._stampT);
    card._stampT = setTimeout(function () { card.classList.remove('shop-stamped'); }, 1250);
  }
  function stampEl() { return h('span', { class: 'shop-stamp', 'aria-hidden': 'true' }); }
  function reqChip(icon, text) { var t = h('span'); var el = h('span', { class: 'chip shop-reqchip' }, h('span', { class: 'shop-reqchip-ico' }), t); el.set = function (met, s) { txt(t, s || text); cls(el, 'is-met', met); var k = met ? 'check' : icon; if (el._k !== k) { el._k = k; el.firstChild.innerHTML = SS.icon(k); } }; return el; }

  /* ------------------------------------------------------------------ *
   * SHOP
   * ------------------------------------------------------------------ */
  function upgradeCard(u) {
    var S = sim(), pips = h('div', { class: 'shop-pips', role: 'img' });
    var pipEls = u.levels.map(function () { return pips.appendChild(h('i')); });
    var nowT = h('span'), nextT = h('span');
    var now = h('p', { class: 'shop-line' }, h('span', { class: 'label' }, 'You have'), nowT);
    var next = h('p', { class: 'shop-line shop-line--next' }, h('span', { class: 'label' }, 'Next'), nextT);
    var why = h('p', { class: 'shop-why', role: 'alert', hidden: true }), cost = h('span', { class: 'num' });
    var btn = h('button', { class: 'btn btn--primary shop-buy', type: 'button', onclick: buy }, I('coin'), cost);
    var maxed = h('span', { class: 'chip chip--good shop-maxed' }, I('check'), 'Maxed');
    var card = h('article', { class: 'panel shop-card' },
      h('div', { class: 'shop-art', html: SS.icon(u.icon) }),
      h('div', { class: 'shop-main' }, h('div', { class: 'shop-top' }, h('h4', { class: 'display shop-name' }, u.name), pips), h('p', { class: 'shop-desc' }, u.desc), now, next),
      h('div', { class: 'shop-act' }, btn, maxed, why), stampEl());
    var seen = -1;
    function buy() {
      var r = S && S.buyUpgrade ? S.buyUpgrade(u.id) : null;
      if (r && r.ok) { why.hidden = true; stamp(card, 'Bought!'); } else refuse(card, why, r && r.reason);
      refresh();
    }
    function refresh() {
      var info = (S && S.upgradeInfo && S.upgradeInfo(u.id)) || { level: 0, max: u.levels.length, next: null, canAfford: false };
      var lvl = SS.clamp(info.level | 0, 0, u.levels.length);
      pipEls.forEach(function (e, i) { var on = i < lvl; if (on && seen >= 0 && i >= seen) restart(e, 'shop-pip-pop'); cls(e, 'is-on', on); });
      pips.setAttribute('aria-label', 'Level ' + lvl + ' of ' + u.levels.length);
      now.hidden = lvl < 1;
      if (lvl > 0) txt(nowT, u.levels[lvl - 1].label);
      next.hidden = !info.next;
      btn.hidden = !info.next; maxed.hidden = !!info.next;
      if (info.next) {
        txt(nextT, info.next.label);
        txt(cost, 'Buy for ' + moneyShort(info.next.cost));
        btn.setAttribute('aria-disabled', info.canAfford ? 'false' : 'true');
        btn.setAttribute('aria-label', 'Buy ' + info.next.label + ' for ' + money(info.next.cost));
        if (info.canAfford) why.hidden = true;
      } else why.hidden = true;
      cls(card, 'is-max', !info.next);
      cls(card, 'is-owned', lvl > 0);
      seen = lvl;
    }
    refresh();
    return { el: card, refresh: refresh };
  }

  function flavorCard(f) {
    var S = sim(), why = h('p', { class: 'shop-why', role: 'alert', hidden: true });
    var btnT = h('span'), btnI = h('span', { class: 'shop-buy-ico' });
    var btn = h('button', { class: 'btn btn--primary shop-buy', type: 'button', onclick: act }, btnI, btnT);
    var inUse = h('span', { class: 'chip chip--lemon shop-maxed' }, I('check'), 'Pouring now');
    var req = reqChip('star', stars1(f.repReq) + ' stars');
    var facts = h('ul', { class: 'shop-facts' },
      h('li', null, I(f.wtp > 0 ? 'arrowUp' : 'tag'), f.wtp > 0 ? 'People pay about ' + Math.round(f.wtp * 100) + '% more' : 'The regular price'),
      h('li', null, I('coin'), f.extraCost > 0 ? money(f.extraCost / 10) + ' more a cup to make' : 'No extra cost to make'));
    var only = f.limited ? h('p', { class: 'shop-only' }, I('dealer'), h('span', null, 'Limited edition · only from Dex the Dealer')) : null;
    var card = h('article', { class: 'panel shop-card shop-card--flavor' + (f.limited ? ' shop-card--limited' : '') },
      tinted('drink', f.color, 'shop-art shop-art--drink'),
      h('div', { class: 'shop-main' }, h('div', { class: 'shop-top' }, h('h4', { class: 'display shop-name' }, f.name),
        f.limited ? h('span', { class: 'chip shop-lim-chip' }, I('sparkle'), 'Limited') : f.repReq > 0 ? req : null), h('p', { class: 'shop-desc' }, f.blurb), facts),
      h('div', { class: 'shop-act' }, btn, inUse, only, why), stampEl());
    function act() {
      var info = S && S.flavorInfo ? S.flavorInfo(f.id) : null, r = null;
      if (f.limited && info && !info.owned) { refuse(card, why, info.reason); return; }
      if (info && info.owned) { r = S.setFlavor(f.id); if (r && r.ok) stamp(card, 'Pouring!'); }
      else if (info) { r = S.buyFlavor(f.id); if (r && r.ok) stamp(card, 'Unlocked!'); }
      if (r && r.ok) why.hidden = true; else refuse(card, why, r && r.reason);
      refresh();
    }
    function refresh() {
      var st = SS.state, info = (S && S.flavorInfo && S.flavorInfo(f.id)) || { owned: false, current: false, canBuy: false, reason: '' };
      var mode = info.current ? 'on' : info.owned ? 'own' : 'buy', locked = !!f.limited && !info.owned;
      btn.hidden = info.current || locked; inUse.hidden = !info.current;
      if (only) only.hidden = !locked;
      cls(card, 'is-locked', locked);
      req.hidden = info.owned;
      req.set(!!st && st.reputation + 1e-9 >= f.repReq, 'Needs ' + stars1(f.repReq) + ' stars');
      if (card._mode !== mode) {
        card._mode = mode;
        btnI.innerHTML = mode === 'buy' ? SS.icon('coin') : '';
        btn.classList.toggle('btn--primary', mode === 'buy'); btn.classList.toggle('btn--sky', mode === 'own');
      }
      txt(btnT, mode === 'buy' ? (f.cost > 0 ? 'Unlock for ' + moneyShort(f.cost) : 'Unlock') : 'Pour this');
      btn.setAttribute('aria-label', mode === 'buy' ? 'Unlock ' + f.name + ' for ' + money(f.cost) : 'Pour ' + f.name);
      btn.setAttribute('aria-disabled', mode === 'buy' && !info.canBuy ? 'true' : 'false');
      if (mode !== 'buy' || info.canBuy) why.hidden = true;
      cls(card, 'is-on', info.current); cls(card, 'is-owned', info.owned);
    }
    refresh();
    return { el: card, refresh: refresh };
  }

  function buildShop() {
    var strip = cashStrip(), cards = [], tabs = {}, counts = {};
    var grids = { upgrades: h('div', { class: 'shop-grid', role: 'tabpanel', 'aria-label': 'Upgrades' }), flavors: h('div', { class: 'shop-grid', role: 'tabpanel', 'aria-label': 'Flavors' }) };
    D.upgrades.forEach(function (u, i) { var c = upgradeCard(u); c.el.style.setProperty('--i', i); cards.push(c); grids.upgrades.append(c.el); });
    D.flavors.forEach(function (f, i) { var c = flavorCard(f); c.el.style.setProperty('--i', i); cards.push(c); grids.flavors.append(c.el); });
    function setTab(t) {
      shopTab = t;
      cards.forEach(function (c) { c.el.classList.remove('shop-shake'); });
      ['upgrades', 'flavors'].forEach(function (k) { var on = k === t; cls(tabs[k], 'is-on', on); tabs[k].setAttribute('aria-selected', on ? 'true' : 'false'); grids[k].hidden = !on; });
    }
    function tab(k, label, icon) {
      counts[k] = h('span', { class: 'num shop-tab-n' });
      return (tabs[k] = h('button', { class: 'shop-tab', type: 'button', role: 'tab', onclick: function () { if (shopTab !== k) { SS.sfx('click'); setTab(k); } } }, icon, h('span', null, label), counts[k]));
    }
    var el = h('div', { class: 'shop' },
      h('div', { class: 'shop-bar' }, strip.el,
        h('div', { class: 'shop-tabs', role: 'tablist' }, tab('upgrades', 'Upgrades', I('juicer')), tab('flavors', 'Flavors', tinted('drink', '#ff8fb3', 'shop-tab-drink')))),
      grids.upgrades, grids.flavors);
    function refresh() {
      var st = SS.state;
      if (!st) return;
      strip.refresh();
      cards.forEach(function (c) { c.refresh(); });
      var got = 0, all = 0;
      D.upgrades.forEach(function (u) { all += u.levels.length; got += SS.clamp(num(st.upgrades && st.upgrades[u.id]), 0, u.levels.length); });
      txt(counts.upgrades, got + '/' + all);
      txt(counts.flavors, (st.flavors ? st.flavors.length : 1) + '/' + D.flavors.length);
    }
    setTab(shopTab);
    refresh();
    return { el: el, refresh: refresh };
  }

  /* ------------------------------------------------------------------ *
   * MAP
   * ------------------------------------------------------------------ */
  function buildMap() {
    var S = sim(), strip = cashStrip(), stops = [];
    var maxT = 1, maxW = 1;
    D.locations.forEach(function (l) { maxT = Math.max(maxT, l.traffic); maxW = Math.max(maxW, l.wtp); });
    var list = h('ol', { class: 'map-route' });
    D.locations.forEach(function (loc, i) {
      var who = Object.keys(loc.mix || {}).filter(function (k) { return D.kinds[k]; }).sort(function (a, b) { return loc.mix[b] - loc.mix[a]; }).slice(0, 3)
        .map(function (k) { return D.kinds[k].name + 's'; });
      var pin = h('span', { class: 'map-pin' }), why = h('p', { class: 'shop-why', role: 'alert', hidden: true });
      var here = h('span', { class: 'chip chip--lemon map-here' }, I('stand'), 'You are here');
      var reqCost = reqChip('lock', ''), reqRep = reqChip('lock', '');
      var reqs = h('div', { class: 'map-reqs' }, loc.unlockCost > 0 ? reqCost : null, loc.repReq > 0 ? reqRep : null);
      var btnT = h('span'), btn = h('button', { class: 'btn map-btn', type: 'button', onclick: act }, btnT);
      function meter(label, v, max, fill) {
        return h('div', { class: 'map-meter' }, h('span', { class: 'label' }, label),
          h('div', { class: 'meter', style: '--v:' + SS.clamp(v / max, 0.04, 1).toFixed(3) + ';--meter-fill:' + fill, role: 'img', 'aria-label': label + ' ' + Math.round(v / max * 100) + ' percent of the busiest spot' }, h('i')));
      }
      var card = h('article', { class: 'panel map-card' },
        h('div', { class: 'map-art', html: SS.icon('loc' + loc.id.charAt(0).toUpperCase() + loc.id.slice(1)) }),
        h('div', { class: 'map-main' },
          h('div', { class: 'map-top' }, h('h4', { class: 'display map-name' }, loc.name), here),
          h('p', { class: 'map-blurb' }, loc.blurb),
          h('div', { class: 'map-meters' }, meter('Foot traffic', loc.traffic, maxT, 'var(--sky)'), meter('Spending', loc.wtp, maxW, 'var(--lemon)')),
          h('p', { class: 'map-who' }, I('people'), h('span', null, 'You will meet ' + listJoin(who).toLowerCase() + '.'))),
        h('div', { class: 'map-side' },
          h('div', { class: 'map-rent' }, h('span', { class: 'label' }, 'Rent'), h('b', { class: 'num' }, loc.rent > 0 ? moneyShort(loc.rent) : 'Free'), loc.rent > 0 ? h('span', { class: 'map-rent-per' }, 'a day') : null),
          reqs, btn, why), stampEl());
      var li = h('li', { class: 'map-stop', style: '--i:' + i }, h('div', { class: 'map-rail' }, pin), card);
      list.append(li);
      function act() {
        var info = S && S.locationInfo ? S.locationInfo(loc.id) : null, r = null;
        if (info && info.unlocked) { r = S.setLocation(loc.id); if (r && r.ok) stamp(card, 'Moved in!'); }
        else if (info) { r = S.unlockLocation(loc.id); if (r && r.ok) stamp(card, 'Unlocked!'); }
        if (r && r.ok) why.hidden = true;
        refreshAll();
        if (!(r && r.ok)) refuse(card, why, r && r.reason);
      }
      stops.push(function (st) {
        var info = (S && S.locationInfo && S.locationInfo(loc.id)) || { unlocked: false, current: false, canUnlock: false, reason: '' };
        var mode = info.current ? 'here' : info.unlocked ? 'open' : 'locked';
        cls(li, 'is-here', info.current); cls(li, 'is-locked', !info.unlocked);
        if (li._mode !== mode) {
          li._mode = mode;
          pin.innerHTML = mode === 'locked' ? SS.icon('lock') : mode === 'here' ? SS.icon('stand') : '<b class="num">' + (i + 1) + '</b>';
          btn.classList.toggle('btn--go', mode === 'open'); btn.classList.toggle('btn--primary', mode === 'locked');
        }
        here.hidden = !info.current; btn.hidden = info.current; reqs.hidden = info.unlocked;
        reqCost.set(st.cash + 1e-9 >= loc.unlockCost, moneyShort(loc.unlockCost) + ' to unlock');
        reqRep.set(st.reputation + 1e-9 >= loc.repReq, 'Needs ' + stars1(loc.repReq) + ' stars');
        txt(btnT, mode === 'locked' ? (loc.unlockCost > 0 ? 'Unlock for ' + moneyShort(loc.unlockCost) : 'Unlock') : 'Set up here');
        btn.setAttribute('aria-disabled', mode === 'locked' && !info.canUnlock ? 'true' : 'false');
        if (mode !== 'locked' || info.canUnlock) { if (mode !== 'open' || shopOpen(st)) why.hidden = true; }
      });
    });
    var note = h('p', { class: 'map-note', hidden: true }, I('info'), 'You can move the stand before you open, not while it is open.');
    function refreshAll() {
      var st = SS.state;
      if (!st) return;
      strip.refresh();
      note.hidden = shopOpen(st);
      stops.forEach(function (fn) { fn(st); });
    }
    refreshAll();
    return { el: h('div', { class: 'map' }, h('div', { class: 'shop-bar' }, strip.el), note, list), refresh: refreshAll };
  }
  function shopOpen(st) { return st.phase === 'prep' || st.phase === 'results'; }

  /* ------------------------------------------------------------------ *
   * GOALS
   * ------------------------------------------------------------------ */
  function goalValue(m, pr) {
    if (pr.done) return 'Done';
    switch (m.kind) {
      case 'dayProfit': case 'lifetime': return moneyShort(Math.max(0, pr.value)) + ' of ' + moneyShort(pr.target);
      case 'rep': return stars1(pr.value) + ' of ' + stars1(pr.target) + ' stars';
      case 'location': return 'Not unlocked yet';
      default: return int(pr.value) + ' of ' + int(pr.target);
    }
  }
  function buildGoals() {
    var S = sim(), rows = [], stat = {};
    function tile(key, icon, label) {
      stat[key] = h('b', { class: 'display num goal-stat-n' });
      return h('div', { class: 'goal-stat' }, I(icon, 'goal-stat-ico'), h('div', { class: 'goal-stat-text' }, stat[key], h('span', { class: 'label' }, label)));
    }
    var doneN = h('b', { class: 'num' }), allMeter = h('div', { class: 'meter goal-all-meter', style: '--v:0;--meter-fill:var(--lemon)' }, h('i'));
    var list = h('ol', { class: 'goal-list' });
    D.milestones.forEach(function (m, i) {
      var mark = h('span', { class: 'goal-mark' }), val = h('span', { class: 'num goal-val' });
      var meter = h('div', { class: 'meter goal-meter', style: '--v:0' }, h('i'));
      var up = h('span', { class: 'chip chip--sky goal-next' }, 'Up next');
      var reward = m.final ? h('span', { class: 'chip chip--lemon goal-reward' }, I('trophy'), 'You win')
        : m.reward > 0 ? h('span', { class: 'chip chip--lemon goal-reward num' }, I('coin'), '+' + moneyShort(m.reward)) : null;
      var li = h('li', { class: 'goal-item', style: '--i:' + i }, mark,
        h('div', { class: 'goal-main' },
          h('div', { class: 'goal-top' }, h('strong', { class: 'goal-title' }, m.title), up, reward),
          h('p', { class: 'goal-desc' }, m.desc),
          h('div', { class: 'goal-prog' }, meter, val)));
      list.append(li);
      rows.push(function (isNext) {
        var pr = (S && S.milestoneProgress && S.milestoneProgress(m.id)) || { value: 0, target: 1, pct: 0, done: false };
        var key = pr.done ? 'check' : m.final ? 'trophy' : 'medal';
        if (li._k !== key) { li._k = key; mark.innerHTML = SS.icon(key); }
        cls(li, 'is-done', pr.done); cls(li, 'is-next', isNext);
        up.hidden = !isNext;
        meter.style.setProperty('--v', (SS.clamp(num(pr.pct), 0, 100) / 100).toFixed(3));
        cls(meter, 'is-zero', !(pr.pct > 0));
        txt(val, goalValue(m, pr));
        return pr.done;
      });
    });
    function refresh() {
      var st = SS.state;
      if (!st) return;
      var s = st.stats || {}, done = st.milestonesDone || [], next = null;
      D.milestones.forEach(function (m) { if (!next && done.indexOf(m.id) < 0) next = m.id; });
      txt(stat.days, int(s.days)); txt(stat.best, moneyShort(num(s.bestProfit))); txt(stat.cups, int(s.bestCups)); txt(stat.life, moneyShort(num(st.lifetimeEarnings)));
      var n = 0;
      rows.forEach(function (fn, i) { if (fn(D.milestones[i].id === next)) n++; });
      txt(doneN, n + ' of ' + D.milestones.length);
      allMeter.style.setProperty('--v', (n / Math.max(1, D.milestones.length)).toFixed(3));
      cls(allMeter, 'is-zero', n < 1);
    }
    var pane = h('div', { class: 'goal-pane', role: 'tabpanel', 'aria-label': 'Goals' },
      h('div', { class: 'goal-stats' }, tile('days', 'calendar', 'Days played'), tile('best', 'cash', 'Best day profit'), tile('cups', 'cup', 'Most cups in a day'), tile('life', 'chart', 'Lifetime sales')),
      h('div', { class: 'goal-all' }, h('span', { class: 'goal-all-text' }, I('trophy'), doneN, ' goals reached'), allMeter),
      list);
    var regs = buildRegsPane(), tabs = {}, counts = {};
    function setTab(t) {
      goalsTab = t;
      ['goals', 'regulars'].forEach(function (k) { var on = k === t; cls(tabs[k], 'is-on', on); tabs[k].setAttribute('aria-selected', on ? 'true' : 'false'); });
      pane.hidden = t !== 'goals'; regs.el.hidden = t !== 'regulars';
    }
    function tab(k, label, icon) {
      counts[k] = h('span', { class: 'num shop-tab-n' });
      return (tabs[k] = h('button', { class: 'shop-tab', type: 'button', role: 'tab', onclick: function () { if (goalsTab !== k) { SS.sfx('click'); setTab(k); } } }, icon, h('span', null, label), counts[k]));
    }
    var el = h('div', { class: 'goal' }, h('div', { class: 'shop-tabs goal-tabs', role: 'tablist' }, tab('goals', 'Goals', I('trophy')), tab('regulars', 'Regulars', I('regular'))), pane, regs.el);
    function refreshAll() {
      var st = SS.state;
      if (!st) return;
      refresh(); regs.refresh();
      txt(counts.goals, (st.milestonesDone || []).length + '/' + D.milestones.length);
      txt(counts.regulars, int(Array.isArray(st.regulars) ? st.regulars.length : 0));
    }
    setTab(goalsTab);
    refreshAll();
    return { el: el, refresh: refreshAll };
  }

  /* ------------------------------------------------------------------ *
   * REGULARS (a tab in the goals modal)
   * ------------------------------------------------------------------ */
  var goalsTab = 'goals';
  function openRegulars() { goalsTab = 'regulars'; open('goals'); }
  function buildRegsPane() {
    var S = sim(), list = h('ol', { class: 'regs-list' }), key = null, L = SS.LOYALTY || { step: 0.1, max: 2 };
    var nN = h('b', { class: 'display num regs-tile-n' }), bestN = h('b', { class: 'display num regs-tile-n' }), topN = h('b', { class: 'display num regs-tile-n' });
    function tile(icon, n, label) { return h('div', { class: 'goal-stat' }, I(icon, 'goal-stat-ico'), h('div', { class: 'goal-stat-text' }, n, h('span', { class: 'label' }, label))); }
    var tiles = h('div', { class: 'regs-tiles' }, tile('regular', nN, 'Regulars'), tile('flame', bestN, 'Longest streak ever'), tile('coin', topN, 'Top loyalty bonus'));
    var empty = h('div', { class: 'well regs-empty' }, I('regular', 'regs-empty-ico'),
      h('strong', { class: 'display regs-empty-title' }, 'No regulars yet'),
      h('p', null, 'Make someone really happy and they might come back tomorrow.'));
    var note = h('p', { class: 'regs-note' }, I('info'), h('span', null, 'Every happy visit in a row adds ' + Math.round(L.step * 100) + '% to what a regular pays, up to ' +
      SS.fmtMult(L.max) + '. One bad visit resets the streak. Two in a row and they stop coming.'));
    function stat(label, v) { return h('div', null, h('dt', { class: 'label' }, label), h('dd', { class: 'num' }, int(v))); }
    function refresh() {
      var st = SS.state, rs = (S && S.regularsInfo && safe('regularsInfo', S.regularsInfo)) || [];
      var k = rs.map(function (g) { return g.id + ':' + g.streak + ':' + g.visits + ':' + g.best; }).join('|');
      if (k === key) return;
      key = k;
      list.textContent = '';
      var top = 1;
      rs.forEach(function (g, i) {
        var m = num(g.mult) || SS.loyaltyMult(g.streak);
        top = Math.max(top, m);
        list.append(h('li', { class: 'regs-item' + (g.streak > 0 ? '' : ' is-cold'), style: '--i:' + i },
          h('span', { class: 'regs-face' }, I(g.streak >= 5 ? 'faceLove' : g.streak > 0 ? 'faceHappy' : 'faceMeh')),
          h('div', { class: 'regs-main' }, h('strong', { class: 'regs-name' }, String(g.name || 'A regular')),
            h('span', { class: 'regs-meta' }, kindName(g.kind) + (num(g.since) ? ' · since day ' + int(g.since) : ''))),
          h('dl', { class: 'regs-stats' }, stat('Best', num(g.best)), stat('Visits', num(g.visits))),
          h('div', { class: 'regs-side' }, streakBadge(num(g.streak)), multChip(m))));
      });
      txt(nN, int(rs.length));
      txt(bestN, int(Math.max(num(st && st.stats && st.stats.bestStreak), rs.reduce(function (a, g) { return Math.max(a, num(g.best)); }, 0))));
      txt(topN, SS.fmtMult(top));
      empty.hidden = rs.length > 0; list.hidden = tiles.hidden = !rs.length;
    }
    refresh();
    return { el: h('div', { class: 'regs', role: 'tabpanel', 'aria-label': 'Regulars' }, tiles, list, empty, note), refresh: refresh };
  }

  /* ------------------------------------------------------------------ *
   * DEX THE DEALER
   * ------------------------------------------------------------------ */
  function dealCard(o, onBuy) {
    var S = sim(), lim = o.kind === 'limited', fl = lim ? D.byId(D.flavors, o.id) : null;
    var why = h('p', { class: 'shop-why dex-why', role: 'alert', hidden: true }), cost = h('span', { class: 'num' });
    var btn = h('button', { class: 'btn ' + (lim ? 'btn--go' : 'btn--primary') + ' shop-buy dex-buy', type: 'button', onclick: buy }, I('coin'), cost);
    var doneT = h('span'), done = h('span', { class: 'chip chip--good shop-maxed dex-done', hidden: true }, I('check'), doneT);
    var card;
    if (lim) {
      var pct = fl ? Math.round(num(fl.wtp) * 100) : 0, extra = fl ? num(fl.extraCost) / 10 : 0, i, sparks = [];
      for (i = 0; i < 4; i++) sparks.push(h('span', { class: 'dex-lim-spark', style: '--i:' + i, html: SS.icon('sparkle') }));
      card = h('article', { class: 'panel dex-card dex-card--limited', style: '--fc:' + o.color + ';--fc-pale:' + mixHex(o.color, '#ffffff', 0.72) + ';--fc-mid:' + mixHex(o.color, '#ffffff', 0.35) },
        h('span', { class: 'dex-ribbon', 'aria-hidden': 'true' }, h('span', null, 'Limited edition')),
        h('div', { class: 'dex-lim-art', 'aria-hidden': 'true' }, h('i', { class: 'dex-lim-rays' }), h('span', { class: 'dex-lim-glass', style: 'color:' + o.color, html: SS.icon('drink') }), sparks),
        h('div', { class: 'dex-lim-main' },
          h('span', { class: 'label dex-lim-kicker' }, 'Limited edition flavor'),
          h('h4', { class: 'display dex-lim-name' }, o.name),
          h('div', { class: 'dex-lim-chips' },
            h('span', { class: 'chip dex-chip-today' }, I('clock'), 'Today only'),
            pct > 0 ? h('span', { class: 'chip chip--good num' }, I('arrowUp'), '+' + pct + '% price') : null),
          h('p', { class: 'shop-desc dex-lim-blurb' }, (fl ? fl.blurb + ' ' : '') + 'Once it is yours, you keep it for good.' +
            (extra > 0 ? ' Costs ' + money(extra) + ' more a cup to make.' : ''))),
        h('div', { class: 'shop-act dex-lim-act' }, btn, done, why), stampEl());
    } else {
      card = h('article', { class: 'panel dex-card', style: '--bc:' + o.color + ';--bc-pale:' + mixHex(o.color, '#ffffff', 0.78) + ';--bc-mid:' + mixHex(o.color, '#ffffff', 0.45) },
        h('div', { class: 'dex-art', html: SS.icon(o.icon || 'sparkle') }),
        h('div', { class: 'shop-main' }, h('h4', { class: 'display shop-name' }, o.name), h('p', { class: 'shop-desc' }, o.desc)),
        h('div', { class: 'shop-act' }, btn, done, why), stampEl());
    }
    function buy() {
      var r = S && S.buyDeal ? safe('buyDeal', function () { return S.buyDeal(o.id); }) : null;
      if (r && r.ok) { why.hidden = true; stamp(card, lim ? 'Yours!' : 'Bought!'); }
      else { refuse(card, why, (r && r.reason) || card._reason); restart(why, 'is-alert'); }
      onBuy();
    }
    function refresh(info) {
      var st = SS.state, on = !lim && (info.sold || (st && st.boosts && st.boosts.indexOf(info.id) >= 0));
      var finished = info.sold || on;
      btn.hidden = finished; done.hidden = !finished;
      txt(doneT, lim ? 'Yours to keep' : on ? 'Active today' : 'Sold');
      txt(cost, 'Buy for ' + moneyShort(info.cost));
      btn.setAttribute('aria-label', 'Buy ' + info.name + ' for ' + money(info.cost));
      btn.setAttribute('aria-disabled', info.canBuy ? 'false' : 'true');
      card._reason = info.reason;
      if (finished || info.canBuy) { why.hidden = true; why.classList.remove('is-alert'); }
      else { txt(why, info.reason || 'Dex cannot sell you this right now.'); why.hidden = false; }
      cls(card, 'is-on', finished);
    }
    return { el: card, refresh: refresh };
  }

  function buildDealer() {
    var strip = cashStrip(), cards = {}, order = null;
    var line = h('p', { class: 'dex-line' });
    var hero = h('div', { class: 'dex-hero' },
      h('div', { class: 'dex-avatar', 'aria-hidden': 'true' }, h('i', { class: 'dex-rays' }), I('dealer', 'dex-face')),
      h('div', { class: 'dex-bubble' }, h('span', { class: 'label' }, 'Dex says'), line));
    var activeRow = h('div', { class: 'dex-active-row', role: 'list' });
    var active = h('section', { class: 'dex-active', 'aria-label': 'Boosts active today' }, h('span', { class: 'label' }, 'Active today'), activeRow);
    var grid = h('div', { class: 'dex-grid' });
    var note = h('p', { class: 'dex-note' }, I('info'), h('span'));
    var emptyT = h('strong', { class: 'display dex-empty-title' }), emptyP = h('p');
    var empty = h('div', { class: 'well dex-empty' }, I('dealer', 'dex-empty-face'), emptyT, emptyP);
    var activeKey = null;
    function refresh() {
      var st = SS.state, d = dex();
      if (!st) return;
      strip.refresh();
      var here = !!(d && d.present);
      hero.hidden = active.hidden = grid.hidden = note.hidden = !here;
      empty.hidden = here;
      if (!here) {
        var res = st.phase === 'results', first = (st.day | 0) < 2 && !res;
        txt(emptyT, res ? 'Dex has packed up for the night' : first ? 'Dex rolls into town tomorrow' : 'Dex is out of town today');
        txt(emptyP, res ? 'He turns up some mornings, so keep an eye out for his trunk.' : first ? 'He sells boosts that last one day, and sometimes a limited-edition flavor you can\'t get anywhere else.'
          : 'He turns up some mornings with boosts and, now and then, a limited-edition flavor.');
        return;
      }
      txt(line, '“' + (d.line || 'Step right up! Fresh deals, today only.') + '”');
      txt(note.lastChild, st.phase === 'day' ? 'A boost you buy now works for the rest of today.' : 'A boost you buy now works for the whole day ahead. Dex brings new stock every time he visits.');
      var offers = d.offers.slice().sort(function (a, b) { return (b.kind === 'limited') - (a.kind === 'limited'); });
      var k = offers.map(function (o) { return o.id; }).join(',');
      if (k !== order) {
        order = k; cards = {}; grid.textContent = '';
        offers.forEach(function (o, i) {
          var c = dealCard(o, refresh);
          c.el.style.setProperty('--i', i);
          cards[o.id] = c; grid.append(c.el);
        });
      }
      offers.forEach(function (o) { if (cards[o.id]) cards[o.id].refresh(o); });
      var act = (d.active || []).filter(boostDef), ak = act.join(',');
      if (ak !== activeKey) {
        var grew = activeKey !== null && ak.length > activeKey.length;
        activeKey = ak; activeRow.textContent = '';
        act.forEach(function (id, i) {
          var b = boostDef(id), chip = h('span', { class: 'chip dex-active-chip', role: 'listitem', title: b.desc }, boostDot(b), b.name);
          if (grew && i === act.length - 1) chip.classList.add('is-new');
          activeRow.append(chip);
        });
        if (!act.length) activeRow.append(h('span', { class: 'dex-active-none' }, 'No boosts yet. Pick one below and it starts working right away.'));
      }
    }
    refresh();
    return { el: h('div', { class: 'dex' }, h('div', { class: 'shop-bar' }, strip.el), hero, active, grid, note, empty), refresh: refresh };
  }

  /* ------------------------------------------------------------------ *
   * PRIVACY & TERMS (plain language; opened from the title screen)
   * ------------------------------------------------------------------ */
  var LEGAL_DATE = '25 November 2026';
  var LEGAL = [
    ['Privacy Policy', [
      'Squeeze Street does not collect, sell or share any personal information. There are no accounts, ads, analytics or trackers in the game.',
      'Your progress and settings are saved only in your browser\'s local storage, on your own device. Starting a new game or clearing your browser data deletes them.',
      'The game does not send anything over the internet. Everything it needs, including its fonts, comes with the game.',
      'If you play on a game website such as CrazyGames, that website\'s own privacy policy covers what it collects, such as accounts, ads and cloud saves.',
      'If this policy changes, the new version and its date will appear here.'
    ]],
    ['Terms & Conditions', [
      'Squeeze Street is free to play for your personal entertainment. By playing, you agree to these terms.',
      'The game, its code and its art are \u00a9 2026 Squeeze Street. Please do not copy, sell or re-host it without permission.',
      'Money, boosts, flavors and other items in the game are pretend: they have no real-world value and cannot be exchanged for money.',
      'The game is provided as it is, without warranties. We are not responsible for any loss, including lost save data.',
      'Fonts: Bagel Fat One and Figtree, used under the SIL Open Font License 1.1.'
    ]]
  ];
  function buildLegal() {
    var el = h('div', { class: 'legal' },
      h('p', { class: 'legal-date' }, 'Last updated ' + LEGAL_DATE));
    LEGAL.forEach(function (sec) {
      el.append(h('section', { class: 'legal-sec' },
        h('h3', { class: 'display legal-h' }, sec[0]),
        h('ul', { class: 'legal-list' }, sec[1].map(function (t) { return h('li', null, t); }))));
    });
    return { el: el, refresh: function () {} };
  }

  /* ------------------------------------------------------------------ *
   * FOOD TRUCK: showroom, campaign map, the prep card and the results lines.
   * Talks to the truck API in the core.js contract; every call is guarded so these screens
   * still open (with dashes) while that API is missing.
   * ------------------------------------------------------------------ */
  var MAP_W = 400, MAP_H = 260;
  var LAND = 'M30 40C60 18 130 22 170 14S280 20 320 26 385 50 372 80 382 120 372 150 350 205 330 222 250 246 210 240 130 250 95 240 30 214 26 180 34 130 26 104 12 58 30 40Z';
  var TRUCK_SAYS = { trading: 'Trading', travelling: 'On the road', arrived: 'Arrived', parked: 'Parked' };
  var campSel = null;     // the city picked on the campaign map; kept between visits

  function initials(name) { return String(name).split(' ').map(function (w) { return w.charAt(0); }).join('').slice(0, 2); }
  function truckOf(st) { return st && st.truck && typeof st.truck === 'object' ? st.truck : null; }
  function cityOf(id) { return (D.cities && D.byId(D.cities, id)) || null; }
  function call(name) {
    var S = sim(), args = Array.prototype.slice.call(arguments, 1);
    return S && typeof S[name] === 'function' ? safe(name, function () { return S[name].apply(S, args); }) : undefined;
  }
  function truckLook(st) { var c = st && st.custom; return (c && c.truck) || (D.customDefaults ? D.customDefaults().truck : {}); }
  /** the forecast for a town (it can miss, like the stand's); the real weather once the day is under way */
  function cityWx(id, day) {
    var w = call('cityForecast', id, day) || call('cityWeather', id, day), type = w && D.weather[w.type] ? w.type : null;
    return type ? { type: type, temp: num(w.temp) || D.weather[type].temp[0], sure: w.confidence != null ? SS.clamp(num(w.confidence), 0, 1) : 1 } : null;
  }
  /** the trip to `id` plus a day of trading there; days and fuel fall back to the contract formula while truckEstimate is missing */
  function tripTo(id) {
    var e = call('truckEstimate', id);
    if (e && typeof e === 'object') return e;
    var tr = truckOf(SS.state), a = cityOf((tr && tr.at) || 'home'), b = cityOf(id), T = D.truck || {};
    if (!a || !b) return null;
    var dist = Math.hypot(a.x - b.x, a.y - b.y);
    return { days: dist ? Math.max(1, Math.ceil(dist / (T.mapPerDay || 0.32))) : 0, fuel: dist * (T.fuelPerMap || 180), rent: b.rent };
  }
  function travelling(tr) { return !!(tr && tr.route && cityOf(tr.route.to)); }
  /** where the truck is, in words (prep card, campaign bar, screen readers) */
  function truckLine(st, tr) {
    var r = tr.route, to = travelling(tr) && cityOf(r.to), at = cityOf(tr.at) || cityOf('home');
    if (to) {
      var left = Math.max(0, Math.round(num(r.left)));
      if (st.phase === 'prep' && left >= num(r.total)) return 'Leaves for ' + to.name + ' when you open';
      return 'On the road to ' + to.name + ', ' + left + ' ' + plural(left, 'day') + ' left';
    }
    if (!at || at.id === 'home') return 'Parked next to your stand';
    return (tr.open ? 'Trading at ' : 'Parked at ') + at.name;
  }
  /** the truck's spot on the map (0..1) and which way it faces; moves along the route through the day while travelling */
  function truckSpot(st, tr) {
    var at = cityOf(tr.at) || cityOf('home');
    if (!travelling(tr)) return { x: at.x, y: at.y, flip: false, parked: true };
    var r = tr.route, a = cityOf(r.from) || at, b = cityOf(r.to), tot = Math.max(1, num(r.total));
    var done = tot - SS.clamp(num(r.left), 0, tot) + (st.phase === 'day' && st.today ? SS.clamp(num(st.today.t), 0, 1) : 0);
    var p = arcPt(a, b, SS.clamp(done / tot, 0, 1));
    return { x: p.x, y: p.y, flip: b.x < a.x, parked: false };
  }
  /** a gentle bow between two cities, so routes read as roads rather than rulers */
  function arcCtl(a, b) { return { x: (a.x + b.x) / 2 - (b.y - a.y) * 0.16, y: (a.y + b.y) / 2 + (b.x - a.x) * 0.16 }; }
  function arcPt(a, b, k) {
    var c = arcCtl(a, b), u = 1 - k;
    return { x: u * u * a.x + 2 * u * k * c.x + k * k * b.x, y: u * u * a.y + 2 * u * k * c.y + k * k * b.y };
  }
  function arcD(a, b) {
    var c = arcCtl(a, b);
    return 'M' + (a.x * MAP_W).toFixed(1) + ' ' + (a.y * MAP_H).toFixed(1) + 'Q' + (c.x * MAP_W).toFixed(1) + ' ' + (c.y * MAP_H).toFixed(1) + ' ' + (b.x * MAP_W).toFixed(1) + ' ' + (b.y * MAP_H).toFixed(1);
  }
  /** the country: sea, land, a desert, mountains, a forest, a lake, and roads to each town's two nearest neighbours */
  function mapSvg() {
    var K = '#1b1f3b', roads = '', seen = {};
    D.cities.forEach(function (a) {
      D.cities.filter(function (b) { return b !== a; }).sort(function (p, q) { return Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y); })
        .slice(0, 2).forEach(function (b) {
          var k = [a.id, b.id].sort().join('-');
          if (!seen[k]) { seen[k] = 1; roads += '<path d="' + arcD(a, b) + '"/>'; }
        });
    });
    var wave = function (x, y) { return '<path d="M' + x + ' ' + y + 'q5-5 10 0t10 0"/>'; };
    var peak = function (x, y, s) { return '<path d="M' + x + ' ' + y + 'l' + 16 * s + '-26' + 'l' + 16 * s + ' 26z" fill="#aab1d8"/><path d="M' + (x + 10 * s) + ' ' + (y - 16) + 'l' + 6 * s + '-10l' + 6 * s + ' 10l-3 2-3-2-3 2z" fill="#fff" stroke-width="2"/>'; };
    var tree = function (x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="7" fill="#35c977"/>'; };
    return '<svg class="camp-svg" viewBox="0 0 ' + MAP_W + ' ' + MAP_H + '" aria-hidden="true" stroke="' + K + '" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
      '<rect x="-4" y="-4" width="408" height="268" fill="#8fd3ff" stroke="none"/>' +
      '<g stroke="#fff" stroke-width="2.5" opacity=".7">' + wave(372, 16) + wave(8, 232) + wave(372, 238) + wave(6, 128) + wave(196, 252) + '</g>' +
      '<path d="' + LAND + '" transform="translate(0 6)" fill="' + K + '" opacity=".16" stroke="none"/>' +
      '<path d="' + LAND + '" fill="#c8f0d2" stroke-width="3"/>' +
      '<ellipse cx="92" cy="182" rx="50" ry="34" fill="#ffe9a6" stroke="none"/>' +
      '<g stroke="#e0b34a" stroke-width="2.5"><path d="M62 186q8-5 16 0M98 200q8-5 16 0M104 166q8-5 16 0"/></g>' +
      '<g stroke-width="2.5">' + peak(92, 72, 1) + peak(150, 66, 1) + peak(176, 74, 0.8) + '</g>' +
      '<g stroke-width="2.5">' + tree(276, 122) + tree(289, 114) + tree(266, 132) + tree(214, 76) + tree(225, 70) + '</g>' +
      '<path d="M320 152Q350 162 372 152" stroke-width="7"/><path d="M320 152Q350 162 372 152" stroke="#8fd3ff" stroke-width="3"/>' +
      '<ellipse cx="300" cy="150" rx="22" ry="12" fill="#8fd3ff" stroke-width="2.5"/>' +
      '<g class="camp-roads" stroke="#fff" stroke-width="3" stroke-dasharray="1 7">' + roads + '</g>' +
      '<path class="camp-trip" d="" stroke="' + K + '" stroke-width="7"/><path class="camp-trip camp-trip-in" d="" stroke="#ff6257" stroke-width="3.5"/>' +
      '<path class="camp-plan" d="" stroke="' + K + '" stroke-width="3" stroke-dasharray="8 7"/>' +
      '<g transform="translate(378 212)" stroke-width="2.5"><circle r="12" fill="#fff"/><path d="M0-9l4 9-4 9-4-9z" fill="#ff6257"/>' +
      '<path d="M-3 -19v-6l6 6v-6" stroke-width="2"/></g>' +
      '</svg>';
  }

  /** size the canvas backing store to its CSS box (only when that changes) and return a cleared, dpr-scaled context */
  function fitCanvas(cv) {
    var w = cv.clientWidth, hh = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !hh) return null;
    if (cv._w !== w || cv._h !== hh || cv._d !== dpr) { cv._w = w; cv._h = hh; cv._d = dpr; cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
    var ctx = cv._ctx || (cv._ctx = cv.getContext('2d'));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    return ctx;
  }
  function paintPostcard(cv, cityId, t, wx) {
    var ctx = fitCanvas(cv), V = SS.Vehicles, look = truckLook(SS.state);
    if (!ctx) return;
    if (V && V.drawPostcard) V.drawPostcard(ctx, cv._w, cv._h, cityId, t, look, { weather: wx, reduced: SS.reduced() });
  }
  /** one rAF loop per open campaign modal; it ends by itself once the modal leaves the page, and runs a single frame when motion is reduced */
  function campLoop(root, paint) {
    var still = SS.reduced();
    function frame(now) {
      if (!root.isConnected) return;
      safe('campaign frame', function () { paint(still ? 0 : now / 1000); });
      if (!still) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /** Open / Park: a switch that shows its state in words */
  function openSwitch() {
    var t = h('span', { class: 'camp-switch-t' });
    var b = h('button', { class: 'camp-switch', type: 'button', role: 'switch', 'aria-label': 'Truck open for trade', onclick: function () {
      var tr = truckOf(SS.state);
      if (!tr || b.disabled) return;
      SS.sfx('click');
      var r = call('truckSetOpen', !tr.open);
      if (r && r.ok === false) { SS.sfx('error'); if (r.reason && SS.UI && SS.UI.toast) SS.UI.toast(r.reason, 'info', 'truck'); }
      onChange();
    } }, h('i', { class: 'camp-switch-knob', 'aria-hidden': 'true' }), t);
    b.set = function (tr, can) { var on = !!tr.open; b.setAttribute('aria-checked', String(on)); txt(t, on ? 'Open for trade' : 'Parked'); b.disabled = !can; };
    return b;
  }
  /** the truck's own cup price, with the stand price's hold-to-repeat stepper; a disabled fieldset locks it outside prep */
  function truckPriceBox(tr) {
    var P = D.price, s = SS.stepper({ value: num(tr.price) || (D.truck && D.truck.priceStart) || P.start, min: P.min, max: P.max, step: P.step, fmt: money, label: 'truck price per cup',
      onChange: function (v) { call('truckSetPrice', v); onChange(); } });
    var fs = h('fieldset', { class: 'camp-fs' }, s);
    fs.set = function (tr2, can) { fs.disabled = !can; if (num(tr2.price) && Math.abs(s.get() - num(tr2.price)) > 1e-9) s.set(num(tr2.price)); };
    return fs;
  }
  function planNote(st) {
    return st.phase === 'prep' ? '' : st.phase === 'day' ? 'The truck\'s plans are set for today. Pick a new town, price or open and park it tomorrow morning, before you open.'
      : 'Plan the truck\'s next move in the morning, before you open the stand.';
  }

  /* ---- showroom (before you own it) ---- */
  function buildShowroom(onBought) {
    var T = D.truck || {}, cost = num(T.cost), loc = D.byId(D.locations, T.unlockLocation);
    var cv = h('canvas', { class: 'camp-cv' });
    var why = h('p', { class: 'shop-why', role: 'alert', hidden: true });
    var reqU = reqChip('lock', ''), reqC = reqChip('coin', '');
    reqU.classList.add('camp-req'); reqC.classList.add('camp-req');
    var btn = h('button', { class: 'btn btn--go btn--lg camp-buy', type: 'button', onclick: buy }, 'Buy for ' + moneyShort(cost));
    var card = h('article', { class: 'panel camp-show' },
      h('div', { class: 'camp-show-art' }, cv),
      h('div', { class: 'camp-show-main' },
        h('span', { class: 'label' }, 'For sale'),
        h('h3', { class: 'display camp-show-title' }, 'A food truck of your own'),
        h('p', { class: 'camp-show-p' }, 'A second business on wheels. Drive it from town to town, sell where people are thirsty, and pay each town\'s rent on the days you trade.'),
        h('ul', { class: 'camp-show-facts' },
          h('li', null, I('cup'), 'Sells up to ' + int(T.capacity || 0) + ' cups a day with your recipe and flavor'),
          h('li', null, I('pin'), int(D.cities.length - 1) + ' towns, from quiet Maple Falls to glittering Neon Bay'),
          h('li', null, I('tag'), 'Its own cup price: crowds in big cities pay more')),
        h('div', { class: 'camp-show-buy' },
          h('div', { class: 'camp-show-price' }, h('span', { class: 'label' }, 'Price'), h('b', { class: 'display num' }, moneyShort(cost))),
          h('div', { class: 'camp-show-reqs' }, reqU, reqC), btn),
        why),
      stampEl());
    function buy() {
      var st = SS.state;
      if (!call('truckUnlocked')) { refuse(card, why, 'Unlock ' + (loc ? loc.name : 'a bigger spot') + ' or sell ' + moneyShort(T.unlockLifetime) + ' in total first.'); return; }
      if (num(st.cash) + 1e-9 < cost) { refuse(card, why, 'You need ' + money(cost - num(st.cash)) + ' more.'); return; }
      var ask = SS.UI && SS.UI.confirm ? SS.UI.confirm({ title: 'Buy the food truck?', text: 'It costs ' + money(cost) + '. You will have ' + money(num(st.cash) - cost) + ' left for the stand.', yes: 'Buy it', no: 'Not yet' }) : Promise.resolve(true);
      Promise.resolve(ask).then(function (yes) {
        if (!yes) return;
        var r = call('buyTruck');
        if (r && r.ok) { why.hidden = true; stamp(card, 'Yours!'); onBought(); } else refuse(card, why, (r && r.reason) || 'The truck is not for sale right now.');
        onChange();
      });
    }
    return {
      el: h('div', { class: 'camp-shop' }, card),
      refresh: function (st) {
        var un = !!call('truckUnlocked');
        reqU.set(un, un ? 'Unlocked' : 'Unlock ' + (loc ? loc.name : 'a bigger spot') + ' or sell ' + moneyShort(T.unlockLifetime) + ' in total');
        reqC.set(num(st.cash) + 1e-9 >= cost, moneyShort(cost) + ' in cash');
        btn.setAttribute('aria-disabled', un && num(st.cash) + 1e-9 >= cost ? 'false' : 'true');
      },
      frame: function (t) { paintPostcard(cv, 'home', t, null); }
    };
  }

  /* ---- the campaign (once you own it) ---- */
  function campaignView() {
    var st0 = SS.state, tr0 = truckOf(st0);
    if (!cityOf(campSel)) campSel = (travelling(tr0) && tr0.route.to) || tr0.at || 'home';
    var maxT = 1, maxD = 1, maxP = 1;
    D.cities.forEach(function (c) { maxT = Math.max(maxT, c.traffic); maxD = Math.max(maxD, c.demand); maxP = Math.max(maxP, c.tolerance); });

    /* status bar */
    var statusT = h('strong', { class: 'camp-status-t' }), statusS = h('span', { class: 'camp-status-s' });
    var sw = openSwitch(), price = truckPriceBox(tr0);
    var homeT = h('span'), homeBtn = h('button', { class: 'btn btn--sm camp-home', type: 'button', onclick: function () { campSel = 'home'; go('home'); } }, I('home'), homeT);
    var note = h('p', { class: 'camp-note', hidden: true }, I('info'), h('span'));
    var bar = h('section', { class: 'panel camp-bar' },
      h('div', { class: 'camp-status' }, h('span', { class: 'camp-status-ico', html: SS.icon('truck') }), h('div', { class: 'camp-status-text' }, statusT, statusS)),
      h('div', { class: 'camp-ctl' }, sw, h('div', { class: 'camp-price' }, h('span', { class: 'label' }, 'Cup price'), price), homeBtn));

    /* map */
    var map = h('div', { class: 'camp-map', role: 'group', 'aria-label': 'Map of the country. Pick a town to see what trading there is like.', html: mapSvg() });
    var plan = map.querySelector('.camp-plan'), trips = map.querySelectorAll('.camp-trip');
    var marker = h('span', { class: 'camp-marker', 'aria-hidden': 'true' }, h('span', { class: 'camp-marker-in', html: SS.icon('truck') }));
    var pins = {};
    D.cities.forEach(function (c) {
      var b = h('button', { class: 'camp-pin' + (c.id === 'home' ? ' is-home' : ''), type: 'button', style: 'left:' + (c.x * 100).toFixed(2) + '%;top:' + (c.y * 100).toFixed(2) + '%',
        onclick: function () { if (campSel !== c.id) { SS.sfx('click'); campSel = c.id; refresh(); } } },
        h('span', { class: 'camp-pin-dot', html: SS.icon(c.id === 'home' ? 'stand' : 'pin') }), h('span', { class: 'camp-pin-l' }, c.name),
        h('span', { class: 'camp-pin-s', 'aria-hidden': 'true' }, initials(c.name)));   // the short tag a narrow map shows instead
      pins[c.id] = b; map.append(b);
    });
    map.append(marker);

    /* the picked town */
    var cv = h('canvas', { class: 'camp-cv' });
    var dTag = h('span', { class: 'chip camp-city-tag', hidden: true });
    var dName = h('h3', { class: 'display camp-city-name' }), dBlurb = h('p', { class: 'camp-city-blurb' });
    var dStats = h('dl', { class: 'camp-stats' }), dWx = h('div', { class: 'camp-wx' }), dEst = h('div', { class: 'camp-est' });
    var goT = h('span'), goBtn = h('button', { class: 'btn btn--go camp-go', type: 'button', onclick: function () { go(campSel); } }, I('truck'), goT);
    var why = h('p', { class: 'shop-why', role: 'alert', hidden: true });
    var detail = h('section', { class: 'panel camp-city', 'aria-label': 'Town details' },
      h('div', { class: 'camp-postcard' }, cv, dTag),
      h('div', { class: 'camp-city-body' }, dName, dBlurb, dStats, dWx, dEst, goBtn, why), stampEl());

    /* campaign book */
    var totals = h('dl', { class: 'camp-totals' }), stamps = h('ul', { class: 'camp-stamps' });
    var book = h('section', { class: 'camp-book' },
      h('div', { class: 'camp-book-part' }, h('h3', { class: 'display res-sec-title' }, I('chart'), 'Campaign so far'), totals),
      h('div', { class: 'camp-book-part' }, h('h3', { class: 'display res-sec-title' }, I('pin'), 'Towns visited'), stamps));

    function go(id) {
      var r = call('truckGo', id);
      if (r && r.ok) { why.hidden = true; stamp(detail, id === 'home' ? 'Heading home!' : 'Road trip!'); }
      else refuse(detail, why, (r && r.reason) || 'The truck cannot set off right now.');
      onChange();
    }
    var keys = {};
    function refresh(st) {
      st = st || SS.state;
      var tr = truckOf(st);
      if (!st || !tr) return;
      var prepNow = st.phase === 'prep', moving = travelling(tr), at = cityOf(tr.at) || cityOf('home'), dest = moving ? tr.route.to : null;
      var plan0 = moving && prepNow && num(tr.route.left) >= num(tr.route.total), away = moving && !plan0;   // plan0: planned this morning, still parked
      var sell = !moving && at.id !== 'home';
      txt(statusT, truckLine(st, tr));
      txt(statusS, sell && tr.open ? 'Rent ' + money(at.rent) + ' a day while it trades. Park it to pay nothing.' : moving ? 'No sales and no rent while it is on the road.' : at.id === 'home' ? 'Pick a town on the map to start a road trip.' : 'Parked: no rent, no sales.');
      sw.set(tr, prepNow && sell); sw.hidden = !sell;
      price.set(tr, prepNow);
      homeBtn.hidden = (at.id === 'home' && !moving) || dest === 'home' || away;
      txt(homeT, plan0 && at.id === 'home' ? 'Cancel the trip' : 'Bring it home');
      homeBtn.disabled = !prepNow;
      var nt = planNote(st);
      note.hidden = !nt; txt(note.lastChild, nt);

      /* pins and lines */
      D.cities.forEach(function (c) {
        var b = pins[c.id], visited = (tr.visited || []).indexOf(c.id) >= 0;
        cls(b, 'is-sel', c.id === campSel); cls(b, 'is-here', !away && c.id === at.id); cls(b, 'is-dest', c.id === dest); cls(b, 'is-visited', visited);
        b.setAttribute('aria-pressed', String(c.id === campSel));
        b.setAttribute('aria-label', c.name + (!away && c.id === at.id ? ', the truck is here' : c.id === dest ? ', the truck is heading here' : '') +
          (c.rent > 0 ? ', rent ' + moneyShort(c.rent) + ' a day' : '') + (visited && c.id !== 'home' ? ', visited' : ''));
      });
      var tripD = moving && cityOf(tr.route.from) ? arcD(cityOf(tr.route.from), cityOf(dest)) : '';
      trips.forEach(function (p) { p.setAttribute('d', tripD); });
      var sel = cityOf(campSel) || at, from = moving ? truckSpot(st, tr) : at;
      plan.setAttribute('d', sel.id === (dest || at.id) ? '' : arcD(from, sel));

      /* details: rebuilt only when something they show changed */
      var e = tripTo(sel.id) || {}, here = !away && sel.id === at.id, isDest = sel.id === dest, days = here ? 0 : Math.max(0, Math.round(num(e.days)));
      var day = num(st.day) + (prepNow ? 0 : 1) + days, wx = sel.id === 'home' ? null : cityWx(sel.id, day);
      var k = [sel.id, st.phase, st.day, tr.at, dest, tr.open, tr.price, Math.round(num(st.cash)), JSON.stringify(e), wx && wx.type].join('|');
      if (keys.detail !== k) { keys.detail = k; paintDetail(st, tr, sel, e, here, isDest, days, day, wx, prepNow, plan0, away); }

      var tot = tr.total || {}, tk = JSON.stringify(tot);
      if (keys.tot !== tk) {
        keys.tot = tk;
        var pr = num(tot.profit), costs = num(tot.costs);
        totals.replaceChildren.apply(totals, [['calendar', 'Days traded', int(num(tot.days)), ''], ['cup', 'Cups sold', int(num(tot.cups)), ''], ['coin', 'Sales', money(num(tot.revenue)), ''],
          ['fuel', 'Costs', costs > 0 ? '-' + money(costs) : money(0), costs > 0 ? 'bad' : ''], ['trophy', 'Profit', money(pr), pr > 0.004 ? 'good' : pr < -0.004 ? 'bad' : '']].map(function (d) {
          return h('div', { class: 'camp-total' }, h('dt', null, I(d[0]), d[1]), h('dd', { class: 'display num ' + d[3] }, d[2]));
        }));
      }
      var vk = (tr.visited || []).join(',');
      if (keys.vis !== vk) {
        keys.vis = vk;
        stamps.replaceChildren.apply(stamps, D.cities.filter(function (c) { return c.id !== 'home'; }).map(function (c, i) {
          var on = (tr.visited || []).indexOf(c.id) >= 0;
          return h('li', { class: 'camp-stamp' + (on ? ' is-on' : ''), style: '--i:' + i + ';--r:' + ((i * 37) % 17 - 8) + 'deg' },
            h('span', { class: 'camp-stamp-ring', 'aria-hidden': 'true' }, h('b', { class: 'display' }, initials(c.name))),
            h('span', { class: 'camp-stamp-l' }, c.name, h('span', { class: 'hud-sr' }, on ? ', visited' : ', not yet visited')));
        }));
      }
    }
    function paintDetail(st, tr, sel, e, here, isDest, days, day, wx, prepNow, plan0, away) {
      var home = sel.id === 'home', fuel = num(e.fuel), rent = num(e.rent != null ? e.rent : sel.rent);
      txt(dName, sel.name);
      txt(dBlurb, sel.blurb || '');
      dTag.hidden = !(here || isDest || (tr.visited || []).indexOf(sel.id) >= 0);
      txt(dTag, here ? 'The truck is here' : isDest ? 'On the way' : 'Visited');
      cls(dTag, 'chip--lemon', here || isDest);
      function stat(icon, label, value, meter) {
        return h('div', { class: 'camp-stat' }, h('dt', null, I(icon), label), h('dd', null, h('b', { class: 'num' }, value),
          meter ? h('span', { class: 'meter camp-meter', style: '--v:' + SS.clamp(meter[0], 0.04, 1).toFixed(3) + ';--meter-fill:' + meter[1], 'aria-hidden': 'true' }, h('i')) : null));
      }
      var thirst = sel.demand >= 1.5 ? 'Parched' : sel.demand >= 1.15 ? 'Thirsty' : sel.demand >= 0.95 ? 'Normal' : 'Low';
      var tol = Math.round((sel.tolerance - 1) * 100);
      dStats.replaceChildren.apply(dStats, (home ? [] : [
        stat('people', 'Foot traffic', int(sel.traffic) + ' a day', [sel.traffic / maxT, 'var(--sky)']),
        stat('drop', 'Thirst', thirst, [sel.demand / maxD, 'var(--coral)']),
        stat('tag', 'Price tolerance', tol > 0 ? 'Pays ' + tol + '% more' : 'Usual prices', [sel.tolerance / maxP, 'var(--lemon)']),
        stat('pin', 'Rent', money(rent) + ' a day')
      ]).concat([
        stat('fuel', 'Fuel from here', isDest ? 'Paid' : here ? 'None' : money(fuel)),
        stat('road', 'Travel', here ? 'Already here' : isDest ? int(Math.max(0, num(tr.route.left))) + ' ' + plural(num(tr.route.left), 'day') + ' left' : int(days) + ' ' + plural(days, 'day'))
      ]));

      dWx.replaceChildren();
      if (wx) {
        var wd = D.weather[wx.type];
        dWx.append(h('span', { class: 'camp-wx-ico', html: SS.icon(wd.icon) }),
          h('div', null, h('span', { class: 'label' }, (days === 0 && prepNow ? 'Today' : 'Day ' + int(day)) + (wx.sure < 1 ? ' forecast' : ' weather')),
            h('strong', null, wd.name + ' · ' + SS.fmtTemp(wx.temp))),
          wx.sure < 1 ? h('span', { class: 'chip camp-wx-sure' }, 'about ' + Math.round(wx.sure * 100) + '% sure') : null);
      }
      dWx.hidden = !wx;

      dEst.replaceChildren();
      dEst.className = 'camp-est';
      var lo = e.lo, hi = e.hi;
      if (home) dEst.append(h('p', null, 'Parked at home the truck pays no rent and sells nothing. Handy between road trips.'));
      else if (typeof lo !== 'number' || typeof hi !== 'number') dEst.append(h('p', null, 'No estimate yet for ' + sel.name + '.'));
      else {
        var tone = hi < 0 ? 'bad' : lo < 0 ? 'meh' : 'good', mid = (lo + hi) / 2;
        dEst.classList.add('is-' + tone);
        dEst.append(
          h('div', { class: 'camp-est-top' }, h('span', { class: 'label' }, 'A day of trading'),
            h('span', { class: 'chip camp-verdict' }, I(tone === 'good' ? 'faceHappy' : tone === 'meh' ? 'faceMeh' : 'faceSad'), tone === 'good' ? 'Worth it' : tone === 'meh' ? 'Risky' : 'Losing money')),
          h('strong', { class: 'display num camp-est-range' }, signed(lo) + ' to ' + signed(hi)),
          h('p', null, (typeof e.cupsLo === 'number' ? int(e.cupsLo) + ' to ' + int(e.cupsHi) + ' cups at ' + money(num(tr.price)) + ', after ' + money(rent) + ' rent and supplies. ' : 'After rent and supplies. ') +
            (tone === 'bad' ? 'Even a good day here loses money: try a lower price or a cheaper town.' : tone === 'meh' ? 'A good day pays the rent, a slow one does not.' : 'It should beat the rent even on a slow day.') +
            (num(e.sure) > 0 && num(e.sure) < 0.7 ? ' The forecast is shaky, so the weather may not play along.' : '') +
            (!here && !isDest && fuel > 0 && mid > 0 ? ' The fuel pays for itself in about ' + int(Math.max(1, Math.ceil(fuel / mid))) + ' ' + plural(Math.max(1, Math.ceil(fuel / mid)), 'day') + '.' : '')));
      }

      var can = prepNow && !away && !isDest && (!here || plan0);
      txt(goT, !prepNow ? 'Plan trips in the morning' : away ? 'On the road' : isDest ? (plan0 ? 'Leaves when you open' : 'On its way') : here ? (plan0 ? 'Stay here, cancel the trip' : 'The truck is here')
        : (home ? 'Bring it home' : plan0 ? 'Drive here instead' : 'Drive here') + (fuel > 0 ? ' · ' + money(fuel) + ' fuel' : ''));
      goBtn.disabled = !can;
      if (can) why.hidden = true;
    }

    var el = h('div', { class: 'camp-own' }, bar, note, h('div', { class: 'camp-main' }, h('section', { class: 'camp-map-box' }, map), detail, book));
    var lastSpot = '';
    return {
      el: el, refresh: refresh,
      frame: function (t) {
        var st = SS.state, tr = truckOf(st);
        if (!tr) return;
        var sel = cityOf(campSel) || cityOf('home');
        paintPostcard(cv, sel.id, t, sel.id === 'home' ? null : cityWx(sel.id, num(st.day)));
        var s = truckSpot(st, tr), k = (s.x * 100).toFixed(2) + '|' + (s.y * 100).toFixed(2) + '|' + s.flip + '|' + s.parked;
        if (k !== lastSpot) {
          lastSpot = k;
          marker.style.left = (s.x * 100).toFixed(2) + '%'; marker.style.top = (s.y * 100).toFixed(2) + '%';
          cls(marker, 'is-flip', s.flip); cls(marker, 'is-parked', s.parked); cls(marker, 'is-moving', !s.parked);
        }
      }
    };
  }

  function buildCampaign() {
    var strip = cashStrip(), root = h('div', { class: 'camp' }), view = null, owned = null, hold = false;
    function swap() {
      owned = !!truckOf(SS.state);
      view = owned ? campaignView() : buildShowroom(function () { hold = true; setTimeout(function () { hold = false; refresh(); }, 1100); });
      root.replaceChildren(h('div', { class: 'shop-bar' }, strip.el), view.el);
    }
    function refresh() {
      var st = SS.state;
      if (!st) return;
      strip.refresh();
      if (!hold && !!truckOf(st) !== owned) swap();
      view.refresh(st);
      if (SS.reduced() && view.frame) view.frame(0);
    }
    swap(); refresh();
    campLoop(root, function (t) { if (view.frame) view.frame(t); });
    return { el: root, refresh: refresh };
  }

  /* ---- prep card: where the truck is, today's weather there, open / park, price, the campaign button ---- */
  function truckPrepSlot() {
    var el = h('div', { class: 'prep-truck-slot prep-in', style: '--i:2', hidden: true }), kind = null, card = null;
    function mapBtn(label) { return h('button', { class: 'btn btn--sm btn--sky prep-truck-btn', type: 'button', onclick: function () { SS.sfx('click'); open('campaign'); } }, I('map'), label); }
    function saleCard() {
      var T = D.truck || {};
      return { el: h('section', { class: 'panel prep-truck prep-truck--sale' },
        h('span', { class: 'prep-truck-ico', html: SS.icon('truck') }),
        h('div', { class: 'prep-truck-main' }, h('span', { class: 'label' }, 'For sale'), h('strong', { class: 'prep-truck-title' }, 'A food truck of your own'),
          h('p', { class: 'prep-truck-line' }, 'Take your lemonade on a road trip for ' + moneyShort(num(T.cost)) + '.')),
        mapBtn('Take a look')) };
    }
    function ownCard() {
      var tr0 = truckOf(SS.state), line = h('strong', { class: 'prep-truck-title' }), sub = h('p', { class: 'prep-truck-line' });
      var wx = h('span', { class: 'chip chip--sky prep-truck-wx', hidden: true }), sw = openSwitch(), price = truckPriceBox(tr0);
      var ctl = h('div', { class: 'prep-truck-ctl' }, sw, h('div', { class: 'camp-price' }, h('span', { class: 'label' }, 'Cup price'), price));
      var el2 = h('section', { class: 'panel prep-truck' },
        h('div', { class: 'prep-truck-top' }, h('span', { class: 'prep-truck-ico', html: SS.icon('truck') }),
          h('div', { class: 'prep-truck-main' }, h('span', { class: 'label' }, 'Food truck'), line, sub), mapBtn('Campaign')),
        ctl);
      return { el: el2, refresh: function (st, tr) {
        var moving = travelling(tr), at = cityOf(tr.at) || cityOf('home'), sell = !moving && at.id !== 'home', w = sell ? cityWx(at.id, num(st.day)) : null;
        txt(line, truckLine(st, tr));
        var pi = sell && tr.open && st.phase === 'prep' ? call('prepInfo') : null, short = !!(pi && pi.truckShut);
        txt(sub, sell ? (tr.open ? 'Rent ' + money(at.rent) + ' today. ' + (short ? 'After your shopping you cannot pay it, so it stays shut.' : '') : 'Parked today: no rent. ') + (short ? '' : 'Same recipe as the stand.') : moving ? 'No sales or rent until it arrives.' : 'Pick a town on the campaign map.');
        cls(sub, 'is-bad', short);
        wx.hidden = !w;
        if (w && wx._k !== w.type + w.temp) { wx._k = w.type + w.temp; wx.replaceChildren(I(D.weather[w.type].icon), D.weather[w.type].name + ' ' + SS.fmtTemp(w.temp)); }
        if (wx.parentNode !== sub.parentNode) sub.parentNode.insertBefore(wx, sub);
        ctl.hidden = !sell;
        sw.set(tr, st.phase === 'prep'); price.set(tr, st.phase === 'prep');
      } };
    }
    function refresh() {
      var st = SS.state, tr = truckOf(st), k = tr ? 'own' : call('truckUnlocked') ? 'sale' : '';
      if (k !== kind) {
        kind = k; card = k === 'own' ? ownCard() : k === 'sale' ? saleCard() : null;
        if (card) el.replaceChildren(card.el); else el.replaceChildren();
        el.hidden = !card;
      }
      if (card && card.refresh) card.refresh(st, tr);
    }
    refresh();
    return { el: el, refresh: refresh };
  }

  /* ---- results: the truck's day as extra tally rows (stand subtotal, truck lines, truck profit); the existing total becomes the combined one ---- */
  function truckResultRows(raw, st) {
    var t = raw && raw.truck;
    if (!t || typeof t !== 'object') return [];
    var c = cityOf(t.city) || cityOf('home'), status = TRUCK_SAYS[t.status] ? t.status : 'parked', rows = [];
    var tp = num(t.profit), sp = raw.standProfit != null ? num(raw.standProfit) : num(raw.profit) - tp;
    function tone(v) { return v > 0.004 ? 'good' : v < -0.004 ? 'bad' : ''; }
    function row(icon, label, value, tn, extra) { return h('div', { class: 'res-row' + (extra ? ' ' + extra : '') }, h('dt', null, icon ? I(icon) : null, label), h('dd', { class: 'num ' + (tn || '') }, value)); }
    function counted(el, v) { var dd = el.lastChild; el._in = function (instant) { SS.countTo(dd, v, { from: 0, ms: instant ? 0 : 700 }); }; return el; }
    rows.push(counted(row('stand', 'Stand profit', money(sp), tone(sp), 'res-row--sub'), sp));
    var wx = t.weather && D.weather[t.weather.type];
    rows.push(h('div', { class: 'res-row res-row--truck' }, h('dt', null, I('truck'), h('span', null, 'Food truck · ' + c.name)),
      h('dd', null, h('span', { class: 'chip res-truck-chip res-truck-chip--' + status }, wx ? I(wx.icon) : null, TRUCK_SAYS[status]))));
    var r = truckOf(st) && truckOf(st).route, left = r ? Math.max(0, Math.round(num(r.left))) : 0, to = r && cityOf(r.to);
    var news = status === 'arrived' ? (c.id === 'home' ? 'Back home, parked next to your stand.' : 'Rolled into ' + c.name + (num(t.cups) > 0 ? ' and opened straight away.' : '. Ready to trade tomorrow.'))
      : status === 'travelling' ? 'On the road' + (to ? ' to ' + to.name : '') + (left > 0 ? ', ' + left + ' ' + plural(left, 'day') + ' to go.' : '.')
      : status === 'parked' ? (c.id === 'home' ? 'Parked next to your stand.' : 'Parked in ' + c.name + ': no rent, no sales.') : '';
    if (news) rows.push(h('div', { class: 'res-row res-row--note' }, h('dt', null, news)));
    if (num(t.cups) > 0 || status === 'trading') rows.push(row('cup', 'Truck cups', int(num(t.cups))), row('coin', 'Truck sales', signed(num(t.revenue)), num(t.revenue) > 0 ? 'good' : ''));
    if (num(t.supplies) > 0) rows.push(row('lemon', 'Truck supplies', '-' + money(num(t.supplies)), 'bad'));
    if (num(t.rent) > 0) rows.push(row('pin', 'Rent in ' + c.name, '-' + money(num(t.rent)), 'bad'));
    if (num(t.fuel) > 0) rows.push(row('fuel', 'Fuel', '-' + money(num(t.fuel)), 'bad'));
    rows.push(counted(row('truck', 'Truck profit', money(tp), tone(tp), 'res-row--sub'), tp));
    return rows;
  }

  /* truck events refresh the prep card and an open modal like the other sim events (registered here to keep this section self-contained) */
  var coachSeen = { st: null, on: false };
  /** a coach toast the moment the truck first goes on sale in this session */
  function truckCoach() {
    var st = SS.state;
    if (!st || !st.stats || st.phase === 'title') return;
    var on = !truckOf(st) && !!call('truckUnlocked');
    if (coachSeen.st === st && on && !coachSeen.on && SS.UI && SS.UI.toast) SS.UI.toast('A food truck is for sale! Find it on your morning prep card.', 'good', 'truck');
    coachSeen.st = st; coachSeen.on = on;
  }
  if (SS.on) {
    ['truck:buy', 'truck:set', 'truck:depart', 'truck:arrive'].forEach(function (e) { SS.on(e, function () { onChange(); }); });
    ['phase', 'location:unlock', 'truck:buy'].forEach(function (e) { SS.on(e, truckCoach); });
  }

  /* ------------------------------------------------------------------ *
   * CUSTOMISE: the stand's and the food truck's looks. Rules live in sim.js (customBuy / customSet / customAppeal);
   * this screen lets the player try a look on a live preview before paying for it.
   * ------------------------------------------------------------------ */
  var cusTab = 'stand', DECOR_MAX = 4;
  var NAME_OK = /^[A-Z0-9 &'!.\-]*$/;                     // what sim.js keeps on a sign
  var SLOT = {
    paint: ['Paint', 'paint'], trim: ['Trim', 'brush'], accent: ['Accent', 'brush'], awning: ['Awning', 'awning'], sign: ['Sign', 'sign'],
    layout: ['Layout', 'stand'], decor: ['Decorations', 'decor'], wrap: ['Wrap', 'gift'], topper: ['Roof topper', 'star'], lights: ['Lights', 'sparkle'], name: ['Name', 'tag']
  };
  var SWATCH = { paint: 1, trim: 1, accent: 1, awning: 1, wrap: 1 };
  var OPT_ICON = {
    sign: { classic: 'sign', chalk: 'recipe', wood: 'sign', marquee: 'sparkle', neon: 'sun' },
    layout: { classic: 'stand', flipped: 'stand', showcase: 'lemon' },
    decor: { flowers: 'locPark', bunting: 'decor', lights: 'sparkle', balloons: 'gift', plant: 'lemon', menu: 'recipe' },
    topper: { none: 'close', lemon: 'lemon', cup: 'drink', horn: 'speaker' },
    lights: { none: 'close', bulbs: 'sparkle', neon: 'sun' }
  };
  var CHEER = ['Looking zesty!', 'Now that is a-peel-ing.', 'Fresh look, fresh lemons!', 'Ooh, fancy!', 'Main-squeeze material.', 'Customers will stop and stare.'];
  function squeezy(pose) { var U = SS.UI; return U && U.squeezy ? U.squeezy(pose) : h('span'); }
  function pick1(a) { return a[Math.floor(Math.random() * a.length)]; }
  function lookOf(st, target) { var c = st && st.custom; return (c && c[target]) || D.customDefaults()[target]; }
  function cusOwned(st, target, slot, o) {
    var S = sim(), v = S && S.customOwned ? safe('customOwned', function () { return S.customOwned(target, slot, o.id); }) : undefined;
    if (typeof v === 'boolean') return v;
    return !(o.cost > 0) || ((st.custom && st.custom.owned) || []).indexOf(target + '.' + slot + '.' + o.id) >= 0;
  }
  /** why an option is still locked, or '' */
  function cusLock(st, o) {
    if (!o.req) return '';
    if (o.req === 'truck') return st.truck ? '' : 'Buy the food truck first.';
    if ((st.milestonesDone || []).indexOf(o.req) >= 0) return '';
    var m = D.byId(D.milestones, o.req);
    return m ? 'Unlocks with the goal "' + m.title + '": ' + m.desc : 'Not unlocked yet.';
  }
  /** sim.js sells looks only while the stand is closed (equipping works any time) */
  function cusClosed(st) { return st.phase === 'day' ? 'You can buy it after you close for the day. Try it on now!' : ''; }
  /** the style bonus of a look: option appeal summed and capped, the same sum sim.js makes */
  function cusAppeal(target, look) {
    var cat = D.custom[target], a = 0;
    D.customSlots[target].forEach(function (slot) {
      if (!Array.isArray(cat[slot])) return;
      (slot === 'decor' ? look.decor || [] : [look[slot]]).forEach(function (id) { var o = D.byId(cat[slot], id); if (o && o.appeal) a += o.appeal; });
    });
    return Math.min(a, D.custom.appealCap);
  }
  function plusPct(a) { return '+' + Math.round(num(a) * 100) + '%'; }
  function truckPaint(look) { var o = D.byId(D.custom.truck.paint, look.paint); return (o && o.color) || '#ffd83d'; }
  /** the little picture on an option: a colour swatch (with its pattern), an icon, or Squeezy */
  function optArt(slot, o, look) {
    var art = h('span', { class: 'cus-art' }), sq = o.id === 'squeezy' || o.id === 'cutout' || o.id === 'costume';
    if (SWATCH[slot]) {
      art.className = 'cus-art cus-sw' + (o.pattern ? ' cus-pat--' + o.pattern : '') + (slot === 'wrap' ? ' cus-pat--' + o.id : '') + (!o.color && !o.colors && slot !== 'wrap' ? ' cus-sw--classic' : '');
      if (o.colors) {
        var n = o.colors.length < 3 ? 4 : o.colors.length, s = [], i;
        for (i = 0; i < n; i++) s.push(o.colors[i % o.colors.length] + ' ' + (i * 100 / n) + '% ' + ((i + 1) * 100 / n) + '%');
        art.style.background = 'linear-gradient(90deg,' + s.join(',') + ')';
      } else if (o.color || slot === 'wrap') art.style.setProperty('--c', o.color || truckPaint(look));
      if (sq) art.append(squeezy());
    } else if (sq) art.append(squeezy());
    else art.innerHTML = SS.icon((OPT_ICON[slot] && OPT_ICON[slot][o.id]) || SLOT[slot][1]);
    if (o.id === 'flipped') art.classList.add('is-flip');
    return art;
  }

  function buildCustom() {
    var strip = cashStrip(), raf = 0, seen = false, frames = 0, failed = {}, tabs = {};
    var v = { target: cusTab, trial: null, name: null, opts: [], decorN: null, tryKey: '' };
    var canvas = h('canvas', { class: 'cus-canvas', 'aria-hidden': 'true' });
    var bonus = h('b', { class: 'num' }), bonusNote = h('span', { class: 'cus-bonus-note num' });
    var stage = h('div', { class: 'cus-stage' }, canvas,
      h('span', { class: 'chip chip--lemon cus-bonus', title: 'A good-looking business pulls in more customers' }, I('people'), h('span', null, bonus, ' customers'), bonusNote));
    var tryArt = h('span', { class: 'cus-try-art' }), tryName = h('b', { class: 'cus-try-name' }), tryNote = h('span', { class: 'cus-try-note' });
    var buyT = h('span'), buyBtn = h('button', { class: 'btn btn--primary btn--sm cus-buy', type: 'button', onclick: buy }, I('coin'), buyT);
    var tryBar = h('div', { class: 'cus-try', hidden: true }, tryArt, h('div', { class: 'cus-try-text' }, tryName, tryNote), buyBtn,
      h('button', { class: 'btn btn--icon btn--sm cus-try-x', type: 'button', 'aria-label': 'Stop trying this on', onclick: function () { SS.sfx('click'); v.trial = null; refresh(); } }, I('close')));
    var sayT = h('span', { class: 'cus-say-text' }), say = h('p', { class: 'cus-say', role: 'status' }, squeezy('talk'), sayT);
    var list = h('div', { class: 'cus-list' });
    function tab(k, label, icon) {
      return (tabs[k] = h('button', { class: 'shop-tab cus-tab', type: 'button', role: 'tab', onclick: function () { if (v.target !== k) { SS.sfx('click'); setTab(k); } } }, I(icon), h('span', null, label)));
    }
    var root = h('div', { class: 'cus' },
      h('div', { class: 'cus-side' }, h('div', { class: 'shop-tabs cus-tabs', role: 'tablist' }, tab('stand', 'Stand', 'stand'), tab('truck', 'Truck', 'truck')), stage, tryBar, say),
      h('div', { class: 'cus-main' }, strip.el, list));

    function tell(text, bad) { txt(sayT, text); cls(say, 'is-bad', !!bad); restart(say, 'cus-say-pop'); }
    function nope(text) { SS.sfx('error'); restart(v.trial ? tryBar : say, 'shop-shake'); tell(text, true); }
    function preview(st) {
      var base = lookOf(st, v.target), pv = Object.assign({}, base, { decor: (base.decor || []).slice() }), t = v.trial;
      if (t && t.slot === 'decor') { if (pv.decor.indexOf(t.o.id) < 0 && pv.decor.length < DECOR_MAX) pv.decor.push(t.o.id); }
      else if (t) pv[t.slot] = t.o.id;
      if (v.name) pv.name = v.name;
      return pv;
    }
    function isOn(look, slot, id) { return slot === 'decor' ? (look.decor || []).indexOf(id) >= 0 : look[slot] === id; }

    /* picking: an owned option goes on at once; anything else is tried on first, and the bar under the preview sells it */
    function pick(slot, o) {
      var st = SS.state, look = lookOf(st, v.target);
      if (!st) return;
      if (!cusOwned(st, v.target, slot, o)) { SS.sfx('click'); v.trial = v.trial && v.trial.o === o ? null : { slot: slot, o: o }; refresh(); return; }
      v.trial = null;
      if (slot !== 'decor' && look[slot] === o.id) { refresh(); return; }
      if (slot === 'decor' && !isOn(look, slot, o.id) && (look.decor || []).length >= DECOR_MAX) { nope('The stand fits ' + DECOR_MAX + ' decorations. Take one down first.'); refresh(); return; }
      equip(slot, o);
    }
    function equip(slot, o) {
      var S = sim(), target = v.target, r = S && S.customSet ? safe('customSet', function () { return S.customSet(target, slot, o.id); }) : null;
      if (!r || !r.ok) { nope((r && r.reason) || 'Customising is still being set up.'); return; }
      tell(isOn(lookOf(SS.state, target), slot, o.id) ? o.label + ' on. ' + pick1(CHEER) : o.label + ' taken down.');
      refresh();
    }
    function buy() {
      var st = SS.state, t = v.trial, S = sim();
      if (!st || !t) return;
      var lock = cusLock(st, t.o) || cusClosed(st);
      if (lock) { nope(lock); return; }
      if (num(st.cash) + 1e-9 < t.o.cost) { nope('You need ' + money(t.o.cost - num(st.cash)) + ' more for ' + t.o.label + '.'); return; }
      var r = S && S.customBuy ? safe('customBuy', function () { return S.customBuy(v.target, t.slot, t.o.id); }) : null;
      if (!r || !r.ok) { nope((r && r.reason) || 'Customising is still being set up.'); return; }
      v.trial = null;
      restart(stage, 'cus-stage-pop');
      var look = lookOf(SS.state, v.target);
      if (isOn(look, t.slot, t.o.id)) { tell(t.o.label + ' is yours. ' + pick1(CHEER)); refresh(); }
      else if (t.slot === 'decor' && (look.decor || []).length >= DECOR_MAX) { tell(t.o.label + ' is yours. Take a decoration down to put it up.'); refresh(); }
      else equip(t.slot, t.o);
    }

    function nameField(target) {
      var max = (D.custom.nameMax && D.custom.nameMax[target]) || 14, id = 'cus-name-' + target, timer = 0;
      var count = h('span', { class: 'cus-name-n num', 'aria-hidden': 'true' }), msg = h('span', { class: 'cus-name-msg', id: id + '-msg' });
      var inp = h('input', { class: 'cus-name-in display', id: id, type: 'text', maxlength: String(max), autocomplete: 'off', autocapitalize: 'characters',
        spellcheck: 'false', enterkeyhint: 'done', 'aria-label': target === 'truck' ? 'Truck name' : 'Stand name', 'aria-describedby': id + '-msg' });
      inp.value = lookOf(SS.state, target).name || '';
      function check() {
        var raw = inp.value.toUpperCase(), t = raw.replace(/\s+/g, ' ').trim();
        var bad = !t ? 'Give it a name.' : !NAME_OK.test(raw) ? 'Letters, numbers, spaces and & \' ! . - only.' : '';
        txt(count, raw.length + '/' + max);
        txt(msg, bad || (t === lookOf(SS.state, target).name ? 'This is on your sign.' : 'Looks great. It goes on the sign as you type.'));
        cls(msg, 'is-bad', !!bad); inp.setAttribute('aria-invalid', bad ? 'true' : 'false');
        v.name = bad ? null : t; kick();
        return bad ? '' : t;
      }
      function commit() {
        clearTimeout(timer);
        var t = check(), S = sim();
        if (!t || t === lookOf(SS.state, target).name || !S || !S.customSet) return;
        var r = safe('customSet', function () { return S.customSet(target, 'name', t); });
        if (r && r.ok) check(); else if (r) tell(r.reason, true);
      }
      inp.addEventListener('input', function () { check(); clearTimeout(timer); timer = setTimeout(commit, 700); });
      inp.addEventListener('change', commit);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); commit(); } });
      check();
      return h('div', { class: 'cus-name' }, h('div', { class: 'cus-name-row' }, inp, count), msg);
    }
    function teaser() {
      var S = sim(), T = D.truck, loc = D.byId(D.locations, T.unlockLocation);
      var can = S && S.truckUnlocked ? !!safe('truckUnlocked', S.truckUnlocked) : false;
      return h('div', { class: 'panel cus-teaser' }, squeezy('wow'),
        h('h3', { class: 'display cus-teaser-title' }, 'Your own food truck'),
        h('p', null, 'Paint it, wrap it, string up lights and crown it with a giant lemon. Then take it on the road.'),
        h('p', { class: 'cus-hint' }, can ? 'It is ready to buy for ' + moneyShort(T.cost) + '.' : 'Unlocks when you open at ' + (loc ? loc.name : 'Downtown') + ' or reach ' + moneyShort(T.unlockLifetime) + ' in sales.'),
        MODALS.campaign ? h('button', { class: 'btn btn--go', type: 'button', onclick: function () { SS.sfx('click'); open('campaign'); } }, I('truck'), can ? 'Get the truck' : 'See the truck') : null);
    }
    function buildList() {
      var st = SS.state, target = v.target, cat = D.custom[target];
      v.opts = []; v.decorN = null; list.textContent = '';
      if (target === 'truck' && !(st && st.truck)) { list.append(teaser()); return; }
      D.customSlots[target].forEach(function (slot) {
        var head = h('h3', { class: 'cus-sec-title' }, I(SLOT[slot][1]), h('span', null, slot === 'name' ? (target === 'truck' ? 'Truck name' : 'Stand name') : SLOT[slot][0]));
        var sec = h('section', { class: 'cus-sec cus-sec--' + slot }, head);
        if (slot === 'name') { sec.append(nameField(target)); list.append(sec); return; }
        if (!Array.isArray(cat[slot])) return;
        if (slot === 'decor') { head.append(v.decorN = h('span', { class: 'chip num cus-decor-n' })); sec.append(h('p', { class: 'cus-hint' }, 'Up to ' + DECOR_MAX + ' fit on the stand at once. Tap one you own to put it up or take it down.')); }
        var grid = h('div', { class: 'cus-grid' + (SWATCH[slot] ? ' cus-grid--sw' : ''), role: 'group', 'aria-label': SLOT[slot][0] });
        cat[slot].forEach(function (o) {
          var art = optArt(slot, o, lookOf(st, target)), price = h('span', { class: 'cus-price num' });
          var b = h('button', { class: 'cus-opt ' + (SWATCH[slot] ? 'cus-opt--sw' : 'cus-opt--card'), type: 'button', title: o.label, onclick: function () { pick(slot, o); } },
            art, SWATCH[slot] ? null : h('span', { class: 'cus-opt-name' }, o.label), price, o.appeal ? h('span', { class: 'cus-opt-ap num', 'aria-hidden': 'true' }, plusPct(o.appeal)) : null);
          v.opts.push({ slot: slot, o: o, el: b, art: art, price: price, k: '' });
          grid.append(b);
        });
        sec.append(grid);
        list.append(sec);
      });
    }
    function setTab(k) {
      var st = SS.state;
      cusTab = v.target = k; v.trial = null; v.name = null;
      ['stand', 'truck'].forEach(function (t) { var on = t === k; cls(tabs[t], 'is-on', on); tabs[t].setAttribute('aria-selected', on ? 'true' : 'false'); });
      buildList(); refresh();
      tell(k === 'stand' ? 'Tap anything to try it on. You only pay if you keep it.'
        : st && st.truck ? 'Let\'s make this truck the talk of the nation!' : 'A truck of our own? That would be zest-tastic.');
    }
    function refresh() {
      var st = SS.state, target = v.target, S = sim();
      if (!st) return;
      strip.refresh();
      cls(tabs.truck, 'is-locked', !st.truck);
      var look = lookOf(st, target), pv = preview(st), cash = num(st.cash);
      v.opts.forEach(function (r) {
        var o = r.o, own = cusOwned(st, target, r.slot, o), lock = own ? '' : cusLock(st, o), on = isOn(look, r.slot, o.id), card = !SWATCH[r.slot];
        var k = on ? 'on' : own ? 'own' : lock ? 'lock' : 'buy';
        cls(r.el, 'is-on', on); cls(r.el, 'is-owned', own); cls(r.el, 'is-locked', !!lock);
        cls(r.el, 'is-trial', !!v.trial && v.trial.o === o);
        cls(r.el, 'is-dear', k === 'buy' && cash + 1e-9 < o.cost);
        r.el.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (r.k !== k) {
          r.k = k;
          r.price.replaceChildren.apply(r.price, k === 'on' ? [I('check'), card ? (r.slot === 'decor' ? 'Up' : 'On') : ''] : k === 'own' ? ['Yours'] : k === 'lock' ? [I('lock')] : [o.cost > 0 ? moneyShort(o.cost) : 'Free']);
          r.el.setAttribute('aria-label', o.label + ', ' + (k === 'on' ? 'in use' : k === 'own' ? 'yours, tap to use' : k === 'lock' ? 'locked' : o.cost > 0 ? money(o.cost) + ', tap to try it on' : 'free'));
        }
        if (r.slot === 'wrap') r.art.style.setProperty('--c', truckPaint(pv));
      });
      if (v.decorN) txt(v.decorN, (look.decor || []).length + '/' + DECOR_MAX + ' up');
      var now = S && S.customAppeal ? num(safe('customAppeal', function () { return S.customAppeal(target); })) : cusAppeal(target, look);
      var next = now + cusAppeal(target, pv) - cusAppeal(target, look);
      txt(bonus, plusPct(now));
      txt(bonusNote, v.trial && Math.abs(next - now) > 0.004 ? '→ ' + plusPct(next) : '');
      var t = v.trial;
      tryBar.hidden = !t;
      if (t) {
        var locked = cusLock(st, t.o), lock = locked || cusClosed(st), short = cash + 1e-9 < t.o.cost, key = t.slot + '.' + t.o.id;
        if (v.tryKey !== key) { v.tryKey = key; tryArt.replaceChildren(optArt(t.slot, t.o, pv)); restart(tryBar, 'cus-try-in'); }
        txt(tryName, t.o.label + (SWATCH[t.slot] && t.slot !== 'wrap' ? ' ' + SLOT[t.slot][0].toLowerCase() : ''));
        txt(tryNote, lock || (short ? 'You have ' + money(cash) + '. Keep selling!' : 'Cash ' + money(cash) + ' → ' + money(cash - t.o.cost)));
        txt(buyT, locked ? 'Locked' : lock ? 'Later' : 'Buy for ' + moneyShort(t.o.cost));
        buyBtn.setAttribute('aria-disabled', lock || short ? 'true' : 'false');
        buyBtn.setAttribute('aria-label', 'Buy ' + t.o.label + ' for ' + money(t.o.cost));
        cls(tryBar, 'is-locked', !!lock);
      } else v.tryKey = '';
      cls(stage, 'is-truckless', target === 'truck' && !st.truck);
      kick();
    }

    /* the live preview: one canvas, drawn only while the screen is open (once per change with reduced motion) */
    function draw(t) {
      var st = SS.state, w = canvas.clientWidth, ht = canvas.clientHeight, key = v.target, drew = false;
      if (!st || !w || !ht) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1), cw = Math.round(w * dpr), ch = Math.round(ht * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      var g = canvas.getContext('2d'), look = preview(st), A = SS.Actors, V = SS.Vehicles;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, ht);
      g.save();
      try {
        if (key === 'stand' && A && typeof A.drawStandPreview === 'function') { A.drawStandPreview(g, w, ht, look, t); drew = true; }
        else if (key === 'truck' && V && typeof V.drawTruck === 'function') {
          var s = Math.min(w / 400, ht / 345);                     // ~360 long; the tallest roof topper reaches ~330 up
          g.translate(w / 2, ht - 6); g.scale(s, s);
          if (!st.truck) g.globalAlpha = 0.5;
          V.drawTruck(g, look, { t: t, reduced: SS.reduced() }); drew = true;
        }
      } catch (e) { if (!failed[key]) { failed[key] = 1; if (window.console) console.error('[SS.Screens] customise preview failed', e); } }
      g.restore();
      if (!drew && SS.Mascot && SS.Mascot.draw) { g.clearRect(0, 0, w, ht); SS.Mascot.draw(g, w / 2, ht / 2, Math.min(w, ht) * 0.62, { rot: Math.sin(t * 2) * 0.08 }); }
    }
    function frame(now) {
      raf = 0;
      if (root.isConnected) seen = true; else if (seen || ++frames > 240) return;     // closed (or never shown): stop
      draw(SS.reduced() ? 0 : now / 1000);
      if (!SS.reduced()) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }
    if (window.ResizeObserver) new ResizeObserver(function () { kick(); }).observe(canvas);

    setTab(SS.state && SS.state.truck ? cusTab : 'stand');
    return { el: root, refresh: refresh };
  }

  /* Squeezy's take on the day, for the results card: a pose and a pun picked by how it went */
  function squeezyReact(r, raw) {
    var said, pose, p = num(r.profit), wet = r.weather && (r.weather.type === 'rainy' || r.weather.type === 'storm');
    if (r.bestDay && num(r.profit) > 0) { pose = 'cheer'; said = ['Best day yet! I\'m bursting with zest!', 'Record day! Somebody pinch my peel.']; }
    else if (raw && raw.groceries) { pose = 'cheer'; said = ['Thanks, Mom! Free lemons are the best lemons.', 'Mom saved the day. Again.']; }
    else if (r.people && r.people.soldout > 0) { pose = 'wow'; said = ['We squeezed the pantry dry! Stock up more tomorrow.', 'Sold out! That is a juicy problem to have.']; }
    else if (p < -0.004 && raw && raw.truck && num(raw.truck.profit) < 0 && num(raw.standProfit) > 0) {   // the stand did fine: the truck cost the day
      pose = 'talk'; said = raw.truck.status === 'trading' ? ['The stand did fine. The truck wants a cheaper town or a better price.'] : ['Fuel now, cups later. Road trips pay off once we get there!'];
    }
    else if (wet && p <= 40) { pose = p < 0 ? 'sad' : 'talk'; said = ['Rain, rain, go away. Come back on a lemonade day!']; }
    else if (p > 40) { pose = 'cheer'; said = ['That is what I call a squeeze of success!', 'Cha-ching! We are on a zest streak.']; }
    else if (p > 0.004) { pose = 'talk'; said = ['A tidy little profit. Every cup counts!', 'Not bad at all. Let\'s squeeze out a bit more tomorrow.']; }
    else if (p < -0.004) { pose = 'sad'; said = ['Ouch, a sour one. Tomorrow we turn it into lemonade.', 'When life hands you a loss, make a better recipe.']; }
    else { pose = 'talk'; said = ['Even-steven. Tomorrow we squeeze harder!']; }
    return h('div', { class: 'res-sq res-sq--' + pose }, squeezy(pose), h('p', { class: 'res-sq-line' }, h('b', null, D.mascot.name + ': '), said[num(r.day) % said.length]));
  }

  /* ------------------------------------------------------------------ *
   * Opening and closing
   * ------------------------------------------------------------------ */
  var MODALS = {
    shop: { title: 'Shop', icon: 'shop', build: buildShop },
    map: { title: 'Town map', icon: 'map', build: buildMap },
    goals: { title: 'Goals', icon: 'trophy', build: buildGoals },
    dealer: { title: 'Dex\'s Deals', icon: 'dealer', build: buildDealer },
    campaign: { title: 'Food truck', icon: 'truck', build: buildCampaign },
    custom: { title: 'Customise', icon: 'brush', build: buildCustom },
    legal: { title: 'Privacy & Terms', icon: 'info', build: buildLegal, any: true }   // any: works on the title screen too, with no game loaded
  };
  /** used only when ui.js is not there: a plain panel in #modal-root */
  function fallbackModal(name, def, bodyEl, onClose) {
    var host = document.getElementById('modal-root'), isOpen = true;
    if (!host) return function () {};
    var x = h('button', { class: 'btn btn--icon btn--sm', type: 'button', 'aria-label': 'Close', onclick: close }, SS.ICONS && SS.ICONS.close ? I('close') : '×');
    var wrap = h('div', { class: 'shop-fb', onclick: function (e) { if (e.target === wrap) close(); } },
      h('div', { class: 'panel shop-fb-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': def.title },
        h('header', { class: 'shop-fb-head' }, h('h2', { class: 'display shop-fb-title' }, I(def.icon), def.title), x),
        h('div', { class: 'shop-fb-body' }, bodyEl)));
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!isOpen) return;
      isOpen = false;
      document.removeEventListener('keydown', key);
      wrap.remove();
      SS.sfx('close');
      onClose();
      SS.emit('ui:close', { name: name });
    }
    document.addEventListener('keydown', key);
    host.append(wrap);
    SS.sfx('open');
    SS.emit('ui:open', { name: name });
    x.focus({ preventScroll: true });
    return close;
  }
  function closeModal() {
    var m = modal;
    modal = null;
    if (m && m.close) safe('close modal', m.close);
  }
  function open(name) {
    var def = MODALS[name];
    if (!def || (!def.any && (!SS.state || !SS.state.stats))) return false;
    closeModal();
    var view = def.build(), m = { name: name, refresh: view.refresh, close: null };
    function onClose() { if (modal === m) modal = null; }
    var UI = SS.UI, viaUI = false;
    if (UI && UI.openModal) {
      try {
        var c = UI.openModal({ id: name, title: def.title, icon: def.icon, body: view.el, wide: true, onClose: onClose });
        viaUI = true;
        m.close = typeof c === 'function' ? c : function () { if (UI.closeModal) UI.closeModal(); };
      } catch (e) { if (window.console) console.error('[SS.Screens] SS.UI.openModal failed, using the plain panel', e); }
    }
    if (!viaUI) m.close = fallbackModal(name, def, view.el, onClose);
    modal = m;
    return true;
  }

  SS.Screens = {
    init: function () {
      sheet = document.getElementById('sheet');
      if (!sheet) return;
      body = sheet.querySelector('.sheet-body') || sheet.appendChild(h('div', { class: 'sheet-body' }));
      foot = sheet.querySelector('.sheet-foot') || sheet.appendChild(h('div', { class: 'sheet-foot' }));
      SS.on('phase', onPhase);
      ['cart', 'recipe', 'price', 'cash', 'upgrade:buy', 'flavor:buy', 'flavor:set', 'location:set', 'location:unlock', 'reputation', 'milestone',
        'dealer:buy', 'boost:on', 'regular:new', 'regular:lost']
        .forEach(function (e) { SS.on(e, onChange); });
      SS.on('dealer:setup', function (p) { if (p && p.step === 'ready') onChange(); });
      var legal = document.getElementById('legal-link');
      if (legal) legal.addEventListener('click', function () { open('legal'); });
      onPhase();
    },
    open: function (name) { return safe('open ' + name, function () { return open(name); }); }
  };
})();
