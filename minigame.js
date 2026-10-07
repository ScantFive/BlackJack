(function () {
  "use strict";

  // Ошибку о несовпадении версий показывает script.js
  if (!window.DB || window.DB.VERSION !== 2) return;

  const DAILY_LIMIT = 10; // попыток в день
  const REWARD = 20;      // награда за верный ответ, ₽

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const $ = (id) => document.getElementById(id);

  const el = {
    card: $("mg-card"),
    higher: $("mg-higher"),
    lower: $("mg-lower"),
    message: $("mg-message"),
    left: $("mg-left"),
    bank: $("bank"),
  };

  let current = null;
  let finished = false; // показали ли сообщение об исчерпанном лимите

  // Карта другого достоинства, чем excludeIndex (ничьих не бывает)
  function randomCard(excludeIndex) {
    let index;
    do {
      index = Math.floor(Math.random() * RANKS.length);
    } while (index === excludeIndex);
    return {
      index,
      rank: RANKS[index],
      suit: SUITS[Math.floor(Math.random() * SUITS.length)],
    };
  }

  function renderCard(card) {
    el.card.innerHTML = "";
    const div = document.createElement("div");
    div.className = "card" + (card.suit === "♥" || card.suit === "♦" ? " red" : "");

    const top = document.createElement("span");
    top.textContent = card.rank + card.suit;
    const center = document.createElement("span");
    center.className = "center";
    center.textContent = card.suit;
    const bottom = document.createElement("span");
    bottom.className = "corner-bottom";
    bottom.textContent = card.rank + card.suit;

    div.append(top, center, bottom);
    el.card.appendChild(div);
  }

  function refresh() {
    const info = DB.getMinigame();
    const left = Math.max(0, DAILY_LIMIT - info.plays);

    el.left.textContent =
      `Попыток сегодня: осталось ${left} из ${DAILY_LIMIT}. ` +
      `Заработано здесь за всё время: ${info.earned.toLocaleString("ru-RU")} ₽`;

    // Выше туза и ниже двойки не бывает — такие кнопки отключаем
    el.higher.disabled = left <= 0 || current.index === RANKS.length - 1;
    el.lower.disabled = left <= 0 || current.index === 0;

    if (left <= 0 && !finished) {
      finished = true;
      el.message.textContent = "Лимит на сегодня исчерпан. Приходите завтра!";
      el.message.className = "message small";
    }
  }

  function guess(direction) {
    if (DB.getMinigame().plays >= DAILY_LIMIT) {
      refresh();
      return;
    }

    const prev = current;
    const next = randomCard(prev.index);
    const correct = direction === "higher" ? next.index > prev.index : next.index < prev.index;

    // Попытка засчитывается и деньги начисляются одной сохранённой операцией
    const newBank = DB.minigamePlay(correct ? REWARD : 0);
    el.bank.textContent = newBank.toLocaleString("ru-RU"); // не зависим от события

    current = next;
    renderCard(next);

    el.message.textContent = correct
      ? `Было ${prev.rank}${prev.suit} → стало ${next.rank}${next.suit}. Верно! +${REWARD} ₽`
      : `Было ${prev.rank}${prev.suit} → стало ${next.rank}${next.suit}. Не угадали`;
    el.message.className = "message small " + (correct ? "win" : "lose");

    try {
      if (navigator.vibrate) navigator.vibrate(correct ? [30, 40, 30] : 60);
    } catch (e) {
      /* не поддерживается */
    }

    finished = false;
    refresh();
  }

  el.higher.addEventListener("click", () => guess("higher"));
  el.lower.addEventListener("click", () => guess("lower"));

  current = randomCard(-1);
  renderCard(current);
  refresh();
})();
