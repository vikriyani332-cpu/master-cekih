/* ================================================================
   SCORE CEKIH — APP.JS
   Sadewa Corp — Vanilla JavaScript
   ================================================================ */

'use strict';

/* ======================== CONSTANTS ======================== */
const LS_KEY = 'scoreCekih_v7';
const ANIMAL_MAP = { 1: 'Dragon', 2: 'Tiger', 3: 'Eagle', 4: 'Qilin' };
const EFFECT_MAP = { 1: 'fire', 2: 'claw', 3: 'dive', 4: 'lightning' };
const SUIT_LABELS = { 1: '♠', 2: '♥', 3: '♦', 4: '♣' };
const AI_COMMENTS = [
  'Wah tipis banget selisihnya!',
  'Kayaknya ada yang mau comeback nih',
  'Hati-hati yang di bawah lagi ngintip!',
  'Situasi makin panas!',
  'Siapa yang bakal menang ya?',
  'Jangan santai dulu, masih panjang!',
  'Fokus fokus!',
  'Wah berbahaya ini!'
];
const ACHIEVEMENTS_DEF = [
  { id: 'tukanNgocok',  icon: '🃏', name: 'Tukang Ngocok Kartu',         desc: 'Skor pernah minus',          check: s => s.minusEver },
  { id: 'tukanBakar',   icon: '🔥', name: 'Tukang Bakar',                desc: 'Burns ≥ 3',                  check: s => s.burns >= 3 },
  { id: 'hariApes',     icon: '😵', name: 'Hari Apes Gak Ada Yang Tau',  desc: 'Burned ≥ 5',                 check: s => s.burned >= 5 },
  { id: 'dewaKartu',    icon: '🌟', name: 'Dewa Kartu',                   desc: 'Skor tertinggi ≥ 500',       check: s => s.highestScore >= 500 },
  { id: 'dewaDewa',     icon: '👑', name: 'Dewa Dari Segala Dewa',        desc: 'Bintang > 1',                check: s => s.stars > 1 },
  { id: 'tripleBurn',   icon: '💥', name: 'Triple Burn',                  desc: 'Triple Burn pernah terjadi', check: s => s.tripleBurn > 0 }
];

/* ======================== STATE ======================== */
let gameState = defaultState();
let undoStack = [];
let bgMusic = null;
let bgMusicVolume = 1.0;
let bgMusicOn = true;
let rewardVideoTimer = null;
let negativeAudioPlaying = null;
let klikAudio = null;
let chartInstance = null;

function defaultState() {
  return {
    screen: 'setup', // 'setup' | 'game'
    round: 1,
    turn: 1,
    target: 1000,
    players: [],          // [{name, score, stars, rank, prevRank, borderRank, waterRank, burns, burned, tripleBurn, highestScore, minusEver, isInRecoveryMode, recoveryStartTurn, consecutiveMinus, consecutiveMinusAudioPlayed, chaseTargets}]
    history: [],          // [{round, turn, scores, burns, burnDetails}]
    burnCandidates: [],   // [{attackerId, victimId, attackerName, victimName}]
    burnConfirmed: false,
    chartData: [],        // [{round, turn, scores:[]}]
    playerArchive: {},    // {name: {stars, burns, burned, tripleBurn, highestScore, minusEver}}
    achievements: {},     // {name: [achievementId]}
    prevRankings: null,   // rankings before current turn (for burn detection)
    firstTurnOfRound: true,
    currentBurnStep: 0,
    audioQueue: [],
  };
}

/* ======================== INIT ======================== */
window.addEventListener('load', () => {
  initBgMusic();
  runLoadingScreen(() => {
    loadFromLS();
    render();
    setupEventListeners();
    registerSW();
  });
});

function runLoadingScreen(cb) {
  const bar = document.getElementById('loadingBar');
  const txt = document.getElementById('loadingText');
  const screen = document.getElementById('loadingScreen');
  const steps = ['Memuat aset...', 'Membaca data...', 'Memulihkan sesi...', 'Siap!'];
  let p = 0;
  const iv = setInterval(() => {
    p += 22;
    if (p > 100) p = 100;
    bar.style.width = p + '%';
    txt.textContent = steps[Math.min(Math.floor(p / 25), steps.length - 1)];
    if (p >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        cb();
        screen.classList.add('fade-out');
        setTimeout(() => { screen.style.display = 'none'; }, 850);
      }, 400);
    }
  }, 120);
}

/* ======================== LOCALSTORAGE ======================== */
function saveToLS() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      gameState,
      bgMusicOn,
      bgMusicVolume
    }));
  } catch(e) {}
}

function loadFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.gameState) gameState = Object.assign(defaultState(), data.gameState);
    if (typeof data.bgMusicOn === 'boolean') bgMusicOn = data.bgMusicOn;
    if (typeof data.bgMusicVolume === 'number') bgMusicVolume = data.bgMusicVolume;
    // ensure players have all fields
    if (gameState.players) {
      gameState.players = gameState.players.map(p => ensurePlayerFields(p));
    }
  } catch(e) { gameState = defaultState(); }
}

function ensurePlayerFields(p) {
  return Object.assign({
    name: '', score: 0, stars: 0, rank: 1, prevRank: 1, borderRank: 1, waterRank: 1,
    burns: 0, burned: 0, tripleBurn: 0, highestScore: 0, minusEver: false,
    isInRecoveryMode: false, recoveryStartTurn: null, consecutiveMinus: 0,
    consecutiveMinusAudioPlayed: false, chaseTargets: []
  }, p);
}

