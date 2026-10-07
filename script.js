(function () {
  "use strict";

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

  const el = {
    bank: document.getElementById("bank"),
    statWins: document.getElementById("stat-wins"),
    statLosses: document.getElementById("stat-losses"),
    statPushes: document.getElementById("stat-pushes"),
    dealerCards: document.getElementById("dealer-cards"),
    playerCards: document.getElementById("player-cards"),
    dealerScore: document.getElementById("dealer-score"),
    playerScore: document.getElementById("player-score"),
    message: document.getElementById("message"),
    betInput: document.getElementById("bet-input"),
    btnDeal: document.getElementById("btn-deal"),
    btnHit: document.getElementById("btn-hit"),
    btnStand: document.getElementById("btn-stand"),
    btnDouble: document.getElementById("btn-double"),
    btnReset: document.getElementById("btn-reset"),
  };

  let deck = [];
  let player = [];
  let dealer = [];
  let bet = 0;
  let inRound = false;

  // ---------- Колода и подсчёт очков ----------

  function buildDeck() {
    const cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ rank, suit });
      }
    }
    // Тасование Фишера–Йетса
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  function draw() {
    if (deck.length < 10) deck = buildDeck();
    return deck.pop();
  }

  function cardValue(card) {
    if (card.rank === "A") return 11;
    if (["J", "Q", "K"].includes(card.rank)) return 10;
    return parseInt(card.rank, 10);
  }

  function handValue(hand) {
    let total = 0;
    let aces = 0;
    for (const card of hand) {
      total += cardValue(card);
      if (card.rank === "A") aces++;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return total;
  }

  function isBlackjack(hand) {
    return hand.length === 2 && handValue(hand) === 21;
  }

  // ---------- Отрисовка ----------

  function renderCard(card, hidden) {
    const div = document.createElement("div");
    if (hidden) {
      div.className = "card back";
      return div;
    }
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
    return div;
  }

  function setMessage(text, type) {
    el.message.textContent = text;
    el.message.className = "message" + (type ? " " + type : "");
  }

  function render(revealDealer) {
    const bank = DB.getBank();
    const stats = DB.getStats();

    el.bank.textContent = bank;
    el.statWins.textContent = stats.wins;
    el.statLosses.textContent = stats.losses;
    el.statPushes.textContent = stats.pushes;

    el.dealerCards.innerHTML = "";
    dealer.forEach((card, i) => {
      // Вторая карта дилера скрыта, пока раунд не закончен
      el.dealerCards.appendChild(renderCard(card, !revealDealer && i === 1));
    });

    el.playerCards.innerHTML = "";
    player.forEach((card) => el.playerCards.appendChild(renderCard(card, false)));

    el.playerScore.textContent = player.length ? `(${handValue(player)})` : "";
    el.dealerScore.textContent =
      dealer.length && revealDealer ? `(${handValue(dealer)})` : "";

    el.btnDeal.disabled = inRound || bank <= 0;
    el.btnHit.disabled = !inRound;
    el.btnStand.disabled = !inRound;
    el.btnDouble.disabled = !(inRound && player.length === 2 && bank >= bet);
    el.betInput.disabled = inRound;
    el.btnReset.hidden = !(bank <= 0 && !inRound);
  }

  // ---------- Ставки и выплаты ----------

  function readBet() {
    const value = parseInt(el.betInput.value, 10);
    if (!Number.isFinite(value) || value < 1) {
      setMessage("Введите корректную ставку (минимум 1 ₽)", "lose");
      return null;
    }
    if (value > DB.getBank()) {
      setMessage("Недостаточно средств на банке", "lose");
      return null;
    }
    return value;
  }

  // Сколько возвращается игроку при данном исходе (включая его ставку)
  function payout(outcome) {
    if (outcome === "blackjack") return bet + Math.floor(bet * 1.5);
    if (outcome === "win") return bet * 2;
    if (outcome === "push") return bet;
    return 0;
  }

  function settle(outcome, text) {
    inRound = false;
    const amount = payout(outcome);
    if (amount > 0) DB.setBank(DB.getBank() + amount);
    DB.recordResult(outcome);

    const type =
      outcome === "win" || outcome === "blackjack" ? "win"
      : outcome === "lose" ? "lose"
      : "";
    setMessage(text, type);
    render(true);
  }

  // ---------- Действия игрока ----------

  function deal() {
    if (inRound) return;
    const value = readBet();
    if (value === null) return;

    DB.setBank(DB.getBank() - value);
    bet = value;
    player = [draw(), draw()];
    dealer = [draw(), draw()];
    inRound = true;
    setMessage("");

    const playerBJ = isBlackjack(player);
    const dealerBJ = isBlackjack(dealer);

    if (playerBJ || dealerBJ) {
      if (playerBJ && dealerBJ) {
        settle("push", "Блэкджек у обоих — ничья");
      } else if (playerBJ) {
        settle("blackjack", `Блэкджек! Выигрыш ${Math.floor(bet * 1.5)} ₽`);
      } else {
        settle("lose", "У дилера блэкджек — вы проиграли");
      }
      return;
    }

    render(false);
  }

  function hit() {
    if (!inRound) return;
    player.push(draw());
    if (handValue(player) > 21) {
      settle("lose", "Перебор! Вы проиграли");
    } else {
      render(false);
    }
  }

  function stand() {
    if (!inRound) return;
    finishDealerTurn();
  }

  // Дабл: удваиваем ставку, берём ровно одну карту и сразу останавливаемся
  function double() {
    if (!inRound || player.length !== 2) return;
    if (DB.getBank() < bet) {
      setMessage("Недостаточно средств для дабла", "lose");
      return;
    }

    DB.setBank(DB.getBank() - bet);
    bet *= 2;
    player.push(draw());

    if (handValue(player) > 21) {
      settle("lose", "Перебор после дабла! Вы проиграли");
    } else {
      finishDealerTurn();
    }
  }

  // Дилер добирает до 17 и сравнивается с игроком
  function finishDealerTurn() {
    while (handValue(dealer) < 17) {
      dealer.push(draw());
    }

    const p = handValue(player);
    const d = handValue(dealer);

    if (d > 21) {
      settle("win", `Дилер перебрал! Выигрыш ${bet} ₽`);
    } else if (p > d) {
      settle("win", `Вы выиграли ${bet} ₽`);
    } else if (p < d) {
      settle("lose", "Дилер выиграл");
    } else {
      settle("push", "Ничья — ставка возвращена");
    }
  }

  function reset() {
    DB.reset();
    bet = 0;
    player = [];
    dealer = [];
    inRound = false;
    setMessage("Новая игра! Сделайте ставку");
    render(false);
  }

  // ---------- Инициализация ----------

  el.btnDeal.addEventListener("click", deal);
  el.btnHit.addEventListener("click", hit);
  el.btnStand.addEventListener("click", stand);
  el.btnDouble.addEventListener("click", double);
  el.btnReset.addEventListener("click", reset);

  el.betInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") deal();
  });

  // Обновляем экран при изменении банка (например, из мини-игры)
  window.addEventListener("bank-changed", () => render(!inRound));

  deck = buildDeck();
  if (DB.getBank() <= 0) {
    setMessage("Банк пуст. Заработайте в мини-игре или начните заново");
  } else {
    setMessage("Сделайте ставку и нажмите «Раздать»");
  }
  render(false);
})();
