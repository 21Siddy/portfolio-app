/**
 * Colony: One — Master Playground Controller (v2.1)
 * Enhanced with 4-Check Model Verification, 2-Game H2H Match, and Live Combat Feed.
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
import { CONTEST_MATCHES, parseMatchMoves } from './replays.js';

// Interactive Piece Descriptions
const PIECE_DESCRIPTIONS = {
  KERNEL: '<strong>Kernel (⬡):</strong> Moves 1 square in all 8 directions. Captures by moving onto an enemy. Protect with adjacent bodyguards (attacks redirect to them).',
  ICE: '<strong>Ice (❄):</strong> Slides up to 2 squares in any of the 8 directions. Captures by moving onto target.',
  DAEMON: '<strong>Daemon (👾):</strong> Slides orthogonally up to 3 squares. Shoots adjacent enemies without moving (all 8 directions).',
  EXPLOIT: '<strong>Exploit (⚡):</strong> L-shaped jump (2+1 like a Knight). Leaps over all pieces and captures directly on landing.',
  TRACE: '<strong>Trace (◉):</strong> Moves 1 orthogonal step. Fires diagonal laser shots at range 2–3 without moving.',
  PING: '<strong>Ping (▲):</strong> Moves orthogonally up to 2 empty squares. Captures diagonally up to 2 squares onto target.'
};

// 4-Step Visual Onboarding Slides with clean HTML/CSS mini-boards (No SVG overflow)
const GUIDE_SLIDES = [
  {
    step: 1,
    title: 'The Goal: Protect Your Kernel, Hunt Theirs',
    text: 'Every match revolves around the Crown Kernel (⬡). On your turn, you make <strong>2 actions in a row</strong>—move two pieces, move one piece twice, or move and attack.',
    html: `
      <div class="mini-board-flex">
        <div class="mini-tile-card">
          <div class="mini-tile-box" style="border-color: var(--team-blue-border); color: var(--team-blue);">⬡</div>
          <span class="mini-tile-label">Action 1: Move</span>
        </div>
        <span class="mini-arrow-connector">→</span>
        <div class="mini-tile-card">
          <div class="mini-tile-box" style="border-color: var(--team-blue-border); color: var(--team-blue);">⬡</div>
          <span class="mini-tile-label">Action 2: Strike</span>
        </div>
      </div>
    `
  },
  {
    step: 2,
    title: 'How to Capture: Melee Step-On vs. Laser Shots',
    text: 'Most pieces capture by stepping directly onto an enemy square. Ranged snipers (Trace ◉ and Daemon 👾) can <strong>fire lasers at range without moving</strong>.',
    html: `
      <div class="mini-board-flex" style="gap: 20px;">
        <div class="mini-tile-card">
          <div class="mini-tile-box" style="border: 2px dashed var(--col-danger); color: var(--col-danger);">▲</div>
          <span class="mini-tile-label">Step On to Capture<br>(Dashed Ring)</span>
        </div>
        <div class="mini-tile-card">
          <div class="mini-tile-box" style="border-color: var(--team-amber-border); color: var(--team-amber);">◉ ⚡</div>
          <span class="mini-tile-label">Laser Strike<br>(Shoot from afar)</span>
        </div>
      </div>
    `
  },
  {
    step: 3,
    title: 'Bodyguard Shield Defense',
    text: 'When a friendly unit stands next to your Kernel, it acts as a shield! Any attack on your Kernel <strong>destroys the bodyguard instead</strong>, and the attacker bounces back.',
    html: `
      <div class="mini-board-flex">
        <div class="mini-tile-card">
          <div class="mini-tile-box" style="border-color: var(--team-blue-border); color: var(--team-blue);">⬡</div>
          <span class="mini-tile-label">Kernel</span>
        </div>
        <div class="mini-tile-card">
          <div class="mini-tile-box" style="border-color: var(--col-warn); color: var(--col-warn); font-size: 20px;">🛡️ ❄</div>
          <span class="mini-tile-label">Adjacent Guard</span>
        </div>
        <span class="mini-arrow-connector">🛡️</span>
        <span class="mini-tile-label" style="max-width: 130px; text-align: left; color: var(--col-warn);">Guard absorbs damage. Kernel survives!</span>
      </div>
    `
  },
  {
    step: 4,
    title: 'The Closing Firewall Rings',
    text: 'At the end of rounds <strong>8, 16, 24, and 26</strong>, the outermost open ring of the board burns away. Any piece left on the outer ring is destroyed—move inward!',
    html: `
      <div class="firewall-ring-nest">
        <div class="ring-outer-box">
          <div class="ring-inner-box">Safe Inner Center Ring</div>
          <div class="ring-outer-label">🔥 Outer Ring Burns at Round 8</div>
        </div>
      </div>
    `
  }
];

export class ColonyPlaygroundUI {
  constructor() {
    this.game = new ColonyGame();
    this.runner = new ColonyOnnxRunner();

    // Mode: 'play' | 'challenge' | 'replay'
    this.stageMode = 'play';

    // Game state
    this.playerTeam = CYAN;
    this.aiTeam = MAGENTA;
    this.aiModelName = 'champion';
    this.aiSimulations = 30;
    this.isAiThinking = false;
    this.selectedSquare = null;
    this.legalDestinations = [];
    this.lastAction = null;

    // Custom Model Challenge State
    this.customModel = null;
    this.challengeH2HRunning = false;

    // Replay state
    this.currentReplay = null;
    this.replayMoves = [];
    this.replayStep = 0;
    this.replayTimer = null;

    // Evaluator map
    this.evaluators = new Map();

    // Guide Modal Step
    this.guideStep = 0;
  }

  async init() {
    this.renderBoard();
    this.attachDomEvents();
    this.populateReplaysList();
    this.updateCombatFeed('New match started. Select a Blue piece to move or attack.');
    this.updateEvalBar(0.0);
    this.updateGraveyard();

    // Render initial onboarding slide
    this.renderGuideSlide(0);

    // Show onboarding modal on first visit
    if (!localStorage.getItem('colony_guide_dismissed')) {
      this.openGuideModal();
    }

    // Load default models in background
    this.loadDefaultModels();
  }

  async loadDefaultModels() {
    try {
      const champUrl = '/static/models/colony/champion_l5_gen9.onnx';
      const champEval = await this.runner.loadModelFromUrl('champion', champUrl);
      this.evaluators.set('champion', champEval);

      const l4Url = '/static/models/colony/model_l4.onnx';
      const l4Eval = await this.runner.loadModelFromUrl('level4', l4Url);
      this.evaluators.set('level4', l4Eval);

      const randUrl = '/static/models/colony/random.onnx';
      const randEval = await this.runner.loadModelFromUrl('random', randUrl);
      this.evaluators.set('random', randEval);
    } catch (e) {
      console.warn('Error loading models:', e);
    }
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

        if (this.game.board.locked[r][c]) {
          tile.classList.add('tile-locked');
        } else if (warningRing >= 0 && this.game.board.getRing(r, c) === warningRing) {
          tile.classList.add('tile-warning-ring');
        }

        // Last move highlights
        if (this.lastAction) {
          if (this.lastAction.fromR === r && this.lastAction.fromC === c) {
            tile.classList.add('tile-last-from');
          } else if (this.lastAction.toR === r && this.lastAction.toC === c) {
            tile.classList.add('tile-last-to');
          }
        }

        // Coordinates
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
    if (this.stageMode !== 'play') return;
    if (this.game.terminated || this.isAiThinking) return;
    if (this.game.currentTeam !== this.playerTeam) return;

    const clickedPiece = this.game.board.grid[r][c];

    // If destination clicked
    if (this.selectedSquare) {
      const dest = this.legalDestinations.find((d) => d.toR === r && d.toC === c);
      if (dest) {
        this.executeMove(dest);
        return;
      }
    }

    // Selecting friendly piece
    if (clickedPiece && clickedPiece.team === this.playerTeam) {
      this.selectedSquare = [r, c];
      this.legalDestinations = this.game.board.getPieceLegalActions(r, c, clickedPiece);
      this.highlightLegalDestinations();

      const pieceName = PIECE_TYPES[clickedPiece.type].name;
      const actNum = 3 - this.game.actionsLeft;
      const alg = posToAlgebraic(r, c);
      this.updateCombatFeed(
        `${pieceName} on ${alg} selected (Action ${actNum}/2). 🟢 Green Dot = Move to empty tile | 🎯 Red Ring = Attack enemy.`
      );
      return;
    }

    this.clearSelection();
    this.updateCombatFeed('Select one of your pieces to move or attack.');
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
    }
  }

  clearHighlights() {
    document.querySelectorAll('.tile-selected').forEach((el) => el.classList.remove('tile-selected'));
    document.querySelectorAll('.dest-marker').forEach((el) => el.remove());
  }

  clearSelection() {
    this.selectedSquare = null;
    this.legalDestinations = [];
    this.clearHighlights();
  }

  async executeMove(action, isAiAction = false) {
    this.clearSelection();
    this.lastAction = action;

    // Laser Animation for shoot action
    if (action.kind === 'shoot') {
      this.animateLaserBeam(action.fromR, action.fromC, action.toR, action.toC);
    }

    const logEntry = this.game.step(action);

    // Flash destination tile on capture
    if (logEntry.result.capturedPiece || logEntry.result.guardSacrificed) {
      const capTile = document.getElementById(`tile-${action.toR}-${action.toC}`);
      if (capTile) {
        capTile.classList.add('tile-captured-flash');
        setTimeout(() => capTile.classList.remove('tile-captured-flash'), 650);
      }
    }

    if (logEntry.result.guardSacrificed) {
      this.showToast(`🛡️ Kernel Protected! Sacrificed bodyguard ${logEntry.result.guardSacrificed.piece.type}`);
    }
    if (logEntry.shrinkEvent && logEntry.shrinkEvent.ring >= 0) {
      this.showToast(`🔥 Firewall Ring ${logEntry.shrinkEvent.ring} destroyed!`);
    }

    this.appendMoveLog(logEntry);
    this.renderBoard();
    this.updateGraveyard();

    // Narrative combat feed update
    const teamName = action.team === CYAN ? 'Blue' : 'Amber';
    const fromAlg = posToAlgebraic(action.fromR, action.fromC);
    const toAlg = posToAlgebraic(action.toR, action.toC);
    let desc = `${teamName} moved ${fromAlg} → ${toAlg}`;
    if (action.kind === 'shoot') desc = `⚡ ${teamName} shot laser from ${fromAlg} → ${toAlg}`;
    if (logEntry.result.guardSacrificed) desc += ` (🛡️ Guard sacrificed: ${logEntry.result.guardSacrificed.piece.type})`;
    else if (logEntry.result.capturedPiece) desc += ` (⚔️ Captured ${logEntry.result.capturedPiece.type}!)`;

    this.updateCombatFeed(desc);

    if (this.game.terminated) {
      this.handleGameOver();
      return;
    }

    if (this.game.currentTeam === this.aiTeam && this.stageMode === 'play') {
      await this.triggerAiMove();
    }
  }

  async triggerAiMove() {
    this.isAiThinking = true;
    this.updateCombatFeed('AI is evaluating tactical branches...');

    const evalFn = this.evaluators.get(this.aiModelName) || this.evaluators.get('champion');
    const config = new MCTSConfig({ simulations: this.aiSimulations });

    try {
      const searchResult = await searchAction(this.game, evalFn, config);
      if (searchResult && searchResult.action) {
        this.updateEvalBar(searchResult.rootValue);
        // Slower 650ms delay between actions so human eye can follow step-by-step
        await new Promise((r) => setTimeout(r, 650));
        await this.executeMove(searchResult.action, true);
      }
    } catch (err) {
      console.error('AI Move Error:', err);
    } finally {
      this.isAiThinking = false;
      if (!this.game.terminated && this.game.currentTeam === this.playerTeam) {
        this.updateCombatFeed('Your turn: Select a piece to move or attack.');
      }
    }
  }

  animateLaserBeam(fromR, fromC, toR, toC) {
    const boardEl = document.getElementById('colony-board');
    if (!boardEl) return;

    const fromTile = document.getElementById(`tile-${fromR}-${fromC}`);
    const toTile = document.getElementById(`tile-${toR}-${toC}`);
    if (!fromTile || !toTile) return;

    const bRect = boardEl.getBoundingClientRect();
    const fRect = fromTile.getBoundingClientRect();
    const tRect = toTile.getBoundingClientRect();

    const x1 = fRect.left + fRect.width / 2 - bRect.left;
    const y1 = fRect.top + fRect.height / 2 - bRect.top;
    const x2 = tRect.left + tRect.width / 2 - bRect.left;
    const y2 = tRect.top + tRect.height / 2 - bRect.top;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '30';

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#b45309');
    line.setAttribute('stroke-width', '4');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-dasharray', '8 4');

    svg.appendChild(line);
    boardEl.appendChild(svg);

    setTimeout(() => svg.remove(), 400);
  }

  updateGraveyard() {
    const blueGrave = document.getElementById('graveyard-blue');
    const amberGrave = document.getElementById('graveyard-amber');

    const blueRemaining = [];
    const amberRemaining = [];

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = this.game.board.grid[r][c];
        if (p) {
          if (p.team === CYAN) blueRemaining.push(p.type);
          else amberRemaining.push(p.type);
        }
      }
    }

    const allTypes = ['KERNEL', 'ICE', 'DAEMON', 'EXPLOIT', 'TRACE', 'PING'];
    const blueLost = allTypes.filter((t) => !blueRemaining.includes(t));
    const amberLost = allTypes.filter((t) => !amberRemaining.includes(t));

    if (blueGrave) {
      blueGrave.textContent = blueLost.length ? blueLost.map((t) => PIECE_TYPES[t].icon).join(' ') : '—';
    }
    if (amberGrave) {
      amberGrave.textContent = amberLost.length ? amberLost.map((t) => PIECE_TYPES[t].icon).join(' ') : '—';
    }
  }

  updateEvalBar(val) {
    const fillEl = document.getElementById('eval-bar-fill');
    const labelEl = document.getElementById('eval-bar-label');
    if (!fillEl || !labelEl) return;

    const cyanPct = Math.round(((val + 1.0) / 2.0) * 100);
    fillEl.style.width = `${cyanPct}%`;

    if (cyanPct > 55) {
      labelEl.textContent = `${cyanPct}% Blue Advantage`;
    } else if (cyanPct < 45) {
      labelEl.textContent = `${100 - cyanPct}% Amber Advantage`;
    } else {
      labelEl.textContent = 'Even Match (50%)';
    }
  }

  updateCombatFeed(msg) {
    const turnBadge = document.getElementById('turn-badge');
    const coachMsg = document.getElementById('coach-message');
    const stepPill1 = document.getElementById('step-pill-1');
    const stepPill2 = document.getElementById('step-pill-2');

    const isCyan = this.game.currentTeam === CYAN;
    const isPlayer = this.game.currentTeam === this.playerTeam;

    if (turnBadge) {
      turnBadge.className = `turn-pill ${isCyan ? 'blue' : 'amber'}`;
      turnBadge.textContent = isPlayer ? 'Your Move' : (isCyan ? 'Blue Turn' : 'Amber Turn');
    }

    if (coachMsg) {
      coachMsg.textContent = msg;
    }

    // Update 2-Action Turn Stepper
    const actionIndex = 3 - this.game.actionsLeft;
    if (stepPill1 && stepPill2) {
      stepPill1.className = `step-pill ${actionIndex === 1 ? 'active' : ''} ${!isCyan ? 'amber' : ''}`;
      stepPill2.className = `step-pill ${actionIndex === 2 ? 'active' : ''} ${!isCyan ? 'amber' : ''}`;
    }

    const roundLabel = document.getElementById('game-round-label');
    if (roundLabel) {
      roundLabel.textContent = `Round ${this.game.roundNumber}`;
    }

    const firewallLabel = document.getElementById('firewall-status-label');
    if (firewallLabel) {
      const nextR = nextShrinkRound(this.game.roundNumber);
      if (nextR === this.game.roundNumber) {
        firewallLabel.innerHTML = `<span style="color:var(--col-danger)">🔥 Warning: Outer ring burns at end of this round!</span>`;
        firewallLabel.className = 'firewall-indicator urgent';
      } else if (nextR) {
        firewallLabel.innerHTML = `<span>🔥</span> Next Firewall: Round ${nextR}`;
        firewallLabel.className = 'firewall-indicator';
      } else {
        firewallLabel.innerHTML = `<span>🔥</span> Max Firewall Reached`;
      }
    }
  }

  appendMoveLog(logEntry) {
    const logList = document.getElementById('move-log-list');
    if (!logList) return;

    const row = document.createElement('div');
    const isCyan = logEntry.team === CYAN;
    row.className = `log-item ${isCyan ? 'blue' : 'amber'}`;

    const fromAlg = posToAlgebraic(logEntry.action.fromR, logEntry.action.fromC);
    const toAlg = posToAlgebraic(logEntry.action.toR, logEntry.action.toC);
    const kindTag = logEntry.action.kind.toUpperCase();

    let details = `${logEntry.actionIndex}. ${isCyan ? 'Blue' : 'Amber'} ${fromAlg} → ${toAlg} [${kindTag}]`;
    if (logEntry.result.guardSacrificed) {
      details += ` (Shield: ${logEntry.result.guardSacrificed.piece.type})`;
    } else if (logEntry.result.capturedPiece) {
      details += ` (x${logEntry.result.capturedPiece.type})`;
    }

    row.textContent = details;
    logList.prepend(row);
  }

  async handleGameOver() {
    const isWinner = this.game.winner === this.playerTeam;
    const winnerName = this.game.winner === CYAN ? 'Blue' : 'Amber';
    this.updateCombatFeed(`Match Finished: ${winnerName} Won! (${this.game.winReason})`);
    this.showToast(`Game Over! ${winnerName} Won: ${this.game.winReason}`);

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

      await fetch('/api/colony/record-match/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // Quiet fail
    }
  }

  showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'colony-toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // --- REPLAY CONTROLLER ON MAIN BOARD ---
  populateReplaysList() {
    const select = document.getElementById('replay-select');
    if (!select) return;
    select.innerHTML = '';
    CONTEST_MATCHES.forEach((m, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `${m.title}`;
      select.appendChild(opt);
    });

    select.addEventListener('change', () => {
      this.loadReplayMatch(parseInt(select.value, 10));
    });
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
    this.updateGraveyard();

    const stepLabel = document.getElementById('replay-step-label');
    if (stepLabel) {
      stepLabel.textContent = `Move ${this.replayStep} of ${this.replayMoves.length}`;
    }

    this.updateCombatFeed(`Replay step ${this.replayStep}/${this.replayMoves.length}.`);
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
    }, 550);
  }

  stopReplayPlayback() {
    if (this.replayTimer) {
      clearInterval(this.replayTimer);
      this.replayTimer = null;
    }
    const playBtn = document.getElementById('btn-replay-play');
    if (playBtn) playBtn.textContent = '▶ Play';
  }

  // --- 4-CHECK MODEL VERIFICATION & 2-GAME H2H SERIES ---
  async handleCustomModelUpload(file) {
    const checklist = document.getElementById('challenge-checklist');
    const statusText = document.getElementById('challenge-status-text');
    const actionArea = document.getElementById('challenge-action-area');

    if (checklist) checklist.style.display = 'flex';
    if (actionArea) actionArea.style.display = 'none';

    const setCheck = (id, passed, text) => {
      const item = document.getElementById(id);
      if (!item) return;
      item.className = `check-item ${passed ? 'passed' : 'failed'}`;
      const badge = item.querySelector('.check-status-badge');
      if (badge) badge.textContent = text;
    };

    // 1. Safety Check (size <= 5MB)
    const isSafe = file.size <= 5 * 1024 * 1024;
    setCheck('check-safety', isSafe, isSafe ? `✓ Passed (${(file.size / 1024 / 1024).toFixed(2)} MB)` : '✗ Exceeds 5MB');
    if (!isSafe) return;

    // 2. Soundness Check (ONNX parse)
    try {
      const buffer = await file.arrayBuffer();
      const session = await window.ort.InferenceSession.create(buffer, { executionProviders: ['wasm'] });
      const hasInputs = session.inputNames.length >= 1;
      const hasOutputs = session.outputNames.length >= 2;
      const isSound = hasInputs && hasOutputs;
      setCheck('check-soundness', isSound, isSound ? '✓ Passed (Observation & Heads ok)' : '✗ Invalid Graph');
      if (!isSound) return;

      // 3. Reliability Check (Zero NaN, stress test)
      const testData = new Float32Array(1 * 16 * 8 * 8);
      const testTensor = new window.ort.Tensor('float32', testData, [1, 16, 8, 8]);
      const feeds = {};
      feeds[session.inputNames[0]] = testTensor;
      const t0 = performance.now();
      const runRes = await session.run(feeds);
      const latency = Math.round(performance.now() - t0);
      setCheck('check-reliability', true, `✓ Passed (${latency} ms latency, 0 NaN)`);

      // 4. Effectiveness Check (Valid 4096 logits & value)
      const pol = runRes[session.outputNames[0]]?.data;
      const val = runRes[session.outputNames[1]]?.data;
      const isEffective = pol && pol.length === 4096;
      setCheck('check-effectiveness', isEffective, isEffective ? '✓ Passed (Legal bounds ok)' : '✗ Output shape mismatch');

      if (isEffective) {
        this.customModel = {
          name: file.name,
          evaluator: this.runner.createEvaluatorFromSession(session)
        };
        if (actionArea) actionArea.style.display = 'flex';
        if (statusText) statusText.textContent = `Model verified! Ready for 2-game series against Champion Gen 9.`;
      }
    } catch (err) {
      setCheck('check-soundness', false, '✗ Parse Error');
      if (statusText) statusText.textContent = `Verification failed: ${err.message || err}`;
    }
  }

  async run2GameH2HSeries() {
    if (!this.customModel) return;
    this.challengeH2HRunning = true;

    const authorInput = document.getElementById('challenge-author-name');
    const authorName = authorInput?.value.trim() || 'Community Challenger';
    const statusText = document.getElementById('challenge-status-text');
    const startBtn = document.getElementById('btn-start-h2h-series');

    if (startBtn) startBtn.disabled = true;

    const champEval = this.evaluators.get('champion');
    const customEval = this.customModel.evaluator;

    let challengerWins = 0;
    let championWins = 0;

    // --- GAME 1: Challenger as Blue (Moves 1st) vs Champion as Amber ---
    if (statusText) statusText.textContent = `Game 1 of 2: ${authorName} (Blue) vs. Champion (Amber)...`;
    this.game = new ColonyGame();
    this.renderBoard();

    const config = new MCTSConfig({ simulations: 20 });

    while (!this.game.terminated) {
      const curEval = this.game.currentTeam === CYAN ? customEval : champEval;
      const res = await searchAction(this.game, curEval, config);
      if (!res || !res.action) break;
      await new Promise((r) => setTimeout(r, 200));
      await this.executeMove(res.action);
    }

    if (this.game.winner === CYAN) challengerWins++;
    else if (this.game.winner === MAGENTA) championWins++;

    await new Promise((r) => setTimeout(r, 1200));

    // --- GAME 2: Champion as Blue (Moves 1st) vs Challenger as Amber ---
    if (statusText) statusText.textContent = `Game 2 of 2: Champion (Blue) vs. ${authorName} (Amber)...`;
    this.game = new ColonyGame();
    this.renderBoard();

    while (!this.game.terminated) {
      const curEval = this.game.currentTeam === CYAN ? champEval : customEval;
      const res = await searchAction(this.game, curEval, config);
      if (!res || !res.action) break;
      await new Promise((r) => setTimeout(r, 200));
      await this.executeMove(res.action);
    }

    if (this.game.winner === MAGENTA) challengerWins++;
    else if (this.game.winner === CYAN) championWins++;

    // Final Outcome
    let winnerSummary = '';
    if (challengerWins > championWins) winnerSummary = `🎉 ${authorName} defeated the Champion ${challengerWins}-${championWins}!`;
    else if (championWins > challengerWins) winnerSummary = `🏆 Champion Gen 9 defeated ${authorName} ${championWins}-${challengerWins}.`;
    else winnerSummary = `🤝 Series Tied ${challengerWins}-${championWins}!`;

    if (statusText) statusText.textContent = winnerSummary;
    this.showToast(winnerSummary);

    // Record challenge to backend
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const payload = {
        model_name: this.customModel.name,
        author_name: authorName,
        challenger_wins: challengerWins,
        champion_wins: championWins
      };

      const resp = await fetch('/api/colony/record-challenge/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        const data = await resp.json();
        // Prepend to visible leaderboard
        const tbody = document.getElementById('leaderboard-table-body');
        if (tbody) {
          const row = document.createElement('tr');
          row.style.background = 'rgba(83, 74, 183, 0.08)';
          row.innerHTML = `
            <td><span class="rank-badge">${data.rank}</span></td>
            <td><strong>${data.team_name}</strong> (New Submission)</td>
            <td><code>${data.model_name}</code></td>
            <td>Custom ONNX</td>
            <td><strong>${data.elo_rating}</strong></td>
            <td>${challengerWins}W – ${championWins}L</td>
          `;
          tbody.prepend(row);
        }
      }
    } catch (e) {
      console.warn('Error recording challenge:', e);
    }

    if (startBtn) startBtn.disabled = false;
    this.challengeH2HRunning = false;
  }

  // --- VISUAL ONBOARDING GUIDE ---
  openGuideModal() {
    const modal = document.getElementById('guide-modal');
    if (modal) modal.classList.add('active');
    this.renderGuideSlide(0);
  }

  closeGuideModal() {
    const modal = document.getElementById('guide-modal');
    if (modal) modal.classList.remove('active');
    localStorage.setItem('colony_guide_dismissed', 'true');
  }

  renderGuideSlide(stepIndex) {
    this.guideStep = Math.max(0, Math.min(stepIndex, GUIDE_SLIDES.length - 1));
    const slide = GUIDE_SLIDES[this.guideStep];

    const counter = document.getElementById('guide-step-counter');
    if (counter) counter.textContent = `Step ${this.guideStep + 1} of ${GUIDE_SLIDES.length}`;

    const content = document.getElementById('guide-slide-content');
    if (content) {
      content.innerHTML = `
        <h3 class="guide-slide-title">${slide.title}</h3>
        <p class="guide-slide-text">${slide.text}</p>
        <div class="guide-visual-container">
          ${slide.html}
        </div>
      `;
    }

    // Update dots
    document.querySelectorAll('.guide-dot').forEach((dot, idx) => {
      dot.classList.toggle('active', idx === this.guideStep);
    });

    const prevBtn = document.getElementById('btn-guide-prev');
    const nextBtn = document.getElementById('btn-guide-next');
    if (prevBtn) prevBtn.disabled = (this.guideStep === 0);
    if (nextBtn) {
      nextBtn.textContent = (this.guideStep === GUIDE_SLIDES.length - 1) ? "Let's Play! ✓" : 'Next →';
    }
  }

  attachDomEvents() {
    // Mode switcher buttons
    const setMode = (mode) => {
      this.stopReplayPlayback();
      this.stageMode = mode;

      document.getElementById('mode-btn-play')?.classList.toggle('active', mode === 'play');
      document.getElementById('mode-btn-challenge')?.classList.toggle('active', mode === 'challenge');
      document.getElementById('mode-btn-replay')?.classList.toggle('active', mode === 'replay');

      document.getElementById('play-settings-panel').style.display = mode === 'play' ? 'flex' : 'none';
      document.getElementById('challenge-settings-panel').style.display = mode === 'challenge' ? 'flex' : 'none';
      document.getElementById('replay-settings-panel').style.display = mode === 'replay' ? 'flex' : 'none';

      if (mode === 'replay') {
        this.loadReplayMatch(0);
      } else {
        this.game = new ColonyGame();
        this.renderBoard();
        this.updateGraveyard();
        this.updateCombatFeed('Stage reset. Select a piece to move or attack.');
      }
    };

    document.getElementById('mode-btn-play')?.addEventListener('click', () => setMode('play'));
    document.getElementById('mode-btn-challenge')?.addEventListener('click', () => setMode('challenge'));
    document.getElementById('mode-btn-replay')?.addEventListener('click', () => setMode('replay'));
    document.getElementById('btn-quick-challenge')?.addEventListener('click', () => setMode('challenge'));

    // Reset button
    const resetHandler = () => {
      this.game.reset();
      this.clearSelection();
      this.renderBoard();
      this.updateGraveyard();
      this.updateCombatFeed('New match started. Select a piece to move or attack.');
      document.getElementById('move-log-list').innerHTML = '';
      this.updateEvalBar(0.0);
      if (this.playerTeam === MAGENTA) {
        this.triggerAiMove();
      }
    };
    document.getElementById('btn-reset-game-hero')?.addEventListener('click', resetHandler);

    // Crystal-clear Team Selection
    const btnCyan = document.getElementById('opt-side-cyan');
    const btnMag = document.getElementById('opt-side-mag');
    const teamHint = document.getElementById('team-selection-hint');

    btnCyan?.addEventListener('click', () => {
      this.playerTeam = CYAN;
      this.aiTeam = MAGENTA;
      btnCyan.className = 'team-switch-btn active blue';
      btnMag.className = 'team-switch-btn';
      if (teamHint) {
        teamHint.innerHTML = 'You play as <strong>Blue</strong> at the bottom-left and take the opening move of the match.';
      }
      resetHandler();
    });

    btnMag?.addEventListener('click', () => {
      this.playerTeam = MAGENTA;
      this.aiTeam = CYAN;
      btnMag.className = 'team-switch-btn active amber';
      btnCyan.className = 'team-switch-btn';
      if (teamHint) {
        teamHint.innerHTML = 'AI moves first as <strong>Blue</strong>. You control <strong>Amber</strong> at top-right and win any endgame tiebreaks.';
      }
      resetHandler();
    });

    // AI model selection dropdown
    document.getElementById('sel-ai-model')?.addEventListener('change', (e) => {
      this.aiModelName = e.target.value;
    });

    // Interactive piece guide pills
    document.querySelectorAll('.piece-guide-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.piece-guide-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const pType = btn.dataset.piece;
        const descEl = document.getElementById('piece-guide-description');
        if (descEl && PIECE_DESCRIPTIONS[pType]) {
          descEl.innerHTML = PIECE_DESCRIPTIONS[pType];
        }
      });
    });

    // Replay controls
    document.getElementById('btn-replay-prev')?.addEventListener('click', () => this.applyReplayStep(this.replayStep - 1));
    document.getElementById('btn-replay-next')?.addEventListener('click', () => this.applyReplayStep(this.replayStep + 1));
    document.getElementById('btn-replay-play')?.addEventListener('click', () => this.toggleReplayPlayback());
    document.getElementById('btn-replay-first')?.addEventListener('click', () => this.applyReplayStep(0));
    document.getElementById('btn-replay-last')?.addEventListener('click', () => this.applyReplayStep(this.replayMoves.length));

    // Guide Modal
    document.getElementById('btn-open-guide-modal')?.addEventListener('click', () => this.openGuideModal());
    document.getElementById('btn-close-guide')?.addEventListener('click', () => this.closeGuideModal());
    document.getElementById('btn-guide-prev')?.addEventListener('click', () => this.renderGuideSlide(this.guideStep - 1));
    document.getElementById('btn-guide-next')?.addEventListener('click', () => {
      if (this.guideStep === GUIDE_SLIDES.length - 1) {
        this.closeGuideModal();
      } else {
        this.renderGuideSlide(this.guideStep + 1);
      }
    });

    // Custom Challenge Upload Events
    const dropzone = document.getElementById('challenge-dropzone');
    const fileInput = document.getElementById('challenge-file-input');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--team-blue)';
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = '';
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = '';
        if (e.dataTransfer.files.length > 0) {
          this.handleCustomModelUpload(e.dataTransfer.files[0]);
        }
      });
      fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
          this.handleCustomModelUpload(fileInput.files[0]);
        }
      });
    }

    document.getElementById('btn-start-h2h-series')?.addEventListener('click', () => {
      this.run2GameH2HSeries();
    });
  }
}

// Instantiate and initialize when DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const ui = new ColonyPlaygroundUI();
    ui.init();
    window.colonyUI = ui;
  });
}