/* ======================== RENDER ENGINE ======================== */
function render() {
  const app = document.getElementById('app');
  app.classList.remove('hidden');
  if (gameState.screen === 'setup') {
    document.getElementById('setupScreen').classList.remove('hidden');
    document.getElementById('gameScreen').classList.add('hidden');
  } else {
    document.getElementById('setupScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    renderHeader();
    renderCards();
    renderBurnSection();
    renderRankingTab();
    renderHistoryTab();
    renderAchievementsTab();
    renderStatsTab();
    renderArchiveTab();
    renderChartTab();
    renderAI();
    updateBgMusicButton();
  }
}

function renderHeader() {
  document.getElementById('headerRound').textContent =
    `Ronde ${gameState.round} · Turn ${gameState.turn}`;
}

function renderCards() {
  const grid = document.getElementById('cardsGrid');
  grid.innerHTML = '';
  gameState.players.forEach((p, i) => {
    const card = buildPlayerCard(p, i);
    grid.appendChild(card);
  });
}

function buildPlayerCard(p, idx) {
  const card = document.createElement('div');
  card.className = `player-card rank-${p.rank}`;
  card.id = `card-${idx}`;

  // Border frame (by rank)
  const borderImg = document.createElement('img');
  borderImg.className = 'card-border-frame';
  borderImg.src = `images/border_${p.borderRank}.png`;
  borderImg.alt = '';
  borderImg.onerror = () => { borderImg.style.display = 'none'; };
  card.appendChild(borderImg);

  // Watermark
  const wmImg = document.createElement('img');
  wmImg.className = 'card-watermark';
  wmImg.src = `images/card_${p.waterRank}.png`;
  wmImg.alt = '';
  wmImg.onerror = () => { wmImg.style.display = 'none'; };
  card.appendChild(wmImg);

  // Content wrapper
  const content = document.createElement('div');
  content.className = 'card-content';

  // TOP ROW
  const top = document.createElement('div');
  top.className = 'card-top';

  const rankBadge = document.createElement('div');
  rankBadge.className = `rank-badge r${p.rank}`;
  rankBadge.id = `rankBadge-${idx}`;
  rankBadge.textContent = `#${p.rank}`;

  const rightTop = document.createElement('div');
  rightTop.style.cssText = 'display:flex;align-items:center;gap:4px';

  const starsEl = document.createElement('span');
  starsEl.className = 'card-stars';
  starsEl.textContent = '⭐'.repeat(p.stars) || '';

  const rtLabel = document.createElement('span');
  rtLabel.className = 'card-round-turn';
  rtLabel.textContent = `R${gameState.round}T${gameState.turn}`;

  rightTop.appendChild(starsEl);
  rightTop.appendChild(rtLabel);
  top.appendChild(rankBadge);
  top.appendChild(rightTop);
  content.appendChild(top);

  // NAME
  const nameEl = document.createElement('div');
  nameEl.className = 'card-name';
  nameEl.textContent = p.name;
  content.appendChild(nameEl);

  // SCORE
  const scoreEl = document.createElement('div');
  scoreEl.className = 'card-score' + (p.score < 0 ? ' negative' : '');
  scoreEl.id = `score-display-${idx}`;
  scoreEl.textContent = p.score;
  content.appendChild(scoreEl);

  // BADGES
  const badges = document.createElement('div');
  badges.className = 'card-badges';
  if (p.isInRecoveryMode) {
    const rb = document.createElement('span');
    rb.className = 'badge badge-recovery';
    rb.textContent = '🔄 Recovery';
    badges.appendChild(rb);
  }
  // Danger badge
  const db = document.createElement('span');
  db.className = 'badge ' + getDangerClass(p, gameState.target);
  db.textContent = getDangerLabel(p, gameState.target);
  badges.appendChild(db);
  // Thumbs down if negative
  if (p.score < 0) {
    const td = document.createElement('span');
    td.className = 'badge badge-thumbsdown';
    td.textContent = '👎';
    badges.appendChild(td);
  }
  content.appendChild(badges);

  // PROGRESS BAR
  const pwrap = document.createElement('div');
  pwrap.className = 'card-progress-wrap';
  const pbar = document.createElement('div');
  pbar.className = 'card-progress-bar';
  const pct = Math.max(0, Math.min(100, (p.score / gameState.target) * 100));
  pbar.style.width = pct + '%';
  pwrap.appendChild(pbar);
  content.appendChild(pwrap);

  // SCORE INPUT
  const inputRow = document.createElement('div');
  inputRow.className = 'card-input-row';
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.className = 'card-score-input';
  inp.id = `input-${idx}`;
  inp.placeholder = '+/-';
  inp.min = -9999;
  inp.max = 1000;
  inp.addEventListener('focus', () => inp.select());
  inputRow.appendChild(inp);
  content.appendChild(inputRow);

  card.appendChild(content);
  return card;
}

function getDangerClass(p, target) {
  const pct = p.score / target;
  if (pct < 0) return 'badge-danger-critical';
  if (pct < 0.3) return 'badge-danger-safe';
  if (pct < 0.6) return 'badge-danger-caution';
  if (pct < 0.85) return 'badge-danger-danger';
  return 'badge-danger-critical';
}
function getDangerLabel(p, target) {
  const pct = p.score / target;
  if (pct < 0) return '🔴 Critical';
  if (pct < 0.3) return '🟢 Safe';
  if (pct < 0.6) return '🟡 Caution';
  if (pct < 0.85) return '🟠 Danger';
  return '🔴 Critical';
}

function renderBurnSection() {
  const sec = document.getElementById('burnSection');
  const list = document.getElementById('burnCandidatesList');
  list.innerHTML = '';
  if (gameState.burnCandidates && gameState.burnCandidates.length > 0 && !gameState.burnConfirmed) {
    sec.classList.remove('hidden');
    gameState.burnCandidates.forEach(bc => {
      const item = document.createElement('div');
      item.className = 'burn-candidate-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `burn-cb-${bc.attackerId}-${bc.victimId}`;
      cb.dataset.attacker = bc.attackerId;
      cb.dataset.victim = bc.victimId;
      cb.checked = true;
      const lbl = document.createElement('label');
      lbl.className = 'burn-candidate-text';
      lbl.htmlFor = cb.id;
      lbl.innerHTML = `🔥 <strong>${bc.attackerName}</strong> membakar <strong>${bc.victimName}</strong>`;
      item.appendChild(cb);
      item.appendChild(lbl);
      list.appendChild(item);
    });
  } else {
    sec.classList.add('hidden');
  }
}

function renderRankingTab() {
  const el = document.getElementById('rankingList');
  el.innerHTML = '';
  const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
  sorted.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'ranking-item';
    const posIcons = ['🥇', '🥈', '🥉', '4️⃣'];
    item.innerHTML = `
      <div class="ranking-pos">${posIcons[i] || (i+1)}</div>
      <div class="ranking-name">${escHtml(p.name)}</div>
      <div class="ranking-score ${p.score < 0 ? 'neg' : ''}">${p.score}</div>
      <div class="ranking-stars">${'⭐'.repeat(p.stars)}</div>
    `;
    el.appendChild(item);
  });
}

function renderHistoryTab() {
  const el = document.getElementById('historyList');
  el.innerHTML = '';
  const hist = [...gameState.history].reverse();
  hist.forEach(h => {
    const item = document.createElement('div');
    item.className = 'history-item';
    let scoresHtml = h.scores.map(s => {
      const sign = s.delta > 0 ? '+' : '';
      const cls = s.delta > 0 ? 'pos' : (s.delta < 0 ? 'neg' : '');
      return `<span class="h-score-entry ${cls}">${escHtml(s.name)}: ${sign}${s.delta} (${s.total})</span>`;
    }).join('');
    let burnsHtml = '';
    if (h.burns && h.burns.length > 0) {
      burnsHtml = h.burns.map(b => `<div class="h-burn">🔥 ${escHtml(b.attackerName)} membakar ${escHtml(b.victimName)}</div>`).join('');
    }
    item.innerHTML = `
      <div class="h-turn">Ronde ${h.round} · Turn ${h.turn}</div>
      <div class="h-scores">${scoresHtml}</div>
      ${burnsHtml}
    `;
    el.appendChild(item);
  });
}

function renderAchievementsTab() {
  const el = document.getElementById('achievementList');
  el.innerHTML = '';
  // Collect all unlocked for all players
  const unlockedMap = {}; // {achievementId: [playerName]}
  Object.entries(gameState.playerArchive).forEach(([name, stats]) => {
    ACHIEVEMENTS_DEF.forEach(a => {
      if (a.check(stats)) {
        if (!unlockedMap[a.id]) unlockedMap[a.id] = [];
        if (!unlockedMap[a.id].includes(name)) unlockedMap[a.id].push(name);
      }
    });
  });
  ACHIEVEMENTS_DEF.forEach(a => {
    const unlocked = unlockedMap[a.id] && unlockedMap[a.id].length > 0;
    const item = document.createElement('div');
    item.className = 'achievement-item' + (unlocked ? ' unlocked' : ' achievement-locked');
    item.innerHTML = `
      <div class="achievement-icon">${a.icon}</div>
      <div class="achievement-info">
        <div class="achievement-name">${escHtml(a.name)}</div>
        <div class="achievement-desc">${escHtml(a.desc)}</div>
        ${unlocked ? `<div class="achievement-who">🏅 ${unlockedMap[a.id].map(escHtml).join(', ')}</div>` : ''}
      </div>
    `;
    el.appendChild(item);
  });
}

