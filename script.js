(function () {
  "use strict";

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const START_BANK = 1000;

  const el = {
    bank: document.getElementById("bank"),
    dealerCards: document.getElementById("dealer-cards"),
    playerCards: document.getElementById("player-cards"),
    dealerScore: document.getElementById("dealer-score"),
    playerScore: document.getElementById("player-score"),
    message: document.getElementById("message"),
    betInput: document.getElementById("bet-input"),
    btnDeal: document.getElementById("btn-deal"),
    btnHit: document.getElementById("btn-hit"),
    btnStand: document.getElementById("btn-stand"),
    btnReset: document.getElementById("btn-reset"),
  };

  let deck = [];
  let player = [];
  let dealer = [];
  let bank = START_BANK;
  let bet = 0;
  let inRound = false;

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
    bottom.style.alignSelf = "flex-end";
    bottom.style.transform = "rotate(180deg)";
    bottom.textContent = card.rank + card.suit;
    div.append(top, center, bottom);
    return div;
  }

  function render(revealDealer) {
    el.bank.textContent = bank;

    el.dealerCards.innerHTML = "";
    dealer.forEach((card, i) => {
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
    el.betInput.disabled = inRound;
    el.btnReset.hidden = !(bank <= 0 && !inRound);
  }

  function setMessage(text, type) {
    el.message.textContent = text;
    el.message.className = "message" + (type ? " " + type : "");
  }

  function readBet() {
    const value = parseInt(el.betInput.value, 10);
    if (!Number.isFinite(value) || value < 1) {
      setMessage("Введите корректную ставку (минимум 1)", "lose");
      return null;
    }
    if (value > bank) {
      setMessage("Недостаточно средств на банке", "lose");
      return null;
    }
    return value;
  }

  function deal() {
    const value = readBet();
    if (value === null) return;

    bet = value;
    bank -= bet;
    player = [draw(), draw()];
    dealer = [draw(), draw()];
    inRound = true;
    setMessage("");

    const playerBJ = isBlackjack(player);
    const dealerBJ = isBlackjack(dealer);

    if (playerBJ || dealerBJ) {
      inRound = false;
      if (playerBJ && dealerBJ) {
        bank += bet;
        setMessage("Блэкджек у обоих — ничья", "");
      } else if (playerBJ) {
        const win = bet + Math.floor(bet * 1.5);
        bank += win;
        setMessage(`Блэкджек! Вы выиграли ${win - bet} ₽`, "win");
      } else {
        setMessage("У дилера блэкджек — вы проиграли", "lose");
      }
      render(true);
      return;
    }

    render(false);
  }

  function hit() {
    if (!inRound) return;
    player.push(draw());
    if (handValue(player) > 21) {
      finishRound("bust");
    } else {
      render(false);
    }
  }

  function stand() {
    if (!inRound) return;
    // Дилер добирает до 17
    while (handValue(dealer) < 17) {
      dealer.push(draw());
    }
    finishRound("stand");
  }

  function finishRound(reason) {
    inRound = false;
    const p = handValue(player);
    const d = handValue(dealer);
    let result;

    if (reason === "bust" || p > 21) {
      result = "lose";
      setMessage("Перебор! Вы проиграли", "lose");
    } else if (d > 21) {
      result = "win";
      bank += bet * 2;
      setMessage(`Дилер перебрал! Вы выиграли ${bet} ₽`, "win");
    } else if (p > d) {
      result = "win";
      bank += bet * 2;
      setMessage(`Вы выиграли ${bet} ₽`, "win");
    } else if (p < d) {
      result = "lose";
      setMessage("Дилер выиграл", "lose");
    } else {
      result = "push";
      bank += bet;
      setMessage("Ничья", "");
    }

    render(true);
    return result;
  }

  function reset() {
    bank = START_BANK;
    player = [];
    dealer = [];
    setMessage("Новая игра! Сделайте ставку");
    render(false);
  }

  el.btnDeal.addEventListener("click", deal);
  el.btnHit.addEventListener("click", hit);
  el.btnStand.addEventListener("click", stand);
  el.btnReset.addEventListener("click", reset);

  el.betInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !inRound) deal();
  });

  deck = buildDeck();
  render(false);
})();
