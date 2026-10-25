/**
 * Colony: One — Client-Side AlphaZero PUCT Monte-Carlo Tree Search (MCTS)
 * Matches the official tournament referee search implementation.
 */

import { ColonyBoard, ColonyGame, CYAN, MAGENTA } from './engine.js';

export class MCTSConfig {
  constructor({
    simulations = 60,
    cPuct = 1.25,
    temperature = 0.0,
    dirichletAlpha = 0.3,
    dirichletEps = 0.25,
    virtualLoss = 1.0
  } = {}) {
    this.simulations = simulations;
    this.cPuct = cPuct;
    this.temperature = temperature;
    this.dirichletAlpha = dirichletAlpha;
    this.dirichletEps = dirichletEps;
    this.virtualLoss = virtualLoss;
  }
}

class MCTSNode {
  constructor(action = null, prior = 0.0) {
    this.action = action;
    this.prior = prior;
    this.visitCount = 0;
    this.totalValue = 0.0;
    this.children = new Map(); // actionKey -> MCTSNode
    this.isExpanded = false;
  }

  get qValue() {
    return this.visitCount === 0 ? 0.0 : this.totalValue / this.visitCount;
  }
}

function actionKey(a) {
  return `${a.fromR},${a.fromC}->${a.toR},${a.toC}:${a.kind}`;
}

export async function searchAction(game, evaluator, config = new MCTSConfig()) {
  const root = new MCTSNode();
  const rootTeam = game.currentTeam;

  // Clone game state for root expansion
  const simGame = new ColonyGame();
  simGame.board = game.board.clone();
  simGame.currentTeam = game.currentTeam;
  simGame.actionsLeft = game.actionsLeft;
  simGame.roundNumber = game.roundNumber;
  simGame.actionCount = game.actionCount;
  simGame.terminated = game.terminated;
  simGame.winner = game.winner;

  // Root expansion
  const legalActions = simGame.legalActions();
  if (legalActions.length === 0) return null;
  if (legalActions.length === 1) return { action: legalActions[0], visitCounts: [[legalActions[0], 1]], rootValue: 0 };

  const obs = simGame.encodeObservation();
  const evalResult = await evaluator(obs); // { policy: Float32Array(4096), value: float in [-1, 1] }

  // Extract legal priors and softmax
  const legalPriors = [];
  let maxLogit = -Infinity;
  for (const act of legalActions) {
    const idx = simGame.actionToIndex(act);
    const logit = evalResult.policy[idx];
    if (logit > maxLogit) maxLogit = logit;
    legalPriors.push({ act, logit });
  }

  let sumExp = 0.0;
  for (const item of legalPriors) {
    item.exp = Math.exp(item.logit - maxLogit);
    sumExp += item.exp;
  }

  for (const item of legalPriors) {
    const prior = item.exp / (sumExp || 1.0);
    const key = actionKey(item.act);
    root.children.set(key, new MCTSNode(item.act, prior));
  }
  root.isExpanded = true;

  // Run MCTS Simulations
  for (let sim = 0; sim < config.simulations; sim++) {
    const searchGame = new ColonyGame();
    searchGame.board = game.board.clone();
    searchGame.currentTeam = game.currentTeam;
    searchGame.actionsLeft = game.actionsLeft;
    searchGame.roundNumber = game.roundNumber;
    searchGame.actionCount = game.actionCount;
    searchGame.terminated = game.terminated;
    searchGame.winner = game.winner;

    const path = [root];
    let currentNode = root;

    // 1. Selection
    while (currentNode.isExpanded && !searchGame.terminated) {
      let bestScore = -Infinity;
      let bestChild = null;
      let totalVisits = 0;
      for (const child of currentNode.children.values()) {
        totalVisits += child.visitCount;
      }
      const sqrtTotal = Math.sqrt(totalVisits || 1);

      for (const child of currentNode.children.values()) {
        // Invert Q if side to move flipped at previous action
        const q = child.qValue;
        const u = config.cPuct * child.prior * (sqrtTotal / (1 + child.visitCount));
        const score = q + u;
        if (score > bestScore) {
          bestScore = score;
          bestChild = child;
        }
      }

      if (!bestChild) break;
      path.push(bestChild);
      searchGame.step(bestChild.action);
      currentNode = bestChild;
    }

    // 2. Expansion & Evaluation
    let leafValue = 0.0;
    if (searchGame.terminated) {
      if (searchGame.winner === rootTeam) {
        leafValue = 1.0;
      } else {
        leafValue = -1.0;
      }
    } else {
      const leafActions = searchGame.legalActions();
      if (leafActions.length > 0) {
        const leafObs = searchGame.encodeObservation();
        const leafEval = await evaluator(leafObs);
        leafValue = leafEval.value;

        // Leaf value is from perspective of side to move in leaf state
        if (searchGame.currentTeam !== rootTeam) {
          leafValue = -leafValue;
        }

        // Expand leaf
        let maxL = -Infinity;
        const priors = [];
        for (const act of leafActions) {
          const idx = searchGame.actionToIndex(act);
          const logit = leafEval.policy[idx];
          if (logit > maxL) maxL = logit;
          priors.push({ act, logit });
        }
        let sExp = 0.0;
        for (const p of priors) {
          p.exp = Math.exp(p.logit - maxL);
          sExp += p.exp;
        }
        for (const p of priors) {
          const prior = p.exp / (sExp || 1.0);
          const key = actionKey(p.act);
          currentNode.children.set(key, new MCTSNode(p.act, prior));
        }
        currentNode.isExpanded = true;
      }
    }

    // 3. Backup
    for (const node of path) {
      node.visitCount++;
      node.totalValue += leafValue;
    }
  }

  // 4. Select Action based on Visit Counts
  const visitCounts = [];
  let bestVisits = -1;
  let selectedAction = null;

  for (const child of root.children.values()) {
    visitCounts.push([child.action, child.visitCount, child.qValue, child.prior]);
    if (child.visitCount > bestVisits) {
      bestVisits = child.visitCount;
      selectedAction = child.action;
    }
  }

  return {
    action: selectedAction,
    visitCounts,
    rootValue: root.qValue
  };
}