function renderStatsTab() {
  const el = document.getElementById('statsList');
  el.innerHTML = '';
  gameState.players.forEach(p => {
    const arch = gameState.playerArchive[p.name] || {};
    const item = document.createElement('div');
    item.className = 'stats-player';
    item.innerHTML = `
      <div class="stats-player-name">${escHtml(p.name)}</div>
      <div class="stats-row">
        <div class="stats-entry">⭐ Bintang: <span>${arch.stars || 0}</span></div>
        <div class="stats-entry">🔥 Burns: <span>${arch.burns || 0}</span></div>
        <div class="stats-entry">💀 Terbakar: <span>${arch.burned || 0}</span></div>
        <div class="stats-entry">💥 Triple: <span>${arch.tripleBurn || 0}</span></div>
        <div class="stats-entry">🏆 Skor Tertinggi: <span>${arch.highestScore || 0}</span></div>
      </div>
    `;
    el.appendChild(item);
  });
}

function renderArchiveTab() {
  const el = document.getElementById('archiveList');
  el.innerHTML = '';
  const avatars = ['♠', '♥', '♦', '♣', '🃏', '🎴'];
  Object.entries(gameState.playerArchive).forEach(([name, stats], i) => {
    const item = document.createElement('div');
    item.className = 'archive-item';
    item.innerHTML = `
      <div class="archive-avatar" style="color:${i%2===0?'#f5f5f5':'#e74c3c'}">${avatars[i % avatars.length]}</div>
      <div class="archive-info">
        <div class="archive-name">${escHtml(name)}</div>
        <div class="archive-stats">⭐${stats.stars||0} 🔥${stats.burns||0} 💀${stats.burned||0} 💥Triple:${stats.tripleBurn||0} 🏆${stats.highestScore||0}</div>
      </div>
    `;
    el.appendChild(item);
  });
}

