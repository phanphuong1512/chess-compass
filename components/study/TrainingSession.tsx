'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  X,
  ArrowCounterClockwise,
  Trophy,
  Fire,
  Target,
  Lightning,
  Sparkle,
  Lightbulb,
  ArrowRight,
  Play,
  CheckCircle,
} from '@phosphor-icons/react';
import { Chess, type Square } from 'chess.js';
import ChessBoard from './ChessBoard';
import MaterialDifferenceBar from './MaterialDifferenceBar';
import { calculateMaterial } from '@/lib/chess/material';
import { playMoveSound, playCaptureSound, playErrorSound } from '@/lib/chess/audio';
import type { FSRSCard, FSRSRating, RepertoireNode, RepertoireEdge } from '@/types/chess';
import { scheduleReview, formatInterval, predictIntervals, getDueCards } from '@/lib/fsrs/scheduler';
import { fenToNodeId, STARTING_FEN, RepertoireDAG } from '@/lib/chess/dag';
import {
  extractRepertoireLines,
  type RepertoireLine,
  type LineMove,
} from '@/lib/chess/repertoireTree';

interface TrainingSessionProps {
  cards: FSRSCard[];
  nodes: Map<string, RepertoireNode>;
  edges: Map<string, RepertoireEdge[]>;
  onUpdateCard: (card: FSRSCard) => void;
  onComplete: () => void;
  orientation?: 'white' | 'black';
  repertoireName?: string;
  chapterTitle?: string;
  lines?: RepertoireLine[];
  filterNodeIds?: string[] | null;
}

type TrainingPhase =
  | 'showing'            // User's turn to play
  | 'opponent_thinking'  // Opponent auto-responding
  | 'incorrect'          // User made a mistake, prompt to retry
  | 'line_complete'      // Completed all moves in current line
  | 'session_complete';  // Completed all lines in training set

interface PlayedMoveRecord {
  san: string;
  uci: string;
  turn: 'white' | 'black';
  isCorrect: boolean;
  moveNumber: number;
}

