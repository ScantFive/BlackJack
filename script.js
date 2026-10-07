(function () {
  "use strict";

  // Если db.js не загрузился или остался старой версии (кэш браузера, не все файлы
  // обновлены в репозитории), показываем понятную ошибку вместо «тихой» поломки.
  if (!window.DB || window.DB.VERSION !== 2) {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div class="fatal"><div><b>Файлы игры разных версий.</b><br>' +
        "Убедитесь, что в репозиторий загружены все файлы (db.js, script.js, minigame.js, " +
        "index.html, style.css), и обновите страницу с очисткой кэша " +
        "(Ctrl+F5 или Cmd+Shift+R; на телефоне — очистите данные сайта).</div></div>"
    );
    return;
  }

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const $ = (id) => document.getElementById(id);

  const el = {
    bank: $("bank"),
    warning: $("storage-warning"),
    statWins: $("stat-wins"),
    statLosses: $("stat-losses"),
    statPushes: $("stat-pushes"),
    dealerCards: $("dealer-cards"),
    playerCards: $("player-cards"),
    dealerScore: $("dealer-score"),
    playerScore: $("player-score"),
    message: $("message"),
    betInput: $("bet-input"),
    betMinus: $("bet-minus"),
    betPlus: $("bet-plus"),
    chips: $("chips"),
    preRound: $("pre-round"),
    inRound: $("in-round"),
    broke: $("broke"),
    btnDeal: $("btn-deal"),
    btnHit: $("btn-hit"),
    btnStand: $("btn-stand"),
    btnDouble: $("btn-double"),
    btnReset: $("btn-reset"),
    btnGoEarn: $("btn-go-earn"),
    tabGame: $("tab-game"),
    tabEarn: $("tab-earn"),
    viewGame: $("view-game"),
    viewEarn: $("view-earn"),
  };

  // Состояние раунда: "idle" — до раздачи, "playing" — идёт раунд, "done" — раунд окончен
  let phase = "idle";
  let deck = [];
  let player = [];
  let dealer = [];
  let bet = 0;

  // ---------- Колода и очки ----------

  function buildDeck() {
    const cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ rank, suit });
    }
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  function draw() {
    if (deck.length < 12) deck = buildDeck();
    return deck.pop();
  }

  function cardValue(card) {
    if (card.rank === "A") return 11;
    if (card.rank === "J" || card.rank === "Q" || card.rank === "K") return 10;
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

  function money(n) {
    return Number(n).toLocaleString("ru-RU");
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
    center.className = "center";
    center.textContent = card.suit;
    const bottom = document.createElement("span");
    bottom.className = "corner-bottom";
    bottom.textContent = card.rank + card.suit;

    div.append(top, center, bottom);
    return div;
  }

  function renderHand(container, hand, hideSecond) {
    container.innerHTML = "";
    hand.forEach((card, i) => container.appendChild(renderCard(card, hideSecond && i === 1)));
    container.classList.toggle("overlap", hand.length > 4);
  }

  function setMessage(text, type) {
    el.message.textContent = text;
    el.message.className = "message" + (type ? " " + type : "");
  }

  function clampBetToBank() {
    const bank = DB.getBank();
    const current = readBetInput();
    if (bank < 1) {
      el.betInput.value = "0";
    } else if (current < 1) {
      el.betInput.value = String(Math.min(DB.getLastBet(), bank));
    } else if (current > bank) {
      el.betInput.value = String(bank);
    }
  }

  // Единственная функция, которая рисует экран — целиком по текущему состоянию
  function render() {
    const bank = DB.getBank();
    const stats = DB.getStats();
    const playing = phase === "playing";
    const broke = bank < 1 && !playing;

    el.bank.textContent = money(bank);
    el.statWins.textContent = stats.wins;
    el.statLosses.textContent = stats.losses;
    el.statPushes.textContent = stats.pushes;
    el.warning.hidden = DB.isPersistent();

    renderHand(el.dealerCards, dealer, playing);
    renderHand(el.playerCards, player, false);
    el.playerScore.textContent = player.length ? `(${handValue(player)})` : "";
    el.dealerScore.textContent = dealer.length && !playing ? `(${handValue(dealer)})` : "";

    el.preRound.hidden = playing || broke;
    el.inRound.hidden = !playing;
    el.broke.hidden = !broke;

    el.btnDouble.disabled = !(playing && player.length === 2 && bank >= bet);

    if (!playing) clampBetToBank();
  }

  // ---------- Ставка ----------

  function readBetInput() {
    const v = parseInt(String(el.betInput.value).replace(/\D/g, ""), 10);
    return Number.isFinite(v) ? v : 0;
  }

  function setBetInput(value) {
    const max = DB.getBank();
    if (max < 1) {
      el.betInput.value = "0";
      return;
    }
    el.betInput.value = String(Math.max(1, Math.min(Math.floor(value), max)));
  }

  // ---------- Игровые действия ----------

  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) {
      /* не поддерживается — не страшно */
    }
  }

  // Сколько возвращается игроку при исходе (вместе с его ставкой)
  function payout(outcome) {
    if (outcome === "blackjack") return bet + Math.floor(bet * 1.5);
    if (outcome === "win") return bet * 2;
    if (outcome === "push") return bet;
    return 0;
  }

  function settle(outcome, text) {
    phase = "done";
    const good = outcome === "win" || outcome === "blackjack";
    setMessage(text, good ? "win" : outcome === "lose" ? "lose" : "");
    DB.recordResult(outcome);
    vibrate(good ? [30, 40, 30] : outcome === "lose" ? 70 : 20);

    const amount = payout(outcome);
    if (amount > 0) DB.addBank(amount); // событие bank-changed перерисует экран
    render();
  }

  function deal() {
    if (phase === "playing") return;

    const bank = DB.getBank();
    const value = readBetInput();
    if (bank < 1) {
      setMessage("Банк пуст — заработайте или начните заново", "lose");
      return;
    }
    if (value < 1) {
      setMessage("Введите ставку (минимум 1 ₽)", "lose");
      return;
    }
    if (value > bank) {
      setMessage("Ставка больше, чем у вас на банке", "lose");
      setBetInput(bank);
      return;
    }

    DB.setLastBet(value);
    bet = value;
    player = [draw(), draw()];
    dealer = [draw(), draw()];
    phase = "playing";
    setMessage("");
    DB.addBank(-bet); // ставка списывается и сразу сохраняется

    const playerBJ = isBlackjack(player);
    const dealerBJ = isBlackjack(dealer);

    if (playerBJ && dealerBJ) {
      settle("push", "Блэкджек у обоих — ничья");
    } else if (playerBJ) {
      settle("blackjack", `Блэкджек! Выигрыш ${money(Math.floor(bet * 1.5))} ₽`);
    } else if (dealerBJ) {
      settle("lose", "У дилера блэкджек — вы проиграли");
    } else {
      render();
    }
  }

  function hit() {
    if (phase !== "playing") return;
    player.push(draw());
    const value = handValue(player);
    if (value > 21) {
      settle("lose", "Перебор! Вы проиграли");
    } else if (value === 21) {
      finishDealerTurn(); // 21 — дальше брать нечего
    } else {
      render();
    }
  }

  function stand() {
    if (phase !== "playing") return;
    finishDealerTurn();
  }

  // Дабл: ставка удваивается, берётся ровно одна карта, ход переходит дилеру
  function double() {
    if (phase !== "playing" || player.length !== 2) return;
    if (DB.getBank() < bet) {
      setMessage("Не хватает денег на дабл", "lose");
      return;
    }
    DB.addBank(-bet);
    bet *= 2;
    player.push(draw());

    if (handValue(player) > 21) {
      settle("lose", "Перебор после дабла! Вы проиграли");
    } else {
      finishDealerTurn();
    }
  }

  function finishDealerTurn() {
    while (handValue(dealer) < 17) dealer.push(draw());

    const p = handValue(player);
    const d = handValue(dealer);

    if (d > 21) settle("win", `Дилер перебрал! Выигрыш ${money(bet)} ₽`);
    else if (p > d) settle("win", `Вы выиграли ${money(bet)} ₽`);
    else if (p < d) settle("lose", "Дилер выиграл");
    else settle("push", "Ничья — ставка возвращена");
  }

  function resetGame() {
    DB.resetGame();
    phase = "idle";
    bet = 0;
    player = [];
    dealer = [];
    setMessage("Новая игра! Сделайте ставку");
    render();
  }

  // ---------- Вкладки ----------

  function showTab(name) {
    const game = name === "game";
    el.viewGame.hidden = !game;
    el.viewEarn.hidden = game;
    el.tabGame.classList.toggle("active", game);
    el.tabEarn.classList.toggle("active", !game);
    el.tabGame.setAttribute("aria-selected", String(game));
    el.tabEarn.setAttribute("aria-selected", String(!game));
  }

  // ---------- Обработчики ----------

  el.btnDeal.addEventListener("click", deal);
  el.btnHit.addEventListener("click", hit);
  el.btnStand.addEventListener("click", stand);
  el.btnDouble.addEventListener("click", double);
  el.btnReset.addEventListener("click", resetGame);
  el.btnGoEarn.addEventListener("click", () => showTab("earn"));
  el.tabGame.addEventListener("click", () => showTab("game"));
  el.tabEarn.addEventListener("click", () => showTab("earn"));

  el.betMinus.addEventListener("click", () => setBetInput(readBetInput() - 10));
  el.betPlus.addEventListener("click", () => setBetInput(readBetInput() + 10));

  el.chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    if (chip.dataset.bet) setBetInput(parseInt(chip.dataset.bet, 10));
    else if (chip.dataset.action === "half") setBetInput(Math.floor(DB.getBank() / 2));
    else if (chip.dataset.action === "max") setBetInput(DB.getBank());
  });

  el.betInput.addEventListener("input", () => {
    el.betInput.value = el.betInput.value.replace(/\D/g, "").slice(0, 9);
  });
  el.betInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      el.betInput.blur();
      deal();
    }
  });

  // Банк изменился (в том числе из мини-игры или другой вкладки) — перерисовать
  window.addEventListener("bank-changed", render);

  // ---------- Старт ----------

  deck = buildDeck();
  el.betInput.value = String(DB.getLastBet());
  setMessage(
    DB.getBank() < 1
      ? "Деньги закончились. Заработайте в мини-игре или начните заново"
      : "Сделайте ставку и нажмите «Раздать»"
  );
  render();
})();