function renderChartTab() {
  const canvas = document.getElementById('scoreChart');
  const ctx = canvas.getContext('2d');

  if (gameState.chartData.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 16;
  const H = 220;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.roundRect && ctx.roundRect(0, 0, W, H, 8);
  ctx.fill();

  const colors = ['#f0c040', '#c0c0c0', '#cd7f32', '#e53935'];
  const labels = gameState.chartData.map(d => `R${d.round}T${d.turn}`);
  const allScores = gameState.chartData.flatMap(d => d.scores);
  const minS = Math.min(0, ...allScores);
  const maxS = Math.max(gameState.target, ...allScores);
  const pad = { top: 20, right: 12, bottom: 30, left: 38 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const xOf = (i) => pad.left + (gameState.chartData.length <= 1 ? cW / 2 : (i / (gameState.chartData.length - 1)) * cW);
  const yOf = (v) => pad.top + cH - ((v - minS) / (maxS - minS || 1)) * cH;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = pad.top + (g / 4) * cH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const val = Math.round(maxS - (g / 4) * (maxS - minS));
    ctx.fillStyle = 'rgba(200,200,200,0.5)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val, pad.left - 3, y + 3);
  }

  // Target line
  ctx.strokeStyle = 'rgba(240,192,64,0.3)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, yOf(gameState.target));
  ctx.lineTo(W - pad.right, yOf(gameState.target));
  ctx.stroke();
  ctx.setLineDash([]);

  // Lines per player
  gameState.players.forEach((pl, pi) => {
    const pts = gameState.chartData.map(d => d.scores[pi] !== undefined ? d.scores[pi] : 0);
    ctx.strokeStyle = colors[pi % colors.length];
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((v, i) => {
      const x = xOf(i), y = yOf(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    // Dots
    pts.forEach((v, i) => {
      ctx.fillStyle = colors[pi % colors.length];
      ctx.beginPath();
      ctx.arc(xOf(i), yOf(v), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // X labels (last few)
  const showEvery = Math.max(1, Math.floor(gameState.chartData.length / 5));
  ctx.fillStyle = 'rgba(200,200,200,0.5)';
  ctx.font = '8px sans-serif';
  ctx.textAlign = 'center';
  labels.forEach((lbl, i) => {
    if (i % showEvery === 0 || i === labels.length - 1) {
      ctx.fillText(lbl, xOf(i), H - 8);
    }
  });

  // Legend
  gameState.players.forEach((pl, pi) => {
    ctx.fillStyle = colors[pi % colors.length];
    ctx.fillRect(pad.left + pi * 70, 5, 10, 8);
    ctx.fillStyle = 'rgba(200,200,200,0.7)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(pl.name.substring(0, 8), pad.left + pi * 70 + 13, 13);
  });
}

function renderAI() {
  // AI comment is updated separately
}

/* ======================== CALCULATIONS ======================== */

function calculateRanking(players) {
  // Returns array of ranks (1-indexed) corresponding to player index
  const sorted = [...players]
    .map((p, i) => ({ i, score: p.score }))
    .sort((a, b) => b.score - a.score);
  const ranks = new Array(players.length);
  let currentRank = 1;
  for (let j = 0; j < sorted.length; j++) {
    if (j > 0 && sorted[j].score === sorted[j - 1].score) {
      ranks[sorted[j].i] = ranks[sorted[j - 1].i];
    } else {
      ranks[sorted[j].i] = currentRank;
    }
    currentRank++;
  }
  return ranks;
}

function assignBorderRanks(players) {
  // border/water rank = player's current rank (1-4)
  players.forEach(p => {
    p.borderRank = Math.min(4, Math.max(1, p.rank));
    p.waterRank = Math.min(4, Math.max(1, p.rank));
  });
}

function detectBurnCandidates(playersBefore, playersAfter, firstTurnOfRound) {
  if (firstTurnOfRound) return [];
  const candidates = [];
  const n = playersBefore.length;

  // For each pair: attacker (who rose in rank), victim (who they passed)
  for (let ai = 0; ai < n; ai++) {
    const aBefore = playersBefore[ai];
    const aAfter = playersAfter[ai];
    // Attacker must rise in rank (lower rank number = higher position)
    if (aAfter.rank >= aBefore.rank) continue; // didn't rise

    for (let vi = 0; vi < n; vi++) {
      if (vi === ai) continue;
      const vBefore = playersBefore[vi];
      const vAfter = playersAfter[vi];

      // Victim was above attacker before
      if (vBefore.rank >= aBefore.rank) continue; // victim was not above attacker
      // Victim is now below attacker
      if (vAfter.rank <= aAfter.rank) continue; // victim still above or equal

      // Victim score > 0
      if (vAfter.score <= 0) continue;

      // Victim NOT in Recovery Mode
      if (vAfter.isInRecoveryMode) continue;

      // Check for former recovery — if both exited recovery this turn
      const aWasRecovery = aBefore.isInRecoveryMode;
      const vWasRecovery = vBefore.isInRecoveryMode;
      // If both were in recovery and now both exited, they can't burn each other this turn
      if (aWasRecovery && vWasRecovery && !aAfter.isInRecoveryMode && !vAfter.isInRecoveryMode) continue;

      // Duplicate check
      const dup = candidates.some(c => c.attackerId === ai && c.victimId === vi);
      if (!dup) {
        candidates.push({
          attackerId: ai,
          victimId: vi,
          attackerName: aAfter.name,
          victimName: vAfter.name
        });
      }
    }
  }
  return candidates;
}

function updateRecoveryStatus(players, currentTurn) {
  players.forEach(p => {
    if (p.isInRecoveryMode && p.recoveryStartTurn !== null) {
      // Recovery lasts 1 full turn after burn turn
      // If currentTurn > recoveryStartTurn + 1, exit recovery
      if (currentTurn > p.recoveryStartTurn + 1) {
        p.isInRecoveryMode = false;
        p.recoveryStartTurn = null;
      }
    }
  });
}

function processBurn(players, selectedVictimIds, currentTurn) {
  // Group by attacker to detect triple burn
  const attackerVictims = {};
  selectedVictimIds.forEach(({ attackerId, victimId }) => {
    if (!attackerVictims[attackerId]) attackerVictims[attackerId] = [];
    attackerVictims[attackerId].push(victimId);
  });

  const burnResults = [];
  Object.entries(attackerVictims).forEach(([aId, vIds]) => {
    const attacker = players[parseInt(aId)];
    const isTriple = vIds.length >= 3;
    if (isTriple) attacker.tripleBurn = (attacker.tripleBurn || 0) + 1;
    attacker.burns = (attacker.burns || 0) + vIds.length;

    vIds.forEach(vId => {
      const victim = players[vId];
      victim.score = 0;
      victim.burned = (victim.burned || 0) + 1;
      victim.isInRecoveryMode = true;
      victim.recoveryStartTurn = currentTurn;
      burnResults.push({
        attackerId: parseInt(aId),
        victimId: vId,
        attackerName: attacker.name,
        victimName: victim.name,
        isTriple
      });
    });
  });
  return burnResults;
}

/* ======================== EVENT LISTENERS ======================== */
function setupEventListeners() {
  // Setup screen
  document.getElementById('startGameBtn').addEventListener('click', () => {
    playKlik();
    startGame();
  });

  document.querySelectorAll('.target-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playKlik();
      document.querySelectorAll('.target-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.val;
      const customInput = document.getElementById('customTarget');
      if (val === 'custom') {
        customInput.classList.remove('hidden');
      } else {
        customInput.classList.add('hidden');
        gameState.target = parseInt(val);
      }
    });
  });

  // New round target buttons
  document.querySelectorAll('#newRoundTargetOptions .target-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playKlik();
      document.querySelectorAll('#newRoundTargetOptions .target-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.val;
      const customInput = document.getElementById('newRoundCustomTarget');
      if (val === 'custom') {
        customInput.classList.remove('hidden');
      } else {
        customInput.classList.add('hidden');
      }
    });
  });

  // Game buttons
  document.getElementById('saveTurnBtn').addEventListener('click', () => {
    playKlik();
    saveTurn();
  });

  document.getElementById('confirmBurnBtn').addEventListener('click', () => {
    playKlik();
    confirmBurn();
  });

  document.getElementById('skipBurnBtn').addEventListener('click', () => {
    playKlik();
    skipBurn();
  });

  document.getElementById('undoBtn').addEventListener('click', () => {
    playKlik();
    doUndo();
  });

  document.getElementById('editNameBtn').addEventListener('click', () => {
    playKlik();
    openEditName();
  });

  document.getElementById('editNameCancel').addEventListener('click', () => {
    playKlik();
    document.getElementById('editNameModal').classList.add('hidden');
  });

  document.getElementById('editNameSave').addEventListener('click', () => {
    playKlik();
    saveEditName();
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    playKlik();
    document.getElementById('resetModal').classList.remove('hidden');
  });

  document.getElementById('resetCancel').addEventListener('click', () => {
    playKlik();
    document.getElementById('resetModal').classList.add('hidden');
  });

  document.getElementById('resetConfirm').addEventListener('click', () => {
    playKlik();
    resetGame();
  });

  document.getElementById('bgMusicToggle').addEventListener('click', () => {
    playKlik();
    toggleBgMusic();
  });

  document.getElementById('screenshotBtn').addEventListener('click', () => {
    playKlik();
    takeScreenshot();
  });

  document.getElementById('fullscreenBtn').addEventListener('click', () => {
    playKlik();
    toggleFullscreen();
  });

  document.getElementById('newRoundStart').addEventListener('click', () => {
    playKlik();
    startNewRound();
  });

  // Reward overlay skip
  document.getElementById('rewardOverlay').addEventListener('click', () => {
    skipRewardVideo();
  });

  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playKlik();
      switchTab(btn.dataset.tab);
    });
  });
}

/* ======================== GAME LOGIC ======================== */
function startGame() {
  const names = [
    document.getElementById('setupNameA').value.trim() || 'Pemain A',
    document.getElementById('setupNameB').value.trim() || 'Pemain B',
    document.getElementById('setupNameC').value.trim() || 'Pemain C',
    document.getElementById('setupNameD').value.trim() || 'Pemain D'
  ];

  // Check custom target
  const customVal = document.getElementById('customTarget').value;
  const activeBtn = document.querySelector('#setupScreen .target-btn.active');
  if (activeBtn && activeBtn.dataset.val === 'custom' && customVal) {
    gameState.target = parseInt(customVal) || 1000;
  } else if (activeBtn && activeBtn.dataset.val !== 'custom') {
    gameState.target = parseInt(activeBtn.dataset.val) || 1000;
  }

  gameState.players = names.map((name, i) => {
    const archData = gameState.playerArchive[name] || {};
    return ensurePlayerFields({
      name,
      score: 0,
      stars: archData.stars || 0,
      rank: i + 1,
      prevRank: i + 1,
      borderRank: i + 1,
      waterRank: i + 1,
      burns: archData.burns || 0,
      burned: archData.burned || 0,
      tripleBurn: archData.tripleBurn || 0,
      highestScore: archData.highestScore || 0,
      minusEver: archData.minusEver || false,
      isInRecoveryMode: false,
      recoveryStartTurn: null,
      consecutiveMinus: 0,
      consecutiveMinusAudioPlayed: false,
      chaseTargets: []
    });
  });

  // Initialize archive for these players
  names.forEach(name => {
    if (!gameState.playerArchive[name]) {
      gameState.playerArchive[name] = { stars: 0, burns: 0, burned: 0, tripleBurn: 0, highestScore: 0, minusEver: false };
    }
  });

  // Initial ranking
  const ranks = calculateRanking(gameState.players);
  gameState.players.forEach((p, i) => {
    p.rank = ranks[i];
    p.prevRank = ranks[i];
  });
  assignBorderRanks(gameState.players);

  gameState.screen = 'game';
  gameState.round = 1;
  gameState.turn = 1;
  gameState.history = [];
  gameState.burnCandidates = [];
  gameState.burnConfirmed = false;
  gameState.chartData = [];
  gameState.prevRankings = null;
  gameState.firstTurnOfRound = true;

  saveToLS();
  render();

  setTimeout(() => {
    speakWithDuck('Permainan dimulai');
  }, 300);
}

function saveTurn() {
  // Read inputs
  const inputs = gameState.players.map((p, i) => {
    const el = document.getElementById(`input-${i}`);
    const val = el ? parseFloat(el.value) || 0 : 0;
    return Math.min(1000, val); // Positive max 1000
  });

  // All must be filled (or 0)
  // Create snapshot for undo
  const snapshot = deepClone(gameState);
  undoStack.push(snapshot);
  if (undoStack.length > 30) undoStack.shift();

  // Save prevRankings before applying
  const playersBefore = deepClone(gameState.players);

  // Check recovery status BEFORE applying scores (recovery expiry)
  updateRecoveryStatus(gameState.players, gameState.turn);

  // Update recovery flags post-expiry (for burn detection)
  const playersBeforeAfterRecovery = deepClone(gameState.players);

  // Apply scores
  inputs.forEach((delta, i) => {
    const p = gameState.players[i];
    p.score += delta;

    // Track consecutive minus
    if (p.score < 0) {
      p.consecutiveMinus = (p.consecutiveMinus || 0) + 1;
      p.minusEver = true;
    } else {
      p.consecutiveMinus = 0;
      p.consecutiveMinusAudioPlayed = false;
    }

    // Highest score
    if (p.score > p.highestScore) p.highestScore = p.score;
  });

  // Recalculate ranking
  const newRanks = calculateRanking(gameState.players);
  gameState.players.forEach((p, i) => {
    p.prevRank = p.rank;
    p.rank = newRanks[i];
  });
  assignBorderRanks(gameState.players);

  // Detect burns
  const playersAfterCopy = deepClone(gameState.players);
  const candidates = detectBurnCandidates(playersBeforeAfterRecovery, playersAfterCopy, gameState.firstTurnOfRound);
  gameState.burnCandidates = candidates;
  gameState.burnConfirmed = false;

  // Chart data
  gameState.chartData.push({
    round: gameState.round,
    turn: gameState.turn,
    scores: gameState.players.map(p => p.score)
  });

  // History entry
  const histEntry = {
    round: gameState.round,
    turn: gameState.turn,
    scores: inputs.map((delta, i) => ({
      name: gameState.players[i].name,
      delta,
      total: gameState.players[i].score
    })),
    burns: []
  };
  gameState.history.push(histEntry);

  // Update archive
  syncArchive();

  // After first turn of new round, disable firstTurnOfRound flag
  if (gameState.firstTurnOfRound) {
    gameState.firstTurnOfRound = false;
  }

  // Clear inputs
  gameState.players.forEach((p, i) => {
    const el = document.getElementById(`input-${i}`);
    if (el) el.value = '';
  });

  // Animate card flip
  gameState.players.forEach((p, i) => {
    const card = document.getElementById(`card-${i}`);
    if (card) {
      card.classList.remove('flip-anim');
      void card.offsetWidth;
      card.classList.add('flip-anim');
      setTimeout(() => card.classList.remove('flip-anim'), 700);
    }
  });

  // Animate score counter
  animateScoreCounters();

  // Rank badge bounce if rank changed
  gameState.players.forEach((p, i) => {
    if (p.rank !== p.prevRank) {
      const badge = document.getElementById(`rankBadge-${i}`);
      if (badge) {
        badge.classList.remove('bounce');
        void badge.offsetWidth;
        badge.classList.add('bounce');
        setTimeout(() => badge.classList.remove('bounce'), 600);
      }
    }
  });

  // AI comment
  updateAIComment();

  saveToLS();
  render();

  // Check if any winner (but don't process audio yet — wait for burn confirmation if needed)
  // Audio sequence handled after burn or immediately if no burns
  if (candidates.length === 0) {
    // No burns — start audio sequence immediately
    startNosBurnAudioSequence();
  }
  // If burns exist, audio starts after CONFIRM BURN is clicked
}

function startNosBurnAudioSequence() {
  // Check for 3 consecutive minus streaks
  checkConsecutiveMinus();

  // Check winner
  const winner = gameState.players.find(p => p.score >= gameState.target);
  if (winner) {
    handleWinner(winner);
    return;
  }

  // Shuffle card TTS
  const shuffler = findShuffler();
  const queue = [];
  queue.push({ type: 'tts', text: `${shuffler.name} tolong kocok kartunya ya` });
  gameState.players.forEach(p => {
    queue.push({ type: 'tts', text: `${p.name} mendapatkan ${numberToBahasa(p.score)} poin` });
  });
  queue.push({ type: 'tts', text: randomAIComment() });

  // After queue finishes, advance turn
  playQueue(queue, () => {
    advanceTurn();
  });
}

function checkConsecutiveMinus() {
  gameState.players.forEach(p => {
    if (p.consecutiveMinus >= 3 && !p.consecutiveMinusAudioPlayed) {
      p.consecutiveMinusAudioPlayed = true;
      playWavWithDuck('audio/kok_minus_terus_sih_gamau_menang.wav');
    }
    // Also check repeated burn
    if (p.burned > 0 && p.score === 0) {
      // Will play mulai dari 0 separately after burns
    }
  });
}

function confirmBurn() {
  if (!gameState.burnCandidates || gameState.burnCandidates.length === 0) return;

  // Get checked
  const checked = [];
  gameState.burnCandidates.forEach(bc => {
    const cb = document.getElementById(`burn-cb-${bc.attackerId}-${bc.victimId}`);
    if (cb && cb.checked) {
      checked.push({ attackerId: bc.attackerId, victimId: bc.victimId });
    }
  });

  if (checked.length === 0) {
    skipBurn();
    return;
  }

  // Create snapshot for undo (before executing burns)
  const snapshot = deepClone(gameState);
  undoStack.push(snapshot);
  if (undoStack.length > 30) undoStack.shift();

  // Process burns
  const burnResults = processBurn(gameState.players, checked, gameState.turn);
  gameState.burnConfirmed = true;

  // Store burns in history
  const lastHistory = gameState.history[gameState.history.length - 1];
  if (lastHistory) lastHistory.burns = burnResults;

  // Recalculate rankings after burns
  const newRanks = calculateRanking(gameState.players);
  gameState.players.forEach((p, i) => { p.rank = newRanks[i]; });
  assignBorderRanks(gameState.players);

  // Update chart last entry with new scores
  if (gameState.chartData.length > 0) {
    gameState.chartData[gameState.chartData.length - 1].scores = gameState.players.map(p => p.score);
  }

  // Sync archive
  syncArchive();

  // Clear burn candidates
  gameState.burnCandidates = [];

  saveToLS();
  render();

  // Check triple burn for screen shake
  const hasTriple = burnResults.some(br => br.isTriple);
  if (hasTriple) {
    document.body.classList.remove('screen-shake');
    void document.body.offsetWidth;
    document.body.classList.add('screen-shake');
    setTimeout(() => document.body.classList.remove('screen-shake'), 700);
  }

  // Start burn audio sequence
  runBurnAudioSequence(burnResults);
}

function runBurnAudioSequence(burnResults) {
  const winner = gameState.players.find(p => p.score >= gameState.target);
  const shuffler = findShuffler();

  const queue = [];

  // Burn announcements + animations
  burnResults.forEach(br => {
    queue.push({ type: 'burn-anim', attackerId: br.attackerId, victimId: br.victimId });
    queue.push({ type: 'tts', text: `${br.attackerName} membakar ${br.victimName}` });
  });

  // If repeatedly burned (mulai dari 0)
  burnResults.forEach(br => {
    const victim = gameState.players[br.victimId];
    if (victim && victim.burned >= 2) {
      queue.push({ type: 'wav', src: 'audio/mulai_dari_0_ya_bapak.wav' });
    }
  });

  // Shuffle card
  queue.push({ type: 'tts', text: `${shuffler.name} tolong kocok kartunya ya` });

  // Total scores
  gameState.players.forEach(p => {
    queue.push({ type: 'tts', text: `${p.name} mendapatkan ${numberToBahasa(p.score)} poin` });
  });

  // AI comment
  queue.push({ type: 'tts', text: randomAIComment() });

  playQueue(queue, () => {
    if (winner) {
      handleWinner(winner);
    } else {
      advanceTurn();
    }
  });
}

function skipBurn() {
  gameState.burnCandidates = [];
  gameState.burnConfirmed = true;
  saveToLS();
  render();
  startNosBurnAudioSequence();
}

function advanceTurn() {
  gameState.turn++;
  renderHeader();
  saveToLS();
}

function findShuffler() {
  const players = gameState.players;
  // First turn: Tutup Tangan (+250) or Triss (+300) check
  if (gameState.turn === 1) {
    const lastH = gameState.history[gameState.history.length - 1];
    if (lastH) {
      const tt = lastH.scores.find(s => s.delta >= 250);
      if (tt) return players.find(p => p.name === tt.name) || players[0];
    }
  }
  // Most negative
  const negs = players.filter(p => p.score < 0);
  if (negs.length > 0) {
    return negs.reduce((a, b) => a.score < b.score ? a : b);
  }
  // No negative — find smallest score
  return players.reduce((a, b) => a.score < b.score ? a : b);
}

function handleWinner(winner) {
  // TTS win
  const goldFlash = document.getElementById('goldFlash');
  goldFlash.classList.remove('hidden');
  setTimeout(() => goldFlash.classList.add('hidden'), 900);

  // Update stars
  winner.stars = (winner.stars || 0) + 1;
  syncArchive();
  saveToLS();

  // Play reward video
  playRewardVideo(winner, () => {
    // After video, TTS
    const queue = [
      { type: 'tts', text: `Selamat ya ${winner.name} mendapatkan bintang satu` },
      { type: 'tts', text: 'Ronde selesai, selamat berjuang dan fokus' }
    ];
    playQueue(queue, () => {
      showNewRoundModal();
    });
  });
}

function playRewardVideo(winner, cb) {
  const overlay = document.getElementById('rewardOverlay');
  const video = document.getElementById('rewardVideo');

  const videoFile = `video/${['dragon', 'tiger', 'eagle', 'qilin'][winner.borderRank - 1]}.mp4`;
  video.src = videoFile;

  if (bgMusic) bgMusic.volume = 0.15;

  overlay.classList.remove('hidden');

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (bgMusic) bgMusic.volume = bgMusicVolume;
    video.pause();
    video.src = '';
    overlay.classList.add('hidden');
    clearTimeout(rewardVideoTimer);
    cb();
  };

  video.onerror = finish;
  video.onended = finish;

  rewardVideoTimer = setTimeout(finish, 7500);

  video.play().catch(finish);
}

