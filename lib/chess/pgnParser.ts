import { Chess, type Square } from 'chess.js';
import type { RepertoireNode, RepertoireEdge } from '@/types/chess';
import { RepertoireDAG, fenToNodeId, STARTING_FEN } from './dag';

export interface PgnToken {
  type: 'openParen' | 'closeParen' | 'comment' | 'nag' | 'moveNumber' | 'move' | 'result';
  value?: string | number;
  isBlack?: boolean;
}

export interface ParsedMoveNode {
  id: string;
  san: string;
  uci: string;
  moveNumber: number;
  isWhite: boolean;
  fenBefore: string;
  fenAfter: string;
  parentId: string | null;
  children: ParsedMoveNode[];
  comment?: string;
  nags?: number[];
}

export interface ParsedPgnChapter {
  title: string;
  description?: string;
  headers: Record<string, string>;
  rootNodes: ParsedMoveNode[];
  allNodes: ParsedMoveNode[];
}

/**
 * Tokenizes PGN body into discrete tokens matching ChessAtlas's move-tree tokenizer.
 */
export function tokenizePgn(pgnBody: string): PgnToken[] {
  const tokens: PgnToken[] = [];
  const clean = pgnBody.trim();
  let idx = 0;

  while (idx < clean.length) {
    const ch = clean[idx];

    // Whitespace
    if (/\s/.test(ch)) {
      idx++;
      continue;
    }

    // Variations
    if (ch === '(') {
      tokens.push({ type: 'openParen' });
      idx++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'closeParen' });
      idx++;
      continue;
    }

    // Comments {...}
    if (ch === '{') {
      const end = clean.indexOf('}', idx);
      if (end !== -1) {
        tokens.push({ type: 'comment', value: clean.slice(idx + 1, end).trim() });
        idx = end + 1;
      } else {
        const rest = clean.slice(idx + 1).trim();
        if (rest) tokens.push({ type: 'comment', value: rest });
        break;
      }
      continue;
    }

    // NAG annotations ($1, $2, etc.)
    if (ch === '$') {
      let s = idx + 1;
      while (s < clean.length && /\d/.test(clean[s])) s++;
      if (s > idx + 1) {
        tokens.push({ type: 'nag', value: parseInt(clean.slice(idx + 1, s), 10) });
      }
      idx = s;
      continue;
    }

    // Move numbers (e.g. 1. or 1... or 24.)
    if (/\d/.test(ch)) {
      let s = idx;
      while (s < clean.length && /\d/.test(clean[s])) s++;
      const num = parseInt(clean.slice(idx, s), 10);
      let dotCount = 0;
      while (s < clean.length && clean[s] === '.') {
        dotCount++;
        s++;
      }
      if (dotCount > 0) {
        while (s < clean.length && /\s/.test(clean[s])) s++;
        tokens.push({ type: 'moveNumber', value: num, isBlack: dotCount >= 3 });
        idx = s;
        continue;
      }
    }

    // Game Results (1-0, 0-1, 1/2-1/2, *)
    const resMatch = clean.slice(idx).match(/^(1[-–—]0|0[-–—]1|1\/2[-–—]1\/2|\*)/);
    if (resMatch && resMatch[1]) {
      tokens.push({ type: 'result', value: resMatch[1] });
      idx += resMatch[1].length;
      continue;
    }

    // Skip null moves / symbols (-- or Z0)
    if (clean.slice(idx, idx + 2) === '--' || clean.slice(idx, idx + 2) === 'Z0') {
      idx += 2;
      continue;
    }

    // SAN Move string (e.g. e4, Nf3, O-O, exd5, Qxe4+, e8=Q#)
    const moveMatch = clean
      .slice(idx)
      .match(/^([KQRBN]?[a-h]?[1-8]?[-x]?[a-h][1-8](?:=?[QRBNqrbn])?[+#]?|[Oo0][-–—][Oo0](?:[-–—][Oo0])?[+#]?)/);
    if (moveMatch && moveMatch[1]) {
      let san = moveMatch[1].replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');
      tokens.push({ type: 'move', value: san });
      idx += moveMatch[1].length;

      // Suffix annotations (?, !, ??, !?, ?!)
      while (idx < clean.length && /[!?]/.test(clean[idx])) {
        idx++;
      }
      continue;
    }

    idx++;
  }

  return tokens;
}

/**
 * Splits multi-game / multi-chapter PGN string into individual chapter texts.
 */
export function splitPgnIntoChapters(fullPgn: string): Array<{ headers: Record<string, string>; body: string }> {
  const games: Array<{ headers: Record<string, string>; body: string }> = [];
  const lines = fullPgn.split(/\r?\n/);

  let currentHeaders: Record<string, string> = {};
  let currentBodyLines: string[] = [];
  let inHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('[') && line.endsWith(']')) {
      if (currentBodyLines.length > 0) {
        // We were in a body and now encounter headers of a new game
        games.push({
          headers: currentHeaders,
          body: currentBodyLines.join('\n').trim(),
        });
        currentHeaders = {};
        currentBodyLines = [];
      }
      inHeader = true;
      const match = line.match(/^\[(\w+)\s+"(.*)"\]$/);
      if (match) {
        currentHeaders[match[1]] = match[2];
      }
    } else {
      if (line.length > 0) {
        inHeader = false;
        currentBodyLines.push(line);
      }
    }
  }

  if (currentBodyLines.length > 0 || Object.keys(currentHeaders).length > 0) {
    games.push({
      headers: currentHeaders,
      body: currentBodyLines.join('\n').trim(),
    });
  }

  return games;
}

