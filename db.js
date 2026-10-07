/*
 * Локальная база данных на основе localStorage.
 * Данные хранятся только в браузере этого устройства.
 */
(function (global) {
  "use strict";

  const KEY = "blackjack.db.v1";
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
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);
      const base = defaults();
      return {
        bank: typeof parsed.bank === "number" ? parsed.bank : base.bank,
        stats: Object.assign(base.stats, parsed.stats || {}),
        minigame: Object.assign(base.minigame, parsed.minigame || {}),
      };
    } catch (e) {
      console.warn("Не удалось прочитать базу данных:", e);
      return defaults();
    }
  }

  let data = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Не удалось сохранить базу данных:", e);
    }
  }

  function notify() {
    global.dispatchEvent(new Event("bank-changed"));
  }

  const DB = {
    START_BANK: START_BANK,

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

    // Возвращает данные мини-игры за сегодня; при смене даты счётчик обнуляется
    getMinigame() {
      const today = new Date().toDateString();
      if (data.minigame.date !== today) {
        data.minigame = { date: today, plays: 0, earned: data.minigame.earned || 0 };
        save();
      }
      return { ...data.minigame };
    },

    // Засчитывает одну попытку мини-игры и начисляет награду (если она есть)
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

    // Полный сброс: банк, статистика и мини-игра
    reset() {
      data = defaults();
      save();
      notify();
    },
  };

  global.DB = DB;
})(window);