function skipRewardVideo() {
  const overlay = document.getElementById('rewardOverlay');
  const video = document.getElementById('rewardVideo');
  if (!overlay.classList.contains('hidden')) {
    video.pause();
    video.src = '';
    overlay.classList.add('hidden');
    clearTimeout(rewardVideoTimer);
    if (bgMusic) bgMusic.volume = bgMusicVolume;
  }
}

function showNewRoundModal() {
  const modal = document.getElementById('newRoundModal');
  const info = document.getElementById('newRoundInfo');
  info.textContent = `Ronde ${gameState.round} selesai! Siap untuk ronde berikutnya?`;

  const namesContainer = document.getElementById('newRoundNames');
  namesContainer.innerHTML = '';
  gameState.players.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'new-round-name-row';
    row.innerHTML = `
      <span class="new-round-name-label">Pemain ${['A','B','C','D'][i]}</span>
      <input type="text" class="setup-input new-round-name-input" id="newRoundName-${i}" value="${escHtml(p.name)}" maxlength="20" />
    `;
    namesContainer.appendChild(row);
  });

  // Set active target button
  const targetBtns = document.querySelectorAll('#newRoundTargetOptions .target-btn');
  targetBtns.forEach(btn => {
    btn.classList.remove('active');
    if (parseInt(btn.dataset.val) === gameState.target) btn.classList.add('active');
  });

  modal.classList.remove('hidden');
}

