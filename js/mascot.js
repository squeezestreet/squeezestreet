/* Squeeze Street — mascot.js: Squeezy, the lemon mascot, as a canvas sprite for the scene (stand signs, the truck,
 * cups, decorations) and as inline SVG for the DOM. The art is brand/mark.svg, embedded so the game stays one folder.
 *   SS.Mascot.name                 "Squeezy"
 *   SS.Mascot.svg                  the mark as an SVG string (512x512 viewBox), for innerHTML
 *   SS.Mascot.sprite(px) -> canvas|null   the mark rasterised at px x px (cached per size); null until the image has loaded
 *   SS.Mascot.draw(ctx, x, y, size, opts) draws the mark centred at (x, y), size px wide; opts {rot, alpha}; no-op until loaded
 */
(function () {
  "use strict";
  var SS = window.SS;
  var SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" width=\"512\" height=\"512\"><g transform=\"translate(256 303) scale(1.02)\"><g id=\"shadow\" transform=\"translate(0 13.7)\" fill=\"#1b1f3b\" stroke=\"#1b1f3b\" stroke-width=\"23.5\" stroke-linejoin=\"round\"><g transform=\"rotate(-20)\"><path d=\"M-234 0C-234 -24 -196 -30 -178 -34.5C-184 -93 -99.7 -150 0 -150C99.7 -150 184 -93 178 -34.5C196 -30 234 -24 234 0C234 24 196 30 178 34.5C184 93 99.7 150 0 150C-99.7 150 -184 93 -178 34.5C-196 30 -234 24 -234 0Z\"/></g><path d=\"M176 -70C256 -136 216 -268 34 -264C104 -238 108 -150 150 -90Z\"/></g><g id=\"leaf\"><path d=\"M176 -70C256 -136 216 -268 34 -264C104 -238 108 -150 150 -90Z\" fill=\"#35c977\"/><path d=\"M162 -104C178 -180 142 -232 78 -252\" fill=\"none\" stroke=\"#1c9655\" stroke-width=\"16.45\" stroke-linecap=\"round\"/><path d=\"M176 -70C256 -136 216 -268 34 -264C104 -238 108 -150 150 -90Z\" fill=\"none\" stroke=\"#1b1f3b\" stroke-width=\"23.5\" stroke-linejoin=\"round\"/></g><g transform=\"rotate(-20)\"><g id=\"body\"><path d=\"M-234 0C-234 -24 -196 -30 -178 -34.5C-184 -93 -99.7 -150 0 -150C99.7 -150 184 -93 178 -34.5C196 -30 234 -24 234 0C234 24 196 30 178 34.5C184 93 99.7 150 0 150C-99.7 150 -184 93 -178 34.5C-196 30 -234 24 -234 0Z\" fill=\"#ffd83d\"/><path d=\"M-178 34.5C-184 93 -99.7 150 0 150C99.7 150 184 93 178 34.5C158 93 89 120 0 120C-89 120 -148 99 -178 34.5Z\" fill=\"#f2ae00\"/><path d=\"M-140 -70C-116 -106 -72 -124 -30 -127\" fill=\"none\" stroke=\"#fff4b8\" stroke-width=\"25.85\" stroke-linecap=\"round\"/><circle cx=\"-150\" cy=\"34\" r=\"7.5\" fill=\"#f2ae00\"/><circle cx=\"-132\" cy=\"62\" r=\"7.5\" fill=\"#f2ae00\"/><circle cx=\"150\" cy=\"50\" r=\"7.5\" fill=\"#f2ae00\"/><circle cx=\"126\" cy=\"84\" r=\"7.5\" fill=\"#f2ae00\"/><circle cx=\"160\" cy=\"18\" r=\"7.5\" fill=\"#f2ae00\"/><path d=\"M-234 0C-234 -24 -196 -30 -178 -34.5C-184 -93 -99.7 -150 0 -150C99.7 -150 184 -93 178 -34.5C196 -30 234 -24 234 0C234 24 196 30 178 34.5C184 93 99.7 150 0 150C-99.7 150 -184 93 -178 34.5C-196 30 -234 24 -234 0Z\" fill=\"none\" stroke=\"#1b1f3b\" stroke-width=\"23.5\" stroke-linejoin=\"round\"/></g></g><g id=\"face\" transform=\"rotate(-4) translate(0 -6)\" stroke=\"#1b1f3b\" stroke-width=\"14.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M-110 4V-28Q-78 -46 -42 -30V4Z\" fill=\"#ffffff\"/><path d=\"M44 4V-36C44 -58 60 -68 78 -68C96 -68 112 -58 112 -36V4Z\" fill=\"#ffffff\"/><circle cx=\"-66\" cy=\"-16\" r=\"13\" fill=\"#1b1f3b\" stroke=\"none\"/><circle cx=\"84\" cy=\"-22\" r=\"14\" fill=\"#1b1f3b\" stroke=\"none\"/><path d=\"M-110 -28Q-78 -46 -42 -30\" fill=\"none\" stroke-width=\"23.5\"/><path d=\"M-110 -78Q-78 -88 -44 -76\" fill=\"none\" stroke-width=\"23.5\"/><path d=\"M40 -94Q74 -118 110 -96\" fill=\"none\" stroke-width=\"23.5\"/><path d=\"M-128 2L-158 -6M128 2L160 -8\" fill=\"none\" stroke-width=\"18.8\"/><path d=\"M-26 4Q0 -6 26 4\" fill=\"none\" stroke-width=\"18.8\"/><path d=\"M-128 0H-22C-20 34 -38 50 -75 50C-112 50 -130 34 -128 0Z\" fill=\"#1b1f3b\"/><path d=\"M22 0H128C130 34 112 50 75 50C38 50 20 34 22 0Z\" fill=\"#1b1f3b\"/><path d=\"M-106 16l14 -9M-100 33l30 -20M44 16l14 -9M50 33l30 -20\" stroke=\"#ffffff\" stroke-width=\"9.9\"/><path d=\"M-64 74C-26 90 38 86 84 58C82 104 44 128 6 126C-32 124 -60 104 -64 74Z\" fill=\"#1b1f3b\"/><path d=\"M-56 80C-22 94 38 90 78 66C78 72 76 78 73 84C38 102 -24 104 -52 92C-54 88 -56 84 -56 80Z\" fill=\"#ffffff\" stroke=\"none\"/><path d=\"M-26 116C-12 100 28 96 46 108C30 124 -2 128 -26 116Z\" fill=\"#ff6257\" stroke=\"none\"/><path d=\"M-64 74C-26 90 38 86 84 58C82 104 44 128 6 126C-32 124 -60 104 -64 74Z\" fill=\"none\"/></g></g></svg>";
  var img = null, ready = false, cache = {};
  function load() {
    if (img || typeof Image === "undefined") return;
    img = new Image();
    img.onload = function () { ready = true; };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(SVG);
  }
  function sprite(px) {
    load();
    if (!ready) return null;
    var k = Math.max(16, Math.min(1024, Math.ceil(px / 16) * 16));   // size buckets keep the cache small
    if (cache[k]) return cache[k];
    var c = document.createElement("canvas"); c.width = c.height = k;
    c.getContext("2d").drawImage(img, 0, 0, k, k);
    return (cache[k] = c);
  }
  function draw(ctx, x, y, size, opts) {
    var dpr = (SS.view && SS.view.dpr) || 1, sc = ctx.getTransform ? Math.hypot(ctx.getTransform().a, ctx.getTransform().b) : dpr;
    var s = sprite(size * Math.max(1, sc));
    if (!s) return;
    ctx.save(); ctx.translate(x, y);
    if (opts && opts.rot) ctx.rotate(opts.rot);
    if (opts && opts.alpha != null) ctx.globalAlpha *= opts.alpha;
    ctx.drawImage(s, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  SS.Mascot = { name: "Squeezy", svg: SVG, sprite: sprite, draw: draw };
  load();
})();
