/*
 * Кликер «Добыча руды» с 3D-камнем на canvas (собственный мини-движок, без библиотек).
 * Награду начисляет только db.js по таблице ORES; здесь — графика и защита от автокликеров.
 */
(function () {
  "use strict";

  if (!window.DB || window.DB.VERSION !== 3 || window.__BJ_BROKEN__) return;

  const mine = DB.connect("mine");
  const ORES = DB.ORES;
  const $ = (id) => document.getElementById(id);

  const COLORS = {
    coal:    [40, 40, 44],
    copper:  [214, 120, 60],
    iron:    [200, 190, 180],
    gold:    [255, 205, 50],
    emerald: [40, 220, 120],
    diamond: [120, 230, 255],
  };

  const el = {
    canvas: $("mine-canvas"),
    name: $("mine-ore-name"),
    value: $("mine-ore-value"),
    hpBar: $("mine-hp-bar"),
    hpText: $("mine-hp-text"),
    message: $("mine-message"),
    stats: $("mine-stats"),
    legend: $("mine-legend"),
  };
  const ctx = el.canvas.getContext("2d");

  // ---------- Геометрия: неровная икосфера ----------

  function icosphere() {
    const t = (1 + Math.sqrt(5)) / 2;
    let v = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map(norm);
    let f = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    // Одно подразделение: 80 граней
    const cache = {};
    function mid(a, b) {
      const key = a < b ? a + "_" + b : b + "_" + a;
      if (cache[key] !== undefined) return cache[key];
      v.push(norm([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]));
      return (cache[key] = v.length - 1);
    }
    const nf = [];
    f.forEach(([a, b, c]) => {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    });
    return { v, f: nf };
  }

  function norm(p) {
    const l = Math.hypot(p[0], p[1], p[2]) || 1;
    return [p[0] / l, p[1] / l, p[2] / l];
  }

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  const base = icosphere();
  let rock = null; // { verts, faces: [{idx, ore}], oreId, hp, maxHp }

  function pickOre() {
    const ids = Object.keys(ORES);
    let total = 0;
    ids.forEach((id) => (total += ORES[id].weight));
    let r = Math.random() * total;
    for (const id of ids) {
      r -= ORES[id].weight;
      if (r <= 0) return id;
    }
    return ids[0];
  }

  function newRock() {
    const oreId = pickOre();
    const verts = base.v.map((p) => {
      const k = 0.82 + Math.random() * 0.3;
      return [p[0] * k, p[1] * k * 0.9, p[2] * k];
    });
    // Вкрапления: случайные «пятна» граней вокруг нескольких центров
    const centers = [];
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) centers.push(base.v[Math.floor(Math.random() * base.v.length)]);
    const faces = base.f.map((idx) => {
      const c = norm([
        base.v[idx[0]][0] + base.v[idx[1]][0] + base.v[idx[2]][0],
        base.v[idx[0]][1] + base.v[idx[1]][1] + base.v[idx[2]][1],
        base.v[idx[0]][2] + base.v[idx[1]][2] + base.v[idx[2]][2],
      ]);
      const ore = centers.some((p) => c[0] * p[0] + c[1] * p[1] + c[2] * p[2] > 0.9);
      return { idx, ore, crack: Math.random() };
    });
    rock = { verts, faces, oreId, hp: ORES[oreId].hp, maxHp: ORES[oreId].hp };
    updateInfo();
  }

  // ---------- Отрисовка ----------

  let yaw = 0.6, pitch = -0.35, spinV = 0.35;
  let shake = 0, squash = 0;
  let particles = [];
  let floaters = [];
  let size = 300, dpr = 1;

  function resize() {
    const rect = el.canvas.getBoundingClientRect();
    if (!rect.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = rect.width;
    el.canvas.width = Math.round(rect.width * dpr);
    el.canvas.height = Math.round(rect.height * dpr);
  }

  const LIGHT = norm([-0.5, -0.7, -0.6]);

  function drawScene() {
    const w = el.canvas.width, h = el.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Фон пещеры
    const bg = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.75);
    bg.addColorStop(0, "#2c2f38");
    bg.addColorStop(1, "#0d0f13");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = size / 2 + (Math.random() - 0.5) * shake * 10;
    const cy = size * 0.48 + (Math.random() - 0.5) * shake * 10;
    const scale = size * 0.33 * (1 - squash * 0.08);

    // Тень на полу
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(size / 2, size * 0.82, size * 0.3, size * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    if (!rock) return;

    const cy1 = Math.cos(yaw), sy1 = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const proj = rock.verts.map((p) => {
      let x = p[0] * cy1 + p[2] * sy1;
      let z = -p[0] * sy1 + p[2] * cy1;
      let y = p[1] * cp - z * sp;
      z = p[1] * sp + z * cp;
      const k = 3.2 / (3.2 + z);
      return { r: [x, y, z], s: [cx + x * scale * k, cy + y * scale * k * (1 + squash * 0.08)] };
    });

    const dmg = 1 - rock.hp / rock.maxHp;
    const col = COLORS[rock.oreId];
    const list = [];
    rock.faces.forEach((face) => {
      const [a, b, c] = face.idx.map((i) => proj[i]);
      const n = norm(cross(sub(b.r, a.r), sub(c.r, a.r)));
      if (n[2] > 0.05) return; // смотрит от камеры
      list.push({ face, a, b, c, n, z: a.r[2] + b.r[2] + c.r[2] });
    });
    list.sort((p, q) => q.z - p.z);

    list.forEach(({ face, a, b, c, n }) => {
      let light = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      light = 0.28 + light * 0.85;
      let rgb;
      if (face.ore) {
        const shine = rock.oreId === "coal" ? 0.3 : 1;
        rgb = col.map((v) => v * light + Math.pow(light, 8) * 120 * shine);
      } else {
        const g = 115 + face.crack * 20;
        rgb = [g * light, (g - 6) * light, (g - 14) * light];
      }
      if (face.crack < dmg * 0.9) rgb = rgb.map((v) => v * 0.55); // трещины по мере добычи
      ctx.fillStyle = "rgb(" + rgb.map((v) => Math.max(0, Math.min(255, v | 0))).join(",") + ")";
      ctx.beginPath();
      ctx.moveTo(a.s[0], a.s[1]);
      ctx.lineTo(b.s[0], b.s[1]);
      ctx.lineTo(c.s[0], c.s[1]);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });

    // Осколки
    particles.forEach((p) => {
      ctx.fillStyle = "rgba(" + p.c.join(",") + "," + Math.max(0, p.life).toFixed(2) + ")";
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    });

    // Всплывающие «+N ₽»
    ctx.textAlign = "center";
    ctx.font = "bold " + Math.round(size * 0.07) + "px system-ui, sans-serif";
    floaters.forEach((f) => {
      ctx.fillStyle = "rgba(124,252,0," + Math.max(0, f.life).toFixed(2) + ")";
      ctx.fillText(f.text, f.x, f.y);
    });
  }

  function step(dt) {
    yaw += spinV * dt;
    spinV += (0.35 - spinV) * Math.min(1, dt * 2);
    shake = Math.max(0, shake - dt * 5);
    squash = Math.max(0, squash - dt * 6);
    particles.forEach((p) => {
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 1.4;
    });
    particles = particles.filter((p) => p.life > 0);
    floaters.forEach((f) => {
      f.y -= 60 * dt;
      f.life -= dt * 0.9;
    });
    floaters = floaters.filter((f) => f.life > 0);
  }

  let raf = 0, last = 0, visible = false;
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    step(dt);
    drawScene();
  }
  function start() {
    if (raf) return;
    resize();
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // ---------- Защита от автокликеров ----------

  const MIN_GAP = 80;          // быстрее 12 кликов/с не засчитывается (согласовано с db.js)
  let lastHit = 0;
  let intervals = [];
  let blockedUntil = 0;

  function looksAutomated(now) {
    const gap = now - lastHit;
    if (gap < 1500) {
      intervals.push(gap);
      if (intervals.length > 20) intervals.shift();
    } else {
      intervals = [];
    }
    if (intervals.length < 20) return false;
    const mean = intervals.reduce((s, x) => s + x, 0) / intervals.length;
    const sd = Math.sqrt(intervals.reduce((s, x) => s + (x - mean) * (x - mean), 0) / intervals.length);
    return sd < 3; // человек не кликает с точностью до 3 мс
  }

  function setMessage(text, type) {
    el.message.textContent = text;
    el.message.className = "message small" + (type ? " " + type : "");
  }

  // ---------- Добыча ----------

  function hit(e) {
    if (!e.isTrusted) return; // программные клики (el.click(), dispatchEvent) игнорируются
    const now = performance.now();
    if (now < blockedUntil) return;
    if (now - lastHit < MIN_GAP) return;

    if (looksAutomated(now)) {
      blockedUntil = now + 5000;
      intervals = [];
      setMessage("Похоже на автокликер — пауза 5 секунд", "lose");
      lastHit = now;
      return;
    }
    lastHit = now;

    // Точка удара для осколков
    const rect = el.canvas.getBoundingClientRect();
    const px = e.clientX !== undefined && e.clientX !== 0 ? e.clientX - rect.left : size / 2;
    const py = e.clientY !== undefined && e.clientY !== 0 ? e.clientY - rect.top : size / 2;

    rock.hp--;
    shake = 0.6;
    squash = 1;
    spinV += 2.5;
    burst(px, py, 7, rock.faces.some((f) => f.ore) && Math.random() < 0.5 ? COLORS[rock.oreId] : [150, 145, 135]);
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (err) { /* нет вибрации */ }

    if (rock.hp <= 0) {
      const ore = ORES[rock.oreId];
      const got = mine.earn(rock.oreId);
      if (got > 0) {
        burst(size / 2, size * 0.48, 26, COLORS[rock.oreId]);
        floaters.push({ text: "+" + got + " ₽", x: size / 2, y: size * 0.3, life: 1.2 });
        setMessage("Добыто: " + ore.name + "! +" + got + " ₽", "win");
      } else {
        setMessage("Слишком быстро — руда рассыпалась", "lose");
      }
      newRock();
    }
    updateInfo();
  }

  function burst(x, y, n, rgb) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 220;
      particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200,
        s: 2 + Math.random() * 4, life: 1, c: rgb.map((c) => c | 0),
      });
    }
  }

  function updateInfo() {
    if (!rock) return;
    const ore = ORES[rock.oreId];
    el.name.textContent = ore.name;
    el.value.textContent = "+" + ore.value + " ₽";
    el.hpBar.style.width = (rock.hp / rock.maxHp) * 100 + "%";
    el.hpText.textContent = "Прочность: " + rock.hp + " / " + rock.maxHp;
    const m = DB.getMined();
    el.stats.textContent = "Добыто руды: " + m.ores + " · заработано: " + UI.money(m.earned) + " ₽";
  }

  function buildLegend() {
    el.legend.innerHTML = "";
    Object.keys(ORES).forEach((id) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = "rgb(" + COLORS[id].join(",") + ")";
      li.append(dot, ORES[id].name + " " + ORES[id].value + " ₽");
      el.legend.appendChild(li);
    });
  }

  // pointerdown срабатывает сразу при касании — удобно на телефоне
  el.canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    hit(e);
  });
  el.canvas.addEventListener("keydown", (e) => {
    if (e.repeat) return; // зажатая клавиша не считается
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      hit(e);
    }
  });

  window.addEventListener("tab-changed", (e) => {
    visible = e.detail === "mine";
    if (visible) start();
    else stop();
  });
  window.addEventListener("resize", () => { if (visible) resize(); });
  window.addEventListener("db-changed", updateInfo);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (visible) start();
  });

  buildLegend();
  newRock();
})();
