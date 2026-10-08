/*
 * Локальная база данных (localStorage) с защитой от накрутки.
 *
 * Что здесь сделано:
 *  1. Сохранение подписано хэшем SHA-256. Если данные изменить вручную
 *     (DevTools → Application → Local Storage), подпись не сойдётся и прогресс сбросится.
 *  2. Счётчик записей n: подмена сохранения более старой копией во время игры тоже обнаруживается.
 *  3. Денежные операции недоступны из консоли: изменять банк могут только модули игры,
 *     которые один раз получают закрытый API через DB.connect(). Повторный вызов запрещён.
 *  4. Блэкджек: ставка списывается заранее и хранится в сохранении («эскроу»).
 *     Выплату рассчитывает сама база по этой ставке, а не вызывающий код.
 *  5. Добыча: награду определяет таблица ORES внутри базы, а не вызывающий код;
 *     есть минимальный интервал между добычами руды.
 *
 * ВАЖНО: всё это работает в браузере пользователя, поэтому это защита от случайной и
 * «лёгкой» накрутки, а не от опытного человека, который читает исходный код.
 * Полностью надёжная защита возможна только с сервером.
 */
(function (global) {
  "use strict";

  var VERSION = 3;
  var KEY = "blackjack.db.v3";
  var OLD_KEY = "blackjack.db.v1";
  var START_BANK = 1000;
  var DEFAULT_BET = 50;
  var MAX_BANK = 1000000000;
  var MIGRATE_CAP = 5000; // сколько денег переносится из старой версии игры
  var SALT = "bj3|Zk7q-91xV|\u2660\u2665\u2666\u2663|";

  // ---------- Каталоги (источник правды для цен и наград) ----------

  var ORES = {
    coal:    { name: "Уголь",   value: 8,   hp: 4,  weight: 40 },
    copper:  { name: "Медь",    value: 20,  hp: 6,  weight: 28 },
    iron:    { name: "Железо",  value: 35,  hp: 8,  weight: 18 },
    gold:    { name: "Золото",  value: 80,  hp: 11, weight: 9 },
    emerald: { name: "Изумруд", value: 120, hp: 13, weight: 6 },
    diamond: { name: "Алмаз",   value: 200, hp: 16, weight: 4 },
  };

  var SHOP = {
    bg: [
      { id: "classic", name: "Классика", price: 0 },
      { id: "waves",   name: "Волны",    price: 1200 },
      { id: "sky",     name: "Небо",     price: 1500 },
      { id: "germany", name: "Германия", price: 2500 },
    ],
    cards: [
      { id: "classic", name: "Классические", price: 0 },
      { id: "retro",   name: "Ретро",        price: 500 },
      { id: "gold",    name: "Золотые",      price: 900 },
      { id: "neon",    name: "Неон",         price: 1400 },
      { id: "cosmos",  name: "Космос",       price: 2200 },
    ],
  };

  var REWARD_GAP_MS = 80; // минимум мс на один «клик» прочности руды

  function deepFreeze(o) {
    Object.keys(o).forEach(function (k) {
      if (o[k] && typeof o[k] === "object") deepFreeze(o[k]);
    });
    return Object.freeze(o);
  }
  deepFreeze(ORES);
  deepFreeze(SHOP);

  function shopItem(kind, id) {
    var list = SHOP[kind] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // ---------- SHA-256 ----------

  var K256 = [];
  var H256 = [];
  (function initConstants() {
    var primes = [];
    for (var n = 2; primes.length < 64; n++) {
      var isPrime = true;
      for (var i = 0; i < primes.length; i++) {
        if (n % primes[i] === 0) { isPrime = false; break; }
      }
      if (isPrime) primes.push(n);
    }
    function frac32(x) { return Math.floor((x - Math.floor(x)) * 4294967296); }
    for (var j = 0; j < 64; j++) K256.push(frac32(Math.cbrt(primes[j])));
    for (var k = 0; k < 8; k++) H256.push(frac32(Math.sqrt(primes[k])));
  })();

  function ror(x, n) { return (x >>> n) | (x << (32 - n)); }

  function sha256(text) {
    var bytes = new TextEncoder().encode(text);
    var len = bytes.length;
    var padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[len] = 0x80;
    var view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor((len * 8) / 4294967296));
    view.setUint32(padded.length - 4, (len * 8) >>> 0);

    var H = H256.slice();
    var w = new Uint32Array(64);

    for (var off = 0; off < padded.length; off += 64) {
      var i;
      for (i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
      for (i = 16; i < 64; i++) {
        var s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K256[i] + w[i]) >>> 0;
        var S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(function (x) { return ("00000000" + x.toString(16)).slice(-8); }).join("");
  }

  function sign(payload) {
    return sha256(SALT + payload + SALT);
  }

  // ---------- Хранилище ----------

  var store = null;
  try {
    var probe = "__bj_probe__";
    global.localStorage.setItem(probe, "1");
    global.localStorage.removeItem(probe);
    store = global.localStorage;
  } catch (e) {
    store = null;
  }

  var memoryRaw = null;
  var persistent = store !== null;

  function readRaw() {
    try {
      return store ? store.getItem(KEY) : memoryRaw;
    } catch (e) {
      persistent = false;
      return memoryRaw;
    }
  }

  function writeRaw(text) {
    memoryRaw = text;
    if (!store) return;
    try {
      store.setItem(KEY, text);
    } catch (e) {
      persistent = false;
    }
  }

  // ---------- Данные ----------

  var notices = [];
  var lastN = 0; // наибольший номер записи, который мы видели на этой странице

  function defaults() {
    return {
      n: 0,
      bank: START_BANK,
      lastBet: DEFAULT_BET,
      pending: 0,
      doubled: false,
      stats: { wins: 0, losses: 0, pushes: 0 },
      mined: { ores: 0, earned: 0 },
      owned: { bg: ["classic"], cards: ["classic"] },
      sel: { bg: "classic", cards: "classic" },
    };
  }

  function num(value, fallback, min, max) {
    if (typeof value !== "number" || !isFinite(value) || value < min) return fallback;
    return Math.min(Math.floor(value), max);
  }

  function cleanOwned(kind, list) {
    var out = ["classic"];
    if (Array.isArray(list)) {
      list.forEach(function (id) {
        if (shopItem(kind, id) && out.indexOf(id) < 0) out.push(id);
      });
    }
    return out;
  }

  function sanitize(p) {
    var d = defaults();
    if (!p || typeof p !== "object") return d;
    d.n = num(p.n, 0, 0, Number.MAX_SAFE_INTEGER);
    d.bank = num(p.bank, d.bank, 0, MAX_BANK);
    d.lastBet = num(p.lastBet, d.lastBet, 1, MAX_BANK);
    d.pending = num(p.pending, 0, 0, MAX_BANK * 4);
    d.doubled = p.doubled === true && d.pending > 0;
    var s = p.stats || {};
    d.stats.wins = num(s.wins, 0, 0, MAX_BANK);
    d.stats.losses = num(s.losses, 0, 0, MAX_BANK);
    d.stats.pushes = num(s.pushes, 0, 0, MAX_BANK);
    var m = p.mined || {};
    d.mined.ores = num(m.ores, 0, 0, MAX_BANK);
    d.mined.earned = num(m.earned, 0, 0, MAX_BANK * 10);
    var o = p.owned || {};
    d.owned.bg = cleanOwned("bg", o.bg);
    d.owned.cards = cleanOwned("cards", o.cards);
    var sl = p.sel || {};
    d.sel.bg = d.owned.bg.indexOf(sl.bg) >= 0 ? sl.bg : "classic";
    d.sel.cards = d.owned.cards.indexOf(sl.cards) >= 0 ? sl.cards : "classic";
    return d;
  }

  function notify() {
    try {
      global.dispatchEvent(new Event("db-changed"));
    } catch (e) {
      /* очень старые браузеры — не критично */
    }
  }

  function commit(data, silent) {
    data.n = Math.max(data.n, lastN) + 1;
    lastN = data.n;
    var payload = JSON.stringify(data);
    writeRaw(JSON.stringify({ p: payload, s: sign(payload) }));
    if (!silent) notify();
  }

  function tampered() {
    notices.push("Обнаружено вмешательство в сохранение — прогресс сброшен.");
    var d = defaults();
    commit(d, true);
    return d;
  }

  function migrateOld() {
    var d = defaults();
    try {
      var raw = store ? store.getItem(OLD_KEY) : null;
      if (!raw) return null;
      var o = JSON.parse(raw);
      d.bank = num(o.bank, d.bank, 0, MIGRATE_CAP);
      d.lastBet = num(o.lastBet, d.lastBet, 1, MIGRATE_CAP);
      var s = o.stats || {};
      d.stats.wins = num(s.wins, 0, 0, 100000);
      d.stats.losses = num(s.losses, 0, 0, 100000);
      d.stats.pushes = num(s.pushes, 0, 0, 100000);
      try { store.removeItem(OLD_KEY); } catch (e) { /* ignore */ }
      return d;
    } catch (e) {
      return null;
    }
  }

  function load() {
    var raw = readRaw();

    if (!raw) {
      var d = migrateOld() || defaults();
      commit(d, true);
      return d;
    }

    var wrapper;
    try {
      wrapper = JSON.parse(raw);
    } catch (e) {
      return tampered();
    }
    if (!wrapper || typeof wrapper.p !== "string" || typeof wrapper.s !== "string") return tampered();
    if (sign(wrapper.p) !== wrapper.s) return tampered();

    var parsed;
    try {
      parsed = JSON.parse(wrapper.p);
    } catch (e) {
      return tampered();
    }

    var data = sanitize(parsed);
    if (data.n < lastN) return tampered(); // откат к старой копии
    lastN = data.n;
    return data;
  }

  // Прочитать → изменить → записать. Если change вернул false — запись не делается.
  function mutate(change) {
    var d = load();
    var result = change(d);
    if (result === false) return { ok: false, data: d };
    commit(d);
    return { ok: true, data: d, result: result };
  }

  // Раунд, прерванный закрытием страницы, считается проигрышем ставки
  (function recoverPending() {
    var d = load();
    if (d.pending > 0) {
      d.pending = 0;
      d.doubled = false;
      d.stats.losses++;
      notices.push("Прошлый раунд был прерван — ставка проиграна.");
      commit(d, true);
    }
  })();

  // ---------- Закрытые API модулей ----------

  var connected = {};
  var lastEarnAt = -Infinity;

  var PAYOUT = { lose: 0, push: 1, win: 2, blackjack: 2.5 };

  function gameApi() {
    return Object.freeze({
      placeBet: function (amount) {
        amount = Math.floor(amount);
        if (!(amount >= 1)) return false;
        return mutate(function (d) {
          if (d.pending > 0 || amount > d.bank) return false;
          d.bank -= amount;
          d.pending = amount;
          d.doubled = false;
          d.lastBet = amount;
        }).ok;
      },

      doubleBet: function () {
        return mutate(function (d) {
          if (d.pending < 1 || d.doubled || d.bank < d.pending) return false;
          d.bank -= d.pending;
          d.pending *= 2;
          d.doubled = true;
        }).ok;
      },

      // kind: lose | push | win | blackjack. Возвращает выплату или null, если раунда нет.
      settle: function (kind) {
        if (!Object.prototype.hasOwnProperty.call(PAYOUT, kind)) return null;
        var r = mutate(function (d) {
          if (d.pending < 1) return false;
          if (kind === "blackjack" && d.doubled) return false;
          var payout = Math.floor(d.pending * PAYOUT[kind]);
          d.bank = Math.min(MAX_BANK, d.bank + payout);
          if (kind === "win" || kind === "blackjack") d.stats.wins++;
          else if (kind === "lose") d.stats.losses++;
          else d.stats.pushes++;
          d.pending = 0;
          d.doubled = false;
          return payout;
        });
        return r.ok ? r.result : null;
      },

      // «Начать заново» доступно только при пустом банке
      resetGame: function () {
        return mutate(function (d) {
          if (d.bank > 0 || d.pending > 0) return false;
          d.bank = START_BANK;
          d.lastBet = DEFAULT_BET;
          d.stats = { wins: 0, losses: 0, pushes: 0 };
        }).ok;
      },
    });
  }

  function mineApi() {
    return Object.freeze({
      // Награду определяет таблица ORES; частые вызовы отклоняются
      earn: function (oreId) {
        if (!Object.prototype.hasOwnProperty.call(ORES, oreId)) return 0;
        var ore = ORES[oreId];
        var now = performance.now();
        if (now - lastEarnAt < (ore.hp - 1) * REWARD_GAP_MS) return 0;
        lastEarnAt = now;
        var r = mutate(function (d) {
          d.bank = Math.min(MAX_BANK, d.bank + ore.value);
          d.mined.ores++;
          d.mined.earned += ore.value;
        });
        return r.ok ? ore.value : 0;
      },
    });
  }

  function shopApi() {
    return Object.freeze({
      buy: function (kind, id) {
        var item = shopItem(kind, id);
        if (!item) return { ok: false, reason: "unknown" };
        var info = { ok: true };
        var r = mutate(function (d) {
          if (d.owned[kind].indexOf(id) >= 0) { info = { ok: false, reason: "owned" }; return false; }
          if (d.bank < item.price) {
            info = { ok: false, reason: "funds", need: item.price - d.bank };
            return false;
          }
          d.bank -= item.price;
          d.owned[kind].push(id);
        });
        return r.ok ? info : info;
      },

      select: function (kind, id) {
        if (!shopItem(kind, id)) return false;
        return mutate(function (d) {
          if (d.owned[kind].indexOf(id) < 0) return false;
          d.sel[kind] = id;
        }).ok;
      },
    });
  }

  function connect(name) {
    if (connected[name]) throw new Error("Модуль уже подключён");
    var api;
    if (name === "game") api = gameApi();
    else if (name === "mine") api = mineApi();
    else if (name === "shop") api = shopApi();
    else throw new Error("Неизвестный модуль");
    connected[name] = true;
    return api;
  }

  // ---------- Публичный API (только чтение) ----------

  var DB = Object.freeze({
    VERSION: VERSION,
    ORES: ORES,
    SHOP: SHOP,
    connect: connect,
    isPersistent: function () { return persistent && store !== null; },
    getBank: function () { return load().bank; },
    getLastBet: function () { return load().lastBet; },
    getStats: function () { return Object.assign({}, load().stats); },
    getMined: function () { return Object.assign({}, load().mined); },
    getOwned: function () {
      var o = load().owned;
      return { bg: o.bg.slice(), cards: o.cards.slice() };
    },
    getSelected: function () { return Object.assign({}, load().sel); },
    takeNotices: function () {
      var out = notices.slice();
      notices.length = 0;
      return out;
    },
  });

  Object.defineProperty(global, "DB", { value: DB, writable: false, configurable: false });

  // Изменения из другой вкладки
  global.addEventListener("storage", function (e) {
    if (e.key === KEY || e.key === null) notify();
  });
})(window);
