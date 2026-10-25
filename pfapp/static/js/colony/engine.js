/**
 * Colony: One — Core Game Engine
 * Faithfully ports the official Cloudfight tournament referee rules.
 */

export const BOARD_SIZE = 8;
export const CYAN = 'CYAN';
export const MAGENTA = 'MAGENTA';

export const PIECE_TYPES = {
  PING: { name: 'PING', abbr: 'PI', sacrificeRank: 0, icon: '▲' },
  DAEMON: { name: 'DAEMON', abbr: 'DE', sacrificeRank: 3, icon: '👾' },
  EXPLOIT: { name: 'EXPLOIT', abbr: 'EX', sacrificeRank: 1, icon: '⚡' },
  TRACE: { name: 'TRACE', abbr: 'TR', sacrificeRank: 2, icon: '◉' },
  ICE: { name: 'ICE', abbr: 'IC', sacrificeRank: 4, icon: '❄' },
  KERNEL: { name: 'KERNEL', abbr: 'KE', sacrificeRank: 5, icon: '⬡' }
};

export const PIECE_ORDER = [
  PIECE_TYPES.PING,
  PIECE_TYPES.DAEMON,
  PIECE_TYPES.EXPLOIT,
  PIECE_TYPES.TRACE,
  PIECE_TYPES.ICE,
  PIECE_TYPES.KERNEL
];

export const SHRINK_ROUNDS = [8, 16, 24, 26];

// Level 4/5 Starting Layout (Canonical coordinates)
export const STARTING_SETUP = {
  MAGENTA: [
    { type: 'KERNEL', r: 0, c: 7 },
    { type: 'ICE', r: 1, c: 6 },
    { type: 'DAEMON', r: 0, c: 5 },
    { type: 'TRACE', r: 2, c: 7 },
    { type: 'EXPLOIT', r: 1, c: 4 },
    { type: 'PING', r: 3, c: 6 }
  ],
  CYAN: [
    { type: 'KERNEL', r: 7, c: 0 },
    { type: 'ICE', r: 6, c: 1 },
    { type: 'DAEMON', r: 7, c: 2 },
    { type: 'TRACE', r: 5, c: 0 },
    { type: 'EXPLOIT', r: 6, c: 3 },
    { type: 'PING', r: 4, c: 1 }
  ]
};

const ORTHOGONALS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ALL8 = [...ORTHOGONALS, ...DIAGONALS];
const KNIGHT_JUMPS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1]
];

export function sq(r, c) {
  return r * BOARD_SIZE + c;
}

export function fromSq(idx) {
  return [Math.floor(idx / BOARD_SIZE), idx % BOARD_SIZE];
}

export function posToAlgebraic(r, c) {
  const file = String.fromCharCode('A'.charCodeAt(0) + c);
  const rank = 8 - r;
  return `${file}${rank}`;
}

export function algebraicToPos(str) {
  str = str.trim().toUpperCase();
  const c = str.charCodeAt(0) - 'A'.charCodeAt(0);
  const r = 8 - parseInt(str[1], 10);
  return [r, c];
}

export function rotatePos(r, c) {
  return [7 - r, 7 - c];
}

export function canonicalPos(r, c, team) {
  return team === CYAN ? [r, c] : rotatePos(r, c);
}

export function realPos(r, c, team) {
  return canonicalPos(r, c, team);
}

export function firewallUrgency(roundNumber) {
  for (const s of SHRINK_ROUNDS) {
    if (s >= roundNumber) {
      const remaining = s - roundNumber;
      return Math.max(0.0, 1.0 - remaining / 8.0);
    }
  }
  return 0.0;
}

export function nextShrinkRound(roundNumber) {
  for (const s of SHRINK_ROUNDS) {
    if (s >= roundNumber) return s;
  }
  return null;
}

