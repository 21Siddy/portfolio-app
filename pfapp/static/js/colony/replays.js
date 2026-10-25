/**
 * Colony: One — Contest Replay Database
 * Real tournament matches from Cloudfight Coding Contest Level 4 & 5.
 */

import { algebraicToPos } from './engine.js';

export const CONTEST_MATCHES = [
  {
    id: 'match-14243',
    title: 'Match #14243 — Fast Exploit Infiltration & King Hunt',
    winner: 'CYAN',
    rounds: 8,
    movesText: `1. CYAN     EX  D2 -> F3  MOVE
2. CYAN     EX  F3 -> G5  MOVE   xPI
3. MAGENTA  IC  G7 -> G5  MOVE   xEX
4. MAGENTA  TR  H6 -> G6  MOVE
5. CYAN     DE  C1 -> C4  MOVE
6. CYAN     PI  B4 -> B5  MOVE
7. MAGENTA  EX  E7 -> G8  MOVE
8. MAGENTA  DE  F8 -> F5  MOVE
9. CYAN     DE  C4 -> F4  MOVE
10. CYAN     DE  F4 -> F5  SHOOT  xDE
11. MAGENTA  IC  G5 -> F4  MOVE   xDE
12. MAGENTA  KE  H8 -> G7  MOVE
13. CYAN     IC  B2 -> D4  MOVE
14. CYAN     IC  D4 -> F4  MOVE   xIC
15. MAGENTA  TR  G6 -> H6  MOVE
16. MAGENTA  TR  H6 -> F4  SHOOT  xIC
17. CYAN     KE  A1 -> B2  MOVE
18. CYAN     TR  A3 -> B3  MOVE
19. MAGENTA  TR  H6 -> G6  MOVE
20. MAGENTA  TR  G6 -> F6  MOVE
21. CYAN     TR  B3 -> C3  MOVE
22. CYAN     TR  C3 -> F6  SHOOT  xTR
23. MAGENTA  EX  G8 -> E7  MOVE
24. MAGENTA  EX  E7 -> G6  MOVE
25. CYAN     PI  B5 -> D5  MOVE
26. CYAN     TR  C3 -> C4  MOVE
27. MAGENTA  EX  G6 -> E5  MOVE
28. MAGENTA  EX  E5 -> C4  MOVE   xTR
29. CYAN     PI  D5 -> E5  MOVE
30. CYAN     PI  E5 -> G7  MOVE   xKE
---- *** CYAN WINS ***`
  },
  {
    id: 'match-14711',
    title: 'Match #14711 — Round 8 Firewall Vaporization Victory',
    winner: 'CYAN',
    rounds: 8,
    movesText: `1. CYAN     IC  B2 -> B1  MOVE
2. CYAN     IC  B1 -> B3  MOVE
3. MAGENTA  EX  E7 -> F5  MOVE
4. MAGENTA  TR  H6 -> H7  MOVE
5. CYAN     IC  B3 -> B1  MOVE
6. CYAN     KE  A1 -> B2  MOVE
7. MAGENTA  DE  F8 -> E8  MOVE
8. MAGENTA  PI  G5 -> G6  MOVE
9. CYAN     KE  B2 -> C3  MOVE
10. CYAN     IC  B1 -> D3  MOVE
11. MAGENTA  IC  G7 -> E5  MOVE
12. MAGENTA  IC  E5 -> C3  SHOOT  xPI
13. CYAN     IC  D3 -> F5  MOVE   xEX
14. CYAN     IC  F5 -> E5  MOVE   xIC
15. MAGENTA  DE  E8 -> E5  MOVE   xIC
16. MAGENTA  DE  E5 -> E2  MOVE
17. CYAN     EX  D2 -> C4  MOVE
18. CYAN     KE  C3 -> D4  MOVE
19. MAGENTA  TR  H7 -> G7  MOVE
20. MAGENTA  TR  G7 -> D4  SHOOT  xEX
21. CYAN     KE  D4 -> D5  MOVE
22. CYAN     KE  D5 -> C6  MOVE
23. MAGENTA  DE  E2 -> E4  MOVE
24. MAGENTA  DE  E4 -> E6  MOVE
25. CYAN     TR  A3 -> B3  MOVE
26. CYAN     TR  B3 -> E6  SHOOT  xDE
27. MAGENTA  PI  G6 -> G5  MOVE
28. MAGENTA  PI  G5 -> E5  MOVE
29. CYAN     KE  C6 -> D5  MOVE
30. CYAN     DE  C1 -> C4  MOVE
31. MAGENTA  TR  G7 -> F7  MOVE
32. MAGENTA  TR  F7 -> D5  SHOOT  xDE
---- *** FIREWALL ROUND 8: [MAGENTAxKE (H8)] ***
---- *** CYAN WINS ***`
  },
  {
    id: 'match-15204',
    title: 'Match #15204 — Tactical Bodyguard Shields & Endgame Grind',
    winner: 'MAGENTA',
    rounds: 12,
    movesText: `1. CYAN     PI  B4 -> B5  MOVE
2. CYAN     PI  B5 -> D5  MOVE
3. MAGENTA  PI  G5 -> G4  MOVE
4. MAGENTA  PI  G4 -> E4  MOVE
5. CYAN     IC  B2 -> D4  MOVE
6. CYAN     EX  D2 -> F3  MOVE
7. MAGENTA  EX  E7 -> C6  MOVE
8. MAGENTA  IC  G7 -> E5  MOVE
9. CYAN     IC  D4 -> E5  MOVE   xIC
10. CYAN     EX  F3 -> E5  MOVE   xIC
11. MAGENTA  PI  E4 -> E5  MOVE   xEX
12. MAGENTA  EX  C6 -> E5  MOVE   xPI
13. CYAN     DE  C1 -> C5  MOVE
14. CYAN     DE  C5 -> E5  SHOOT  xEX
15. MAGENTA  DE  F8 -> F5  MOVE
16. MAGENTA  DE  F5 -> F3  MOVE
17. CYAN     TR  A3 -> B3  MOVE
18. CYAN     TR  B3 -> E3  MOVE
19. MAGENTA  DE  F3 -> E3  MOVE   xTR
20. MAGENTA  DE  E3 -> C3  MOVE
21. CYAN     KE  A1 -> B2  MOVE
22. CYAN     KE  B2 -> C3  MOVE   xDE
23. MAGENTA  TR  H6 -> G6  MOVE
24. MAGENTA  TR  G6 -> D6  MOVE
25. CYAN     KE  C3 -> D3  MOVE
26. CYAN     DE  C5 -> D5  MOVE
27. MAGENTA  TR  D6 -> D3  SHOOT  xDE
28. MAGENTA  KE  H8 -> G7  MOVE
29. CYAN     KE  D3 -> C3  MOVE
30. CYAN     PI  D5 -> C5  MOVE
31. MAGENTA  TR  D6 -> C6  MOVE
32. MAGENTA  TR  C6 -> C3  SHOOT  xPI
33. CYAN     KE  C3 -> B3  MOVE
34. CYAN     KE  B3 -> A3  MOVE
35. MAGENTA  TR  C6 -> A4  SHOOT
36. MAGENTA  TR  A4 -> A3  SHOOT  xKE
---- *** MAGENTA WINS ***`
  }
];

export function parseMatchMoves(rawText) {
  const lineRe = /^\s*(\d+)\.\s+(CYAN|MAGENTA)\s+(\w\w)\s+(\w\d)\s+->\s+(\w\d)\s+(MOVE|SHOOT)/i;
  const moves = [];

  for (const line of rawText.split('\n')) {
    const match = lineRe.exec(line);
    if (match) {
      const idx = parseInt(match[1], 10);
      const team = match[2].toUpperCase();
      const pieceAbbr = match[3].toUpperCase();
      const fromAlg = match[4].toUpperCase();
      const toAlg = match[5].toUpperCase();
      const kind = match[6].toLowerCase();

      const [fromR, fromC] = algebraicToPos(fromAlg);
      const [toR, toC] = algebraicToPos(toAlg);

      moves.push({
        index: idx,
        team,
        pieceAbbr,
        fromAlg,
        toAlg,
        fromR,
        fromC,
        toR,
        toC,
        kind,
        raw: line.trim()
      });
    }
  }

  return moves;
}