function startNewRound() {
  // Get new names
  const newNames = gameState.players.map((p, i) => {
    const el = document.getElementById(`newRoundName-${i}`);
    return el ? el.value.trim() || p.name : p.name;
  });

  // Get new target
  const activeBtn = document.querySelector('#newRoundTargetOptions .target-btn.active');
  const customVal = document.getElementById('newRoundCustomTarget').value;
  if (activeBtn && activeBtn.dataset.val === 'custom' && customVal) {
    gameState.target = parseInt(customVal) || gameState.target;
  } else if (activeBtn && activeBtn.dataset.val !== 'custom') {
    gameState.target = parseInt(activeBtn.dataset.val) || gameState.target;
  }

  // Update names and archive
  newNames.forEach((name, i) => {
    const oldName = gameState.players[i].name;
    if (name !== oldName) {
      // Migrate archive
      if (gameState.playerArchive[oldName]) {
        gameState.playerArchive[name] = gameState.playerArchive[oldName];
        delete gameState.playerArchive[oldName];
      }
    }
    gameState.players[i].name = name;
    if (!gameState.playerArchive[name]) {
      gameState.playerArchive[name] = { stars: 0, burns: 0, burned: 0, tripleBurn: 0, highestScore: 0, minusEver: false };
    }
  });

  // Reset game state for new round
  gameState.round++;
  gameState.turn = 1;
  gameState.players.forEach(p => {
    p.score = 0;
    p.isInRecoveryMode = false;
    p.recoveryStartTurn = null;
    p.consecutiveMinus = 0;
    p.consecutiveMinusAudioPlayed = false;
    p.chaseTargets = [];
  });
  gameState.burnCandidates = [];
  gameState.burnConfirmed = false;
  gameState.firstTurnOfRound = true;
  gameState.prevRankings = null;

  // Recalculate rankings
  const ranks = calculateRanking(gameState.players);
  gameState.players.forEach((p, i) => {
    p.rank = ranks[i];
    p.prevRank = ranks[i];
  });
  assignBorderRanks(gameState.players);

  document.getElementById('newRoundModal').classList.add('hidden');
  saveToLS();
  render();
}