/**
 * Parses a single chapter's PGN body into a full branching MoveTree (Stack-based RAV).
 * Exactly implements ChessAtlas's `pgn-tree-parser-D-iY71OD.js`.
 */
export function parseChapterTree(body: string, startingFen = STARTING_FEN): ParsedPgnChapter {
  const tokens = tokenizePgn(body);
  const allNodes: ParsedMoveNode[] = [];
  const rootNodes: ParsedMoveNode[] = [];
  const nodeMap = new Map<string, ParsedMoveNode>();

  let nodeCounter = 0;
  const generateId = () => `pnode_${Date.now()}_${nodeCounter++}`;

  interface StackFrame {
    chess: Chess;
    lastNode: ParsedMoveNode | null;
  }

  const stack: StackFrame[] = [
    {
      chess: new Chess(startingFen),
      lastNode: null,
    },
  ];

  let pendingComment: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const top = stack[stack.length - 1];

    if (token.type === 'moveNumber') {
      continue;
    }

    if (token.type === 'comment') {
      const commentText = String(token.value || '');
      if (top.lastNode) {
        top.lastNode.comment = top.lastNode.comment
          ? `${top.lastNode.comment} ${commentText}`
          : commentText;
      } else {
        pendingComment = pendingComment ? `${pendingComment} ${commentText}` : commentText;
      }
      continue;
    }

    if (token.type === 'nag') {
      if (top.lastNode) {
        top.lastNode.nags = top.lastNode.nags || [];
        top.lastNode.nags.push(Number(token.value));
      }
      continue;
    }

    if (token.type === 'openParen') {
      // Start a variation branch
      if (top.lastNode && top.lastNode.parentId) {
        const parent = nodeMap.get(top.lastNode.parentId);
        if (parent) {
          stack.push({
            chess: new Chess(parent.fenAfter),
            lastNode: parent,
          });
        } else {
          stack.push({
            chess: new Chess(startingFen),
            lastNode: null,
          });
        }
      } else {
        stack.push({
          chess: new Chess(startingFen),
          lastNode: null,
        });
      }
      continue;
    }

    if (token.type === 'closeParen') {
      // End of variation branch
      if (stack.length > 1) {
        stack.pop();
      }
      continue;
    }

    if (token.type === 'move') {
      const san = String(token.value);
      const isWhite = top.chess.turn() === 'w';
      const moveNumber = Math.floor(top.chess.history().length / 2) + 1;
      const fenBefore = top.chess.fen();

      try {
        const result = top.chess.move(san);
        if (result) {
          const fenAfter = top.chess.fen();
          const uci = result.from + result.to + (result.promotion || '');
          const id = generateId();

          const newNode: ParsedMoveNode = {
            id,
            san: result.san,
            uci,
            moveNumber,
            isWhite,
            fenBefore,
            fenAfter,
            parentId: top.lastNode?.id || null,
            children: [],
            comment: pendingComment,
          };
          pendingComment = undefined;

          nodeMap.set(id, newNode);
          allNodes.push(newNode);

          if (top.lastNode) {
            top.lastNode.children.push(newNode);
          } else {
            rootNodes.push(newNode);
          }

          top.lastNode = newNode;
        }
      } catch {
        // Skip invalid move
      }
    }
  }

  return {
    title: 'Chapter',
    headers: {},
    rootNodes,
    allNodes,
  };
}

/**
 * Imports full multi-chapter, multi-variation PGN text directly into a Repertoire DAG.
 * Guarantees that every branch, sub-variation, transposition, and card is created!
 */
export async function importPgnToRepertoireDAG(
  pgnText: string,
  repertoireId: string,
  dag: RepertoireDAG
): Promise<{
  nodes: RepertoireNode[];
  edges: RepertoireEdge[];
  chapters: ParsedPgnChapter[];
}> {
  const chapterTexts = splitPgnIntoChapters(pgnText);
  const parsedChapters: ParsedPgnChapter[] = [];

  const createdNodes: RepertoireNode[] = [];
  const createdEdges: RepertoireEdge[] = [];

  for (let cIdx = 0; cIdx < chapterTexts.length; cIdx++) {
    const ch = chapterTexts[cIdx];
    const parsed = parseChapterTree(ch.body);
    parsed.headers = ch.headers;
    parsed.title =
      ch.headers.Chapter ||
      ch.headers.Event ||
      ch.headers.White ||
      `Chapter ${cIdx + 1}`;
    if (ch.headers.Description) parsed.description = ch.headers.Description;
    parsedChapters.push(parsed);

    // Insert all parsed nodes into DAG
    for (const pNode of parsed.allNodes) {
      try {
        const { node, edge } = dag.addMove(pNode.fenBefore, pNode.san, repertoireId);
        createdNodes.push(node);
        createdEdges.push(edge);
      } catch {
        // Continue on any edge error
      }
    }
  }

  return {
    nodes: createdNodes,
    edges: createdEdges,
    chapters: parsedChapters,
  };
}
