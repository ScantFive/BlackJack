(function () {
  "use strict";

  const DAILY_LIMIT = 10; // попыток в день
  const REWARD = 20;      // награда за верный ответ, ₽

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

  const el = {
    card: document.getElementById("mg-card"),
    higher: document.getElementById("mg-higher"),
    lower: document.getElementById("mg-lower"),
    message: document.getElementById("mg-message"),
    left: document.getElementById("mg-left"),
  };

  let current = null;

  function randomCard() {
    const rankIndex = Math.floor(Math.random() * RANKS.length);
    return {
      rank: RANKS[rankIndex],
      suit: SUITS[Math.floor(Math.random() * SUITS.length)],
      value: rankIndex + 2, // 2..14, туз — старший
    };
  }

  function renderCard(card) {
    el.card.innerHTML = "";
    if (!card) return;

    const div = document.createElement("div");
    div.className = "card" + (card.suit === "♥" || card.suit === "♦" ? " red" : "");

    const top = document.createElement("span");
    top.textContent = card.rank + card.suit;

    const center = document.createElement("span");
    center.className = "suit-center";
    center.textContent = card.suit;

    const bottom = document.createElement("span");
    bottom.className = "corner-bottom";
    bottom.textContent = card.rank + card.suit;

    div.append(top, center, bottom);
    el.card.appendChild(div);
  }

  function refresh() {
    const today = DB.getMinigame();
    const left = Math.max(0, DAILY_LIMIT - today.plays);

    el.left.textContent = `Попыток сегодня: осталось ${left} из ${DAILY_LIMIT}. Заработано всего: ${today.earned} ₽`;

    el.higher.disabled = left <= 0;
    el.lower.disabled = left <= 0;

    if (left <= 0 && !el.message.textContent) {
      el.message.textContent = "Лимит на сегодня исчерпан. Приходите завтра!";
      el.message.className = "message small";
    }
  }

  function guess(direction) {
    if (DB.getMinigame().plays >= DAILY_LIMIT) {
      refresh();
      return;
    }

    const next = randomCard();
    const correct =
      direction === "higher" ? next.value > current.value : next.value < current.value;

    // Равные карты считаются проигрышем
    DB.minigamePlay(correct ? REWARD : 0);

    renderCard(next);
    current = next;

    el.message.textContent = correct
      ? `Верно! +${REWARD} ₽`
      : "Неверно. Попробуйте ещё раз";
    el.message.className = "message small " + (correct ? "win" : "lose");

    refresh();
  }

  el.higher.addEventListener("click", () => guess("higher"));
  el.lower.addEventListener("click", () => guess("lower"));

  current = randomCard();
  renderCard(current);
  refresh();
})();
