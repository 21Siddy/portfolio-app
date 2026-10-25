/**
 * Colony: One — Head-to-Head Tournament Arena & Elo Tracker
 * Executes matches between two models, alternates sides, and computes ratings.
 */

import { ColonyGame, CYAN, MAGENTA, posToAlgebraic } from './engine.js';
import { MCTSConfig, searchAction } from './mcts.js';

export function calculateElo(winRate) {
  const p = Math.min(Math.max(winRate, 0.001), 0.999);
  return -400 * Math.log10(1 / p - 1);
}

export function computeEloStats(wins, totalGames) {
  if (totalGames === 0) return { winRate: 0, eloDiff: 0, ciLow: 0, ciHigh: 0, se: 0 };
  const p = wins / totalGames;
  const elo = calculateElo(p);
  const se = Math.sqrt(Math.max(p * (1 - p), 1e-6) / totalGames);
  const pLow = Math.max(0.001, p - 1.96 * se);
  const pHigh = Math.min(0.999, p + 1.96 * se);
  return {
    winRate: p,
    eloDiff: Math.round(elo),
    ciLow: Math.round(calculateElo(pLow)),
    ciHigh: Math.round(calculateElo(pHigh)),
    se
  };
}

export class TournamentArena {
  constructor() {
    this.isRunning = false;
    this.shouldStop = false;
  }

  stop() {
    this.shouldStop = true;
  }

  async runSeries({
    modelA, // { name, evaluator }
    modelB, // { name, evaluator }
    totalGames = 5,
    simulations = 20,
    animate = true,
    stepDelayMs = 250,
    onGameStart = () => {},
    onMove = () => {},
    onGameEnd = () => {},
    onProgress = () => {}
  }) {
    this.isRunning = true;
    this.shouldStop = false;

    let aWins = 0;
    let bWins = 0;
    let aWinsCyan = 0;
    let aWinsMag = 0;
    let aGamesCyan = 0;
    let aGamesMag = 0;

    const gameLogs = [];
    const config = new MCTSConfig({ simulations });

    for (let g = 0; g < totalGames; g++) {
      if (this.shouldStop) break;

      const aIsCyan = g % 2 === 0;
      const cyanModel = aIsCyan ? modelA : modelB;
      const magModel = aIsCyan ? modelB : modelA;

      if (aIsCyan) aGamesCyan++;
      else aGamesMag++;

      const game = new ColonyGame();
      const moveLog = [];

      onGameStart({
        gameIndex: g + 1,
        totalGames,
        aIsCyan,
        cyanName: cyanModel.name,
        magName: magModel.name
      });

      while (!game.terminated && !this.shouldStop) {
        const currentModel = game.currentTeam === CYAN ? cyanModel : magModel;
        const searchResult = await searchAction(game, currentModel.evaluator, config);
        if (!searchResult || !searchResult.action) break;

        const action = searchResult.action;
        const stepLog = game.step(action);

        const moveStr = `${stepLog.team} ${posToAlgebraic(action.fromR, action.fromC)} -> ${posToAlgebraic(action.toR, action.toC)} (${action.kind})`;
        moveLog.push(moveStr);

        onMove({
          gameIndex: g + 1,
          action,
          stepLog,
          game,
          searchResult,
          currentModelName: currentModel.name
        });

        if (animate && stepDelayMs > 0) {
          await new Promise((r) => setTimeout(r, stepDelayMs));
        }
      }

      const aWon = (game.winner === CYAN && aIsCyan) || (game.winner === MAGENTA && !aIsCyan);
      if (aWon) {
        aWins++;
        if (aIsCyan) aWinsCyan++;
        else aWinsMag++;
      } else {
        bWins++;
      }

      const statsSoFar = computeEloStats(aWins, g + 1);

      const gameResult = {
        gameIndex: g + 1,
        winner: game.winner,
        winReason: game.winReason,
        aWon,
        aIsCyan,
        roundCount: game.roundNumber,
        moveCount: moveLog.length,
        moveLog
      };
      gameLogs.push(gameResult);

      onGameEnd({
        gameResult,
        stats: statsSoFar,
        aWins,
        bWins,
        aWinsCyan,
        aWinsMag,
        aGamesCyan,
        aGamesMag
      });

      onProgress({
        completed: g + 1,
        total: totalGames,
        stats: statsSoFar
      });
    }

    this.isRunning = false;
    const finalStats = computeEloStats(aWins, gameLogs.length);

    return {
      modelA: modelA.name,
      modelB: modelB.name,
      totalGames: gameLogs.length,
      aWins,
      bWins,
      stats: finalStats,
      gameLogs
    };
  }
}
