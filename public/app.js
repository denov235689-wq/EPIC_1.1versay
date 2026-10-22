const app = PaxtaGram.WebApp;
app.ready(); app.expand?.();
const API = location.origin;
const initData = app.initData;

async function api(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { "Content-Type": "application/json", "X-Init-Data": initData, ...(opts.headers || {}) } });
  return r.json();
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(window._t); window._t = setTimeout(() => t.classList.remove("show"), 2000);
}

function switchTab(tabId) {
  document.querySelectorAll("main .tab").forEach(x => x.classList.remove("active"));
  const target = document.getElementById(tabId);
  if (target) target.classList.add("active");
  document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach(item => {
    const text = item.querySelector("span").textContent.toLowerCase();
    if ((tabId === 'home' && text === 'home') || (tabId === 'contest' && text === 'leaderboard') || (tabId === 'keys' && text === 'earn')) item.classList.add("active");
  });
}

let balance = 0;
function setBalance(b) { balance = b; document.getElementById("bal").textContent = b; }

async function refreshMe() {
  const me = await api("/api/me");
  if (me.error) return toast("Auth error");
  setBalance(me.balance);
}

const TOPUPS = [{ stars: 10, coins: 100 }, { stars: 45, coins: 500 }, { stars: 80, coins: 1000 }, { stars: 150, coins: 2000 }];
function renderTopups() {
  const el = document.getElementById("topup-list"); el.innerHTML = "";
  TOPUPS.forEach(t => {
    const div = document.createElement("div");
    div.className = "list-card";
    div.innerHTML = `<div class="info"><div class="title">${t.coins} Coins</div><div class="price">${t.stars}⭐</div></div><button>Buy</button>`;
    div.querySelector("button").onclick = async () => {
      const r = await api("/api/topup/link", { method: "POST", body: JSON.stringify({ stars: t.stars }) });
      if (r.url) app.openInvoice(r.url, (status) => { if (status === "paid") { toast("Payment accepted!"); refreshMe(); } });
      else toast("Error: " + (r.error || "?"));
    };
    el.appendChild(div);
  });
}
document.getElementById("deposit-btn").onclick = () => { switchTab('home'); toast("Scroll down to top up!"); };

async function loadKeys() {
  const items = await api("/api/keys");
  const el = document.getElementById("keys-list"); el.innerHTML = "";
  if (!items.length) { el.innerHTML = "<p style='color:#8b8e96'>No keys yet.</p>"; return; }
  items.forEach(k => {
    const price = k.price_stars === 0 ? "FREE" : `${k.price_stars} coins`;
    const div = document.createElement("div");
    div.className = "list-card";
    div.innerHTML = `${k.photo_url ? `<img src="${k.photo_url}" />` : "<div style='width:50px;height:50px;background:#2a2d36;border-radius:10px'></div>"}<div class="info"><div class="title">${k.name}</div><div class="price">${price}</div></div><button>Open</button>`;
    div.querySelector("button").onclick = async () => {
      const r = await api(`/api/keys/${k.id}/open`, { method: "POST", body: "{}" });
      if (r.error) return toast(r.error);
      toast(`🎉 ${r.reward.title}`);
      if (r.reward.gift_photo) app.showPopup?.({ title: r.reward.title, message: "🎁 Gift", buttons: [{ type: "ok" }] });
      setBalance(r.balance);
    };
    el.appendChild(div);
  });
}

async function loadRocket() {
  const cfg = await api("/api/rocket");
  document.getElementById("winpct").textContent = cfg.win_pct + "%";
  const el = document.getElementById("rocket-bets"); el.innerHTML = "";
  [50, 100, 200, 500].filter(b => b >= cfg.min_bet && b <= cfg.max_bet).forEach(bet => {
    const b = document.createElement("button");
    b.className = "rocket-btn"; b.innerHTML = `<span>${bet} coins</span>`;
    b.onclick = async () => {
      const r = await api("/api/rocket/bet", { method: "POST", body: JSON.stringify({ bet }) });
      if (r.error) return toast(r.error);
      setBalance(r.balance);
      document.getElementById("rocket-result").innerHTML = r.win ? `<span style="color:#22c55e">🚀 Won! +${bet}</span>` : `<span style="color:#ef4444">💥 Crashed -${bet}</span>`;
    };
    el.appendChild(b);
  });
}