export class ColonyBoard {
  constructor() {
    this.grid = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    this.locked = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(false));
    this.reset();
  }

  reset() {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        this.grid[r][c] = null;
        this.locked[r][c] = false;
      }
    }

    for (const p of STARTING_SETUP.CYAN) {
      this.grid[p.r][p.c] = { team: CYAN, type: p.type, abbr: PIECE_TYPES[p.type].abbr };
    }
    for (const p of STARTING_SETUP.MAGENTA) {
      this.grid[p.r][p.c] = { team: MAGENTA, type: p.type, abbr: PIECE_TYPES[p.type].abbr };
    }
  }

  clone() {
    const copy = new ColonyBoard();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        copy.grid[r][c] = this.grid[r][c] ? { ...this.grid[r][c] } : null;
        copy.locked[r][c] = this.locked[r][c];
      }
    }
    return copy;
  }

  inBounds(r, c) {
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
  }

  isLocked(r, c) {
    return !this.inBounds(r, c) || this.locked[r][c];
  }

  pieceAt(r, c) {
    return this.inBounds(r, c) ? this.grid[r][c] : null;
  }

  getRing(r, c) {
    const centre = 3.5;
    return Math.floor(Math.max(Math.abs(r - centre), Math.abs(c - centre)));
  }

  nextOpenRing() {
    for (let ring = 0; ring < 4; ring++) {
      let isRingLocked = false;
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (this.getRing(r, c) === 3 - ring && this.locked[r][c]) {
            isRingLocked = true;
            break;
          }
        }
        if (isRingLocked) break;
      }
      if (!isRingLocked) return 3 - ring;
    }
    return -1;
  }

  shrinkRing() {
    const targetRing = this.nextOpenRing();
    if (targetRing < 0) return { ring: -1, destroyed: [] };

    const destroyed = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (this.getRing(r, c) === targetRing && !this.locked[r][c]) {
          this.locked[r][c] = true;
          if (this.grid[r][c]) {
            destroyed.push({ ...this.grid[r][c], r, c });
            this.grid[r][c] = null;
          }
        }
      }
    }
    return { ring: targetRing, destroyed };
  }

  onlyKernelsRemain() {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = this.grid[r][c];
        if (p && p.type !== 'KERNEL') return false;
      }
    }
    return true;
  }

  kernelEndgameWinner(actingTeam) {
    if (!this.onlyKernelsRemain()) return null;

    let cyanPos = null;
    let magPos = null;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = this.grid[r][c];
        if (p && p.type === 'KERNEL') {
          if (p.team === CYAN) cyanPos = [r, c];
          else magPos = [r, c];
        }
      }
    }

    if (!cyanPos || !magPos) return MAGENTA;

    const chebDist = Math.max(Math.abs(cyanPos[0] - magPos[0]), Math.abs(cyanPos[1] - magPos[1]));
    if (chebDist <= 2) {
      // The team that just finished its turn loses
      return actingTeam === MAGENTA ? CYAN : MAGENTA;
    }

    const cyanRing = this.getRing(cyanPos[0], cyanPos[1]);
    const magRing = this.getRing(magPos[0], magPos[1]);

    if (cyanRing < magRing) return CYAN;
    return MAGENTA;
  }

  getAdjacentGuards(kernelR, kernelC, team) {
    const guards = [];
    for (const [dr, dc] of ALL8) {
      const nr = kernelR + dr;
      const nc = kernelC + dc;
      if (this.inBounds(nr, nc)) {
        const p = this.grid[nr][nc];
        if (p && p.team === team && p.type !== 'KERNEL') {
          guards.push({ r: nr, c: nc, piece: p, rank: PIECE_TYPES[p.type].sacrificeRank });
        }
      }
    }
    return guards;
  }

  pickGuardToSacrifice(kernelR, kernelC, team) {
    const guards = this.getAdjacentGuards(kernelR, kernelC, team);
    if (guards.length === 0) return null;
    guards.sort((a, b) => a.rank - b.rank);
    return guards[0];
  }

  applyAction(action) {
    const { fromR, fromC, toR, toC, kind } = action;
    const actor = this.grid[fromR][fromC];
    if (!actor) throw new Error(`No piece at (${fromR}, ${fromC})`);

    const target = this.grid[toR][toC];
    let guardSacrifice = null;
    let actualToR = toR;
    let actualToC = toC;
    let moved = true;

    // Check Bodyguard Protection Rule
    if (target && target.type === 'KERNEL') {
      const sacrificedGuard = this.pickGuardToSacrifice(toR, toC, target.team);
      if (sacrificedGuard) {
        guardSacrifice = sacrificedGuard;
        this.grid[sacrificedGuard.r][sacrificedGuard.c] = null; // Guard destroyed!
        moved = false; // Attacker stays at origin!
        return {
          actor: { ...actor },
          action,
          guardSacrificed: guardSacrifice,
          capturedPiece: null,
          moved: false
        };
      }
    }

    let capturedPiece = null;
    if (kind === 'shoot') {
      capturedPiece = this.grid[toR][toC] ? { ...this.grid[toR][toC] } : null;
      this.grid[toR][toC] = null;
      moved = false;
    } else {
      // Move action
      capturedPiece = this.grid[toR][toC] ? { ...this.grid[toR][toC] } : null;
      this.grid[toR][toC] = actor;
      this.grid[fromR][fromC] = null;
      moved = true;
    }

    return {
      actor: { ...actor },
      action,
      guardSacrificed: null,
      capturedPiece,
      moved
    };
  }

  getLegalActions(team) {
    const actions = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = this.grid[r][c];
        if (p && p.team === team && !this.locked[r][c]) {
          actions.push(...this.getPieceLegalActions(r, c, p));
        }
      }
    }
    return actions;
  }

  getPieceLegalActions(r, c, piece) {
    switch (piece.type) {
      case 'PING':
        return this._pingActions(r, c, piece);
      case 'DAEMON':
        return this._daemonActions(r, c, piece);
      case 'EXPLOIT':
        return this._exploitActions(r, c, piece);
      case 'TRACE':
        return this._traceActions(r, c, piece);
      case 'ICE':
        return this._iceActions(r, c, piece);
      case 'KERNEL':
        return this._kernelActions(r, c, piece);
      default:
        return [];
    }
  }

  _pingActions(r, c, piece) {
    const actions = [];
    // Orthogonal empty move up to 2
    for (const [dr, dc] of ORTHOGONALS) {
      for (let dist = 1; dist <= 2; dist++) {
        const nr = r + dr * dist;
        const nc = c + dc * dist;
        if (!this.inBounds(nr, nc) || this.locked[nr][nc]) break;
        if (this.grid[nr][nc] === null) {
          actions.push({ fromR: r, fromC: c, toR: nr, toC: nc, kind: 'move' });
        } else {
          break; // Blocked by any piece
        }
      }
    }
    // Diagonal capture up to 2
    for (const [dr, dc] of DIAGONALS) {
      for (let dist = 1; dist <= 2; dist++) {
        const nr = r + dr * dist;
        const nc = c + dc * dist;
        if (!this.inBounds(nr, nc) || this.locked[nr][nc]) break;
        const target = this.grid[nr][nc];
        if (target !== null) {
          if (target.team !== piece.team) {
            actions.push({ fromR: r, fromC: c, toR: nr, toC: nc, kind: 'move' });
          }
          break; // Blocked after piece
        }
      }
    }
    return actions;
  }

  _daemonActions(r, c, piece) {
    const actions = [];
    // Shoot adjacent enemy (all 8 directions, no movement)
    for (const [dr, dc] of ALL8) {
      const nr = r + dr;
      const nc = c + dc;
      if (this.inBounds(nr, nc) && !this.locked[nr][nc]) {
        const target = this.grid[nr][nc];
        if (target && target.team !== piece.team) {
          actions.push({ fromR: r, fromC: c, toR: nr, toC: nc, kind: 'shoot' });
        }
      }
    }
    // Orthogonal slide up to 3
    for (const [dr, dc] of ORTHOGONALS) {
      for (let dist = 1; dist <= 3; dist++) {
        const nr = r + dr * dist;
        const nc = c + dc * dist;
        if (!this.inBounds(nr, nc) || this.locked[nr][nc]) break;
        const target = this.grid[nr][nc];
        if (target === null) {
          actions.push({ fromR: r, fromC: c, toR: nr, toC: nc, kind: 'move' });
        } else if (target.team !== piece.team && dist > 1) {
          // Move-capture at range 2 or 3
          actions.push({ fromR: r, fromC: c, toR: nr, toC: nc, kind: 'move' });
          break;
        } else {
          break; // Friendly piece, or adjacent enemy blocks movement
        }
      }
    }
    return actions;
  }

  _exploitActions(r, c, piece) {
    const actions = [];
    for (const [dr, dc] of KNIGHT_JUMPS) {
      const nr = r + dr;
      const nc = c + dc;
      if (this.inBounds(nr, nc) && !this.locked[nr][nc]) {
        const target = this.grid[nr][nc];
        if (!target || target.team !== piece.team) {
          actions.push({ fromR: r, fromC: c, toR: nr, toC: nc, kind: 'move' });
        }
      }
    }
    return actions;
  }

  _traceActions(r, c, piece) {
    const actions = [];
    // Orthogonal 1-step move onto empty tile
    for (const [dr, dc] of ORTHOGONALS) {
      const nr = r + dr;
      const nc = c + dc;
      if (this.inBounds(nr, nc) && !this.locked[nr][nc] && this.grid[nr][nc] === null) {
        actions.push({ fromR: r, fromC: c, toR: nr, toC: nc, kind: 'move' });
      }
    }
    // Diagonal shoot at range 2-3 (Trace stays put)
    for (const [dr, dc] of DIAGONALS) {
      for (let dist = 1; dist <= 3; dist++) {
        const nr = r + dr * dist;
        const nc = c + dc * dist;
        if (!this.inBounds(nr, nc) || this.locked[nr][nc]) break;
        const target = this.grid[nr][nc];
        if (target !== null) {
          if (dist >= 2 && target.team !== piece.team) {
            actions.push({ fromR: r, fromC: c, toR: nr, toC: nc, kind: 'shoot' });
          }
          break; // Line blocked
        }
      }
    }
    return actions;
  }

  _iceActions(r, c, piece) {
    const actions = [];
    // Slide up to 2 in all 8 directions, contact capture
    for (const [dr, dc] of ALL8) {
      for (let dist = 1; dist <= 2; dist++) {
        const nr = r + dr * dist;
        const nc = c + dc * dist;
        if (!this.inBounds(nr, nc) || this.locked[nr][nc]) break;
        const target = this.grid[nr][nc];
        if (target === null) {
          actions.push({ fromR: r, fromC: c, toR: nr, toC: nc, kind: 'move' });
        } else if (target.team !== piece.team) {
          actions.push({ fromR: r, fromC: c, toR: nr, toC: nc, kind: 'move' });
          break;
        } else {
          break;
        }
      }
    }
    return actions;
  }

  _kernelActions(r, c, piece) {
    const actions = [];
    for (const [dr, dc] of ALL8) {
      const nr = r + dr;
      const nc = c + dc;
      if (this.inBounds(nr, nc) && !this.locked[nr][nc]) {
        const target = this.grid[nr][nc];
        if (!target || target.team !== piece.team) {
          actions.push({ fromR: r, fromC: c, toR: nr, toC: nc, kind: 'move' });
        }
      }
    }
    return actions;
  }
}

