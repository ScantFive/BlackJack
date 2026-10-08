/*
 * Магазин фонов и карточек. Цены и проверка денег — в db.js.
 */
(function () {
  "use strict";

  if (!window.DB || window.DB.VERSION !== 3 || window.__BJ_BROKEN__) return;

  const shop = DB.connect("shop");
  const $ = (id) => document.getElementById(id);
  const grids = { bg: $("shop-bg"), cards: $("shop-cards") };

  function applySelection() {
    const sel = DB.getSelected();
    document.documentElement.setAttribute("data-cards", sel.cards);
    if (window.BG) BG.set(sel.bg);
  }

  function preview(kind, id) {
    const box = document.createElement("div");
    box.className = "preview";
    if (kind === "bg") {
      const c = document.createElement("canvas");
      c.width = 192;
      c.height = 108;
      box.appendChild(c);
      if (window.BG) BG.drawThumb(c, id);
    } else {
      const p = document.createElement("div");
      p.className = "card-preview";
      p.setAttribute("data-cards", id);
      p.innerHTML =
        '<div class="card"><span>A♠</span><span class="center">♠</span><span class="corner-bottom">A♠</span></div>' +
        '<div class="card red"><span>K♥</span><span class="center">♥</span><span class="corner-bottom">K♥</span></div>' +
        '<div class="card back"></div>';
      box.appendChild(p);
    }
    return box;
  }

  function render() {
    const owned = DB.getOwned();
    const sel = DB.getSelected();
    const bank = DB.getBank();

    Object.keys(grids).forEach((kind) => {
      const grid = grids[kind];
      grid.innerHTML = "";
      DB.SHOP[kind].forEach((item) => {
        const has = owned[kind].indexOf(item.id) >= 0;
        const on = sel[kind] === item.id;

        const card = document.createElement("div");
        card.className = "item" + (on ? " selected" : "");
        card.appendChild(preview(kind, item.id));

        const name = document.createElement("div");
        name.className = "item-name";
        name.textContent = item.name;
        card.appendChild(name);

        const btn = document.createElement("button");
        if (on) {
          btn.textContent = "Выбрано ✓";
          btn.disabled = true;
        } else if (has) {
          btn.textContent = "Выбрать";
          btn.className = "primary";
          btn.addEventListener("click", () => {
            shop.select(kind, item.id);
            applySelection();
          });
        } else {
          btn.textContent = "Купить за " + UI.money(item.price) + " ₽";
          btn.className = bank >= item.price ? "accent" : "short";
          btn.addEventListener("click", () => {
            const r = shop.buy(kind, item.id);
            if (r.ok) {
              shop.select(kind, item.id);
              applySelection();
              UI.showNotice("Куплено: " + item.name, "good");
            } else if (r.reason === "funds") {
              UI.showNotice("Не хватает " + UI.money(r.need) + " ₽. Добудьте руду или выиграйте в блэкджек", "bad");
            }
          });
        }
        card.appendChild(btn);
        grid.appendChild(card);
      });
    });
  }

  window.addEventListener("db-changed", () => {
    render();
    applySelection();
  });
  window.addEventListener("tab-changed", (e) => { if (e.detail === "shop") render(); });

  applySelection();
  render();
})();