let minesState = { game_id: null, opened: [] };
document.getElementById("mines-start").onclick = async () => {
  const bet = Number(document.getElementById("mines-bet").value);
  const mines = Number(document.getElementById("mines-count").value);
  const r = await api("/api/mines/start", { method: "POST", body: JSON.stringify({ bet, mines }) });
  if (r.error) return toast(r.error);
  minesState = { game_id: r.game_id, opened: [] };
  setBalance(r.balance);
  renderMinesGrid(true);
  document.getElementById("mines-status").textContent = "Game started. Pick a cell!";
  document.getElementById("mines-cashout").style.display = "block";
};
function renderMinesGrid(active) {
  const grid = document.getElementById("mines-grid"); grid.innerHTML = "";
  for (let i = 0; i < 25; i++) {
    const cell = document.createElement("button");
    cell.className = "mine-cell"; cell.textContent = minesState.opened.includes(i) ? "💎" : "";
    cell.disabled = !active || minesState.opened.includes(i); cell.onclick = () => clickMine(i);
    grid.appendChild(cell);
  }
}
async function clickMine(i) {
  if (!minesState.game_id) return;
  const r = await api("/api/mines/click", { method: "POST", body: JSON.stringify({ game_id: minesState.game_id, cell: i }) });
  if (r.error) return toast(r.error);
  setBalance(r.balance);
  if (!r.safe) {
    document.getElementById("mines-status").innerHTML = "<span style='color:#ef4444'>💥 BOMB! You lost.</span>";
    minesState.opened.push(i); renderMinesGrid(false);
    const bombCell = document.getElementById("mines-grid").children[i];
    bombCell.classList.add("bomb"); bombCell.textContent = "💣";
    minesState = { game_id: null, opened: [] };
    document.getElementById("mines-cashout").style.display = "none"; return;
  }
  minesState.opened.push(i); renderMinesGrid(true);
  document.getElementById("mines-status").textContent = `✅ Safe! x${r.multiplier?.toFixed(2) || "1.00"}`;
  if (r.autoWon) {
    document.getElementById("mines-status").innerHTML = `<span style='color:#22c55e'>🎉 You won! +${r.payout}</span>`;
    minesState = { game_id: null, opened: [] };
    document.getElementById("mines-cashout").style.display = "none";
    renderMinesGrid(false);
  }
}
document.getElementById("mines-cashout").onclick = async () => {
  if (!minesState.game_id) return;
  const r = await api("/api/mines/cashout", { method: "POST", body: JSON.stringify({ game_id: minesState.game_id }) });
  if (r.error) return toast(r.error);
  setBalance(r.balance); toast(`💰 +${r.payout} coins`);
  minesState = { game_id: null, opened: [] };
  document.getElementById("mines-status").innerHTML = `<span style='color:#22c55e'>Cashed out: +${r.payout}</span>`;
  document.getElementById("mines-cashout").style.display = "none"; renderMinesGrid(false);
};

async function loadContest() {
  const c = await api("/api/contest");
  const el = document.getElementById("contest-list");
  if (!c.active) { el.innerHTML = "<p style='color:#8b8e96'>No active contest.</p>"; return; }
  if (!c.top.length) { el.innerHTML = "<p style='color:#8b8e96'>No participants yet.</p>"; return; }
  el.innerHTML = c.top.map((t, i) => `<div class="list-card" style="border-left:4px solid ${i===0?'gold':i===1?'silver':i===2?'#cd7f32':'transparent'}"><div class="info"><div class="title">${i + 1}. ${t.first_name || "User"}</div></div><div class="price">${t.stars_spent}⭐</div></div>`).join("");
}