export class ColonyGame {
  constructor() {
    this.board = new ColonyBoard();
    this.currentTeam = CYAN;
    this.actionsLeft = 2;
    this.roundNumber = 1;
    this.actionCount = 0;
    this.history = [];
    this.terminated = false;
    this.winner = null;
    this.winReason = null;
  }

  reset() {
    this.board.reset();
    this.currentTeam = CYAN;
    this.actionsLeft = 2;
    this.roundNumber = 1;
    this.actionCount = 0;
    this.history = [];
    this.terminated = false;
    this.winner = null;
    this.winReason = null;
  }

  step(action) {
    if (this.terminated) return null;

    const actionResult = this.board.applyAction(action);
    this.actionCount++;
    this.actionsLeft--;

    let cyanAlive = false;
    let magAlive = false;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = this.board.grid[r][c];
        if (p && p.type === 'KERNEL') {
          if (p.team === CYAN) cyanAlive = true;
          else magAlive = true;
        }
      }
    }

    if (!cyanAlive && !magAlive) {
      this.terminated = true;
      this.winner = MAGENTA;
      this.winReason = 'Both Kernels eliminated (Tiebreak to Magenta)';
    } else if (!cyanAlive) {
      this.terminated = true;
      this.winner = MAGENTA;
      this.winReason = 'Cyan Kernel eliminated';
    } else if (!magAlive) {
      this.terminated = true;
      this.winner = CYAN;
      this.winReason = 'Magenta Kernel eliminated';
    }

    let shrinkEvent = null;
    let turnEndEvent = null;

    if (!this.terminated && this.actionsLeft === 0) {
      // Turn finishes!
      const finishedTeam = this.currentTeam;

      // Check Bare Kernels Endgame rule
      const bareWinner = this.board.kernelEndgameWinner(finishedTeam);
      if (bareWinner) {
        this.terminated = true;
        this.winner = bareWinner;
        this.winReason = `Bare Kernels Endgame resolved: ${bareWinner} wins`;
      }

      // Check Firewall Shrink (fires after Magenta's turn)
      if (finishedTeam === MAGENTA) {
        if (SHRINK_ROUNDS.includes(this.roundNumber)) {
          shrinkEvent = this.board.shrinkRing();
          // Check if any Kernel was caught in the shrink
          let cAlive = false;
          let mAlive = false;
          for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
              const p = this.board.grid[r][c];
              if (p && p.type === 'KERNEL') {
                if (p.team === CYAN) cAlive = true;
                else mAlive = true;
              }
            }
          }
          if (!cAlive && !mAlive) {
            this.terminated = true;
            this.winner = MAGENTA;
            this.winReason = 'Both Kernels vaporized in firewall (Tiebreak to Magenta)';
          } else if (!cAlive) {
            this.terminated = true;
            this.winner = MAGENTA;
            this.winReason = 'Cyan Kernel vaporized by firewall';
          } else if (!mAlive) {
            this.terminated = true;
            this.winner = CYAN;
            this.winReason = 'Magenta Kernel vaporized by firewall';
          }
        }
        this.roundNumber++;
      }

      // Flip team
      this.currentTeam = finishedTeam === CYAN ? MAGENTA : CYAN;
      this.actionsLeft = 2;
      turnEndEvent = { finishedTeam, nextTeam: this.currentTeam };
    }

    const logEntry = {
      actionIndex: this.actionCount,
      team: actionResult.actor.team,
      action,
      result: actionResult,
      shrinkEvent,
      terminated: this.terminated,
      winner: this.winner
    };
    this.history.push(logEntry);

    return logEntry;
  }

  legalActions() {
    return this.terminated ? [] : this.board.getLegalActions(this.currentTeam);
  }

  encodeObservation() {
    // Shape: (16, 8, 8) Float32Array in canonical view
    const planes = new Float32Array(16 * 8 * 8);
    const team = this.currentTeam;
    const isMagenta = team === MAGENTA;

    const planeOffset = (p) => p * 64;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const [cr, cc] = canonicalPos(r, c, team);
        const idx = cr * 8 + cc;

        // Plane 12: Firewall locked
        if (this.board.locked[r][c]) {
          planes[planeOffset(12) + idx] = 1.0;
        }

        const p = this.board.grid[r][c];
        if (p) {
          const typeIdx = PIECE_ORDER.findIndex((pt) => pt.name === p.type);
          if (p.team === team) {
            // Own pieces (Planes 0..5)
            planes[planeOffset(typeIdx) + idx] = 1.0;
          } else {
            // Enemy pieces (Planes 6..11)
            planes[planeOffset(6 + typeIdx) + idx] = 1.0;
          }
        }
      }
    }

    // Scalar planes broadcast across all 64 squares:
    // Plane 13: actions_left / 2.0
    const actionsVal = this.actionsLeft / 2.0;
    // Plane 14: Firewall urgency
    const urgencyVal = firewallUrgency(this.roundNumber);
    // Plane 15: 1.0 for Magenta to move, 0.0 for Cyan
    const sideVal = isMagenta ? 1.0 : 0.0;

    for (let i = 0; i < 64; i++) {
      planes[planeOffset(13) + i] = actionsVal;
      planes[planeOffset(14) + i] = urgencyVal;
      planes[planeOffset(15) + i] = sideVal;
    }

    return planes;
  }

  actionToIndex(action) {
    const [crFromR, crFromC] = canonicalPos(action.fromR, action.fromC, this.currentTeam);
    const [crToR, crToC] = canonicalPos(action.toR, action.toC, this.currentTeam);
    return sq(crFromR, crFromC) * 64 + sq(crToR, crToC);
  }

  indexToAction(idx) {
    const fromIdx = Math.floor(idx / 64);
    const toIdx = idx % 64;
    const [crFromR, crFromC] = fromSq(fromIdx);
    const [crToR, crToC] = fromSq(toIdx);
    const [rFromR, rFromC] = realPos(crFromR, crFromC, this.currentTeam);
    const [rToR, rToC] = realPos(crToR, crToC, this.currentTeam);

    // Kind is determined by target geometry and piece rules
    const p = this.board.pieceAt(rFromR, rFromC);
    if (!p) return null;
    const legals = this.board.getPieceLegalActions(rFromR, rFromC, p);
    return legals.find((a) => a.toR === rToR && a.toC === rToC) || null;
  }
}
