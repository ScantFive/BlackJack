/*
 * Фоны, нарисованные кодом на canvas (без картинок).
 * BG.set(id) — выбрать фон, BG.drawThumb(canvas, id) — миниатюра для магазина.
 */
(function (global) {
  "use strict";

  var TAU = Math.PI * 2;

  // ---------- Классика: зелёное сукно ----------
  function classic(ctx, w, h) {
    var g = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.3, Math.max(w, h) * 0.85);
    g.addColorStop(0, "#1f7a4d");
    g.addColorStop(1, "#0d4026");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // ---------- Волны ----------
  function waves(ctx, w, h, t) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#06193a");
    g.addColorStop(0.45, "#0b4a82");
    g.addColorStop(1, "#14a8c9");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Лунный блик на горизонте
    var rg = ctx.createRadialGradient(w * 0.75, h * 0.1, 0, w * 0.75, h * 0.1, h * 0.38);
    rg.addColorStop(0, "rgba(255,255,255,0.35)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    var layers = 7;
    var step = Math.max(5, w / 90);

    for (var i = 0; i < layers; i++) {
      var k = i / (layers - 1);
      var base = h * (0.26 + k * 0.66);
      var amp = h * (0.012 + k * 0.03);
      var len = w * (0.85 - k * 0.35);
      var speed = 0.45 + k * 0.85;
      var phase = i * 1.7;
      var pts = [];

      for (var x = 0; x <= w + step; x += step) {
        var y =
          base +
          Math.sin((x / len) * TAU + t * speed + phase) * amp +
          Math.sin((x / (len * 0.47)) * TAU - t * speed * 1.3 + phase * 2) * amp * 0.45;
        pts.push(x, y);
      }

      ctx.beginPath();
      ctx.moveTo(0, h);
      for (var p = 0; p < pts.length; p += 2) ctx.lineTo(pts[p], pts[p + 1]);
      ctx.lineTo(w + step, h);
      ctx.closePath();
      ctx.fillStyle =
        "rgba(" + Math.round(18 + k * 14) + "," + Math.round(86 + k * 70) + "," +
        Math.round(158 + k * 48) + "," + (0.38 + k * 0.5).toFixed(2) + ")";
      ctx.fill();

      // Пена по гребню
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (var q = 2; q < pts.length; q += 2) ctx.lineTo(pts[q], pts[q + 1]);
      ctx.lineWidth = 1.2 + k * 1.8;
      ctx.strokeStyle = "rgba(255,255,255," + (0.1 + k * 0.28).toFixed(2) + ")";
      ctx.stroke();
    }
  }

  // ---------- Небо ----------
  var CLOUDS = [
    { y: 0.1,  s: 0.9, v: 14, x: 0.1 },
    { y: 0.22, s: 1.5, v: 9,  x: 0.55 },
    { y: 0.34, s: 0.8, v: 20, x: 0.8 },
    { y: 0.48, s: 1.3, v: 7,  x: 0.3 },
    { y: 0.62, s: 1.0, v: 12, x: 0.7 },
    { y: 0.76, s: 1.7, v: 5,  x: 0.0 },
  ];
  var PUFFS = [[0, 0, 38], [-42, 10, 28], [40, 12, 30], [-18, -18, 30], [22, -20, 26], [0, 16, 34]];

  function cloud(ctx, x, y, s) {
    var i, p;
    ctx.fillStyle = "rgba(170,200,235,0.55)"; // тень снизу
    for (i = 0; i < PUFFS.length; i++) {
      p = PUFFS[i];
      ctx.beginPath();
      ctx.arc(x + p[0] * s, y + (p[1] + 7) * s, p[2] * s, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    for (i = 0; i < PUFFS.length; i++) {
      p = PUFFS[i];
      ctx.beginPath();
      ctx.arc(x + p[0] * s, y + p[1] * s, p[2] * s, 0, TAU);
      ctx.fill();
    }
  }

  function sky(ctx, w, h, t) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1767c9");
    g.addColorStop(0.55, "#5fb0f2");
    g.addColorStop(1, "#d9f0ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Солнце
    var sx = w * 0.8, sy = h * 0.14, sr = Math.min(w, h) * 0.07;
    var glow = ctx.createRadialGradient(sx, sy, sr * 0.3, sx, sy, sr * 5);
    glow.addColorStop(0, "rgba(255,248,200,0.9)");
    glow.addColorStop(0.25, "rgba(255,240,170,0.35)");
    glow.addColorStop(1, "rgba(255,240,170,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fffbe0";
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, TAU);
    ctx.fill();

    // Облака плывут и «замыкаются» по краям
    var unit = Math.min(w, 600) / 420;
    for (var i = 0; i < CLOUDS.length; i++) {
      var c = CLOUDS[i];
      var s = c.s * unit;
      var span = w + 320 * s;
      var x = ((c.x * w + t * c.v * unit) % span) - 160 * s;
      cloud(ctx, x, c.y * h, s);
    }
  }

  // ---------- Германия: развевающийся флаг ----------
  function germany(ctx, w, h, t) {
    var amp = h * 0.03;
    var step = Math.max(4, Math.round(w / 90));
    var colors = ["#0b0b0b", "#dd0000", "#ffce00"];
    var band = (h + amp * 5) / 3;

    for (var x = 0; x < w + step; x += step) {
      var ph = x * 0.011 + t * 1.7;
      var off = Math.sin(ph) * amp + Math.sin(x * 0.004 - t * 0.8) * amp * 0.7;
      var top = off - amp * 2.5;

      for (var i = 0; i < 3; i++) {
        ctx.fillStyle = colors[i];
        ctx.fillRect(x, top + i * band, step + 1, band + 1);
      }

      // Складки ткани: светлые и тёмные полосы
      var sh = Math.cos(ph) * 0.2;
      ctx.fillStyle = sh > 0 ? "rgba(255,255,255," + (sh * 0.55).toFixed(3) + ")" : "rgba(0,0,0," + (-sh).toFixed(3) + ")";
      ctx.fillRect(x, 0, step + 1, h);
    }
  }

  var painters = { classic: classic, waves: waves, sky: sky, germany: germany };
  var animated = { waves: true, sky: true, germany: true };
  var dimming = { classic: 0, waves: 0.12, sky: 0.08, germany: 0.3 }; // затемнение для читаемости текста

  function paint(ctx, id, w, h, t) {
    (painters[id] || classic)(ctx, w, h, t);
    var d = dimming[id] || 0;
    if (d > 0) {
      ctx.fillStyle = "rgba(0,0,0," + d + ")";
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ---------- Фон страницы ----------
  var canvas = null, ctx = null;
  var current = "classic";
  var raf = 0, last = 0, t = 2;
  var reduceMotion = false;
  try {
    reduceMotion = global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) { /* ignore */ }

  function resize() {
    if (!canvas) return;
    var scale = 0.75; // фон плавный, ему не нужна полная плотность пикселей
    var w = Math.max(2, Math.round(global.innerWidth * scale));
    var h = Math.max(2, Math.round(global.innerHeight * scale));
    if (w * h > 1200000) {
      var k = Math.sqrt(1200000 / (w * h));
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    canvas.width = w;
    canvas.height = h;
    draw();
  }

  function draw() {
    if (!ctx) return;
    paint(ctx, current, canvas.width, canvas.height, t);
  }

  function frame(ts) {
    raf = global.requestAnimationFrame(frame);
    if (document.hidden || ts - last < 33) return; // ~30 кадров/с экономит батарею
    t += Math.min((ts - last) / 1000, 0.1);
    last = ts;
    draw();
  }

  function stop() {
    if (raf) global.cancelAnimationFrame(raf);
    raf = 0;
  }

  function start() {
    stop();
    if (animated[current] && !reduceMotion) raf = global.requestAnimationFrame(frame);
  }

  var BG = {
    set: function (id) {
      if (!painters[id]) id = "classic";
      if (id === current && canvas && canvas.__ready) return;
      current = id;
      if (canvas) canvas.__ready = true;
      draw();
      start();
    },
    current: function () { return current; },
    drawThumb: function (thumb, id) {
      var c = thumb.getContext("2d");
      paint(c, id, thumb.width, thumb.height, 2.3);
    },
  };

  function init() {
    canvas = document.getElementById("bg");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    canvas.__ready = false;
    resize();
    global.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) draw(); });
    BG.set(current);
  }

  global.BG = BG;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