export default function TrainingSession({
  cards: allCards,
  nodes,
  edges,
  onUpdateCard,
  onComplete,
  orientation = 'white',
  repertoireName,
  chapterTitle,
  lines: providedLines,
  filterNodeIds,
}: TrainingSessionProps) {
  // 1. Build discrete playable lines from the Repertoire DAG
  const trainingLines = useMemo(() => {
    let baseLines: RepertoireLine[] = [];
    if (providedLines && providedLines.length > 0) {
      baseLines = providedLines;
    } else {
      const allNodesList = Array.from(nodes.values());
      const allEdgesList = Array.from(edges.values()).flat();
      const dag = new RepertoireDAG(allNodesList, allEdgesList);
      baseLines = extractRepertoireLines(dag, '');
    }

    // Filter if specific line or chapter node IDs were targeted
    if (filterNodeIds && filterNodeIds.length > 0) {
      const filterSet = new Set(filterNodeIds);
      const matched = baseLines.filter((line) =>
        line.nodeIds.some((id) => filterSet.has(id))
      );
      if (matched.length > 0) return matched;
    }

    // If no multi-move lines exist, construct synthetic single-step lines from cards
    if (baseLines.length === 0) {
      const synthLines: RepertoireLine[] = [];
      for (const card of allCards) {
        const node = nodes.get(card.nodeId);
        const outEdges = edges.get(card.nodeId) || [];
        if (node && outEdges.length > 0) {
          const edge = outEdges[0];
          const chess = new Chess(node.fen);
          const isWhite = chess.turn() === 'w';
          const toNodeFen = nodes.get(edge.toNodeId)?.fen || node.fen;
          synthLines.push({
            id: `card-${card.id}`,
            title: `Position ${card.nodeId.slice(0, 8)}`,
            moves: [
              {
                fromFen: node.fen,
                toFen: toNodeFen,
                san: edge.san,
                uci: edge.uci || '',
                moveNumber: chess.moveNumber(),
                isWhite,
              },
            ],
            formattedMoves: `${isWhite ? `${chess.moveNumber()}. ` : `${chess.moveNumber()}... `}${edge.san}`,
            nodeIds: [card.nodeId, edge.toNodeId],
            isMainLine: true,
            leafNodeId: edge.toNodeId,
          });
        }
      }
      return synthLines;
    }

    return baseLines;
  }, [providedLines, filterNodeIds, nodes, edges, allCards]);

  // Session State
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<TrainingPhase>('showing');
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [linesCompleted, setLinesCompleted] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [correctAttempts, setCorrectAttempts] = useState(0);

  // Active board state
  const activeLine = trainingLines[currentLineIndex];
  const [currentFen, setCurrentFen] = useState<string>(
    activeLine?.moves[0]?.fromFen || STARTING_FEN
  );
  const [playedMoves, setPlayedMoves] = useState<PlayedMoveRecord[]>([]);
  const [lastMoveHighlight, setLastMoveHighlight] = useState<{ from: string; to: string } | null>(null);
  const [boardArrows, setBoardArrows] = useState<Array<{ from: string; to: string; color: string }>>([]);
  const [showingHint, setShowingHint] = useState(false);
  const [wrongMoveFeedback, setWrongMoveFeedback] = useState<string | null>(null);

  // FEN-derived turn ('white' | 'black')
  const currentTurn: 'white' | 'black' = currentFen.split(' ')[1] === 'w' ? 'white' : 'black';
  const isUserTurn = currentTurn === orientation;

  // Material evaluation for current position
  const boardMaterial = useMemo(() => calculateMaterial(currentFen), [currentFen]);

  // Expected move for the active step in the line
  const expectedMove: LineMove | undefined = activeLine?.moves[stepIndex];

  // Helper to play sounds safely
  const triggerAudio = useCallback((san: string, isOpponent = false) => {
    try {
      if (san.includes('x')) {
        playCaptureSound();
      } else {
        playMoveSound();
      }
    } catch {}
  }, []);

  // Reset or load line
  const loadLine = useCallback((lineIdx: number) => {
    const line = trainingLines[lineIdx];
    if (!line) {
      setPhase('session_complete');
      return;
    }
    const startFen = line.moves[0]?.fromFen || STARTING_FEN;
    setCurrentLineIndex(lineIdx);
    setStepIndex(0);
    setCurrentFen(startFen);
    setPlayedMoves([]);
    setLastMoveHighlight(null);
    setBoardArrows([]);
    setShowingHint(false);
    setWrongMoveFeedback(null);
    setPhase('showing');
  }, [trainingLines]);

  // When trainingLines or activeLine changes, load initial line
  useEffect(() => {
    if (trainingLines.length > 0) {
      loadLine(0);
    } else {
      setPhase('session_complete');
    }
  }, [trainingLines.length, loadLine]);

  // =========================================================================
  // AUTOMATED OPPONENT RESPONSE ENGINE
  // When it is NOT the user's turn (e.g. Black in White repertoire, or White in Black repertoire)
  // the computer automatically plays the repertoire's prepared response after a natural delay (350ms)
  // =========================================================================
  useEffect(() => {
    if (phase === 'session_complete' || phase === 'line_complete' || !activeLine) return;

    // Check if it's the opponent's turn to move
    if (!isUserTurn) {
      setPhase('opponent_thinking');

      const opponentMove = expectedMove;
      if (!opponentMove) {
        // Reached end of line!
        setPhase('line_complete');
        return;
      }

      const timer = setTimeout(() => {
        try {
          const chess = new Chess(currentFen);
          const executed = chess.move(opponentMove.san);
          if (executed) {
            triggerAudio(opponentMove.san, true);
            const nextFen = chess.fen();
            setCurrentFen(nextFen);

            const fromSq = executed.from;
            const toSq = executed.to;
            setLastMoveHighlight({ from: fromSq, to: toSq });
            setBoardArrows([
              {
                from: fromSq,
                to: toSq,
                color: '#3B82F6', // Blue highlight for opponent move
              },
            ]);

            setPlayedMoves((prev) => [
              ...prev,
              {
                san: executed.san,
                uci: `${fromSq}${toSq}`,
                turn: currentTurn,
                isCorrect: true,
                moveNumber: chess.moveNumber(),
              },
            ]);

            const nextStep = stepIndex + 1;
            setStepIndex(nextStep);

            // Check if line finished after opponent's move
            if (nextStep >= activeLine.moves.length) {
              setPhase('line_complete');
              setLinesCompleted((l) => l + 1);
            } else {
              setPhase('showing');
            }
          }
        } catch (err) {
          console.warn('Opponent auto-move failed:', err);
          setPhase('showing');
        }
      }, 380);

      return () => clearTimeout(timer);
    }
  }, [isUserTurn, phase, expectedMove, currentFen, currentTurn, activeLine, stepIndex, triggerAudio]);

  // =========================================================================
  // USER MOVE HANDLER
  // Validates user's move against primary line or any prepared repertoire edge
  // =========================================================================
  const handleMove = useCallback(
    (move: { from: string; to: string; san: string; promotion?: string }) => {
      if (!isUserTurn || (phase !== 'showing' && phase !== 'incorrect') || !activeLine) return;

      setTotalAttempts((a) => a + 1);

      // 1. Check if matches the primary expected move for this line
      const matchesExpected =
        expectedMove &&
        (expectedMove.san === move.san ||
          expectedMove.uci.startsWith(move.from + move.to));

      // 2. Also check if matches ANY valid edge prepared in the DAG from this node
      const currentNodeId = fenToNodeId(currentFen);
      const validEdges = edges.get(currentNodeId) || [];
      const matchedAlternative = validEdges.find(
        (e) => e.san === move.san || (e.uci && e.uci.startsWith(move.from + move.to))
      );

      const isCorrect = matchesExpected || !!matchedAlternative;

      if (isCorrect) {
        try {
          const chess = new Chess(currentFen);
          const executed = chess.move(move);
          if (!executed) return;

          triggerAudio(move.san, false);

          const nextFen = chess.fen();
          setCurrentFen(nextFen);
          setLastMoveHighlight({ from: move.from, to: move.to });
          setBoardArrows([]);
          setShowingHint(false);
          setWrongMoveFeedback(null);

          setPlayedMoves((prev) => [
            ...prev,
            {
              san: executed.san,
              uci: `${move.from}${move.to}`,
              turn: currentTurn,
              isCorrect: true,
              moveNumber: chess.moveNumber(),
            },
          ]);

          setCorrectAttempts((c) => c + 1);
          setStreak((s) => {
            const next = s + 1;
            setMaxStreak((m) => Math.max(m, next));
            return next;
          });

          // Update FSRS card for this position
          const card = allCards.find((c) => c.nodeId === currentNodeId);
          if (card) {
            const { card: updated } = scheduleReview(card, showingHint ? 2 : 3);
            onUpdateCard(updated);
          }

          const nextStep = stepIndex + 1;
          setStepIndex(nextStep);

          // Check if user completed the line
          if (nextStep >= activeLine.moves.length) {
            setPhase('line_complete');
            setLinesCompleted((l) => l + 1);
          } else {
            // Next turn will be opponent's turn -> triggers auto-response in useEffect
            setPhase('opponent_thinking');
          }
        } catch {
          playErrorSound();
        }
      } else {
        // Wrong move
        playErrorSound();
        setStreak(0);
        setWrongMoveFeedback(`Not in repertoire: ${move.san}. Try again!`);
        setPhase('incorrect');

        // Update card rating to Again (1)
        const card = allCards.find((c) => c.nodeId === currentNodeId);
        if (card) {
          const { card: updated } = scheduleReview(card, 1);
          onUpdateCard(updated);
        }

        // Temporary flash wrong move feedback
        setTimeout(() => {
          setWrongMoveFeedback(null);
        }, 2200);
      }
    },
    [
      isUserTurn,
      phase,
      activeLine,
      expectedMove,
      currentFen,
      edges,
      allCards,
      showingHint,
      stepIndex,
      currentTurn,
      triggerAudio,
      onUpdateCard,
    ]
  );

  // Show Hint button
  const handleShowHint = useCallback(() => {
    if (!expectedMove || !isUserTurn) return;
    setShowingHint(true);
    const fromSq = expectedMove.uci.slice(0, 2);
    const toSq = expectedMove.uci.slice(2, 4);
    setBoardArrows([
      {
        from: fromSq,
        to: toSq,
        color: '#10B981', // Glowing emerald hint arrow
      },
    ]);
  }, [expectedMove, isUserTurn]);

  // Restart current line
  const handleRestartLine = useCallback(() => {
    loadLine(currentLineIndex);
  }, [loadLine, currentLineIndex]);

  // Advance to next line
  const handleNextLine = useCallback(() => {
    if (currentLineIndex + 1 < trainingLines.length) {
      loadLine(currentLineIndex + 1);
    } else {
      setPhase('session_complete');
    }
  }, [currentLineIndex, trainingLines.length, loadLine]);

  // Keyboard navigation (Space/Enter to advance when line completed, 'h' for hint, 'r' for restart)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (phase === 'line_complete') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handleNextLine();
        }
      } else if (isUserTurn && phase === 'showing') {
        if (e.key === 'h' || e.key === 'H') {
          handleShowHint();
        } else if (e.key === 'r' || e.key === 'R') {
          handleRestartLine();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, isUserTurn, handleNextLine, handleShowHint, handleRestartLine]);

  // Session Complete Summary Card
  if (phase === 'session_complete' || trainingLines.length === 0) {
    const accuracy = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 100;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-white/10 bg-[#111827]/95 p-8 backdrop-blur-md text-white shadow-2xl max-w-md mx-auto"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
          <Trophy size={40} weight="duotone" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-extrabold text-white">Repertoire Mastered!</h2>
          <p className="text-xs text-gray-400 mt-1">
            {repertoireName || 'Repertoire'} · All {trainingLines.length} variations completed
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center w-full py-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-2xl font-bold text-emerald-400 font-mono">{linesCompleted}</p>
            <p className="text-[0.65rem] text-gray-400 uppercase tracking-wider mt-0.5">Lines</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-2xl font-bold text-blue-400 font-mono">{accuracy}%</p>
            <p className="text-[0.65rem] text-gray-400 uppercase tracking-wider mt-0.5">Accuracy</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-2xl font-bold text-amber-400 font-mono">{maxStreak}</p>
            <p className="text-[0.65rem] text-gray-400 uppercase tracking-wider mt-0.5">Best Streak</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onComplete}
          className="rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 px-8 py-3 text-sm font-bold text-stone-950 transition-transform active:scale-[0.98] cursor-pointer shadow-lg w-full"
        >
          Return to Dashboard
        </button>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-w-[490px] mx-auto w-full text-white select-none">
      {/* Session Header */}
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#141B29] px-4 py-2.5 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-300 font-medium">
            <Target size={16} weight="duotone" className="text-emerald-400" />
            <span className="font-mono">
              Line {currentLineIndex + 1} / {trainingLines.length}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-orange-400 font-bold">
            <Fire size={16} weight="fill" />
            <span className="font-mono">{streak}</span>
          </div>
        </div>

        <div className="text-right flex items-center gap-2">
          <div className="text-right">
            <span className="text-[0.68rem] font-bold text-amber-400 block truncate max-w-[180px]">
              {activeLine?.title || chapterTitle || repertoireName || 'Repertoire Practice'}
            </span>
            <span className="text-[0.65rem] text-gray-400 font-mono">
              Playing as {orientation === 'white' ? 'White ⚪' : 'Black ⚫'}
            </span>
          </div>
          <button
            type="button"
            onClick={onComplete}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Exit Training"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Move History Breadcrumb Trail */}
      <div className="flex items-center gap-1 overflow-x-auto py-1 px-2 rounded-lg bg-black/25 border border-white/[0.06] text-xs font-mono scrollbar-none">
        {playedMoves.length === 0 ? (
          <span className="text-gray-500 text-[0.68rem] italic">Starting position</span>
        ) : (
          playedMoves.map((m, idx) => (
            <span
              key={idx}
              className={`px-1.5 py-0.5 rounded text-[0.72rem] font-semibold whitespace-nowrap ${
                m.turn === orientation
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-blue-500/15 text-blue-300 border border-blue-500/25'
              }`}
            >
              {m.turn === 'white' ? `${Math.floor(idx / 2) + 1}. ` : ''}
              {m.san}
            </span>
          ))
        )}
      </div>

      {/* Turn & Status Indicator Banner */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs transition-colors duration-200 ${
          wrongMoveFeedback
            ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
            : phase === 'line_complete'
            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
            : phase === 'opponent_thinking'
            ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
            : isUserTurn
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            : 'bg-white/5 border-white/10 text-gray-400'
        }`}
      >
        <div className="flex items-center gap-2">
          {wrongMoveFeedback ? (
            <>
              <X size={15} className="text-rose-400 shrink-0" />
              <span className="font-semibold text-[0.75rem]">{wrongMoveFeedback}</span>
            </>
          ) : phase === 'line_complete' ? (
            <>
              <CheckCircle size={15} weight="fill" className="text-emerald-400 shrink-0" />
              <span className="font-bold text-[0.75rem]">Line Mastered! Perfect preparation.</span>
            </>
          ) : phase === 'opponent_thinking' ? (
            <>
              <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
              <span className="font-medium text-[0.75rem]">
                Opponent is thinking... ({orientation === 'white' ? 'Black' : 'White'})
              </span>
            </>
          ) : isUserTurn ? (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="font-semibold text-[0.75rem]">
                Your turn: Find {orientation}&apos;s move ({stepIndex + 1}/{activeLine?.moves.length || 1})
              </span>
            </>
          ) : (
            <span className="text-[0.75rem]">Waiting...</span>
          )}
        </div>

        {showingHint && expectedMove && (
          <span className="font-mono text-[0.68rem] bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300 border border-emerald-500/40">
            Hint: {expectedMove.san}
          </span>
        )}
      </div>

      {/* Top Player Material Bar */}
      {boardMaterial && (
        <MaterialDifferenceBar
          material={orientation === 'white' ? boardMaterial.black : boardMaterial.white}
          pieceColor={orientation === 'white' ? 'white' : 'black'}
          playerName={orientation === 'white' ? 'Opponent (Black)' : 'You (Black)'}
          className="px-2"
        />
      )}

      {/* Interactive Board */}
      <div className="aspect-square relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#141B29]">
        <ChessBoard
          fen={currentFen}
          orientation={orientation}
          onMove={isUserTurn && (phase === 'showing' || phase === 'incorrect') ? handleMove : undefined}
          interactive={isUserTurn && (phase === 'showing' || phase === 'incorrect')}
          lastMove={lastMoveHighlight}
          arrows={boardArrows}
        />
      </div>

      {/* Bottom Player Material Bar */}
      {boardMaterial && (
        <MaterialDifferenceBar
          material={orientation === 'white' ? boardMaterial.white : boardMaterial.black}
          pieceColor={orientation === 'white' ? 'black' : 'white'}
          playerName={orientation === 'white' ? 'You (White)' : 'Opponent (White)'}
          className="px-2"
        />
      )}

      {/* Actions and Controls */}
      <div className="flex items-center justify-between gap-2 pt-1">
        {phase === 'line_complete' ? (
          <button
            type="button"
            onClick={handleNextLine}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-bold text-stone-950 transition-transform active:scale-[0.98] cursor-pointer shadow-lg hover:brightness-110"
          >
            <span>Next Variation</span>
            <ArrowRight size={18} weight="bold" />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleShowHint}
              disabled={!isUserTurn || showingHint}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#161D2C] hover:bg-white/10 py-2.5 text-xs font-semibold text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <Lightbulb size={16} className="text-amber-400" />
              <span>Hint</span>
            </button>

            <button
              type="button"
              onClick={handleRestartLine}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#161D2C] hover:bg-white/10 py-2.5 text-xs font-semibold text-gray-300 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowCounterClockwise size={16} className="text-blue-400" />
              <span>Restart</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