async function loadAdmin() {
  if (!document.getElementById("s_rocket_win_pct")) return;
  const s = await api("/api/admin/settings");
  if (s.error) return;
  ["rocket_win_pct","mines_win_pct","rocket_min_bet","max_stars_all_games","contest_active"].forEach(k => { const el = document.getElementById("s_" + k); if (el) el.value = s[k] ?? 0; });
  const keys = await api("/api/admin/keys");
  const kel = document.getElementById("admin-keys-list"); kel.innerHTML = "";
  keys.forEach(k => {
    const div = document.createElement("div"); div.className = "list-card";
    div.innerHTML = `<div class="info"><div class="title">${k.name}</div><div class="price">${k.price_stars} coins</div></div><div style="display:flex;gap:4px"><button style="background:#f59e0b">+ Rew</button><button style="background:#ef4444">Del</button></div>`;
    div.querySelectorAll("button")[1].onclick = async () => { if (!confirm("Delete?")) return; await api(`/api/admin/keys/${k.id}`, { method: "DELETE" }); toast("Deleted"); loadAdmin(); loadKeys(); };
    kel.appendChild(div);
  });
  const gifts = await api("/api/admin/gifts");
  const gel = document.getElementById("admin-gifts-list"); gel.innerHTML = "";
  gifts.forEach(g => {
    const div = document.createElement("div"); div.className = "list-card";
    div.innerHTML = `<div class="info"><div class="title">${g.name}</div><div class="price">${g.rarity}</div></div><button style="background:#ef4444">Del</button>`;
    div.querySelector("button").onclick = async () => { if (!confirm("Delete?")) return; await api(`/api/admin/gifts/${g.id}`, { method: "DELETE" }); toast("Deleted"); loadAdmin(); };
    gel.appendChild(div);
  });
}

document.getElementById("save-settings").onclick = async () => {
  const body = {};
  ["rocket_win_pct","mines_win_pct","rocket_min_bet","max_stars_all_games","contest_active"].forEach(k => { const el = document.getElementById("s_" + k); if (el) body[k] = Number(el.value); });
  await api("/api/admin/settings", { method: "POST", body: JSON.stringify(body) });
  toast("Settings saved"); loadRocket();
};
document.getElementById("k_add").onclick = async () => {
  const name = document.getElementById("k_name").value.trim(); if (!name) return toast("Enter name");
  const price_stars = Number(document.getElementById("k_price").value) || 0;
  const photo_url = document.getElementById("k_photo").value.trim() || null;
  await api("/api/admin/keys", { method: "POST", body: JSON.stringify({ name, price_stars, photo_url }) });
  document.getElementById("k_name").value = ""; document.getElementById("k_price").value = ""; toast("Key added"); loadAdmin(); loadKeys();
};
document.getElementById("g_add").onclick = async () => {
  const name = document.getElementById("g_name").value.trim(); if (!name) return toast("Enter name");
  const photo = document.getElementById("g_photo").value.trim() || null;
  const price_stars = Number(document.getElementById("g_price").value) || 0;
  await api("/api/admin/gifts", { method: "POST", body: JSON.stringify({ name, photo, price_stars }) });
  document.getElementById("g_name").value = ""; document.getElementById("g_photo").value = ""; toast("Gift added"); loadAdmin();
};
document.getElementById("contest-finish").onclick = async () => {
  if (!confirm("Announce winners?")) return;
  const r = await api("/api/admin/contest/finish", { method: "POST", body: "{}" });
  toast(`Winners: ${r.winners.length}`); loadContest();
};

(async () => {
  await refreshMe(); renderTopups(); await loadKeys(); await loadRocket(); await loadContest(); await loadAdmin();
})();
