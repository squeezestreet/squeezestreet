/* Squeeze Street — admin.js: hidden admin powers for testing.
 * Tap any tree in the scene (street, park and beach have them), enter the password, and an admin panel opens:
 * infinite money (cash is kept topped up at $1,000,000) and buttons that unlock everything.
 * Only two hashes of the password are kept here, never the password itself. Unlocked for the browser tab
 * (sessionStorage), so a reload keeps it; "Lock admin" turns it off.
 * shortcut: a client-side check, fine for a testing tool; anyone who edits the page source can bypass it.
 * tools/package-crazygames.js leaves this file out of the CrazyGames upload; the single-file build keeps it for testing.
 */
(function () {
  'use strict';
  var SS = window.SS, D = SS.DATA, h = SS.h;
  var KEY = 'squeeze-street-admin', CASH = 1000000, FLOOR = 500000;
  var on = false, inf = true, closeFn = null;

  function fnv(s) { var x = 0x811c9dc5; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x >>> 0; }
  function djb(s) { var x = 5381; for (var i = 0; i < s.length; i++) x = (Math.imul(x, 33) + s.charCodeAt(i)) >>> 0; return x; }
  function right(pw) { return fnv(pw) === 0x628d0b01 && djb(pw) === 0xc0d78b95; }

  function remember() { try { sessionStorage.setItem(KEY, on ? (inf ? '1' : '2') : ''); } catch (e) { /* private mode: lasts until reload */ } }
  function recall() { try { var v = sessionStorage.getItem(KEY); on = v === '1' || v === '2'; inf = v !== '2'; } catch (e) { on = false; } }

  function game() { var st = SS.state; return st && st.stats ? st : null; }
  function icon(n) { return h('span', { class: 'adm-ico', 'aria-hidden': 'true', html: SS.icon ? SS.icon(n) : '' }); }
  function toast(t, kind) { if (SS.UI && SS.UI.toast) SS.UI.toast(t, kind || 'good', 'star'); }
  function save() { try { if (SS.Sim && SS.Sim.save) SS.Sim.save(); } catch (e) { /* saved at the next morning anyway */ } }

  function topUp() {
    var st = game();
    if (!on || !inf || !st || st.cash >= FLOOR) return;
    st.cash = CASH;
    SS.emit('cash', { amount: st.cash, delta: 0, reason: 'admin' });
  }

  /* ---- the powers. Each changes state the same way the sim's own purchases do, then tells everyone. ---- */
  var POWERS = [
    { id: 'all', label: 'Unlock everything', icon: 'sparkle', run: function (st) {
      var truck = '';
      ['locations', 'upgrades', 'flavors', 'looks', 'stars', 'pantry', 'truck'].forEach(function (id) { var m = byId(id).run(st); if (id === 'truck' && /^Could not/.test(m)) truck = ' ' + m; });
      return 'Everything unlocked.' + truck;
    } },
    { id: 'locations', label: 'All locations', icon: 'map', run: function (st) {
      D.locations.forEach(function (l) { if (st.unlockedLocations.indexOf(l.id) < 0) { st.unlockedLocations.push(l.id); SS.emit('location:unlock', { id: l.id }); } });
      return 'Every location is open.';
    } },
    { id: 'upgrades', label: 'Max every upgrade', icon: 'shop', run: function (st) {
      D.upgrades.forEach(function (u) { var top = u.levels.length; if ((st.upgrades[u.id] | 0) < top) { st.upgrades[u.id] = top; SS.emit('upgrade:buy', { id: u.id, level: top }); } });
      return 'Every upgrade is maxed.';
    } },
    { id: 'flavors', label: 'Every flavor', icon: 'drink', run: function (st) {
      D.flavors.forEach(function (f) { if (st.flavors.indexOf(f.id) < 0) { st.flavors.push(f.id); SS.emit('flavor:buy', { id: f.id }); } });
      return 'Every flavor, limited ones too.';
    } },
    { id: 'looks', label: 'Own every look', icon: 'paint', run: function (st) {
      if (!st.custom || !D.custom) return 'Customisation is not in this build yet.';
      ['stand', 'truck'].forEach(function (t) {
        Object.keys(D.custom[t] || {}).forEach(function (slot) {
          (D.custom[t][slot] || []).forEach(function (o) { var k = t + '.' + slot + '.' + o.id; if (o.cost > 0 && st.custom.owned.indexOf(k) < 0) st.custom.owned.push(k); });
        });
      });
      SS.emit('custom:buy', { target: 'stand', slot: 'all', id: 'admin' });
      return 'Every paint, sign and decoration is yours.';
    } },
    { id: 'truck', label: 'Get the food truck', icon: 'truck', run: function (st) {
      if (st.truck) return 'You already have the truck.';
      if (!SS.Sim || !SS.Sim.buyTruck) return 'The food truck is not in this build yet.';
      if (D.truck && D.truck.unlockLocation && st.unlockedLocations.indexOf(D.truck.unlockLocation) < 0) {
        st.unlockedLocations.push(D.truck.unlockLocation); SS.emit('location:unlock', { id: D.truck.unlockLocation });
      }
      var before = st.cash, r = SS.Sim.buyTruck();
      if (r && r.ok === false) return 'Could not get the truck: ' + (r.reason || 'try again in the morning') + '.';
      st.cash = Math.max(st.cash, before);                  // a gift, not a purchase
      SS.emit('cash', { amount: st.cash, delta: 0, reason: 'admin' });
      return 'The food truck is yours.';
    } },
    { id: 'stars', label: '5 stars', icon: 'star', run: function (st) {
      var before = st.reputation; st.reputation = 5;
      SS.emit('reputation', { value: 5, delta: 5 - before });
      return 'Five-star stand.';
    } },
    { id: 'pantry', label: 'Fill the pantry', icon: 'lemon', run: function (st) {
      D.itemOrder.forEach(function (k) { st.stock[k] = (st.stock[k] || 0) + 500; });
      if (st.today && st.today.soldOut) st.today.soldOut = null;
      SS.emit('cart', {});
      return '+500 lemons, sugar, ice and cups.';
    } },
    { id: 'boosts', label: 'Every Dex boost today', icon: 'dealer', run: function (st) {
      if (st.phase === 'results') return 'Boosts work for a day: use this in the morning or during the day.';
      D.boosts.forEach(function (b) { if (st.boosts.indexOf(b.id) < 0) { st.boosts.push(b.id); SS.emit('boost:on', { id: b.id }); } });
      return 'Every boost is on for today.';
    } }
  ];
  function byId(id) { for (var i = 0; i < POWERS.length; i++) if (POWERS[i].id === id) return POWERS[i]; return null; }

  function use(p) {
    var st = game();
    if (!st) { toast('Start or continue a game first.', 'info'); return; }
    var msg;
    try { msg = p.run(st); } catch (e) { console.error('[SS] admin power failed', e); msg = 'That did not work: ' + e.message; }
    save();
    if (SS.Audio && SS.Audio.play) SS.Audio.play('powerup');
    toast(msg);
  }

  /* ---- screens ---- */
  function close() { if (closeFn) { var f = closeFn; closeFn = null; try { f(); } catch (e) { /* already closed */ } } }
  function open(title, body) {
    close();
    if (!SS.UI || !SS.UI.openModal) return;
    closeFn = SS.UI.openModal({ id: 'admin', title: title, icon: 'lock', body: body, onClose: function () { closeFn = null; } });
  }

  function openLogin() {
    var input = h('input', { class: 'adm-pw', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Admin password', placeholder: 'Password' });
    var msg = h('p', { class: 'adm-msg', role: 'status' });
    var form = h('form', { class: 'adm-login', onsubmit: function (e) {
      e.preventDefault();
      if (right(String(input.value || '').trim())) { on = true; inf = true; remember(); topUp(); openPanel(); toast('Admin powers on.'); return; }
      msg.textContent = 'Wrong password.'; input.value = '';
      input.classList.remove('adm-shake'); void input.offsetWidth; input.classList.add('adm-shake');
      input.focus();
    } }, input, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Unlock'));
    open('Admin', h('div', { class: 'adm' }, h('p', { class: 'adm-note' }, 'Testing tools. Enter the admin password.'), form, msg));
    setTimeout(function () { input.focus(); }, 60);
  }

  function openPanel() {
    var infBtn = h('button', { class: 'btn ' + (inf ? 'btn--go' : 'btn--ghost') + ' adm-inf', type: 'button', 'aria-pressed': inf ? 'true' : 'false', onclick: function () {
      inf = !inf; remember(); topUp();
      infBtn.className = 'btn ' + (inf ? 'btn--go' : 'btn--ghost') + ' adm-inf'; infBtn.setAttribute('aria-pressed', inf ? 'true' : 'false');
      infBtn.lastChild.textContent = inf ? 'Infinite money: on' : 'Infinite money: off';
    } }, icon('cash'), h('span', null, inf ? 'Infinite money: on' : 'Infinite money: off'));
    var grid = h('div', { class: 'adm-grid' }, POWERS.map(function (p) {
      return h('button', { class: 'btn adm-pow' + (p.id === 'all' ? ' btn--primary adm-pow--all' : ''), type: 'button', onclick: function () { use(p); } }, icon(p.icon), h('span', null, p.label));
    }));
    var lock = h('button', { class: 'btn btn--ghost btn--sm adm-lock', type: 'button', onclick: function () { on = false; remember(); close(); toast('Admin powers off.', 'info'); } }, icon('lock'), 'Lock admin');
    open('Admin powers', h('div', { class: 'adm' }, h('p', { class: 'adm-note' }, 'Testing only. Changes save with your game.'), infBtn, grid, lock));
  }

  function onPress(e) {
    if (!game() || document.querySelector('#modal-root > *')) return;
    var r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    try { if (SS.Actors && SS.Actors.hit && SS.Actors.hit(x, y)) return; } catch (err) { /* fall through to the tree check */ }
    if (!SS.Backdrops || !SS.Backdrops.treeAt || !SS.Backdrops.treeAt(x, y)) return;
    if (on) openPanel(); else openLogin();
  }

  var CSS = '.adm{display:grid;gap:12px}.adm-note{margin:0;font-weight:700;color:var(--ink-soft,#4a4f73)}' +
    '.adm-login{display:flex;gap:8px}.adm-pw{flex:1 1 auto;min-width:0;height:48px;padding:0 14px;font:800 18px Figtree,system-ui,sans-serif;background:var(--paper,#fff);border:3px solid var(--ink,#1b1f3b);border-radius:12px;-webkit-user-select:text;user-select:text}' +
    '.adm-pw:focus{outline:3px solid var(--grape,#7a5cff);outline-offset:2px}.adm-msg{margin:0;min-height:1.2em;font-weight:800;color:var(--bad,#d83a30)}' +
    '.adm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,190px),1fr));gap:8px}.adm-pow{justify-content:flex-start;gap:8px;text-align:left;min-height:52px;white-space:normal;line-height:1.15}.adm-pow>span:last-child{min-width:0;overflow-wrap:anywhere}' +
    '.adm-pow--all{grid-column:1/-1;justify-content:center}.adm-inf{width:100%;justify-content:center;gap:8px}.adm-lock{justify-self:start;gap:6px}' +
    '.adm-ico{display:inline-flex;width:26px;height:26px;flex:none}.adm-ico svg{width:100%;height:100%}' +
    '@keyframes adm-shake{20%{transform:translateX(-8px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}' +
    '.adm-shake{animation:adm-shake .35s}#game.reduced .adm-shake{animation:none}';

  function init() {
    recall();
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var scene = document.getElementById('scene');
    if (scene) scene.addEventListener('pointerdown', onPress);
    SS.on('cash', topUp);
    SS.on('phase', function () { setTimeout(topUp, 0); });
    topUp();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  SS.Admin = { _right: right, unlocked: function () { return on; } };
})();
