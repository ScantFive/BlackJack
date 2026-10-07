/*
 * Локальная база данных на основе localStorage.
 *
 * Принципы:
 *  - каждая операция читает свежие данные из хранилища и сразу записывает результат,
 *    поэтому ничего не теряется при перезагрузке, закрытии вкладки или работе в двух вкладках;
 *  - если localStorage недоступен (приватный режим, встроенный просмотр, запрет cookies),
 *    игра продолжает работать в памяти, а isPersistent() вернёт false;
 *  - после любого изменения банка вызывается событие "bank-changed".
 */
(function (global) {
  "use strict";

  var VERSION = 2;
  var KEY = "blackjack.db.v1"; // ключ тот же, что и раньше — старые сохранения не теряются
  var START_BANK = 1000;
  var DEFAULT_BET = 50;

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
    memoryRaw = text; // копия в памяти на случай сбоя хранилища
    if (!store) return;
    try {
      store.setItem(KEY, text);
    } catch (e) {
      persistent = false;
    }
  }

  // ---------- Данные ----------

  function defaults() {
    return {
      bank: START_BANK,
      lastBet: DEFAULT_BET,
      stats: { wins: 0, losses: 0, pushes: 0 },
      minigame: { date: "", plays: 0, earned: 0 },
    };
  }

  function num(value, fallback, min) {
    return typeof value === "number" && isFinite(value) && value >= min
      ? Math.floor(value)
      : fallback;
  }

  function read() {
    var data = defaults();
    var parsed = null;
    var raw = readRaw();

    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        parsed = null;
      }
    }

    if (parsed && typeof parsed === "object") {
      data.bank = num(parsed.bank, data.bank, 0);
      data.lastBet = num(parsed.lastBet, data.lastBet, 1);

      var s = parsed.stats || {};
      data.stats.wins = num(s.wins, 0, 0);
      data.stats.losses = num(s.losses, 0, 0);
      data.stats.pushes = num(s.pushes, 0, 0);

      var m = parsed.minigame || {};
      data.minigame.date = typeof m.date === "string" ? m.date : "";
      data.minigame.plays = num(m.plays, 0, 0);
      data.minigame.earned = num(m.earned, 0, 0);
    }

    // Новый день — счётчик попыток мини-игры обнуляется
    var today = new Date().toDateString();
    if (data.minigame.date !== today) {
      data.minigame.date = today;
      data.minigame.plays = 0;
    }

    return data;
  }

  function notify() {
    try {
      global.dispatchEvent(new Event("bank-changed"));
    } catch (e) {
      /* старые браузеры без конструктора Event — не критично */
    }
  }

  // Прочитать → изменить → записать → сообщить об изменении
  function mutate(change, silent) {
    var data = read();
    change(data);
    writeRaw(JSON.stringify(data));
    if (!silent) notify();
    return data;
  }

  // ---------- Публичный API ----------

  var DB = {
    VERSION: VERSION,
    START_BANK: START_BANK,

    isPersistent: function () {
      return persistent && store !== null;
    },

    getBank: function () {
      return read().bank;
    },

    // Изменить банк на delta (может быть отрицательной). Банк не уходит ниже 0.
    addBank: function (delta) {
      return mutate(function (d) {
        d.bank = Math.max(0, d.bank + Math.floor(delta));
      }).bank;
    },

    getLastBet: function () {
      return read().lastBet;
    },

    setLastBet: function (value) {
      mutate(function (d) {
        d.lastBet = Math.max(1, Math.floor(value));
      }, true);
    },

    recordResult: function (outcome) {
      mutate(function (d) {
        if (outcome === "win" || outcome === "blackjack") d.stats.wins++;
        else if (outcome === "lose") d.stats.losses++;
        else if (outcome === "push") d.stats.pushes++;
      }, true);
    },

    getStats: function () {
      return read().stats;
    },

    getMinigame: function () {
      return read().minigame;
    },

    // Одна попытка мини-игры: считаем её и сразу начисляем награду в банк
    minigamePlay: function (reward) {
      return mutate(function (d) {
        d.minigame.plays++;
        if (reward > 0) {
          d.bank += Math.floor(reward);
          d.minigame.earned += Math.floor(reward);
        }
      }).bank;
    },

    // «Начать заново»: банк и статистика сбрасываются,
    // а лимит мини-игры сохраняется (чтобы его нельзя было обойти сбросом)
    resetGame: function () {
      mutate(function (d) {
        d.bank = START_BANK;
        d.lastBet = DEFAULT_BET;
        d.stats = { wins: 0, losses: 0, pushes: 0 };
      });
    },
  };

  // Создаём запись сразу, чтобы она была видна в DevTools → Application → Local Storage
  if (!readRaw()) writeRaw(JSON.stringify(read()));

  // Изменения из другой вкладки
  global.addEventListener("storage", function (e) {
    if (e.key === KEY || e.key === null) notify();
  });

  global.DB = DB;
})(window);
