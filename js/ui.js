/* Squeeze Street — ui.js
 * The interface shell (DOM only): HUD, title screen, day bar, pause card, modals, toasts,
 * banners, coach tips, settings, how to play and the win screen.
 * Builds SS.UI exactly as the contract in core.js describes. Styles live in css/ui.css.
 */
(function () {
  'use strict';
  var SS = window.SS;
  if (!SS || !SS.h || !SS.DATA) return;
  var h = SS.h, D = SS.DATA, clamp = SS.clamp, ITEMS = D.itemOrder;
  var LOC_ICON = { street: 'locStreet', park: 'locPark', beach: 'locBeach', downtown: 'locDowntown', carnival: 'locCarnival' };
  var WX_NOTE = {
    sunny: 'Clear skies again.', heatwave: 'Thirsty crowds, and they want ice.', cloudy: 'Fewer people feel thirsty.',
    rainy: 'The street is emptying out.', storm: 'Hardly anyone is about.'
  };
  var BUMP = [{ transform: 'scale(1)' }, { transform: 'scale(1.28)', offset: 0.4 }, { transform: 'scale(1)' }];
  var SHAKE = [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }];

  var R = {};                                   // root elements
  var hud = {}, bar = {}, ttl = {}, pause = {}; // element refs per area
  var dv = {};                                  // last values written to the day bar
  var phase = 'title', inited = false, warned = {};

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  function $(id) { return document.getElementById(id); }
  function ico(name, cls) { return SS.iconEl(name, cls); }
  function warn(tag, e) { if (!warned[tag]) { warned[tag] = 1; console.error('[SS.UI] ' + tag, e); } }
  /** guarded SS.Sim call: sim('setPrice', 1.5) */
  function sim(name) {
    var S = SS.Sim;
    if (!S || typeof S[name] !== 'function') return undefined;
    try { return S[name].apply(S, Array.prototype.slice.call(arguments, 1)); } catch (e) { warn('Sim.' + name, e); return undefined; }
  }
  /** a real <button> that clicks audibly */
  function btn(cls, kids, fn, attrs) {
    var p = { class: cls, type: 'button' }, k;
    if (attrs) for (k in attrs) p[k] = attrs[k];
    var b = h('button', p, kids);
    b.addEventListener('click', function (e) { SS.sfx('click'); if (fn) fn(e, b); });
    return b;
  }
  function put(el, v) { if (el && el._v !== v) { el._v = v; el.textContent = v; return true; } return false; }
  function setIcon(holder, name) { if (holder && holder._n !== name) { holder._n = name; holder.innerHTML = SS.icon(name); } }
  /** one-shot flourish; skipped entirely when motion is reduced */
  function anim(el, frames, ms, easing) {
    if (!el || !el.animate || SS.reduced()) return;
    try { el.animate(frames, { duration: ms, easing: easing || 'ease-out' }); } catch (e) { /* cosmetic only */ }
  }
  function stars1(v) { return (Math.round((Number(v) || 0) * 10) / 10).toFixed(1); }
  function itemName(id) { var it = D.items[id]; return it ? it.name.toLowerCase() : 'supplies'; }
  function refuse(el, text, icon) { SS.sfx('error'); anim(el, SHAKE, 300); if (text) toast(text, 'info', icon || 'info'); }
  function soundOn() { var s = SS.state && SS.state.settings; return !!s && !!(s.sfx || s.music); }
  function toggleSound() { var on = !soundOn(); sim('setSetting', 'sfx', on); sim('setSetting', 'music', on); }
  function openScreen(name) {
    if (SS.Screens && SS.Screens.open) { try { SS.Screens.open(name); } catch (e) { warn('Screens.open', e); } }
    else refuse(null, 'That screen is still being set up.');
  }

  /* ------------------------------------------------------------------ *
   * HUD
   * ------------------------------------------------------------------ */
  var pendDelta = 0, deltaTimer = 0;

  function buildHud() {
    hud.dayNum = h('b', { class: 'hud-day-num display num' }, '1');
    hud.day = h('div', { class: 'hud-bar hud-day' }, h('span', { class: 'label' }, 'Day'), hud.dayNum);

    hud.locIco = h('span', { class: 'hud-ico' });
    hud.locName = h('span', { class: 'hud-loc-name' });
    hud.loc = btn('hud-seg hud-loc', [hud.locIco, hud.locName], onLoc);
    hud.wxIco = h('span', { class: 'hud-ico' });
    hud.wxTemp = h('b', { class: 'num' });
    hud.wxName = h('span', { class: 'hud-sr' });
    hud.wxTag = h('span', { class: 'hud-wx-tag label' }, 'Forecast');
    hud.wx = h('div', { class: 'hud-seg hud-wx' }, hud.wxIco, hud.wxTemp, hud.wxName, hud.wxTag);
    hud.clockText = h('b', { class: 'hud-clock-text num' }, SS.clockText(0));
    hud.track = h('div', { class: 'hud-clock-track', 'aria-hidden': 'true' }, h('i', { class: 'hud-clock-fill' }), h('i', { class: 'hud-clock-sun' }));
    hud.clock = h('div', { class: 'hud-bar hud-clock', hidden: true }, h('span', { class: 'hud-sr' }, 'Time '), hud.clockText, hud.track);
    hud.sub = h('div', { class: 'hud-sub' }, h('div', { class: 'hud-bar hud-ctx' }, hud.loc, hud.wx), hud.clock);

    hud.repStars = h('span', { class: 'hud-rep-full', html: SS.starsHTML(0) });
    hud.repOn = hud.repStars.querySelector('.stars-on');
    hud.repNum = h('b', { class: 'num' }, '0.0');
    hud.rep = h('div', { class: 'hud-seg hud-rep', id: 'hud-rep', role: 'img', title: 'Your reputation' },
      hud.repStars, h('span', { class: 'hud-rep-one', html: SS.icon('star') }), hud.repNum);
    hud.cash = h('span', { class: 'hud-cash-num display num', id: 'hud-cash' }, SS.fmtMoney(0));
    hud.cashSeg = h('div', { class: 'hud-seg hud-cash', title: 'Cash' }, ico('coin'), h('span', { class: 'hud-sr' }, 'Cash '), hud.cash);
    hud.stats = h('div', { class: 'hud-bar hud-stats' }, hud.rep, hud.cashSeg);

    hud.snd = btn('btn btn--icon', null, toggleSound);
    hud.btns = h('div', { class: 'hud-btns' },
      btn('btn btn--icon', ico('trophy'), function () { openScreen('goals'); }, { 'aria-label': 'Goals', title: 'Goals' }),
      hud.snd,
      btn('btn btn--icon', ico('gear'), openSettings, { 'aria-label': 'Settings', title: 'Settings' }));
    hud.menuBtn = btn('btn btn--icon hud-menu-btn', ico('menu'), function () { toggleMenu(); },
      { 'aria-label': 'Menu', 'aria-haspopup': 'true', 'aria-expanded': 'false' });
    hud.menu = h('div', { class: 'hud-menu panel', role: 'menu', hidden: true });
    R.hud.replaceChildren(hud.day, hud.sub, hud.stats, hud.btns, hud.menuBtn, hud.menu);
  }

  function onLoc() {
    if (phase === 'day') refuse(hud.loc, 'You can move the stand before you open or after you close.', 'map');
    else openScreen('map');
  }

  function menuItem(icon, label, fn) {
    return btn('hud-menu-item', [ico(icon), label], function () { toggleMenu(false); fn(); }, { role: 'menuitem' });
  }
  function toggleMenu(force) {
    if (!hud.menu) return;
    var open = typeof force === 'boolean' ? force : hud.menu.hidden;
    if (open === !hud.menu.hidden) return;
    if (open) {
      var items = [menuItem('trophy', 'Goals', function () { openScreen('goals'); })];
      if (phase === 'day') items.push(menuItem('pause', 'Pause', function () { SS.setPaused(true); }));
      else items.push(menuItem('map', 'Map', function () { openScreen('map'); }));
      items.push(menuItem(soundOn() ? 'sound' : 'mute', soundOn() ? 'Sound is on' : 'Sound is off', toggleSound));
      items.push(menuItem('gear', 'Settings', openSettings));
      hud.menu.replaceChildren.apply(hud.menu, items);
    }
    hud.menu.hidden = !open;
    hud.menuBtn.setAttribute('aria-expanded', String(open));
    R.hud.classList.toggle('is-menu-open', open);
    if (open && hud.menu.firstChild) hud.menu.firstChild.focus();
  }

  function refreshSound() {
    var on = soundOn(), label = on ? 'Turn sound off' : 'Turn sound on';
    [hud.snd, ttl.snd].forEach(function (b) {
      if (!b) return;
      setIcon(b, on ? 'sound' : 'mute');
      b.setAttribute('aria-label', label); b.title = label + ' (M)';
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function refreshWeather() {
    var s = SS.state;
    if (!s || !hud.wx) return;
    var fc = s.phase === 'prep';
    var wx = (s.phase === 'day' && s.today && s.today.weatherNow) || (fc ? s.forecast : s.weather) || s.forecast;
    if (!wx) return;
    var def = D.weather[wx.type] || D.weather.sunny, temp = SS.fmtTemp(wx.temp);
    setIcon(hud.wxIco, def.icon);
    put(hud.wxTemp, temp);
    put(hud.wxName, ' ' + def.name + (fc ? ' forecast' : ''));
    hud.wxTag.hidden = !fc;
    hud.wx.title = (fc ? 'Forecast: ' : '') + def.name + ', ' + temp;
  }

  function setRep(v) {
    v = clamp(Number(v) || 0, 0, 5);
    put(hud.repNum, stars1(v));
    if (hud.repOn) hud.repOn.style.width = (v / 5 * 100).toFixed(1) + '%';
    hud.rep.setAttribute('aria-label', 'Reputation: ' + stars1(v) + ' out of 5 stars');
  }
  function setCash(amount, tick) {
    amount = Number(amount) || 0;
    hud.cashSeg.classList.toggle('is-long', SS.fmtMoney(amount).length > 9);
    SS.countTo(hud.cash, amount, { ms: tick ? 500 : 0 });
  }

  function refreshHud() {
    var s = SS.state;
    if (!s || !hud.day) return;
    var inDay = s.phase === 'day', loc = D.byId(D.locations, s.location) || D.locations[0];
    put(hud.dayNum, String(s.day || 1));
    setIcon(hud.locIco, LOC_ICON[loc.id] || 'map');
    put(hud.locName, loc.name);
    hud.loc.title = inDay ? loc.name : 'Open the map';
    hud.loc.setAttribute('aria-label', inDay ? 'Your stand is at ' + loc.name : loc.name + '. Open the map');
    hud.loc.classList.toggle('is-fixed', inDay);
    hud.clock.hidden = !inDay;
    R.hud.classList.toggle('is-day', inDay);
    refreshWeather();
    setRep(s.reputation);
    setCash(s.cash, false);
    refreshSound();
  }

  function flushDelta() {
    deltaTimer = 0;
    var d = Math.round(pendDelta * 100) / 100;
    pendDelta = 0;
    if (!d || !hud.stats || R.hud.hidden) return;
    var old = hud.stats.querySelectorAll('.hud-delta');
    if (old.length > 1) old[0].remove();
    var el = h('span', { class: 'hud-delta chip num ' + (d > 0 ? 'chip--good' : 'chip--bad'), 'aria-hidden': 'true' }, (d > 0 ? '+' : '') + SS.fmtMoney(d));
    hud.stats.append(el);
    setTimeout(function () { el.remove(); }, 1250);
  }
  function onCash(p) {
    var s = SS.state;
    if (!s || !hud.cash) return;
    var delta = (p && Number(p.delta)) || 0;
    setCash(p && typeof p.amount === 'number' ? p.amount : s.cash, true);
    if (!delta) return;
    anim(hud.cashSeg, [{ backgroundColor: delta > 0 ? '#a6efc4' : '#ffbcb6' }, { backgroundColor: 'rgba(255,255,255,0)' }], 600);
    pendDelta += delta;
    if (!deltaTimer) deltaTimer = setTimeout(flushDelta, 170);   // a burst of sales shows as one number
  }
  function onRep(p) {
    var s = SS.state;
    if (!s || !hud.rep) return;
    setRep(p && typeof p.value === 'number' ? p.value : s.reputation);
    if (p && p.delta) anim(hud.repNum, BUMP, 300);
  }

  /* ------------------------------------------------------------------ *
   * Day bar
   * ------------------------------------------------------------------ */
  function stat(icon, label, cls) {
    var num = h('b', { class: 'num' }, '0');
    return { num: num, n: -1, lvl: -1, el: h('div', { class: 'daybar-stat' + (cls ? ' ' + cls : ''), title: label }, ico(icon), num, h('span', { class: 'hud-sr' }, ' ' + label)) };
  }
  function buildDaybar() {
    var P = D.price;
    bar.bellCd = h('span', { class: 'daybar-bell-cd num', 'aria-hidden': 'true' });
    bar.bell = btn('daybar-bell', [h('span', { class: 'daybar-bell-face' }, ico('bell')), bar.bellCd], onBell,
      { 'data-tut': 'bell', 'aria-label': 'Ring the bell', title: 'Ring the bell to call people over (B)' });
    bar.price = SS.stepper({ value: P.start, min: P.min, max: P.max, step: P.step, fmt: SS.fmtMoney, label: 'price', onChange: function (v) { sim('setPrice', v); } });
    bar.speedBtns = [1, 2, 3].map(function (n) {
      return btn('daybar-speed-btn', n + '×', function () { onSpeed(n); },
        { 'aria-pressed': 'false', 'aria-label': 'Speed ' + n + ' times', title: 'Speed ' + n + '× (press ' + n + ')' });
    });
    bar.speed = h('div', { class: 'daybar-speed', 'data-tut': 'speed', role: 'group', 'aria-label': 'Game speed' }, bar.speedBtns);
    var pauseBtn = btn('btn btn--icon daybar-pause', ico('pause'), function () { SS.setPaused(true); }, { 'aria-label': 'Pause', title: 'Pause (Space)' });
    var ctl = h('div', { class: 'daybar-ctl' }, bar.bell,
      h('div', { class: 'daybar-price' }, h('span', { class: 'label' }, 'Price'), bar.price), bar.speed, pauseBtn);

    bar.pitNum = h('b', { class: 'num' }, '0/0');
    bar.pitMeter = h('div', { class: 'meter daybar-pit-meter' }, h('i'));
    bar.pit = h('div', { class: 'daybar-pit', title: 'Cups left in the pitcher' }, ico('pitcher'),
      h('div', { class: 'daybar-pit-col' }, bar.pitNum, bar.pitMeter), h('span', { class: 'hud-sr' }, ' cups in the pitcher'));
    bar.stock = ITEMS.map(function (it) { return stat(D.items[it].icon, D.items[it].name + ' left'); });
    bar.line = stat('people', 'in line');
    bar.sold = stat('drink', 'cups sold today', 'daybar-sold');
    bar.take = stat('cash', 'taken today', 'daybar-take');
    bar.take.num.textContent = SS.fmtMoney(0);
    var stats = h('div', { class: 'daybar-stats', role: 'group', 'aria-label': 'Today so far' },
      bar.pit, h('i', { class: 'daybar-sep' }), bar.stock.map(function (c) { return c.el; }),
      h('i', { class: 'daybar-sep' }), bar.line.el, bar.sold.el, bar.take.el);

    bar.floatIco = h('span', { class: 'hud-ico' });
    bar.floatText = h('span', { class: 'daybar-float-text' });
    bar.floatMeter = h('div', { class: 'meter daybar-float-meter' }, h('i'));
    bar.closeBtn = btn('btn btn--sm btn--primary', 'Close up early', onCloseEarly);
    bar.float = h('div', { class: 'daybar-float', role: 'status', hidden: true }, bar.floatIco, bar.floatMeter, bar.floatText, bar.closeBtn);
    bar.panel = h('div', { class: 'daybar-panel panel' }, bar.float, ctl, stats);
    R.daybar.replaceChildren(bar.panel);
  }

  function onBell() {
    if (sim('ringBell') === true) anim(bar.bell, BUMP, 280);
    else refuse(bar.bell);
  }
  function onSpeed(n) {
    var cur = (SS.state && SS.state.settings && SS.state.settings.speed) || 1;
    if (n === cur && !bar.speedBtns[n % 3].getClientRects().length) n = cur % 3 + 1;     // tight layouts show one button that cycles
    sim('setSetting', 'speed', n);
  }
  function onCloseEarly() {
    var td = SS.state && SS.state.today;
    if (!td) return;
    confirmBox({
      title: 'Close up early?', icon: 'clock',
      text: 'You are out of ' + itemName(td.soldOut) + ', so nobody else can buy today. Close the stand now and see how the day went?',
      yes: 'Close up', no: 'Stay open'
    }).then(function (ok) { if (ok) sim('closeEarly'); });
  }

  function resetDay() {
    dv = { brewLong: true };
    bar.stock.forEach(function (c) { c.n = -1; c.lvl = -1; });
    if (SS.state && bar.price) bar.price.set(SS.state.price);
    if (hud.track) hud.track.style.setProperty('--t', 0);
  }
  function setFloat(mode, out) {
    dv.fm = mode; dv.out = out;
    bar.float.hidden = !mode;
    bar.float.classList.toggle('is-out', mode === 2);
    bar.floatMeter.hidden = mode !== 1;
    bar.closeBtn.hidden = mode !== 2;
    if (mode === 1) { setIcon(bar.floatIco, 'juicer'); put(bar.floatText, 'Tap the stand to squeeze faster'); }
    else if (mode === 2) { setIcon(bar.floatIco, 'warning'); put(bar.floatText, 'Out of ' + itemName(out)); }
  }

  /** Runs every frame during the day. Only writes to the DOM when a shown value changed. */
  function refreshDay() {
    var s = SS.state, td = s && s.today;
    if (!s || !td || !bar.panel) return;
    var t = clamp(td.t || 0, 0, 1), n, i;
    n = Math.round(t * 108);                                  // the clock label moves in 5 minute steps
    if (dv.clk !== n) { dv.clk = n; hud.clockText.textContent = SS.clockText(t); }
    n = Math.round(t * 400) / 400;
    if (dv.t !== n) { dv.t = n; hud.track.style.setProperty('--t', n); }

    var b = td.bell, cd = b && b.cd > 0 ? b.cd : 0;
    n = b && b.max > 0 ? Math.round((1 - cd / b.max) * 200) / 200 : 1;
    if (dv.bp !== n) { dv.bp = n; bar.bell.style.setProperty('--p', n); }
    n = Math.ceil(cd);
    if (dv.bc !== n) {
      dv.bc = n; bar.bellCd.textContent = n > 0 ? n : '';
      bar.bell.classList.toggle('is-cooling', n > 0);
      bar.bell.setAttribute('aria-disabled', n > 0 ? 'true' : 'false');
    }
    n = b && b.active > 0 ? 1 : 0;
    if (dv.ring !== n) { dv.ring = n; bar.bell.classList.toggle('is-ringing', n === 1); }

    var P = td.pitcher || dv, brewing = P.brew != null, max = P.max || 0, cups = Math.floor((P.cups || 0) + 1e-6);
    n = brewing ? -1 : cups * 1000 + max;
    if (dv.pit !== n) {
      dv.pit = n; bar.pitNum.textContent = brewing ? 'Mixing' : cups + '/' + max;
      bar.pit.classList.toggle('is-brew', brewing);
    }
    n = Math.round(clamp(brewing ? P.brew : (max ? P.cups / max : 0), 0, 1) * 100) / 100;
    if (dv.pv !== n) { dv.pv = n; bar.pitMeter.style.setProperty('--v', n); if (brewing) bar.floatMeter.style.setProperty('--v', n); }

    var stock = s.stock || dv, rc = s.recipe || dv;
    for (i = 0; i < ITEMS.length; i++) {
      var it = ITEMS[i], cell = bar.stock[i], have = stock[it] || 0;
      var per = it === 'cups' ? 1 : it === 'ice' ? (rc.ice || 0) : (rc[it] || 0) / 10;
      n = Math.floor(have + 1e-6);
      if (cell.n !== n) { cell.n = n; cell.num.textContent = n; }
      n = !(per > 0) ? 0 : have / per < 1 - 1e-6 ? 2 : have / per < max ? 1 : 0;      // 1 = under one pitcher left, 2 = none
      if (cell.lvl !== n) { cell.lvl = n; cell.el.classList.toggle('is-low', n === 1); cell.el.classList.toggle('is-out', n === 2); }
    }

    n = td.queue ? td.queue.length : 0;
    if (bar.line.n !== n) { bar.line.n = n; bar.line.num.textContent = n; }
    n = td.sold || 0;
    if (bar.sold.n !== n) { if (n > bar.sold.n && bar.sold.n >= 0) anim(bar.sold.num, BUMP, 240); bar.sold.n = n; bar.sold.num.textContent = n; }
    n = Math.round(((td.revenue || 0) + (td.tipsEarned || 0)) * 100);
    if (bar.take.n !== n) { bar.take.n = n; bar.take.num.textContent = SS.fmtMoney(n / 100); }

    n = (s.settings && s.settings.speed) || 1;
    if (dv.sp !== n) {
      dv.sp = n;
      for (i = 0; i < 3; i++) { bar.speedBtns[i].classList.toggle('is-on', i + 1 === n); bar.speedBtns[i].setAttribute('aria-pressed', String(i + 1 === n)); }
    }
    if (dv.flv !== s.flavor) {
      dv.flv = s.flavor;
      var fl = D.byId(D.flavors, s.flavor);
      bar.sold.el.style.color = fl ? fl.color : '';
    }

    var out = td.soldOut || '', mode = out ? 2 : brewing && dv.brewLong ? 1 : 0;
    if (dv.fm !== mode || dv.out !== out) setFloat(mode, out);
  }

  /* ------------------------------------------------------------------ *
   * Pause card
   * ------------------------------------------------------------------ */
  function key(k) { return h('kbd', { class: 'pause-key' }, k); }
  function buildPause() {
    pause.card = h('div', { class: 'pause-card panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pause-title', tabindex: '-1' },
      h('h2', { class: 'pause-title display', id: 'pause-title' }, 'Paused'),
      h('p', { class: 'pause-text' }, 'The whole street is holding still. Nothing moves until you are back.'),
      btn('btn btn--go btn--lg btn--block', [ico('play'), 'Resume'], function () { SS.setPaused(false); }),
      btn('btn btn--block', [ico('gear'), 'Settings'], openSettings),
      btn('btn btn--block', [ico('home'), 'Quit to title'], onQuit),
      h('p', { class: 'pause-keys' },
        h('span', null, key('Space'), ' pause'), h('span', null, key('1'), key('2'), key('3'), ' speed'),
        h('span', null, key('B'), ' bell'), h('span', null, key('M'), ' mute')));
    pause.el = h('div', { class: 'pause-layer', id: 'pause-root', hidden: true }, pause.card);
    R.ui.insertBefore(pause.el, R.modal);
  }
  function onPause(p) {
    if (!pause.el) return;
    var show = !!(p && p.paused) && phase === 'day' && !layers.length;
    if (show === !pause.el.hidden) return;
    pause.el.hidden = !show;
    toggleMenu(false);
    // focus the card itself, not a button, so main.js still hears Space and P
    if (show) { try { pause.card.focus({ preventScroll: true }); } catch (e) { /* focus is a nicety */ } }
    else if (pause.el.contains(document.activeElement)) document.activeElement.blur();
  }
  function onQuit() {
    var inDay = phase === 'day';
    confirmBox({
      title: 'Quit to the title screen?', icon: 'home', danger: inDay,
      text: inDay ? 'Today is not over yet, so everything you sold today will be lost. Next time you start again from this morning.'
        : 'Your game is saved. Pick it up again from the title screen whenever you like.',
      yes: 'Quit', no: 'Keep playing'
    }).then(function (ok) { if (ok) toTitle(false); });
  }
  /** Back to the title screen. The sim has no call for this, so the UI resets it and announces the phase. */
  function toTitle(wipe) {
    var s = SS.state, from = s ? s.phase : 'title', keep = s && s.settings ? Object.assign({}, s.settings) : null, k;
    closeAll();
    if (wipe) sim('wipeSave');
    if (SS.Sim && SS.Sim.init) sim('init');
    else if (s) { s.phase = 'title'; s.today = null; }
    if (wipe && keep) for (k in keep) sim('setSetting', k, keep[k]);     // wiping the save should not forget the volume
    SS.emit('phase', { from: from, to: 'title' });
  }

  /* ------------------------------------------------------------------ *
   * Modals (one at a time; a confirm may sit on top of one)
   * ------------------------------------------------------------------ */
  var layers = [], pausedByModal = false, prevPaused = false, uid = 0;

  function focusables(box) {
    var list = box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'), out = [];
    for (var i = 0; i < list.length; i++) if (!list[i].disabled && list[i].getClientRects().length) out.push(list[i]);
    return out;
  }
  /** While any modal is open during the day the game is paused; closing puts the pause back how it was. */
  function syncModals() {
    var open = layers.length > 0, inDay = !!SS.state && SS.state.phase === 'day';
    if (open && !pausedByModal && inDay) { pausedByModal = true; prevPaused = SS.paused; SS.setPaused(true); }
    else if (!open && pausedByModal) { pausedByModal = false; if (inDay) SS.setPaused(prevPaused); }
  }
  function openLayer(o) {
    if (!inited) init();
    if (!R.modal) return function () {};
    var opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    if (!o.confirm) {
      layers.slice().reverse().forEach(function (old) {
        if (opener && old.el.contains(opener)) opener = old.opener;
        old.close(true);
      });
    }
    toggleMenu(false);
    var L = { id: o.id || 'modal', opener: opener, closed: false }, tid = 'modal-title-' + (++uid);
    L.close = function (quiet) {
      if (L.closed) return;
      L.closed = true;
      var i = layers.indexOf(L);
      if (i >= 0) layers.splice(i, 1);
      if (SS.reduced()) L.el.remove();
      else { L.el.classList.add('is-closing'); setTimeout(function () { L.el.remove(); }, 170); }
      if (o.onClose) { try { o.onClose(); } catch (e) { warn('modal onClose', e); } }
      SS.emit('ui:close', { name: L.id });
      if (quiet === true) return;                             // being replaced or swept away: no sound, no focus move
      SS.sfx('close');
      syncModals();
      var back = L.opener;
      if (back && back.isConnected && back.focus) { try { back.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
    };
    L.card = h('div', {
      class: 'modal-card' + (o.wide ? ' modal-card--wide' : '') + (o.confirm ? ' modal-card--confirm' : ''),
      role: o.confirm ? 'alertdialog' : 'dialog', 'aria-modal': 'true', 'aria-labelledby': tid, tabindex: '-1'
    },
      h('header', { class: 'modal-head' }, o.icon ? ico(o.icon, 'ico--lg') : null,
        h('h2', { class: 'modal-title display', id: tid }, o.title || ''),
        o.confirm ? null : btn('btn btn--icon modal-x', ico('close'), function () { L.close(); }, { 'aria-label': 'Close' })),
      h('div', { class: 'modal-body' }, o.body || null));
    L.el = h('div', { class: 'modal-layer', 'data-modal': L.id }, h('div', { class: 'modal-backdrop', onclick: function () { L.close(); } }), L.card);
    layers.push(L);
    R.modal.append(L.el);
    syncModals();
    SS.sfx('open');
    var first = L.card.querySelector('[data-autofocus]') || L.card;
    try { first.focus({ preventScroll: true }); } catch (e) { /* focus is a nicety */ }
    SS.emit('ui:open', { name: L.id });
    return function () { L.close(); };
  }
  function closeAll() {
    if (!layers.length) return;
    layers.slice().reverse().forEach(function (L) { L.close(true); });
    syncModals();
  }
  function closeModal() {
    while (layers.length > 1) layers[layers.length - 1].close(true);
    if (layers.length) layers[0].close();
  }
  function confirmBox(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var result = false, close = null;
      var yes = btn('btn ' + (o.danger ? 'btn--danger' : 'btn--primary'), o.yes || 'OK', function () { result = true; if (close) close(); });
      var no = btn('btn', o.no || 'Cancel', function () { if (close) close(); });
      (o.danger ? no : yes).setAttribute('data-autofocus', '');
      var body = h('div', { class: 'modal-confirm' }, h('p', { class: 'modal-text' }, o.text || ''), h('div', { class: 'modal-actions' }, no, yes));
      close = openLayer({ id: 'confirm', title: o.title || 'Are you sure?', icon: o.icon, body: body, confirm: true, onClose: function () { resolve(result); } });
    });
  }

  /** Escape and Tab only: every game shortcut belongs to main.js. */
  function onKey(e) {
    var top = layers[layers.length - 1];
    if (e.key === 'Escape') {
      if (hud.menu && !hud.menu.hidden) { e.preventDefault(); toggleMenu(false); hud.menuBtn.focus(); }
      else if (top) { e.preventDefault(); top.close(); }
      else if (pause.el && !pause.el.hidden) { e.preventDefault(); SS.setPaused(false); }
      return;
    }
    if (e.key !== 'Tab') return;
    var box = top ? top.card : pause.el && !pause.el.hidden ? pause.card : null;
    if (!box) return;
    var f = focusables(box), a = document.activeElement;
    if (!f.length) { e.preventDefault(); box.focus(); return; }
    if (!box.contains(a) || a === box) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
    else if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }

  /* ------------------------------------------------------------------ *
   * Settings, how to play, win
   * ------------------------------------------------------------------ */
  function openSettings() {
    var s = (SS.state && SS.state.settings) || {};
    function row(k, icon, name, desc) {
      return btn('set-row', [ico(icon, 'ico--lg'), h('span', { class: 'set-text' }, h('b', null, name), h('span', { class: 'set-desc' }, desc)), h('i', { class: 'set-knob' })],
        function (e, b) { if (sim('setSetting', k, b.getAttribute('aria-checked') !== 'true') !== true) refuse(b); },
        { role: 'switch', 'aria-checked': String(!!s[k]), 'data-set': k });
    }
    var body = h('div', { class: 'set-body' },
      row('sfx', 'sound', 'Sound effects', 'Pours, coins, bells and clicks.'),
      row('music', 'music', 'Music', 'A breezy tune while you work.'),
      row('reducedMotion', 'sparkle', 'Reduced motion', 'No shaking or flashing, and far fewer particles.'),
      h('div', { class: 'set-actions' },
        btn('btn', [ico('info'), 'How to play'], openHowTo),
        phase !== 'title' ? btn('btn', [ico('home'), 'Quit to title'], onQuit) : null,
        btn('btn set-reset', [ico('trash'), 'Reset game'], onReset)),
      h('p', { class: 'set-note' }, 'Your game saves by itself every morning and every evening. Version ' + SS.VERSION + '.'));
    return openLayer({ id: 'settings', title: 'Settings', icon: 'gear', body: body });
  }
  function onReset() {
    confirmBox({
      title: 'Reset the whole game?', icon: 'warning', danger: true,
      text: 'This erases your stand, your cash, every upgrade and every goal. It cannot be undone.',
      yes: 'Erase everything', no: 'Keep my game'
    }).then(function (ok) { if (ok) { toTitle(true); toast('All clear. A fresh stand is waiting.', 'info', 'restart'); } });
  }
  function onSettings() {
    var s = SS.state && SS.state.settings;
    refreshSound();
    if (!s || !R.modal) return;
    var rows = R.modal.querySelectorAll('[data-set]');
    for (var i = 0; i < rows.length; i++) rows[i].setAttribute('aria-checked', String(!!s[rows[i].getAttribute('data-set')]));
  }

  var HOW = [
    ['shop', 'Stock up', 'Every morning, buy lemons, sugar, ice and cups. Buy what you expect to sell: some lemons spoil overnight and the ice melts.'],
    ['recipe', 'Mix your recipe', 'Lemons and sugar set the taste, ice keeps it cold. A richer mix costs more per cup but earns better reviews.'],
    ['tag', 'Name your price', 'Charge too much and people walk on by. Charge too little and you work for nothing. You can change it while the stand is open.'],
    ['sun', 'Watch the weather', 'Hot days bring thirsty crowds who want extra ice. Rain keeps people home, so buy less. The forecast is usually right, not always.'],
    ['bell', 'Work the stand', 'Ring the bell to call people over, tap the stand to mix a batch faster, and tap coins on the ground to pick up tips.'],
    ['newspaper', 'Read the reviews', 'Customers say what bothered them: too sour, too sweet, too warm, too pricey or too slow. Fix that one thing tomorrow.'],
    ['juicer', 'Upgrade', 'Spend your profit on a bigger pitcher, a faster juicer, shade, signs and new flavors.'],
    ['map', 'Move up', 'More stars unlock busier spots, from the park to the carnival. The rent is higher and so are the takings.']
  ];
  function openHowTo() {
    var close = null;
    var body = h('div', { class: 'modal-how' },
      h('ol', { class: 'modal-how-list' }, HOW.map(function (r) {
        return h('li', { class: 'modal-how-item' }, ico(r[0], 'ico--lg'), h('div', null, h('b', null, r[1]), h('p', null, r[2])));
      })),
      h('p', { class: 'modal-how-goal well' }, ico('trophy'), ' Earn $10,000 in total sales and the whole town will call you the lemonade mogul.'),
      btn('btn btn--primary btn--block', 'Got it', function () { if (close) close(); }));
    close = openLayer({ id: 'howto', title: 'How to play', icon: 'info', body: body });
    return close;
  }

  function openWin() {
    var s = SS.state;
    if (!s || phase === 'title') return;
    var st = s.stats || {}, close = null;
    function tile(label, value, fmt) {
      var v = h('b', { class: 'win-val display num' }, fmt(0));
      setTimeout(function () { SS.countTo(v, Number(value) || 0, { from: 0, fmt: fmt, ms: 1500 }); }, 400);
      return h('div', { class: 'win-stat well' }, h('span', { class: 'label' }, label), v);
    }
    var body = h('div', { class: 'win-body' },
      h('div', { class: 'win-hero', 'aria-hidden': 'true' }, h('i', { class: 'win-rays' }), ico('trophy', 'win-trophy')),
      h('h3', { class: 'win-title display' }, 'Lemonade mogul'),
      h('p', { class: 'win-text' }, 'From one pitcher on Maple Street to $10,000 in sales. The whole town knows your stand, and most of it is standing in your line.'),
      h('div', { class: 'win-grid' },
        tile('Total sales', s.lifetimeEarnings, SS.fmtMoney), tile('Cups poured', s.lifetimeCups, SS.fmtInt), tile('Days open', st.days, SS.fmtInt),
        tile('Best day', st.bestProfit, SS.fmtMoney), tile('Tips', st.tips, SS.fmtMoney), tile('Stars', s.reputation, stars1)),
      btn('btn btn--go btn--lg btn--block', 'Keep playing', function () { if (close) close(); }, { 'data-autofocus': '' }));
    close = openLayer({ id: 'win', title: 'You did it!', icon: 'trophy', body: body });
  }

  /* ------------------------------------------------------------------ *
   * Toasts
   * ------------------------------------------------------------------ */
  var toasts = [];
  function dropToast(t) {
    var i = toasts.indexOf(t);
    if (i < 0) return;
    toasts.splice(i, 1);
    clearTimeout(t.timer);
    t.el.classList.add('is-out');
    setTimeout(function () { t.el.remove(); }, SS.reduced() ? 0 : 220);
  }
  function toast(text, kind, icon) {
    if (!text) return;
    if (!inited) init();
    if (!R.toast) return;
    text = String(text);
    var t = null, ms = clamp(2400 + text.length * 45, 2800, 6500), i;
    for (i = 0; i < toasts.length; i++) if (toasts[i].text === text) t = toasts[i];
    if (t) { clearTimeout(t.timer); anim(t.el, BUMP, 260); }       // the same message again: just keep it up longer
    else {
      t = { text: text, timer: 0, el: h('div', { class: 'toast toast--' + (kind === 'good' || kind === 'bad' ? kind : 'info') }, icon ? ico(icon) : null, h('span', null, text)) };
      toasts.push(t);
      R.toast.append(t.el);
      if (toasts.length > 3) dropToast(toasts[0]);
    }
    t.timer = setTimeout(function () { dropToast(t); }, ms);
  }
  function layoutToasts() {
    if (R.toast) R.toast.style.bottom = phase === 'day' && !R.daybar.hidden ? (R.daybar.offsetHeight + 72) + 'px' : '';
  }

  /* ------------------------------------------------------------------ *
   * Banners: at most two on screen, the rest wait their turn
   * ------------------------------------------------------------------ */
  var bannerQ = [], bannersLive = 0, bannerGen = 0;
  function banner(o) {
    if (!R.banner || phase === 'title' || !o || !o.title) return;
    if (bannerQ.length >= 6) bannerQ.shift();
    bannerQ.push(o);
    pumpBanners();
  }
  function pumpBanners() {
    while (bannersLive < 2 && bannerQ.length) showBanner(bannerQ.shift());
  }
  function showBanner(o) {
    var gen = bannerGen, ms = bannerQ.length > 1 ? 2200 : o.goal ? 4200 : 3400;
    var el = h('div', { class: 'banner banner--' + (o.kind || 'news') + (o.goal ? ' banner--goal' : '') },
      h('span', { class: 'banner-ico' }, ico(o.icon || 'star')),
      h('span', { class: 'banner-text' },
        o.label ? h('span', { class: 'label' }, o.label) : null,
        h('b', { class: 'banner-title' + (o.goal ? ' display' : '') }, o.title),
        o.desc ? h('span', { class: 'banner-desc' }, o.desc) : null),
      o.reward > 0 ? h('span', { class: 'banner-reward display num' }, '+' + SS.fmtMoney(o.reward)) : null);
    bannersLive++;
    R.banner.append(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () {
        el.remove();
        if (gen !== bannerGen) return;                        // the board was cleared meanwhile
        bannersLive--;
        pumpBanners();
      }, SS.reduced() ? 0 : 240);
    }, ms);
  }
  function clearBanners() {
    bannerGen++; bannerQ.length = 0; bannersLive = 0;
    if (R.banner) R.banner.replaceChildren();
  }

  function onEvent(p) {
    if (!p || !p.title) return;
    banner({ icon: p.icon || 'newspaper', label: phase === 'prep' ? 'Morning news' : 'News flash', title: p.title, desc: p.desc, kind: 'news' });
  }
  function onWeather(p) {
    refreshWeather();
    var def = p && D.weather[p.type];
    if (!def) return;
    banner({ icon: def.icon, title: def.name + ', ' + SS.fmtTemp(p.temp), desc: WX_NOTE[p.type], kind: 'sky' });
  }
  function onSoldOut(p) {
    banner({ icon: 'warning', title: 'Out of ' + itemName(p && p.missing), desc: 'Nobody can buy until you restock tomorrow.', kind: 'bad' });
  }
  function onUnlock(p) {
    var loc = p && D.byId(D.locations, p.id);
    if (loc) banner({ icon: LOC_ICON[loc.id] || 'map', label: 'New spot', title: loc.name + ' is yours', desc: 'Pick it on the map to set up there.', kind: 'good' });
  }
  function onUpgrade(p) {
    var def = p && D.byId(D.upgrades, p.id), lv = def && def.levels[(p.level || 1) - 1];
    if (!lv) return;
    var parts = String(lv.label).split(' · ');
    banner({ icon: def.icon, label: 'Upgrade', title: parts[0], desc: parts[1] || def.desc, kind: 'good' });
  }
  function onMilestone(p) {
    p = p || {};
    banner({ icon: 'trophy', label: 'Goal complete', title: p.title || 'Nicely done', reward: Number(p.reward) || 0, kind: 'goal', goal: true });
  }

  /* ------------------------------------------------------------------ *
   * Coach tips for a first-time player
   * ------------------------------------------------------------------ */
  var TIPS = {
    prep: [
      { at: 'market', text: 'Start with the shopping. Buy lemons, sugar, ice and cups for today. Two packs of each is plenty for a first morning.' },
      { at: 'recipe', text: 'This is your recipe. More lemons and sugar make a tastier cup that costs more to pour. Add extra ice when it is hot.' },
      { at: 'price', text: 'Now name your price. Too high and people walk on by. Too low and you sell out with little to show for it.' },
      { at: 'open', text: 'All set? Open the stand and watch the street come to life.' }
    ],
    day: [
      { at: 'bell', text: 'Ring the bell to call passers-by over. It takes a little while to recharge, so save it for a quiet moment.' },
      { at: 'stand', text: 'When the pitcher runs dry, a new batch gets mixed. Tap the stand to squeeze faster, and tap coins on the ground to pick up tips.' }
    ],
    results: [
      { at: 'next', text: 'Read the reviews first: they tell you what to fix tomorrow. Then head into the next day.' }
    ]
  };
  var coach = { phase: '', steps: null, i: 0, tries: 0, timer: 0, el: null, ring: null, node: null, bw: 0, bh: 0, side: '', x: 0, y: 0, ax: 0, ay: 0, l: 0, t: 0, w: 0, h: 0 };

  function tutDrop() {
    if (coach.el) coach.el.remove();
    if (coach.ring) coach.ring.remove();
    coach.el = coach.ring = coach.node = null;
  }
  function tutClear() {
    clearTimeout(coach.timer);
    tutDrop();
    coach.steps = null; coach.phase = '';
  }
  function tutFinish() {
    var s = SS.state;
    if (s && s.tutorial && !s.tutorial.done) { s.tutorial.done = true; sim('save'); }
    tutClear();
  }
  function tutStart(ph) {
    var s = SS.state;
    if (!s || !s.tutorial || s.tutorial.done || !TIPS[ph]) { tutClear(); return; }
    if (ph === 'prep' && s.day > 1) { tutFinish(); return; }           // they have been round once: lesson over
    if (coach.phase === ph && coach.steps) return;
    tutClear();
    coach.phase = ph; coach.steps = TIPS[ph]; coach.i = 0; coach.tries = 0;
    coach.timer = setTimeout(tutStep, ph === 'day' ? 1300 : 700);
  }
  function tutAnchor(name) {
    if (name === 'stand') return SS.view && SS.view.w > 1 && phase === 'day' ? 'stand' : null;
    var el = document.querySelector('[data-tut="' + name + '"]');
    return el && el.getClientRects().length ? el : null;
  }
  function tutNext() { coach.i++; coach.tries = 0; tutStep(); }
  function tutStep() {
    clearTimeout(coach.timer);
    tutDrop();
    var steps = coach.steps, step = steps && steps[coach.i];
    if (!steps) return;
    if (!step) {                                             // this phase is done; the last phase ends the lesson
      if (coach.phase === 'results') tutFinish(); else coach.steps = [];
      return;
    }
    var node = tutAnchor(step.at);
    if (!node) {                                             // anchors can show up late: look again, then move on
      if (++coach.tries > 18) { coach.tries = 0; coach.i++; }
      coach.timer = setTimeout(tutStep, 150);
      return;
    }
    coach.tries = 0;
    if (node !== 'stand') {                                  // bring it into view inside its own scroller only
      var sc = node.closest('.sheet-body, .modal-body');
      if (sc) {
        var a = node.getBoundingClientRect(), box = sc.getBoundingClientRect();
        if (a.top < box.top || a.bottom > box.bottom) sc.scrollTop += a.top - box.top - 10;
      }
    }
    var last = coach.i === steps.length - 1;
    coach.node = node;
    coach.ring = h('div', { class: 'coach-ring', 'aria-hidden': 'true' });
    coach.el = h('div', { class: 'coach-bubble', role: 'status' },
      h('p', { class: 'coach-text' }, step.text),
      h('div', { class: 'coach-foot' }, btn('coach-skip', 'Skip tips', tutFinish), btn('btn btn--primary', last ? 'Got it' : 'Next', tutNext)),
      h('i', { class: 'coach-arrow' }));
    R.coach.append(coach.ring, coach.el);
    coach.bw = coach.el.offsetWidth; coach.bh = coach.el.offsetHeight;
    coach.side = '';
    trackCoach();
  }
  /** Keep the bubble glued to its anchor (sheets scroll, the camera eases). Writes only on change. */
  function trackCoach() {
    var hide = layers.length > 0 || (pause.el && !pause.el.hidden);
    if (R.coach.hidden !== hide) R.coach.hidden = hide;
    if (hide || !coach.el) return;
    var node = coach.node, W = R.coach.clientWidth, H = R.coach.clientHeight, l, t, w, ht;
    if (node === 'stand') {
      var v = SS.view, G = SS.W;
      if (!v || phase !== 'day') { tutNext(); return; }
      w = G.STAND_W * v.scale * 1.15; ht = 150 * v.scale;
      l = v.toX(G.STAND_X) - w / 2; t = v.laneY(G.STAND_LANE) - ht;
    } else {
      if (!node.isConnected || !node.getClientRects().length) { tutStep(); return; }
      var r = node.getBoundingClientRect(), o = R.coach.getBoundingClientRect();
      l = r.left - o.left; t = r.top - o.top; w = r.width; ht = r.height;
    }
    if (!coach.bw) { coach.bw = coach.el.offsetWidth; coach.bh = coach.el.offsetHeight; }
    var bw = coach.bw, bh = coach.bh, gap = 18, m = 8, top0 = R.hud.hidden ? m : W <= 520 ? 76 : 66;
    var side, x, y, cy = t + Math.min(ht / 2, 70);
    if (w < W * 0.6 && l > W * 0.4 && l - gap - m >= bw) side = 'left';
    else if (t - top0 - gap >= bh) side = 'top';
    else if (H - (t + ht) - gap - m >= bh) side = 'bottom';
    else if (l - gap - m >= bw) side = 'left';
    else if (W - (l + w) - gap - m >= bw) side = 'right';
    else side = 'over';
    if (side === 'left' || side === 'right') {
      x = side === 'left' ? l - gap - bw : l + w + gap;
      y = clamp(cy - bh / 2, top0, Math.max(top0, H - bh - m));
    } else {
      x = clamp(l + w / 2 - bw / 2, m, Math.max(m, W - bw - m));
      y = side === 'top' ? t - gap - bh : side === 'bottom' ? t + ht + gap : top0 + 4;
    }
    x = Math.round(x); y = Math.round(y); l = Math.round(l); t = Math.round(t); w = Math.round(w); ht = Math.round(ht);
    var ax = Math.round(clamp(l + w / 2 - x, 22, bw - 22)), ay = Math.round(clamp(cy - y, 22, bh - 22));
    if (side !== coach.side || x !== coach.x || y !== coach.y || ax !== coach.ax || ay !== coach.ay) {
      coach.side = side; coach.x = x; coach.y = y; coach.ax = ax; coach.ay = ay;
      coach.el.setAttribute('data-side', side);
      coach.el.style.cssText = 'left:' + x + 'px;top:' + y + 'px;--ax:' + ax + 'px;--ay:' + ay + 'px';
    }
    if (l !== coach.l || t !== coach.t || w !== coach.w || ht !== coach.h) {
      coach.l = l; coach.t = t; coach.w = w; coach.h = ht;
      coach.ring.style.cssText = 'left:' + (l - 6) + 'px;top:' + (t - 6) + 'px;width:' + (w + 12) + 'px;height:' + (ht + 12) + 'px';
    }
  }
  function tutOn(at) { return !!coach.el && !!coach.steps && !!coach.steps[coach.i] && coach.steps[coach.i].at === at; }

  /* ------------------------------------------------------------------ *
   * Title screen
   * ------------------------------------------------------------------ */
  function buildTitle() {
    var words = ['Squeeze', 'Street'];
    function layer(kind) {
      var i = 0;
      return h('span', { class: 'title-layer title-layer--' + kind }, words.map(function (w, wi) {
        return h('span', { class: 'title-word title-word--' + wi }, w.split('').map(function (ch) {
          return h('span', { class: 'title-ch', style: '--i:' + (i++) }, ch);
        }));
      }));
    }
    ttl.actions = h('div', { class: 'title-actions' });
    ttl.snd = btn('btn btn--icon', null, toggleSound);
    R.title.replaceChildren(
      h('div', { class: 'title-corner' }, ttl.snd, btn('btn btn--icon', ico('gear'), openSettings, { 'aria-label': 'Settings', title: 'Settings' })),
      h('h1', { class: 'title-logo display', 'aria-label': 'Squeeze Street' },
        h('span', { class: 'title-stack', 'aria-hidden': 'true' }, layer('shadow'), layer('ink'), layer('fill'))),
      h('p', { class: 'title-tag' }, 'Run the sunniest lemonade stand in town.'),
      ttl.actions);
  }
  function refreshTitle() {
    if (!ttl.actions) return;
    var has = sim('hasSave') === true, sum = has ? sim('saveSummary') : null, kids = [];
    if (has) {
      kids.push(btn('btn btn--go btn--lg title-continue', [
        h('span', null, 'Continue'),
        sum ? h('small', { class: 'title-save num' }, 'Day ' + sum.day + ' · ' + SS.fmtMoney(sum.cash) + ' · ' + stars1(sum.reputation) + ' stars') : null
      ], function (e, b) {
        if (sim('continueGame') === false) { refuse(b, 'That save could not be opened. Start a new game instead.', 'warning'); refreshTitle(); }
      }));
    }
    kids.push(btn('btn btn--lg ' + (has ? 'btn--primary' : 'btn--go'), 'New game', onNewGame));
    kids.push(btn('btn title-how', [ico('info'), 'How to play'], openHowTo));
    ttl.actions.replaceChildren.apply(ttl.actions, kids);
    refreshSound();
  }
  function onNewGame() {
    if (sim('hasSave') !== true) { sim('newGame'); return; }
    var sum = sim('saveSummary');
    confirmBox({
      title: 'Start a new game?', icon: 'restart', danger: true,
      text: 'Your saved stand' + (sum ? ' (day ' + sum.day + ', ' + SS.fmtMoney(sum.cash) + ')' : '') + ' will be replaced. This cannot be undone.',
      yes: 'Start over', no: 'Keep my stand'
    }).then(function (ok) { if (ok) sim('newGame'); });
  }
  function showTitle(on) {
    var el = R.title;
    clearTimeout(ttl.timer);
    if (on) { el.classList.remove('is-leaving'); if (el.hidden) { el.hidden = false; } refreshTitle(); return; }
    if (el.hidden) return;
    if (SS.reduced()) { el.hidden = true; return; }
    el.classList.add('is-leaving');                          // a quick fade so the scene is not uncovered with a snap
    ttl.timer = setTimeout(function () { el.hidden = true; el.classList.remove('is-leaving'); }, 240);
  }

  /* ------------------------------------------------------------------ *
   * Phase handling and boot
   * ------------------------------------------------------------------ */
  function onPhase(p) {
    var s = SS.state, to = (p && p.to) || (s && s.phase) || 'title';
    phase = to;
    closeAll();                                              // no modal outlives a phase change
    pausedByModal = false;
    toggleMenu(false);
    showTitle(to === 'title');
    R.hud.hidden = to === 'title';
    R.daybar.hidden = to !== 'day';
    if (pause.el) pause.el.hidden = true;
    if (to === 'title') clearBanners();
    if (to === 'day') resetDay();
    refreshHud();
    layoutToasts();
    tutStart(to);
  }

  function frame() {
    requestAnimationFrame(frame);
    try {
      if (phase === 'day') refreshDay();
      if (coach.el) trackCoach();
    } catch (e) { warn('frame', e); }
  }

  function init() {
    if (inited) return;
    inited = true;
    ['game', 'ui', 'hud', 'daybar', 'title'].forEach(function (id) { R[id] = $(id); });
    R.modal = $('modal-root'); R.toast = $('toast-root'); R.banner = $('banner-root'); R.coach = $('coach-root');
    if (!R.ui || !R.hud || !R.daybar || !R.title || !R.modal || !R.coach) { warn('init', 'the page is missing its UI containers'); return; }
    R.game = R.game || document.body;
    buildHud(); buildDaybar(); buildPause(); buildTitle();

    SS.on('phase', onPhase);
    SS.on('cash', onCash);
    SS.on('reputation', onRep);
    SS.on('weather:change', onWeather);
    SS.on('day:start', refreshHud);
    SS.on('location:set', refreshHud);
    SS.on('settings', onSettings);
    SS.on('price', function () { if (SS.state && bar.price) bar.price.set(SS.state.price); });
    SS.on('pause', onPause);
    SS.on('toast', function (p) { if (p) toast(p.text, p.kind, p.icon); });
    SS.on('event:trigger', onEvent);
    SS.on('soldout', onSoldOut);
    SS.on('location:unlock', onUnlock);
    SS.on('upgrade:buy', onUpgrade);
    SS.on('milestone', onMilestone);
    SS.on('win', function () { setTimeout(openWin, 1100); });
    SS.on('brew:start', function (p) {
      var sp = (SS.state && SS.state.settings && SS.state.settings.speed) || 1;
      dv.brewLong = !p || !(p.duration > 0) || p.duration / sp >= 1.2;     // a blink-and-miss-it batch needs no hint
    });
    SS.on('bell', function () { if (tutOn('bell')) tutNext(); });
    SS.on('brew:tap', function () { if (tutOn('stand')) tutNext(); });

    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', function (e) {
      if (hud.menu && !hud.menu.hidden && !hud.menu.contains(e.target) && !hud.menuBtn.contains(e.target)) toggleMenu(false);
    }, true);
    window.addEventListener('resize', function () { toggleMenu(false); layoutToasts(); coach.bw = 0; });

    onPhase({ from: null, to: SS.state ? SS.state.phase : 'title' });
    requestAnimationFrame(frame);
  }

  SS.UI = {
    init: init,
    openModal: function (o) { return openLayer({ id: o && o.id, title: o && o.title, icon: o && o.icon, body: o && o.body, wide: !!(o && o.wide), onClose: o && o.onClose }); },
    closeModal: closeModal,
    toast: toast,
    confirm: confirmBox,
    openSettings: openSettings,
    openHowTo: openHowTo
  };
})();