/* ======================== UNDO ======================== */
function doUndo() {
  // Stop all audio/video
  speechSynthesis.cancel();
  if (negativeAudioPlaying) {
    negativeAudioPlaying.pause();
    negativeAudioPlaying.currentTime = 0;
    negativeAudioPlaying = null;
  }
  skipRewardVideo();
  if (bgMusic) bgMusic.volume = bgMusicVolume;

  if (undoStack.length === 0) {
    updateAICommentText('Tidak ada yang bisa di-undo.');
    return;
  }

  const prev = undoStack.pop();
  gameState = prev;
  saveToLS();
  render();
  updateAICommentText('Undo berhasil!');
}

/* ======================== EDIT NAME ======================== */
function openEditName() {
  const container = document.getElementById('editNameInputs');
  container.innerHTML = '';
  gameState.players.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'edit-name-row';
    row.innerHTML = `
      <span class="edit-name-label">Pemain ${['A','B','C','D'][i]}</span>
      <input type="text" class="setup-input" id="editName-${i}" value="${escHtml(p.name)}" maxlength="20" />
    `;
    container.appendChild(row);
  });
  document.getElementById('editNameModal').classList.remove('hidden');
}

function saveEditName() {
  gameState.players.forEach((p, i) => {
    const el = document.getElementById(`editName-${i}`);
    if (el) {
      const newName = el.value.trim() || p.name;
      if (newName !== p.name) {
        // Update archive
        if (gameState.playerArchive[p.name]) {
          gameState.playerArchive[newName] = gameState.playerArchive[p.name];
          delete gameState.playerArchive[p.name];
        }
        p.name = newName;
      }
    }
  });
  document.getElementById('editNameModal').classList.add('hidden');
  syncArchive();
  saveToLS();
  render();
}

/* ======================== RESET ======================== */
function resetGame() {
  // Keep permanent stats
  const archive = deepClone(gameState.playerArchive);
  gameState = defaultState();
  gameState.playerArchive = archive;
  undoStack = [];
  document.getElementById('resetModal').classList.add('hidden');
  saveToLS();
  render();
}

/* ======================== TABS ======================== */
function switchTab(tab) {
  const tabMap = {
    ranking: 'tabRanking',
    history: 'tabHistory',
    achievement: 'tabAchievement',
    stats: 'tabStats',
    archive: 'tabArchive',
    chart: 'tabChart'
  };
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  Object.entries(tabMap).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', key !== tab);
  });
  if (tab === 'chart') renderChartTab();
  if (tab === 'stats') renderStatsTab();
  if (tab === 'archive') renderArchiveTab();
  if (tab === 'achievement') renderAchievementsTab();
  if (tab === 'history') renderHistoryTab();
  if (tab === 'ranking') renderRankingTab();
}

/* ======================== AUDIO SYSTEM ======================== */
function initBgMusic() {
  bgMusic = new Audio('audio/casino_bg.mp3');
  bgMusic.loop = true;
  bgMusic.volume = bgMusicVolume;
  if (bgMusicOn) {
    bgMusic.play().catch(() => {
      // Autoplay blocked — will retry on user interaction
      document.addEventListener('click', () => {
        if (bgMusicOn && bgMusic.paused) bgMusic.play().catch(() => {});
      }, { once: true });
    });
  }
}

function toggleBgMusic() {
  bgMusicOn = !bgMusicOn;
  if (bgMusicOn) {
    bgMusic.volume = bgMusicVolume;
    bgMusic.play().catch(() => {});
  } else {
    bgMusic.pause();
  }
  updateBgMusicButton();
  saveToLS();
}

function updateBgMusicButton() {
  const btn = document.getElementById('bgMusicToggle');
  if (btn) {
    btn.textContent = bgMusicOn ? '🎵' : '🔇';
    btn.classList.toggle('active', bgMusicOn);
  }
}

function speakWithDuck(text) {
  return new Promise(resolve => {
    if (bgMusic) bgMusic.volume = 0.15;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'id-ID';
    utter.rate = 1;
    utter.pitch = 0.8;
    utter.volume = 1;
    getMaleVoice().then(voice => {
      if (voice) utter.voice = voice;
      utter.onend = () => { if (bgMusic) bgMusic.volume = bgMusicVolume; resolve(); };
      utter.onerror = () => { if (bgMusic) bgMusic.volume = bgMusicVolume; resolve(); };
      speechSynthesis.speak(utter);
    });
  });
}

function playWavWithDuck(src) {
  return new Promise(resolve => {
    if (bgMusic) bgMusic.volume = 0.15;
    const audio = new Audio(src);
    negativeAudioPlaying = audio;
    audio.onended = () => { if (bgMusic) bgMusic.volume = bgMusicVolume; negativeAudioPlaying = null; resolve(); };
    audio.onerror = () => { if (bgMusic) bgMusic.volume = bgMusicVolume; negativeAudioPlaying = null; resolve(); };
    audio.play().catch(() => { if (bgMusic) bgMusic.volume = bgMusicVolume; negativeAudioPlaying = null; resolve(); });
  });
}

function getMaleVoice() {
  return new Promise(resolve => {
    const tryGet = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        const male = voices.find(v => v.lang === 'id-ID' && /male|pria|laki/i.test(v.name))
          || voices.find(v => v.lang === 'id-ID')
          || voices.find(v => v.lang.startsWith('id'))
          || voices[0];
        resolve(male);
      } else {
        setTimeout(tryGet, 100);
      }
    };
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = tryGet;
    }
    tryGet();
  });
}

// Queue system
let audioQueueRunning = false;
let currentQueueResolve = null;

function playQueue(queue, onFinish) {
  audioQueueRunning = true;
  const run = async (items) => {
    for (const item of items) {
      if (item.type === 'tts') {
        await speakWithDuck(item.text);
      } else if (item.type === 'wav') {
        await playWavWithDuck(item.src);
      } else if (item.type === 'burn-anim') {
        triggerBurnAnimation(item.attackerId, item.victimId);
        await delay(600);
      }
    }
    audioQueueRunning = false;
    if (onFinish) onFinish();
  };
  run(queue);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function playKlik() {
  try {
    const audio = new Audio('audio/klik.wav');
    audio.volume = 0.5;
    audio.play().catch(() => {
      // Fallback: AudioContext beep
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.1;
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      } catch(e) {}
    });
  } catch(e) {}
}

