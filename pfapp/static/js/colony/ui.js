/**
 * Colony: One — Master Interactive Playground UI Controller
 */

import {
  BOARD_SIZE,
  CYAN,
  MAGENTA,
  PIECE_TYPES,
  ColonyGame,
  posToAlgebraic,
  nextShrinkRound
} from './engine.js';
import { MCTSConfig, searchAction } from './mcts.js';
import { ColonyOnnxRunner } from './onnx_runner.js';
import { TournamentArena, computeEloStats } from './arena.js';
import { CONTEST_MATCHES, parseMatchMoves } from './replays.js';

export class ColonyPlaygroundUI {
  constructor() {
    this.game = new ColonyGame();
    this.runner = new ColonyOnnxRunner();
    this.arena = new TournamentArena();

    // Game state
    this.playerTeam = CYAN;
    this.aiTeam = MAGENTA;
    this.aiModelName = 'champion';
    this.aiSimulations = 30;
    this.isAiThinking = false;
    this.selectedSquare = null;
    this.legalDestinations = [];

    // Replay state
    this.currentReplay = null;
    this.replayMoves = [];
    this.replayStep = 0;
    this.replayTimer = null;

    // Evaluator map
    this.evaluators = new Map(); // name -> evaluator function
    this.activeTab = 'play'; // 'play' | 'arena' | 'replays' | 'rules'

    // Audio SFX synthesizer
    this.audioCtx = null;
    this.soundEnabled = true;
  }

  async init() {
    this.setupAudio();
    this.renderBoard();
    this.attachDomEvents();
    this.populateReplaysList();
    this.updateStatusHud();

    // Load default models in background
    this.loadDefaultModels();
  }

  setupAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    } catch (e) {
      this.soundEnabled = false;
    }
  }

  playSfx(type) {
    if (!this.soundEnabled || !this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'move') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'shoot') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'sacrifice') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(80, now + 0.25);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'shrink') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch (e) {
      // Audio error ignored safely
    }
  }

  async loadDefaultModels() {
    this.setStatusBadge('Loading models (WASM)...', 'warn');

    // 1. Champion Gen 9 Model
    const champUrl = '/static/models/colony/champion_l5_gen9.onnx';
    const champEval = await this.runner.loadModelFromUrl('champion', champUrl);
    this.evaluators.set('champion', champEval);

    // 2. Level 4 Model
    const l4Url = '/static/models/colony/model_l4.onnx';
    const l4Eval = await this.runner.loadModelFromUrl('level4', l4Url);
    this.evaluators.set('level4', l4Eval);

    // 3. Random baseline
    const randUrl = '/static/models/colony/random.onnx';
    const randEval = await this.runner.loadModelFromUrl('random', randUrl);
    this.evaluators.set('random', randEval);

    this.setStatusBadge('Champion Ready (Gen 9)', 'cyan');
    this.updateEvalBar(0.0);
  }

  renderBoard() {
    const boardEl = document.getElementById('colony-board');
    if (!boardEl) return;
    boardEl.innerHTML = '';

    const warnRound = nextShrinkRound(this.game.roundNumber);
    const isWarningRound = warnRound === this.game.roundNumber;
    const warningRing = isWarningRound ? this.game.board.nextOpenRing() : -1;

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const tile = document.createElement('div');
        tile.className = `board-tile ${(r + c) % 2 === 0 ? 'tile-light' : 'tile-dark'}`;
        tile.dataset.r = r;
        tile.dataset.c = c;
        tile.id = `tile-${r}-${c}`;

        // Firewall locked square
        if (this.game.board.locked[r][c]) {
          tile.classList.add('tile-locked');
        } else if (warningRing >= 0 && this.game.board.getRing(r, c) === warningRing) {
          tile.classList.add('tile-warning-ring');
        }

        // Coordinate tags
        if (c === 0) {
          const rankTag = document.createElement('span');
          rankTag.className = 'coord-tag rank-tag';
          rankTag.textContent = 8 - r;
          tile.appendChild(rankTag);
        }
        if (r === 7) {
          const fileTag = document.createElement('span');
          fileTag.className = 'coord-tag file-tag';
          fileTag.textContent = String.fromCharCode('A'.charCodeAt(0) + c);
          tile.appendChild(fileTag);
        }

        // Piece rendering
        const piece = this.game.board.grid[r][c];
        if (piece) {
          const pieceEl = this.createPieceElement(piece, r, c);
          tile.appendChild(pieceEl);
        }

        tile.addEventListener('click', () => this.onTileClick(r, c));
        boardEl.appendChild(tile);
      }
    }
  }

  createPieceElement(piece, r, c) {
    const el = document.createElement('div');
    const isCyan = piece.team === CYAN;
    el.className = `piece-token ${isCyan ? 'piece-cyan' : 'piece-mag'}`;
    el.dataset.type = piece.type;
    el.dataset.team = piece.team;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'piece-icon';
    iconSpan.textContent = PIECE_TYPES[piece.type].icon;

    const abbrSpan = document.createElement('span');
    abbrSpan.className = 'piece-abbr';
    abbrSpan.textContent = piece.abbr;

    el.appendChild(iconSpan);
    el.appendChild(abbrSpan);

    if (piece.type === 'KERNEL') {
      const guards = this.game.board.getAdjacentGuards(r, c, piece.team);
      if (guards.length > 0) {
        const shieldBadge = document.createElement('span');
        shieldBadge.className = 'shield-indicator';
        shieldBadge.title = `Guarded by ${guards.length} piece(s)`;
        shieldBadge.textContent = `🛡️${guards.length}`;
        el.appendChild(shieldBadge);
      }
    }

    return el;
  }

  onTileClick(r, c) {
    if (this.activeTab !== 'play') return;
    if (this.game.terminated || this.isAiThinking) return;

    // Is human's turn?
    if (this.game.currentTeam !== this.playerTeam) return;

    const clickedPiece = this.game.board.grid[r][c];

    // If a destination was clicked
    if (this.selectedSquare) {
      const dest = this.legalDestinations.find((d) => d.toR === r && d.toC === c);
      if (dest) {
        this.executeMove(dest);
        return;
      }
    }

    // If clicking on friendly piece, select it
    if (clickedPiece && clickedPiece.team === this.playerTeam) {
      this.selectedSquare = [r, c];
      this.legalDestinations = this.game.board.getPieceLegalActions(r, c, clickedPiece);
      this.highlightLegalDestinations();
      return;
    }

    // Clear selection
    this.clearSelection();
  }

  highlightLegalDestinations() {
    this.clearHighlights();

    if (!this.selectedSquare) return;
    const [sr, sc] = this.selectedSquare;
    const selTile = document.getElementById(`tile-${sr}-${sc}`);
    if (selTile) selTile.classList.add('tile-selected');

    for (const d of this.legalDestinations) {
      const tile = document.getElementById(`tile-${d.toR}-${d.toC}`);
      if (!tile) continue;

      const marker = document.createElement('div');
      marker.className = `dest-marker ${d.kind === 'shoot' ? 'marker-shoot' : 'marker-move'}`;

      const targetPiece = this.game.board.grid[d.toR][d.toC];
      if (targetPiece) {
        marker.classList.add('marker-capture');
      }

      tile.appendChild(marker);
      tile.classList.add('tile-legal-target');
    }
  }

  clearHighlights() {
    document.querySelectorAll('.tile-selected').forEach((el) => el.classList.remove('tile-selected'));
    document.querySelectorAll('.tile-legal-target').forEach((el) => el.classList.remove('tile-legal-target'));
    document.querySelectorAll('.dest-marker').forEach((el) => el.remove());
  }

  clearSelection() {
    this.selectedSquare = null;
    this.legalDestinations = [];
    this.clearHighlights();
  }

  async executeMove(action) {
    this.clearSelection();
    this.triggerActionAnimation(action);

    const logEntry = this.game.step(action);
    this.playSfx(action.kind === 'shoot' ? 'shoot' : 'move');

    if (logEntry.result.guardSacrificed) {
      this.playSfx('sacrifice');
      this.showToast(`🛡️ Kernel Protected! Sacrificed ${logEntry.result.guardSacrificed.piece.type}`, 'warn');
    }
    if (logEntry.shrinkEvent && logEntry.shrinkEvent.ring >= 0) {
      this.playSfx('shrink');
      this.showToast(`🔥 Firewall locked Ring ${logEntry.shrinkEvent.ring}!`, 'danger');
    }

    this.appendMoveLog(logEntry);
    this.renderBoard();
    this.updateStatusHud();

    // Check game termination
    if (this.game.terminated) {
      this.handleGameOver();
      return;
    }

    // If it's now AI's turn, trigger AI move
    if (this.game.currentTeam === this.aiTeam) {
      await this.triggerAiMove();
    }
  }

  async triggerAiMove() {
    this.isAiThinking = true;
    this.setStatusBadge('AI Calculating...', 'magenta');

    const evalFn = this.evaluators.get(this.aiModelName) || this.evaluators.get('champion');
    const config = new MCTSConfig({ simulations: this.aiSimulations });

    try {
      const searchResult = await searchAction(this.game, evalFn, config);
      if (searchResult && searchResult.action) {
        this.updateEvalBar(searchResult.rootValue);
        // Small delay for natural feel
        await new Promise((r) => setTimeout(r, 200));
        await this.executeMove(searchResult.action);
      }
    } catch (err) {
      console.error('AI Move Error:', err);
    } finally {
      this.isAiThinking = false;
      if (!this.game.terminated && this.game.currentTeam === this.playerTeam) {
        this.setStatusBadge('Your Turn', 'cyan');
      }
    }
  }

  triggerActionAnimation(action) {
    if (action.kind === 'shoot') {
      this.drawLaserBeam(action.fromR, action.fromC, action.toR, action.toC);
    }
  }

  drawLaserBeam(fr, fc, tr, tc) {
    const boardEl = document.getElementById('colony-board');
    if (!boardEl) return;

    const fromTile = document.getElementById(`tile-${fr}-${fc}`);
    const toTile = document.getElementById(`tile-${tr}-${tc}`);
    if (!fromTile || !toTile) return;

    const bRect = boardEl.getBoundingClientRect();
    const fRect = fromTile.getBoundingClientRect();
    const tRect = toTile.getBoundingClientRect();

    const x1 = fRect.left + fRect.width / 2 - bRect.left;
    const y1 = fRect.top + fRect.height / 2 - bRect.top;
    const x2 = tRect.left + tRect.width / 2 - bRect.left;
    const y2 = tRect.top + tRect.height / 2 - bRect.top;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'laser-overlay-svg');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '50';

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#ff007f');
    line.setAttribute('stroke-width', '4');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('class', 'laser-beam-pulse');

    svg.appendChild(line);
    boardEl.appendChild(svg);

    setTimeout(() => svg.remove(), 400);
  }

  updateEvalBar(val) {
    const fillEl = document.getElementById('eval-bar-fill');
    const labelEl = document.getElementById('eval-bar-label');
    if (!fillEl || !labelEl) return;

    // val in [-1.0, 1.0], from Cyan perspective (+1 = Cyan win, -1 = Mag win)
    const cyanPct = Math.round(((val + 1.0) / 2.0) * 100);
    fillEl.style.width = `${cyanPct}%`;
    labelEl.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(2)} (${cyanPct}% Cyan)`;
  }

  updateStatusHud() {
    const teamEl = document.getElementById('hud-current-team');
    const actionsEl = document.getElementById('hud-actions-left');
    const roundEl = document.getElementById('hud-round-number');
    const urgencyEl = document.getElementById('hud-firewall-status');

    if (teamEl) {
      teamEl.textContent = this.game.currentTeam;
      teamEl.className = this.game.currentTeam === CYAN ? 'badge badge-cyan' : 'badge badge-magenta';
    }
    if (actionsEl) {
      actionsEl.textContent = `Action ${3 - this.game.actionsLeft} of 2`;
    }
    if (roundEl) {
      roundEl.textContent = `Round ${this.game.roundNumber}`;
    }
    if (urgencyEl) {
      const nextR = nextShrinkRound(this.game.roundNumber);
      if (nextR === this.game.roundNumber) {
        urgencyEl.textContent = `⚠️ SHRINK END OF ROUND ${nextR}`;
        urgencyEl.className = 'hud-firewall-urgent';
      } else if (nextR) {
        urgencyEl.textContent = `Next Shrink: Round ${nextR}`;
        urgencyEl.className = 'hud-firewall-normal';
      } else {
        urgencyEl.textContent = 'Firewall Maximum';
      }
    }
  }

  appendMoveLog(logEntry) {
    const logList = document.getElementById('move-log-list');
    if (!logList) return;

    const row = document.createElement('div');
    const isCyan = logEntry.team === CYAN;
    row.className = `move-log-entry ${isCyan ? 'entry-cyan' : 'entry-mag'}`;

    const fromAlg = posToAlgebraic(logEntry.action.fromR, logEntry.action.fromC);
    const toAlg = posToAlgebraic(logEntry.action.toR, logEntry.action.toC);
    const kindTag = logEntry.action.kind.toUpperCase();

    let details = `${logEntry.actionIndex}. ${logEntry.team} ${fromAlg} -> ${toAlg} [${kindTag}]`;
    if (logEntry.result.guardSacrificed) {
      details += ` 🛡️ x${logEntry.result.guardSacrificed.piece.type}`;
    } else if (logEntry.result.capturedPiece) {
      details += ` ⚔️ x${logEntry.result.capturedPiece.type}`;
    }

    row.textContent = details;
    logList.prepend(row);
  }

  async handleGameOver() {
    const isWinner = this.game.winner === this.playerTeam;
    this.setStatusBadge(`Game Over — ${this.game.winner} Wins!`, isWinner ? 'green' : 'red');
    this.showToast(`Game Over! ${this.game.winReason}`, isWinner ? 'green' : 'danger');

    // Asynchronously record match to Django PostgreSQL database
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const payload = {
        player_team: this.playerTeam,
        ai_model: this.aiModelName,
        winner: this.game.winner,
        win_reason: this.game.winReason || '',
        total_rounds: this.game.roundNumber,
        total_actions: this.game.actionCount
      };

      const resp = await fetch('/api/colony/record-match/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        const data = await resp.json();
        const dbTotal = document.getElementById('db-total-matches');
        const dbWins = document.getElementById('db-human-wins');
        const dbAi = document.getElementById('db-ai-wins');
        if (dbTotal) dbTotal.textContent = data.total_matches;
        if (dbWins) dbWins.textContent = data.player_wins;
        if (dbAi) dbAi.textContent = data.ai_wins;
      }
    } catch (e) {
      console.warn('Unable to record match to database:', e);
    }
  }


  showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `colony-toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-fade');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  setStatusBadge(text, type = 'cyan') {
    const badge = document.getElementById('ai-status-badge');
    if (!badge) return;
    badge.textContent = text;
    badge.className = `badge badge-${type}`;
  }

  // --- REPLAY CONTROLLER ---
  populateReplaysList() {
    const select = document.getElementById('replay-select');
    if (!select) return;
    select.innerHTML = '';
    CONTEST_MATCHES.forEach((m, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `${m.title} (${m.winner} Win)`;
      select.appendChild(opt);
    });

    select.addEventListener('change', () => {
      this.loadReplayMatch(parseInt(select.value, 10));
    });

    if (CONTEST_MATCHES.length > 0) {
      this.loadReplayMatch(0);
    }
  }

  loadReplayMatch(idx) {
    this.stopReplayPlayback();
    const match = CONTEST_MATCHES[idx];
    this.currentReplay = match;
    this.replayMoves = parseMatchMoves(match.movesText);
    this.replayStep = 0;
    this.applyReplayStep(0);
  }

  applyReplayStep(targetStep) {
    targetStep = Math.max(0, Math.min(targetStep, this.replayMoves.length));
    this.replayStep = targetStep;

    const replayGame = new ColonyGame();
    for (let i = 0; i < targetStep; i++) {
      const m = this.replayMoves[i];
      const action = {
        fromR: m.fromR,
        fromC: m.fromC,
        toR: m.toR,
        toC: m.toC,
        kind: m.kind
      };
      replayGame.step(action);
    }

    this.game = replayGame;
    this.renderBoard();
    this.updateStatusHud();

    const stepLabel = document.getElementById('replay-step-label');
    if (stepLabel) {
      stepLabel.textContent = `Move ${this.replayStep} of ${this.replayMoves.length}`;
    }
  }

  toggleReplayPlayback() {
    if (this.replayTimer) {
      this.stopReplayPlayback();
    } else {
      this.startReplayPlayback();
    }
  }

  startReplayPlayback() {
    const playBtn = document.getElementById('btn-replay-play');
    if (playBtn) playBtn.textContent = '⏸ Pause';

    this.replayTimer = setInterval(() => {
      if (this.replayStep >= this.replayMoves.length) {
        this.stopReplayPlayback();
        return;
      }
      this.applyReplayStep(this.replayStep + 1);
    }, 600);
  }

  stopReplayPlayback() {
    if (this.replayTimer) {
      clearInterval(this.replayTimer);
      this.replayTimer = null;
    }
    const playBtn = document.getElementById('btn-replay-play');
    if (playBtn) playBtn.textContent = '▶ Play';
  }

  // --- ARENA CONTROLLER ---
  async runArenaTournament() {
    const modelASel = document.getElementById('arena-model-a').value;
    const modelBSel = document.getElementById('arena-model-b').value;
    const gamesCount = parseInt(document.getElementById('arena-games-count').value, 10) || 5;
    const simsCount = parseInt(document.getElementById('arena-sims-count').value, 10) || 20;

    const evalA = this.evaluators.get(modelASel);
    const evalB = this.evaluators.get(modelBSel);

    if (!evalA || !evalB) {
      this.showToast('Please wait for both models to load.', 'warn');
      return;
    }

    const startBtn = document.getElementById('btn-start-arena');
    const stopBtn = document.getElementById('btn-stop-arena');
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;

    const arenaStatsEl = document.getElementById('arena-live-stats');
    if (arenaStatsEl) arenaStatsEl.style.display = 'block';

    try {
      await this.arena.runSeries({
        modelA: { name: modelASel, evaluator: evalA },
        modelB: { name: modelBSel, evaluator: evalB },
        totalGames: gamesCount,
        simulations: simsCount,
        animate: true,
        stepDelayMs: 150,
        onGameStart: (info) => {
          this.game = new ColonyGame();
          this.renderBoard();
          this.updateStatusHud();
          const gameTitle = document.getElementById('arena-current-game');
          if (gameTitle) gameTitle.textContent = `Game ${info.gameIndex}/${info.totalGames}: ${info.cyanName} (Cyan) vs ${info.magName} (Magenta)`;
        },
        onMove: (moveInfo) => {
          this.triggerActionAnimation(moveInfo.action);
          this.renderBoard();
          this.updateStatusHud();
        },
        onGameEnd: (endInfo) => {
          this.updateArenaLeaderboard(endInfo);
        }
      });
    } catch (err) {
      console.error('Arena Error:', err);
    } finally {
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    }
  }

  updateArenaLeaderboard(data) {
    const stats = data.stats;
    const winRateEl = document.getElementById('arena-winrate');
    const eloDiffEl = document.getElementById('arena-elodiff');
    const ciEl = document.getElementById('arena-ci');
    const scoreEl = document.getElementById('arena-score');

    if (winRateEl) winRateEl.textContent = `${(stats.winRate * 100).toFixed(1)}%`;
    if (eloDiffEl) eloDiffEl.textContent = `${stats.eloDiff >= 0 ? '+' : ''}${stats.eloDiff}`;
    if (ciEl) ciEl.textContent = `95% CI: [${stats.ciLow >= 0 ? '+' : ''}${stats.ciLow}, ${stats.ciHigh >= 0 ? '+' : ''}${stats.ciHigh}]`;
    if (scoreEl) scoreEl.textContent = `A Wins: ${data.aWins} | B Wins: ${data.bWins}`;
  }

  attachDomEvents() {
    // Mode Navigation Tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Reset Button
    document.getElementById('btn-reset-game')?.addEventListener('click', () => {
      this.game.reset();
      this.clearSelection();
      this.renderBoard();
      this.updateStatusHud();
      document.getElementById('move-log-list').innerHTML = '';
      this.updateEvalBar(0.0);
      if (this.playerTeam === MAGENTA) {
        this.triggerAiMove();
      }
    });

    // Side selection toggles
    document.getElementById('opt-side-cyan')?.addEventListener('click', () => {
      this.playerTeam = CYAN;
      this.aiTeam = MAGENTA;
      document.getElementById('opt-side-cyan').classList.add('active');
      document.getElementById('opt-side-mag').classList.remove('active');
      document.getElementById('btn-reset-game').click();
    });
    document.getElementById('opt-side-mag')?.addEventListener('click', () => {
      this.playerTeam = MAGENTA;
      this.aiTeam = CYAN;
      document.getElementById('opt-side-mag').classList.add('active');
      document.getElementById('opt-side-cyan').classList.remove('active');
      document.getElementById('btn-reset-game').click();
    });

    // AI model selection dropdown
    document.getElementById('sel-ai-model')?.addEventListener('change', (e) => {
      this.aiModelName = e.target.value;
    });

    // AI simulations budget
    document.getElementById('sel-ai-sims')?.addEventListener('change', (e) => {
      this.aiSimulations = parseInt(e.target.value, 10) || 30;
    });

    // Replay controls
    document.getElementById('btn-replay-prev')?.addEventListener('click', () => {
      this.applyReplayStep(this.replayStep - 1);
    });
    document.getElementById('btn-replay-next')?.addEventListener('click', () => {
      this.applyReplayStep(this.replayStep + 1);
    });
    document.getElementById('btn-replay-play')?.addEventListener('click', () => {
      this.toggleReplayPlayback();
    });
    document.getElementById('btn-replay-first')?.addEventListener('click', () => {
      this.applyReplayStep(0);
    });
    document.getElementById('btn-replay-last')?.addEventListener('click', () => {
      this.applyReplayStep(this.replayMoves.length);
    });

    // Arena Controls
    document.getElementById('btn-start-arena')?.addEventListener('click', () => {
      this.runArenaTournament();
    });
    document.getElementById('btn-stop-arena')?.addEventListener('click', () => {
      this.arena.stop();
    });

    // Model Upload Modal Events
    this.attachUploadEvents();
  }

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));

    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    const activePane = document.getElementById(`pane-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');
    if (activePane) activePane.classList.add('active');

    if (tab === 'replays') {
      this.loadReplayMatch(0);
    } else if (tab === 'play') {
      this.renderBoard();
      this.updateStatusHud();
    }
  }

  attachUploadEvents() {
    const modal = document.getElementById('upload-modal');
    const openBtn = document.getElementById('btn-open-upload-modal');
    const closeBtn = document.getElementById('btn-close-upload-modal');
    const dropzone = document.getElementById('model-dropzone');
    const fileInput = document.getElementById('model-file-input');

    if (openBtn) openBtn.addEventListener('click', () => modal.classList.add('modal-visible'));
    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('modal-visible'));

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dropzone-active');
      });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dropzone-active'));
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dropzone-active');
        if (e.dataTransfer.files.length > 0) {
          this.handleModelUpload(e.dataTransfer.files[0]);
        }
      });
      fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
          this.handleModelUpload(fileInput.files[0]);
        }
      });
    }
  }

  async handleModelUpload(file) {
    const statusBox = document.getElementById('upload-status-output');
    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.className = 'upload-status status-working';
      statusBox.innerHTML = `⏳ Validating <strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)...`;
    }

    try {
      const uploadResult = await this.runner.validateAndLoadUpload(file);
      this.evaluators.set(uploadResult.name, uploadResult.evaluator);

      // Add to AI Opponent & Arena selectors
      this.addModelToSelectors(uploadResult.name, `Custom: ${file.name}`);

      if (statusBox) {
        statusBox.className = 'upload-status status-success';
        statusBox.innerHTML = `
          ✅ <strong>ACCEPTED: ${file.name}</strong><br>
          • Model conforms to Cloudfight Tournament contract.<br>
          • Input: <code>${uploadResult.inputName}</code> [1, 16, 8, 8]<br>
          • Policy: <code>${uploadResult.policyOutputName}</code> [1, 4096]<br>
          • Value: <code>${uploadResult.valueOutputName}</code> [1]<br>
          Ready in Play vs AI and Model vs Model Arena!
        `;
      }
      this.showToast(`Model ${file.name} validated & loaded!`, 'green');
    } catch (err) {
      if (statusBox) {
        statusBox.className = 'upload-status status-error';
        statusBox.innerHTML = `❌ <strong>REJECTED</strong>: ${err.message}`;
      }
      this.showToast(`Upload failed: ${err.message}`, 'danger');
    }
  }

  addModelToSelectors(id, displayName) {
    const selectors = ['sel-ai-model', 'arena-model-a', 'arena-model-b'];
    selectors.forEach((selId) => {
      const sel = document.getElementById(selId);
      if (sel) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = displayName;
        sel.appendChild(opt);
      }
    });
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const playground = new ColonyPlaygroundUI();
  playground.init();
});
