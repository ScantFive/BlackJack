/*
 * Локальная база данных на основе localStorage.
 * Банк, статистика и прогресс мини-игры сохраняются между перезагрузками.
 */
(function (global) {
  "use strict";

  const KEY = "blackjack.db.v2";
  const LEGACY_KEY = "blackjack.db.v1";
  const START_BANK = 1000;

  function defaults() {
    return {
      bank: START_BANK,
      stats: { wins: 0, losses: 0, pushes: 0 },
      minigame: { date: "", plays: 0, earned: 0 },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);
      if (!raw) return defaults();

      const parsed = JSON.parse(raw);
      const base = defaults();

      // Мягкая миграция: существующие деньги и статистика не теряются.
      if (!localStorage.getItem(KEY)) {
        localStorage.setItem(KEY, JSON.stringify(parsed));
      }

      return {
        bank: typeof parsed.bank === "number" ? Math.max(0, Math.floor(parsed.bank)) : base.bank,
        stats: Object.assign(base.stats, parsed.stats || {}),
        minigame: Object.assign(base.minigame, parsed.minigame || {}),
      };
    } catch (e) {
      console.warn("Не удалось прочитать сохранение:", e);
      return defaults();
    }
  }

  let data = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Не удалось сохранить данные:", e);
    }
  }

  function notify() {
    global.dispatchEvent(new Event("bank-changed"));
  }

  const DB = {
    START_BANK,

    getBank() {
      return data.bank;
    },

    setBank(value) {
      data.bank = Math.max(0, Math.floor(value));
      save();
      notify();
    },

    recordResult(outcome) {
      if (outcome === "win" || outcome === "blackjack") data.stats.wins++;
      else if (outcome === "lose") data.stats.losses++;
      else if (outcome === "push") data.stats.pushes++;
      save();
    },

    getStats() {
      return { ...data.stats };
    },

    getMinigame() {
      const today = new Date().toDateString();
      if (data.minigame.date !== today) {
        data.minigame = {
          date: today,
          plays: 0,
          earned: data.minigame.earned || 0,
        };
        save();
      }
      return { ...data.minigame };
    },

    minigamePlay(reward) {
      DB.getMinigame();
      data.minigame.plays++;
      if (reward > 0) {
        data.bank += reward;
        data.minigame.earned += reward;
      }
      save();
      notify();
    },

    reset() {
      data = defaults();
      save();
      notify();
    },
  };

  // Если игра открыта в двух вкладках, изменения банка синхронизируются.
  global.addEventListener("storage", (event) => {
    if (event.key !== KEY || !event.newValue) return;

    try {
      const incoming = JSON.parse(event.newValue);
      if (incoming && typeof incoming.bank === "number") {
        data = load();
        notify();
      }
    } catch (e) {
      console.warn("Не удалось синхронизировать сохранение:", e);
    }
  });

  global.DB = DB;
})(window);