/* ======================== BURN ANIMATION ======================== */
function triggerBurnAnimation(attackerId, victimId) {
  const attackerCard = document.getElementById(`card-${attackerId}`);
  const victimCard = document.getElementById(`card-${victimId}`);
  if (!attackerCard || !victimCard) return;

  const attacker = gameState.players[attackerId];
  const effectType = EFFECT_MAP[attacker.borderRank] || 'fire';

  // Shake victim card
  victimCard.classList.remove('shake-anim');
  void victimCard.offsetWidth;
  victimCard.classList.add('shake-anim');
  setTimeout(() => victimCard.classList.remove('shake-anim'), 600);

  // Get victim card position
  const vRect = victimCard.getBoundingClientRect();
  const overlay = document.getElementById('burnAnimOverlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = '';

  const count = effectType === 'fire' ? 18 : effectType === 'lightning' ? 6 : 10;

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    const cx = vRect.left + vRect.width / 2;
    const cy = vRect.top + vRect.height / 2;

    if (effectType === 'fire') {
      p.className = 'particle-fire';
      const angle = (i / count) * Math.PI * 2;
      const dist = 30 + Math.random() * 40;
      p.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--ty', Math.sin(angle) * dist - 50 + 'px');
      p.style.setProperty('--dur', (0.5 + Math.random() * 0.5) + 's');
      p.style.left = (cx + Math.cos(angle) * 5) + 'px';
      p.style.top = (cy + Math.sin(angle) * 5) + 'px';
      p.style.width = (6 + Math.random() * 8) + 'px';
      p.style.height = p.style.width;
    } else if (effectType === 'claw') {
      p.className = 'particle-claw';
      const rot = -30 + (i / count) * 60;
      p.style.setProperty('--rot', rot + 'deg');
      p.style.setProperty('--dur', '0.4s');
      p.style.left = cx + 'px';
      p.style.top = (cy - 20) + 'px';
    } else if (effectType === 'dive') {
      p.className = 'particle-dive';
      const startX = cx + (Math.random() - 0.5) * 80;
      const startY = cy - 80 - Math.random() * 40;
      p.style.setProperty('--sx', startX + 'px');
      p.style.setProperty('--sy', startY + 'px');
      p.style.setProperty('--ex', cx + 'px');
      p.style.setProperty('--ey', cy + 'px');
      p.style.setProperty('--dur', (0.4 + Math.random() * 0.3) + 's');
      p.style.left = '0';
      p.style.top = '0';
    } else if (effectType === 'lightning') {
      p.className = 'particle-lightning';
      p.style.setProperty('--dur', (0.3 + Math.random() * 0.2) + 's');
      p.style.left = (cx + (Math.random() - 0.5) * 40) + 'px';
      p.style.top = (cy - 30) + 'px';
      p.style.transform = `rotate(${(Math.random() - 0.5) * 30}deg)`;
    }

    overlay.appendChild(p);
  }

  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  }, 800);
}

/* ======================== SCORE ANIMATION ======================== */
function animateScoreCounters() {
  gameState.players.forEach((p, i) => {
    const el = document.getElementById(`score-display-${i}`);
    if (!el) return;
    const target = p.score;
    const start = parseInt(el.textContent) || 0;
    const diff = target - start;
    const steps = 20;
    let step = 0;
    const iv = setInterval(() => {
      step++;
      const current = Math.round(start + (diff * step / steps));
      el.textContent = current;
      el.className = 'card-score' + (current < 0 ? ' negative' : '');
      if (step >= steps) {
        clearInterval(iv);
        el.textContent = target;
        el.className = 'card-score' + (target < 0 ? ' negative' : '');
      }
    }, 25);
  });
}

/* ======================== AI COMMENTATOR ======================== */
function updateAIComment() {
  const comments = analyzeGameState();
  updateAICommentText(comments);
}

function analyzeGameState() {
  const players = gameState.players;
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const leader = sorted[0];
  const last = sorted[sorted.length - 1];

  // Check approaching win
  const approaching = players.find(p => p.score >= gameState.target * 0.85);
  if (approaching) return `⚠️ ${approaching.name} hampir menang! Skor: ${approaching.score}/${gameState.target}`;

  // Check big gap
  const gap = (sorted[0].score || 0) - (sorted[sorted.length-1].score || 0);
  if (gap > 200) return `📊 Selisih ${gap} poin antara ${sorted[0].name} dan ${sorted[sorted.length-1].name}`;

  // Check recovery
  const recovery = players.find(p => p.isInRecoveryMode);
  if (recovery) return `🔄 ${recovery.name} sedang dalam Recovery Mode!`;

  // Check negative
  const negative = players.filter(p => p.score < 0);
  if (negative.length > 0) return `👎 ${negative.map(p => p.name).join(', ')} masih minus!`;

  return randomAIComment();
}

function randomAIComment() {
  return AI_COMMENTS[Math.floor(Math.random() * AI_COMMENTS.length)];
}

function updateAICommentText(text) {
  const el = document.getElementById('aiCommentText');
  if (el) el.textContent = text;
}

/* ======================== ARCHIVE / STATS SYNC ======================== */
function syncArchive() {
  gameState.players.forEach(p => {
    if (!gameState.playerArchive[p.name]) {
      gameState.playerArchive[p.name] = { stars: 0, burns: 0, burned: 0, tripleBurn: 0, highestScore: 0, minusEver: false };
    }
    const arch = gameState.playerArchive[p.name];
    arch.stars = Math.max(arch.stars || 0, p.stars || 0);
    arch.burns = Math.max(arch.burns || 0, p.burns || 0);
    arch.burned = Math.max(arch.burned || 0, p.burned || 0);
    arch.tripleBurn = Math.max(arch.tripleBurn || 0, p.tripleBurn || 0);
    arch.highestScore = Math.max(arch.highestScore || 0, p.highestScore || 0);
    if (p.minusEver) arch.minusEver = true;
  });
}

/* ======================== SCREENSHOT ======================== */
function takeScreenshot() {
  if (navigator.clipboard && window.ClipboardItem) {
    updateAICommentText('Screenshot tersimpan! (Gunakan browser screenshot untuk simpan gambar)');
  }
  // Use html2canvas if available, otherwise prompt user
  if (typeof html2canvas !== 'undefined') {
    html2canvas(document.getElementById('gameScreen')).then(canvas => {
      const link = document.createElement('a');
      link.download = `score-cekih-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    });
  } else {
    updateAICommentText('📸 Gunakan tombol screenshot perangkat Anda untuk menyimpan layar!');
  }
}

/* ======================== FULLSCREEN ======================== */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

/* ======================== NUMBER TO BAHASA ======================== */
function numberToBahasa(n) {
  if (n === 0) return 'nol';
  if (n < 0) return 'minus ' + numberToBahasa(-n);

  const ones = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan',
    'sepuluh', 'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas',
    'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas'];
  const tens = ['', '', 'dua puluh', 'tiga puluh', 'empat puluh', 'lima puluh',
    'enam puluh', 'tujuh puluh', 'delapan puluh', 'sembilan puluh'];

  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n/10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  if (n < 200) return 'seratus' + (n % 100 ? ' ' + numberToBahasa(n % 100) : '');
  if (n < 1000) return ones[Math.floor(n/100)] + ' ratus' + (n % 100 ? ' ' + numberToBahasa(n % 100) : '');
  if (n < 2000) return 'seribu' + (n % 1000 ? ' ' + numberToBahasa(n % 1000) : '');
  if (n < 1000000) return numberToBahasa(Math.floor(n/1000)) + ' ribu' + (n % 1000 ? ' ' + numberToBahasa(n % 1000) : '');
  return n.toString();
}

/* ======================== NUMBER TO ENGLISH ======================== */
function numberToEnglish(n) {
  if (n === 0) return 'zero';
  if (n < 0) return 'minus ' + numberToEnglish(-n);
  const ones = ['','one','two','three','four','five','six','seven','eight','nine',
    'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? '-' + ones[n%10] : '');
  if (n < 1000) return ones[Math.floor(n/100)] + ' hundred' + (n%100 ? ' ' + numberToEnglish(n%100) : '');
  if (n < 1000000) return numberToEnglish(Math.floor(n/1000)) + ' thousand' + (n%1000 ? ' ' + numberToEnglish(n%1000) : '');
  return n.toString();
}

/* ======================== UTILITIES ======================== */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Expose for debugging
window._gameState = () => gameState;
window._undoStack = () => undoStack;

/* ======================== SERVICE WORKER ======================== */
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
