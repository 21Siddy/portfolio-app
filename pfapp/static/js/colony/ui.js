/**
 * Colony: One — Minimalist Playground Controller (v2)
 * Single unified board for Play vs AI and Contest Replays.
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
  KERNEL: '<strong>Kernel (⬡):</strong> Moves 1 square in all 8 directions. Protect with adjacent bodyguards (damage redirects to them).',
  ICE: '<strong>Ice (❄):</strong> Slides up to 2 squares in any of the 8 directions. Moves onto target to capture.',
  DAEMON: '<strong>Daemon (👾):</strong> Slides orthogonally up to 3 squares. Shoots adjacent enemies without moving (all 8 directions).',
  EXPLOIT: '<strong>Exploit (⚡):</strong> L-shaped jump (2+1 like a Knight). Jumps over pieces and locked squares to capture on landing.',
  TRACE: '<strong>Trace (◉):</strong> Moves 1 orthogonal step. Fires diagonal laser shots at range 2–3 without moving.',
  PING: '<strong>Ping (▲):</strong> Moves orthogonally up to 2 empty squares. Captures diagonally up to 2 squares onto target.'
};

// 4-Step Visual Onboarding Slides
const GUIDE_SLIDES = [
  {
    step: 1,
    title: 'The Goal: Protect Your Kernel, Hunt Theirs',
    text: 'Every game revolves around the Crown Kernel (⬡). On your turn, you make <strong>2 actions in a row</strong>—move two pieces, move one piece twice, or move and attack.',
    svg: `<svg width="240" height="120" viewBox="0 0 240 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="20" width="80" height="80" rx="8" fill="var(--bg)" stroke="var(--border)" stroke-width="1.5"/>
      <text x="60" y="65" font-size="28" text-anchor="middle" fill="var(--team-blue)">⬡</text>
      <text x="60" y="90" font-size="11" text-anchor="middle" fill="var(--text-secondary)" font-family="monospace">Action 1: Move</text>
      <path d="M 105 60 L 135 60" stroke="var(--team-blue)" stroke-width="2" marker-end="url(#arr-guide)"/>
      <rect x="140" y="20" width="80" height="80" rx="8" fill="var(--bg)" stroke="var(--border)" stroke-width="1.5"/>
      <text x="180" y="65" font-size="28" text-anchor="middle" fill="var(--team-blue)">⬡</text>
      <text x="180" y="90" font-size="11" text-anchor="middle" fill="var(--text-secondary)" font-family="monospace">Action 2: Strike</text>
    </svg>`
  },
  {
    step: 2,
    title: 'Melee Moves vs. Ranged Laser Shots',
    text: 'Standard units step onto enemy squares to capture. Specialized sniper units (like Trace ◉ and Daemon 👾) can <strong>fire lasers at range without moving</strong>.',
    svg: `<svg width="240" height="120" viewBox="0 0 240 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="30" y="30" width="55" height="55" rx="6" fill="var(--bg)" stroke="var(--border)"/>
      <text x="57" y="66" font-size="22" text-anchor="middle" fill="var(--team-blue)">◉</text>
      <line x1="88" y1="57" x2="152" y2="57" stroke="var(--team-amber)" stroke-width="3" stroke-dasharray="4 2"/>
      <rect x="155" y="30" width="55" height="55" rx="6" fill="var(--bg)" stroke="var(--border)"/>
      <text x="182" y="66" font-size="22" text-anchor="middle" fill="var(--col-danger)">▲</text>
      <text x="120" y="105" font-size="11" text-anchor="middle" fill="var(--text-secondary)" font-family="monospace">Laser Strike at Range 2-3</text>
    </svg>`
  },
  {
    step: 3,
    title: 'Bodyguard Shield Defense',
    text: 'When a friendly unit stands next to your Kernel, it acts as a shield! Any attack on your Kernel <strong>destroys the bodyguard instead</strong>, bouncing the attacker back.',
    svg: `<svg width="240" height="120" viewBox="0 0 240 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="40" y="30" width="55" height="55" rx="6" fill="var(--bg)" stroke="var(--team-blue-border)" stroke-width="1.5"/>
      <text x="67" y="66" font-size="22" text-anchor="middle" fill="var(--team-blue)">⬡</text>
      <rect x="100" y="30" width="55" height="55" rx="6" fill="var(--bg)" stroke="var(--col-warn)" stroke-width="1.5"/>
      <text x="127" y="66" font-size="20" text-anchor="middle" fill="var(--col-warn)">🛡️ ❄</text>
      <text x="120" y="105" font-size="11" text-anchor="middle" fill="var(--col-warn)" font-family="monospace">Guard Absorbs Hit!</text>
    </svg>`
  },
  {
    step: 4,
    title: 'The Closing Firewall Rings',
    text: 'At the end of rounds <strong>8, 16, 24, and 26</strong>, the outermost open ring of the board burns away. Any piece left on the outer ring is vaporized—move toward the center!',
    svg: `<svg width="240" height="120" viewBox="0 0 240 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="50" y="15" width="140" height="90" rx="8" fill="var(--bg)" stroke="var(--col-danger)" stroke-width="2" stroke-dasharray="4 2"/>
      <rect x="75" y="30" width="90" height="60" rx="6" fill="var(--bg-secondary)" stroke="var(--col-safe)" stroke-width="1.5"/>
      <text x="120" y="66" font-size="12" text-anchor="middle" fill="var(--col-safe)" font-family="monospace">Safe Inner Ring</text>
      <text x="120" y="112" font-size="10" text-anchor="middle" fill="var(--col-danger)" font-family="monospace">🔥 Ring Locked at Round 8</text>
    </svg>`
  }
];

export class ColonyPlaygroundUI {
  constructor() {
    this.game = new ColonyGame();
    this.runner = new ColonyOnnxRunner();

    // Mode: 'play' | 'replay'
    this.stageMode = 'play';

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
    this.evaluators = new Map();

    // Guide Modal Step
    this.guideStep = 0;
  }

  async init() {
    this.renderBoard();
    this.attachDomEvents();
    this.populateReplaysList();
    this.updateActionCoach();
    this.updateEvalBar(0.0);

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
    this.setCoachMessage('Loading AI model weights into WebAssembly...');
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

      this.updateActionCoach();
    } catch (e) {
      console.warn('Error loading models:', e);
      this.setCoachMessage('AI ready (heuristic mode).');
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

    // If target clicked
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
      this.setCoachMessage(
        `${pieceName} selected (Action ${actNum}/2): Click a green dot to move, or red target to attack/shoot.`
      );
      return;
    }

    this.clearSelection();
    this.updateActionCoach();
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

  async executeMove(action) {
    this.clearSelection();

    const logEntry = this.game.step(action);

    if (logEntry.result.guardSacrificed) {
      this.showToast(`🛡️ Kernel Protected! Sacrificed ${logEntry.result.guardSacrificed.piece.type}`);
    }
    if (logEntry.shrinkEvent && logEntry.shrinkEvent.ring >= 0) {
      this.showToast(`🔥 Firewall Ring ${logEntry.shrinkEvent.ring} locked!`);
    }

    this.appendMoveLog(logEntry);
    this.renderBoard();
    this.updateActionCoach();

    if (this.game.terminated) {
      this.handleGameOver();
      return;
    }

    if (this.game.currentTeam === this.aiTeam) {
      await this.triggerAiMove();
    }
  }

  async triggerAiMove() {
    this.isAiThinking = true;
    this.setTurnBadge('amber', 'AI Thinking...');
    this.setCoachMessage('The Champion AI is evaluating forward tree branches...');

    const evalFn = this.evaluators.get(this.aiModelName) || this.evaluators.get('champion');
    const config = new MCTSConfig({ simulations: this.aiSimulations });

    try {
      const searchResult = await searchAction(this.game, evalFn, config);
      if (searchResult && searchResult.action) {
        this.updateEvalBar(searchResult.rootValue);
        await new Promise((r) => setTimeout(r, 180));
        await this.executeMove(searchResult.action);
      }
    } catch (err) {
      console.error('AI Move Error:', err);
    } finally {
      this.isAiThinking = false;
      if (!this.game.terminated) {
        this.updateActionCoach();
      }
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

  updateActionCoach() {
    const isPlayer = this.game.currentTeam === this.playerTeam;
    const actNum = 3 - this.game.actionsLeft;

    if (isPlayer) {
      this.setTurnBadge('blue', 'Your Turn');
      this.setCoachMessage(`Action ${actNum} of 2: Click any piece to see where it can move or shoot.`);
    } else {
      this.setTurnBadge('amber', 'AI Turn');
      this.setCoachMessage(`Action ${actNum} of 2: AI Opponent is preparing next action.`);
    }

    const roundLabel = document.getElementById('game-round-label');
    if (roundLabel) {
      roundLabel.textContent = `Round ${this.game.roundNumber}`;
    }

    const firewallLabel = document.getElementById('firewall-status-label');
    if (firewallLabel) {
      const nextR = nextShrinkRound(this.game.roundNumber);
      if (nextR === this.game.roundNumber) {
        firewallLabel.innerHTML = `<span style="color:var(--col-danger)">🔥 Warning: Outer ring locks end of this round!</span>`;
        firewallLabel.className = 'firewall-indicator urgent';
      } else if (nextR) {
        firewallLabel.innerHTML = `<span>🔥</span> Next Firewall: Round ${nextR}`;
        firewallLabel.className = 'firewall-indicator';
      } else {
        firewallLabel.innerHTML = `<span>🔥</span> Maximum Shrink Reached`;
      }
    }
  }

  setTurnBadge(color, text) {
    const badge = document.getElementById('turn-badge');
    if (!badge) return;
    badge.className = `turn-pill ${color}`;
    badge.textContent = text;
  }

  setCoachMessage(msg) {
    const el = document.getElementById('coach-message');
    if (el) el.textContent = msg;
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
      details += ` (Shield x${logEntry.result.guardSacrificed.piece.type})`;
    } else if (logEntry.result.capturedPiece) {
      details += ` (x${logEntry.result.capturedPiece.type})`;
    }

    row.textContent = details;
    logList.prepend(row);
  }

  async handleGameOver() {
    const isWinner = this.game.winner === this.playerTeam;
    this.setTurnBadge(isWinner ? 'blue' : 'amber', 'Game Over');
    this.setCoachMessage(`Match Finished: ${this.game.winner === CYAN ? 'Blue' : 'Amber'} Won! (${this.game.winReason})`);
    this.showToast(`Game Over! ${this.game.winReason}`);

    // Asynchronously record match to backend database
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

    const stepLabel = document.getElementById('replay-step-label');
    if (stepLabel) {
      stepLabel.textContent = `Move ${this.replayStep} of ${this.replayMoves.length}`;
    }

    this.setTurnBadge('blue', 'Replay Mode');
    this.setCoachMessage(`Watching contest replay. Step ${this.replayStep}/${this.replayMoves.length}.`);
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
          ${slide.svg}
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
    document.getElementById('mode-btn-play')?.addEventListener('click', () => {
      this.stopReplayPlayback();
      this.stageMode = 'play';
      document.getElementById('mode-btn-play').classList.add('active');
      document.getElementById('mode-btn-replay').classList.remove('active');
      document.getElementById('play-settings-panel').style.display = 'flex';
      document.getElementById('replay-settings-panel').style.display = 'none';
      this.game = new ColonyGame();
      this.renderBoard();
      this.updateActionCoach();
    });

    document.getElementById('mode-btn-replay')?.addEventListener('click', () => {
      this.stageMode = 'replay';
      document.getElementById('mode-btn-replay').classList.add('active');
      document.getElementById('mode-btn-play').classList.remove('active');
      document.getElementById('play-settings-panel').style.display = 'none';
      document.getElementById('replay-settings-panel').style.display = 'flex';
      this.loadReplayMatch(0);
    });

    // Reset button
    const resetHandler = () => {
      this.game.reset();
      this.clearSelection();
      this.renderBoard();
      this.updateActionCoach();
      document.getElementById('move-log-list').innerHTML = '';
      this.updateEvalBar(0.0);
      if (this.playerTeam === MAGENTA) {
        this.triggerAiMove();
      }
    };
    document.getElementById('btn-reset-game-hero')?.addEventListener('click', resetHandler);

    // Side selection toggles
    document.getElementById('opt-side-cyan')?.addEventListener('click', () => {
      this.playerTeam = CYAN;
      this.aiTeam = MAGENTA;
      resetHandler();
    });
    document.getElementById('opt-side-mag')?.addEventListener('click', () => {
      this.playerTeam = MAGENTA;
      this.aiTeam = CYAN;
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

    // Guide Modal
    document.getElementById('btn-open-guide-modal')?.addEventListener('click', () => {
      this.openGuideModal();
    });
    document.getElementById('btn-close-guide')?.addEventListener('click', () => {
      this.closeGuideModal();
    });
    document.getElementById('btn-guide-prev')?.addEventListener('click', () => {
      this.renderGuideSlide(this.guideStep - 1);
    });
    document.getElementById('btn-guide-next')?.addEventListener('click', () => {
      if (this.guideStep === GUIDE_SLIDES.length - 1) {
        this.closeGuideModal();
      } else {
        this.renderGuideSlide(this.guideStep + 1);
      }
    });

    // Model Upload Dropzone in curious minds section
    this.attachUploadEvents();
  }

  attachUploadEvents() {
    const dropzone = document.getElementById('model-dropzone');
    const fileInput = document.getElementById('model-file-input');
    const statusOut = document.getElementById('upload-status-output');

    if (!dropzone || !fileInput) return;

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
        this.handleModelUpload(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        this.handleModelUpload(fileInput.files[0]);
      }
    });
  }

  async handleModelUpload(file) {
    const statusOut = document.getElementById('upload-status-output');
    if (!statusOut) return;
    statusOut.style.display = 'block';
    statusOut.style.color = 'var(--team-blue)';
    statusOut.textContent = `Validating ${file.name}...`;

    try {
      const result = await this.runner.validateAndLoadUpload(file);
      this.evaluators.set('custom', result.evaluator);

      const sel = document.getElementById('sel-ai-model');
      if (sel) {
        let opt = sel.querySelector('option[value="custom"]');
        if (!opt) {
          opt = document.createElement('option');
          opt.value = 'custom';
          sel.appendChild(opt);
        }
        opt.textContent = `Custom: ${file.name} (Uploaded)`;
        sel.value = 'custom';
        this.aiModelName = 'custom';
      }

      statusOut.style.color = 'var(--col-safe)';
      statusOut.textContent = `✓ Model verified and loaded: ${file.name} (Shape [1,16,8,8] → [1,4096] & [1])`;
      this.showToast(`Custom model loaded: ${file.name}`);
    } catch (err) {
      statusOut.style.color = 'var(--col-danger)';
      statusOut.textContent = `✗ Upload Error: ${err.message || err}`;
    }
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
