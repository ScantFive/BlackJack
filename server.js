import express from "express";
import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   БАЗА ДАННЫХ
   ========================= */
const db = new Database(path.join(__dirname, "blackjack.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 1000,
    hands_played INTEGER NOT NULL DEFAULT 0,
    hands_won INTEGER NOT NULL DEFAULT 0,
    hands_lost INTEGER NOT NULL DEFAULT 0,
    hands_pushed INTEGER NOT NULL DEFAULT 0,
    total_wagered INTEGER NOT NULL DEFAULT 0,
    total_won INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    bet INTEGER NOT NULL,
    player_cards TEXT NOT NULL,
    dealer_cards TEXT NOT NULL,
    player_total INTEGER NOT NULL,
    dealer_total INTEGER NOT NULL,
    outcome TEXT NOT NULL,
    payout INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (player_id) REFERENCES players(id)
  );

  CREATE TABLE IF NOT EXISTS active_games (
    player_id INTEGER PRIMARY KEY,
    deck TEXT NOT NULL,
    player_cards TEXT NOT NULL,
    dealer_cards TEXT NOT NULL,
    bet INTEGER NOT NULL,
    finished INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (player_id) REFERENCES players(id)
  );
`);

/* =========================
   УТИЛИТЫ
   ========================= */
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];

function newDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  // Криптостойкий shuffle (Fisher-Yates)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(rank) {
  if (rank === "A") return 11;
  if (["J","Q","K"].includes(rank)) return 10;
  return parseInt(rank, 10);
}

// Считает сумму с гибким тузом. Возвращает { total, soft }
function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.r);
    if (c.r === "A") aces++;
  }
  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  soft = aces > 0 && total <= 21;
  return { total, soft };
}

function isBlackjack(cards) {
  return cards.length === 2 && handTotal(cards).total === 21;
}

/* =========================
   АВТОРИЗАЦИЯ (упрощённая)
   ========================= */
function auth(req, res, next) {
  const token = req.headers["x-player-token"];
  if (!token) return res.status(401).json({ error: "Нет токена" });
  const player = db.prepare("SELECT * FROM players WHERE token = ?").get(token);
  if (!player) return res.status(401).json({ error: "Игрок не найден" });
  req.player = player;
  next();
}

/* =========================
   РЕГИСТРАЦИЯ / ПРОФИЛЬ
   ========================= */
app.post("/api/register", (req, res) => {
  const name = (req.body.name || "Игрок").toString().slice(0, 32);
  const token = crypto.randomBytes(24).toString("hex");
  const info = db.prepare(
    "INSERT INTO players (token, name) VALUES (?, ?)"
  ).run(token, name);
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(info.lastInsertRowid);
  res.json({ token, ...publicPlayer(player) });
});

app.get("/api/me", auth, (req, res) => {
  res.json(publicPlayer(req.player));
});

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    balance: p.balance,
    stats: {
      hands_played: p.hands_played,
      hands_won: p.hands_won,
      hands_lost: p.hands_lost,
      hands_pushed: p.hands_pushed,
      total_wagered: p.total_wagered,
      total_won: p.total_won,
    },
  };
}

/* =========================
   ИГРА
   ========================= */
app.post("/api/deal", auth, (req, res) => {
  const bet = parseInt(req.body.bet, 10);
  if (!Number.isInteger(bet) || bet <= 0) {
    return res.status(400).json({ error: "Неверная ставка" });
  }
  if (bet > req.player.balance) {
    return res.status(400).json({ error: "Недостаточно средств" });
  }

  // Если есть незавершённая игра — отказываем
  const existing = db.prepare(
    "SELECT * FROM active_games WHERE player_id = ? AND finished = 0"
  ).get(req.player.id);
  if (existing) {
    return res.status(400).json({ error: "У вас уже есть активная игра" });
  }

  const deck = newDeck();
  const playerCards = [deck.pop(), deck.pop()];
  const dealerCards = [deck.pop(), deck.pop()];

  db.prepare(
    "UPDATE players SET balance = balance - ?, total_wagered = total_wagered + ? WHERE id = ?"
  ).run(bet, bet, req.player.id);

  // Мгновенный блэкджек у игрока
  if (isBlackjack(playerCards)) {
    const dealerBJ = isBlackjack(dealerCards);
    let outcome, payout;
    if (dealerBJ) {
      outcome = "push";
      payout = bet;
    } else {
      outcome = "blackjack";
      payout = Math.floor(bet * 2.5); // ставка назад + 1.5 выигрыш
    }
    settleRound(req.player.id, bet, playerCards, dealerCards, outcome, payout);
    return res.json({
      state: "finished",
      playerCards,
      dealerCards,
      playerTotal: handTotal(playerCards).total,
      dealerTotal: handTotal(dealerCards).total,
      outcome,
      payout,
      balance: db.prepare("SELECT balance FROM players WHERE id = ?").get(req.player.id).balance,
    });
  }

  db.prepare(
    `INSERT INTO active_games (player_id, deck, player_cards, dealer_cards, bet, finished)
     VALUES (?, ?, ?, ?, ?, 0)`
  ).run(
    req.player.id,
    JSON.stringify(deck),
    JSON.stringify(playerCards),
    JSON.stringify(dealerCards),
    bet
  );

  res.json({
    state: "playing",
    playerCards,
    dealerCards: [dealerCards[0], { r: "?", s: "?" }], // скрытая карта
    playerTotal: handTotal(playerCards).total,
    dealerTotal: handTotal([dealerCards[0]]).total,
    bet,
  });
});

app.post("/api/hit", auth, (req, res) => {
  const game = db.prepare(
    "SELECT * FROM active_games WHERE player_id = ? AND finished = 0"
  ).get(req.player.id);
  if (!game) return res.status(400).json({ error: "Нет активной игры" });

  const deck = JSON.parse(game.deck);
  const playerCards = JSON.parse(game.player_cards);
  const dealerCards = JSON.parse(game.dealer_cards);

  playerCards.push(deck.pop());
  const { total } = handTotal(playerCards);

  if (total > 21) {
    // Bust — сразу завершаем
    settleRound(req.player.id, game.bet, playerCards, dealerCards, "bust", 0);
    return res.json({
      state: "finished",
      playerCards,
      dealerCards,
      playerTotal: total,
      dealerTotal: handTotal(dealerCards).total,
      outcome: "bust",
      payout: 0,
      balance: db.prepare("SELECT balance FROM players WHERE id = ?").get(req.player.id).balance,
    });
  }

  if (total === 21) {
    // Автоматически stand на 21
    return finishWithStand(req.player.id, game, playerCards, dealerCards, deck, res);
  }

  db.prepare(
    "UPDATE active_games SET deck = ?, player_cards = ? WHERE player_id = ?"
  ).run(JSON.stringify(deck), JSON.stringify(playerCards), req.player.id);

  res.json({
    state: "playing",
    playerCards,
    dealerCards: [dealerCards[0], { r: "?", s: "?" }],
    playerTotal: total,
    dealerTotal: handTotal([dealerCards[0]]).total,
    bet: game.bet,
  });
});

app.post("/api/stand", auth, (req, res) => {
  const game = db.prepare(
    "SELECT * FROM active_games WHERE player_id = ? AND finished = 0"
  ).get(req.player.id);
  if (!game) return res.status(400).json({ error: "Нет активной игры" });

  const deck = JSON.parse(game.deck);
  const playerCards = JSON.parse(game.player_cards);
  const dealerCards = JSON.parse(game.dealer_cards);

  finishWithStand(req.player.id, game, playerCards, dealerCards, deck, res);
});

function finishWithStand(playerId, game, playerCards, dealerCards, deck, res) {
  // Дилер добирает до 17 (стоит на всех 17, включая soft 17)
  while (handTotal(dealerCards).total < 17) {
    dealerCards.push(deck.pop());
  }

  const pTotal = handTotal(playerCards).total;
  const dTotal = handTotal(dealerCards).total;

  let outcome, payout;
  if (dTotal > 21) {
    outcome = "dealer_bust";
    payout = game.bet * 2;
  } else if (pTotal > dTotal) {
    outcome = "win";
    payout = game.bet * 2;
  } else if (pTotal < dTotal) {
    outcome = "lose";
    payout = 0;
  } else {
    outcome = "push";
    payout = game.bet;
  }

  settleRound(playerId, game.bet, playerCards, dealerCards, outcome, payout);

  res.json({
    state: "finished",
    playerCards,
    dealerCards,
    playerTotal: pTotal,
    dealerTotal: dTotal,
    outcome,
    payout,
    balance: db.prepare("SELECT balance FROM players WHERE id = ?").get(playerId).balance,
  });
}

function settleRound(playerId, bet, playerCards, dealerCards, outcome, payout) {
  const pTotal = handTotal(playerCards).total;
  const dTotal = handTotal(dealerCards).total;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE players SET
         balance = balance + ?,
         hands_played = hands_played + 1,
         hands_won = hands_won + ?,
         hands_lost = hands_lost + ?,
         hands_pushed = hands_pushed + ?,
         total_won = total_won + ?
       WHERE id = ?`
    ).run(
      payout,
      outcome === "win" || outcome === "blackjack" || outcome === "dealer_bust" ? 1 : 0,
      outcome === "lose" || outcome === "bust" ? 1 : 0,
      outcome === "push" ? 1 : 0,
      payout,
      playerId
    );

    db.prepare(
      `INSERT INTO rounds
         (player_id, bet, player_cards, dealer_cards, player_total, dealer_total, outcome, payout)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      playerId,
      bet,
      JSON.stringify(playerCards),
      JSON.stringify(dealerCards),
      pTotal,
      dTotal,
      outcome,
      payout
    );

    db.prepare("DELETE FROM active_games WHERE player_id = ?").run(playerId);
  });

  tx();
}

/* =========================
   ИСТОРИЯ
   ========================= */
app.get("/api/history", auth, (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM rounds WHERE player_id = ? ORDER BY id DESC LIMIT 20"
  ).all(req.player.id);
  res.json(rows.map(r => ({
    ...r,
    player_cards: JSON.parse(r.player_cards),
    dealer_cards: JSON.parse(r.dealer_cards),
  })));
});

/* =========================
   СБРОС (для тестов)
   ========================= */
app.post("/api/reset", auth, (req, res) => {
  db.prepare(
    `UPDATE players SET balance = 1000, hands_played = 0, hands_won = 0,
       hands_lost = 0, hands_pushed = 0, total_wagered = 0, total_won = 0
     WHERE id = ?`
  ).run(req.player.id);
  db.prepare("DELETE FROM rounds WHERE player_id = ?").run(req.player.id);
  db.prepare("DELETE FROM active_games WHERE player_id = ?").run(req.player.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Blackjack server: http://localhost:${PORT}`);
});
