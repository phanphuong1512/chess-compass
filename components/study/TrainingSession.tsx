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
  Smiley,
  SmileySad,
  SmileyMeh,
  Eye,
} from '@phosphor-icons/react';
import { Chess, type Square } from 'chess.js';
import ChessBoard from './ChessBoard';
import MaterialDifferenceBar from './MaterialDifferenceBar';
import { calculateMaterial } from '@/lib/chess/material';
import { playMoveSound, playCaptureSound, playCheckSound, playErrorSound } from '@/lib/chess/audio';
import type { FSRSCard, RepertoireNode, RepertoireEdge } from '@/types/chess';
import { scheduleReview } from '@/lib/fsrs/scheduler';
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
  mode?: 'learn' | 'review' | 'overstudy';
}

type TrainingPhase =
  | 'showing'            // User's turn to play
  | 'opponent_thinking'  // Opponent auto-responding
  | 'incorrect'          // User made a mistake, prompt to retry
  | 'preparing_retry'    // ChessAtlas 1.4s transition before retrying missed moves at end of line
  | 'retrying_missed'    // ChessAtlas end-of-line drill of missed moves
  | 'line_complete'      // Completed all moves in current line
  | 'session_complete';  // Completed all lines in training set

interface PlayedMoveRecord {
  san: string;
  uci: string;
  turn: 'white' | 'black';
  isCorrect: boolean;
  moveNumber: number;
  fenAfter: string;
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
  mode: initialMode = 'learn',
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

    // Fallback: if baseLines is still empty, construct synthetic lines from cards
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
  const [trainingMode, setTrainingMode] = useState<'learn' | 'review' | 'overstudy'>(initialMode);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<TrainingPhase>('showing');
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [linesCompleted, setLinesCompleted] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [correctAttempts, setCorrectAttempts] = useState(0);

  // ChessAtlas Missed-Move Retry & Feedback State (useVariationPage-DuKpsf-3.js)
  const [attemptsOnMove, setAttemptsOnMove] = useState(0);
  const [missedSteps, setMissedSteps] = useState<number[]>([]);
  const [retryQueueIdx, setRetryQueueIdx] = useState(0);
  const [alternativeMoveBanner, setAlternativeMoveBanner] = useState<string | null>(null);
  const [tempBoardFen, setTempBoardFen] = useState<string | null>(null);
  const [correctSquares, setCorrectSquares] = useState<[string, string] | null>(null);
  const [incorrectSquares, setIncorrectSquares] = useState<[string, string] | null>(null);
  const [alternativeSquares, setAlternativeSquares] = useState<[string, string] | null>(null);
  const [previewMoveIdx, setPreviewMoveIdx] = useState<number | null>(null);

  // Floating XP feedback state
  const [floatingXP, setFloatingXP] = useState<{ id: number; amount: number } | null>(null);

  // Active line and position
  const activeLine: RepertoireLine | undefined = trainingLines[currentLineIndex];
  const [currentFen, setCurrentFen] = useState<string>(
    activeLine?.moves[0]?.fromFen || STARTING_FEN
  );
  const [playedMoves, setPlayedMoves] = useState<PlayedMoveRecord[]>([]);
  const [lastMoveHighlight, setLastMoveHighlight] = useState<{ from: string; to: string } | null>(null);
  const [boardArrows, setBoardArrows] = useState<Array<{ from: string; to: string; color: string }>>([]);
  const [showingHint, setShowingHint] = useState(false);
  const [wrongMoveFeedback, setWrongMoveFeedback] = useState<string | null>(null);

  // Active target step (normal stepIndex or missedSteps[retryQueueIdx] when retrying missed moves)
  const activeStepIndex = phase === 'retrying_missed' ? (missedSteps[retryQueueIdx] ?? stepIndex) : stepIndex;

  // FEN-derived turn ('white' | 'black')
  const currentTurn: 'white' | 'black' = currentFen.split(' ')[1] === 'w' ? 'white' : 'black';
  const isUserTurn = currentTurn === orientation || phase === 'retrying_missed';

  // Displayed FEN on board (supports temporary wrong/alternative move snapback & breadcrumb preview)
  const displayedFen = useMemo(() => {
    if (previewMoveIdx !== null && playedMoves[previewMoveIdx]) {
      return playedMoves[previewMoveIdx].fenAfter;
    }
    return tempBoardFen ?? currentFen;
  }, [previewMoveIdx, playedMoves, tempBoardFen, currentFen]);

  // Material evaluation for current position
  const boardMaterial = useMemo(() => calculateMaterial(displayedFen), [displayedFen]);

  // Expected move for the active step in the line
  const expectedMove: LineMove | undefined = activeLine?.moves[activeStepIndex];

  // Effective arrows on board (in 'learn' mode, automatically shows the guided arrow zn!)
  const effectiveArrows = useMemo(() => {
    if (previewMoveIdx !== null) return [];
    if (boardArrows.length > 0) return boardArrows;
    if (
      trainingMode === 'learn' &&
      isUserTurn &&
      (phase === 'showing' || phase === 'incorrect') &&
      expectedMove &&
      expectedMove.uci.length >= 4
    ) {
      return [
        {
          from: expectedMove.uci.slice(0, 2),
          to: expectedMove.uci.slice(2, 4),
          color: '#10B981',
        },
      ];
    }
    return [];
  }, [previewMoveIdx, boardArrows, trainingMode, isUserTurn, phase, expectedMove]);

  // Audio helper
  const triggerAudio = useCallback((san: string, isCapture = false) => {
    try {
      if (san.includes('x') || isCapture) {
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
    setAlternativeMoveBanner(null);
    setAttemptsOnMove(0);
    setMissedSteps([]);
    setRetryQueueIdx(0);
    setTempBoardFen(null);
    setCorrectSquares(null);
    setIncorrectSquares(null);
    setAlternativeSquares(null);
    setPreviewMoveIdx(null);
    setPhase('showing');
  }, [trainingLines]);

  // When trainingLines change, load first line
  useEffect(() => {
    if (trainingLines.length > 0) {
      loadLine(0);
    } else {
      setPhase('session_complete');
    }
  }, [trainingLines.length, loadLine]);

  // Helper to finish line or transition into ChessAtlas missed-moves retry (preparing_retry -> retrying_missed)
  const finishOrRetryMissed = useCallback(
    (missedList: number[]) => {
      if (missedList.length > 0 && activeLine) {
        setPhase('preparing_retry');
        setTimeout(() => {
          const firstMissedIdx = missedList[0];
          const targetMove = activeLine.moves[firstMissedIdx];
          if (targetMove) {
            setRetryQueueIdx(0);
            setCurrentFen(targetMove.fromFen);
            setBoardArrows([]);
            setShowingHint(false);
            setWrongMoveFeedback(null);
            setAlternativeMoveBanner(null);
            setCorrectSquares(null);
            setPhase('retrying_missed');
          } else {
            setPhase('line_complete');
            setLinesCompleted((l) => l + 1);
          }
        }, 1400);
      } else {
        setPhase('line_complete');
        setLinesCompleted((l) => l + 1);
      }
    },
    [activeLine]
  );

  // =========================================================================
  // AUTOMATED OPPONENT RESPONSE ENGINE (ChessAtlas Exact Feature)
  // When it is NOT the user's turn (e.g. Black in White repertoire, or White in Black repertoire)
  // the computer automatically plays the repertoire's prepared response after natural delay (380ms)
  // =========================================================================
  useEffect(() => {
    if (
      phase === 'session_complete' ||
      phase === 'line_complete' ||
      phase === 'preparing_retry' ||
      phase === 'retrying_missed' ||
      !activeLine
    ) {
      return;
    }

    // Check if it's the opponent's turn to move
    if (!isUserTurn) {
      setPhase('opponent_thinking');

      const opponentMove = activeLine.moves[stepIndex];
      if (!opponentMove) {
        finishOrRetryMissed(missedSteps);
        return;
      }

      const timer = setTimeout(() => {
        try {
          const chess = new Chess(currentFen);
          let executed = null;

          // Attempt SAN move first
          try {
            executed = chess.move(opponentMove.san);
          } catch {
            // Fallback to UCI coordinates
            if (opponentMove.uci && opponentMove.uci.length >= 4) {
              executed = chess.move({
                from: opponentMove.uci.slice(0, 2),
                to: opponentMove.uci.slice(2, 4),
                promotion: opponentMove.uci[4] || undefined,
              });
            }
          }

          if (executed) {
            triggerAudio(executed.san, !!executed.captured);
            const nextFen = chess.fen();
            setCurrentFen(nextFen);
            setCorrectSquares(null);

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
                fenAfter: nextFen,
              },
            ]);

            const nextStep = stepIndex + 1;
            setStepIndex(nextStep);

            // Check if line finished after opponent's move
            if (nextStep >= activeLine.moves.length) {
              finishOrRetryMissed(missedSteps);
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
  }, [isUserTurn, phase, activeLine, stepIndex, currentFen, currentTurn, triggerAudio, finishOrRetryMissed, missedSteps]);

  // =========================================================================
  // USER MOVE HANDLER (ChessAtlas Exact State Machine: Correct / Alternative / Wrong / Retry)
  // =========================================================================
  const handleMove = useCallback(
    (move: { from: string; to: string; san: string; promotion?: string }) => {
      if (
        !isUserTurn ||
        (phase !== 'showing' && phase !== 'incorrect' && phase !== 'retrying_missed') ||
        !activeLine ||
        tempBoardFen !== null
      ) {
        return;
      }

      setPreviewMoveIdx(null);
      setTotalAttempts((a) => a + 1);

      // 1. Check if matches primary expected move for this line/step
      const matchesExpected =
        expectedMove &&
        (expectedMove.san === move.san ||
          expectedMove.uci.startsWith(move.from + move.to));

      // 2. Check if matches ANOTHER valid edge prepared in the DAG from this node (USER_MOVE_ALTERNATIVE)
      const currentNodeId = fenToNodeId(currentFen);
      const validEdges = edges.get(currentNodeId) || [];
      const matchedAlternative =
        !matchesExpected &&
        validEdges.find(
          (e) => e.san === move.san || (e.uci && e.uci.startsWith(move.from + move.to))
        );

      // CASE A: Alternative Repertoire Move (ChessAtlas USER_MOVE_ALTERNATIVE — 1100ms amber highlight & snapback!)
      if (matchedAlternative) {
        try {
          const chess = new Chess(currentFen);
          const executed = chess.move(move);
          if (executed) {
            triggerAudio(move.san, !!executed.captured);
            setTempBoardFen(chess.fen());
            setAlternativeSquares([move.from, move.to]);
            setWrongMoveFeedback(null);
            setAlternativeMoveBanner(
              `${move.san} is another move in your repertoire — try the move for this variation!`
            );
            setTimeout(() => {
              setTempBoardFen(null);
              setAlternativeSquares(null);
            }, 1100);
          }
        } catch {}
        return;
      }

      // CASE B: Matches Expected Move for Active Variation
      if (matchesExpected) {
        try {
          const chess = new Chess(currentFen);
          const executed = chess.move(move);
          if (!executed) return;

          triggerAudio(move.san, !!executed.captured);

          const nextFen = chess.fen();
          setCurrentFen(nextFen);
          setLastMoveHighlight({ from: move.from, to: move.to });
          setCorrectSquares([move.from, move.to]);
          setBoardArrows([]);
          setShowingHint(false);
          setWrongMoveFeedback(null);
          setAlternativeMoveBanner(null);
          setAttemptsOnMove(0);

          // Trigger +10 XP float animation
          setFloatingXP({ id: Date.now(), amount: 10 });
          setTimeout(() => setFloatingXP(null), 1200);

          setCorrectAttempts((c) => c + 1);
          setStreak((s) => {
            const next = s + 1;
            setMaxStreak((m) => Math.max(m, next));
            return next;
          });

          // If we are in End-of-Line Retry of Missed Moves (retrying_missed)
          if (phase === 'retrying_missed') {
            if (retryQueueIdx + 1 < missedSteps.length) {
              const nextRetryIdx = retryQueueIdx + 1;
              const nextMissedStep = missedSteps[nextRetryIdx];
              const nextTarget = activeLine.moves[nextMissedStep];
              setTimeout(() => {
                setRetryQueueIdx(nextRetryIdx);
                setCurrentFen(nextTarget?.fromFen || nextFen);
                setCorrectSquares(null);
              }, 550);
            } else {
              setTimeout(() => {
                setCorrectSquares(null);
                setPhase('line_complete');
                setLinesCompleted((l) => l + 1);
              }, 550);
            }
            return;
          }

          setPlayedMoves((prev) => [
            ...prev,
            {
              san: executed.san,
              uci: `${move.from}${move.to}`,
              turn: currentTurn,
              isCorrect: attemptsOnMove === 0 && !showingHint,
              moveNumber: chess.moveNumber(),
              fenAfter: nextFen,
            },
          ]);

          // Update FSRS card for this position
          const card = allCards.find((c) => c.nodeId === currentNodeId);
          if (card) {
            const { card: updated } = scheduleReview(card, showingHint || attemptsOnMove > 0 ? 2 : 3);
            onUpdateCard(updated);
          }

          const updatedMissed =
            showingHint && !missedSteps.includes(stepIndex)
              ? [...missedSteps, stepIndex]
              : missedSteps;
          if (updatedMissed !== missedSteps) {
            setMissedSteps(updatedMissed);
          }

          const nextStep = stepIndex + 1;
          setStepIndex(nextStep);

          // Check if user completed the line
          if (nextStep >= activeLine.moves.length) {
            finishOrRetryMissed(updatedMissed);
          } else {
            // Next turn will be opponent's turn -> triggers auto-response in useEffect
            setPhase('opponent_thinking');
          }
        } catch {
          playErrorSound();
        }
      } else {
        // CASE C: Wrong Move (ChessAtlas USER_MOVE_INCORRECT — 600ms red square highlight & snapback!)
        playErrorSound();
        setStreak(0);
        const nextAttempt = attemptsOnMove + 1;
        setAttemptsOnMove(nextAttempt);
        setAlternativeMoveBanner(null);
        setWrongMoveFeedback(`Incorrect move: ${move.san} (Attempt ${nextAttempt})`);

        if (phase !== 'retrying_missed' && !missedSteps.includes(stepIndex)) {
          setMissedSteps((prev) => [...prev, stepIndex]);
        }
        if (phase !== 'retrying_missed') {
          setPhase('incorrect');
        }

        // Temporarily show wrong move on board for 600ms before snapping back (ChessAtlas WRONG_MOVE_DISPLAY = 600)
        try {
          const chess = new Chess(currentFen);
          const executed = chess.move(move);
          if (executed) {
            setTempBoardFen(chess.fen());
            setIncorrectSquares([move.from, move.to]);
            setTimeout(() => {
              setTempBoardFen(null);
              setIncorrectSquares(null);
            }, 600);
          }
        } catch {}

        // After 2 failed attempts on the same move, automatically reveal hint arrow (ChessAtlas behavior)
        if (nextAttempt >= 2 && expectedMove) {
          setShowingHint(true);
          setBoardArrows([
            {
              from: expectedMove.uci.slice(0, 2),
              to: expectedMove.uci.slice(2, 4),
              color: '#10B981',
            },
          ]);
        }

        // Update card rating to Again (1)
        const card = allCards.find((c) => c.nodeId === currentNodeId);
        if (card) {
          const { card: updated } = scheduleReview(card, 1);
          onUpdateCard(updated);
        }
      }
    },
    [
      isUserTurn,
      phase,
      activeLine,
      tempBoardFen,
      expectedMove,
      currentFen,
      edges,
      currentTurn,
      showingHint,
      attemptsOnMove,
      missedSteps,
      retryQueueIdx,
      allCards,
      stepIndex,
      triggerAudio,
      onUpdateCard,
      finishOrRetryMissed,
    ]
  );

  // Show Hint action
  const handleShowHint = useCallback(() => {
    if (!expectedMove) return;
    setShowingHint(true);
    setBoardArrows([
      {
        from: expectedMove.uci.slice(0, 2),
        to: expectedMove.uci.slice(2, 4),
        color: '#10B981', // Emerald arrow indicating best move
      },
    ]);
  }, [expectedMove]);

  // Show Solution action
  const handleShowSolution = useCallback(() => {
    if (!expectedMove) return;
    handleMove({
      from: expectedMove.uci.slice(0, 2),
      to: expectedMove.uci.slice(2, 4),
      san: expectedMove.san,
      promotion: expectedMove.uci[4] || undefined,
    });
  }, [expectedMove, handleMove]);

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

  // Keyboard Shortcuts (Space: Next, R: Restart, H: Hint, Escape: Exit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === ' ' || e.key === 'Enter') {
        if (phase === 'line_complete') {
          e.preventDefault();
          handleNextLine();
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRestartLine();
      } else if (e.key === 'h' || e.key === 'H') {
        if (isUserTurn && !showingHint) {
          e.preventDefault();
          handleShowHint();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onComplete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, isUserTurn, showingHint, handleNextLine, handleRestartLine, handleShowHint, onComplete]);

  // Overall session accuracy
  const sessionAccuracy = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 100;
  const sessionProgressPct =
    trainingLines.length > 0 ? Math.round((linesCompleted / trainingLines.length) * 100) : 0;

  // Coach mascot expression
  const coachExpression = useMemo(() => {
    if (wrongMoveFeedback) return 'sad';
    if (phase === 'line_complete') return 'happy';
    if (phase === 'opponent_thinking') return 'thinking';
    return 'idle';
  }, [wrongMoveFeedback, phase]);

  // =========================================================================
  // VIEW: SESSION COMPLETE
  // =========================================================================
  if (phase === 'session_complete' || trainingLines.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-[#0E131F] border border-white/10 shadow-2xl flex flex-col items-center gap-5 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-300 border border-amber-400/30">
            <Trophy size={36} weight="fill" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white">Repertoire Mastered!</h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-1">
              {repertoireName || 'Repertoire'} · All {trainingLines.length} variations completed
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 w-full py-2">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
              <p className="text-2xl font-bold font-mono text-emerald-400">{linesCompleted}</p>
              <p className="text-[10px] uppercase font-bold text-gray-400 mt-0.5">Lines</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
              <p className="text-2xl font-bold font-mono text-blue-400">{sessionAccuracy}%</p>
              <p className="text-[10px] uppercase font-bold text-gray-400 mt-0.5">Accuracy</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
              <p className="text-2xl font-bold font-mono text-amber-400">{maxStreak}</p>
              <p className="text-[10px] uppercase font-bold text-gray-400 mt-0.5">Best Streak</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onComplete}
            className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-extrabold text-sm transition-transform active:scale-[0.98] cursor-pointer shadow-lg"
          >
            Return to Repertoire
          </button>
        </motion.div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: FULL-SCREEN IMMERSIVE TRAINING SESSION (ChessAtlas Exact Style)
  // =========================================================================
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0B0F18] text-white select-none overflow-hidden">
      {/* Top Session Progress Bar */}
      <div className="h-1.5 w-full bg-white/10 shrink-0">
        <div
          className="h-full bg-emerald-500 transition-all duration-500 ease-out"
          style={{ width: `${sessionProgressPct}%` }}
        />
      </div>

      {/* Top Header Bar */}
      <header className="px-4 sm:px-6 py-3 border-b border-white/[0.08] bg-[#0E131F] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
            <Target size={14} weight="duotone" />
            <span>
              Line {currentLineIndex + 1} / {trainingLines.length}
            </span>
          </div>

          <div className="truncate">
            <h2 className="text-xs sm:text-sm font-extrabold text-white truncate">
              {activeLine?.title || chapterTitle || repertoireName || 'Repertoire Line'}
            </h2>
          </div>
        </div>

        {/* Center/Right Gamification: Mode Switcher + Streak + Floating XP + Exit */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Guided Learn vs Recall Review Mode Toggle (ChessAtlas mode switcher) */}
          <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-0.5 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setTrainingMode('learn')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                trainingMode === 'learn'
                  ? 'bg-emerald-500 text-stone-950 shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Guided mode with move arrows"
            >
              Learn
            </button>
            <button
              type="button"
              onClick={() => setTrainingMode('review')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                trainingMode !== 'learn'
                  ? 'bg-amber-400 text-stone-950 shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Recall mode from memory"
            >
              Review
            </button>
          </div>

          {/* Streak Flame Badge */}
          <div className="flex items-center gap-1 text-xs font-bold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full shadow-inner">
            <Fire size={15} weight="fill" className="text-amber-400 animate-pulse" />
            <span>{streak}</span>
          </div>

          {/* Floating XP Animation */}
          <AnimatePresence>
            {floatingXP && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.8 }}
                animate={{ opacity: 1, y: -8, scale: 1.1 }}
                exit={{ opacity: 0, y: -20 }}
                className="pointer-events-none text-emerald-400 font-black text-sm font-mono drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]"
              >
                +{floatingXP.amount} XP
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={onComplete}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors ml-1"
            title="Exit Training (Escape)"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Main Responsive Layout: ChessBoard Left/Center + Training Panel Right */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row items-center justify-center p-3 sm:p-5 lg:p-6 gap-4 lg:gap-8 overflow-y-auto">
        {/* Left Column: Board + Material Bars */}
        <div className="flex flex-col items-center justify-center w-full max-w-[560px] gap-2.5">
          {/* Top Player Material Bar */}
          {boardMaterial && (
            <MaterialDifferenceBar
              material={orientation === 'white' ? boardMaterial.black : boardMaterial.white}
              pieceColor={orientation === 'white' ? 'white' : 'black'}
              playerName={orientation === 'white' ? 'Opponent (Black)' : 'You (Black)'}
              className="w-full px-1"
            />
          )}

          {/* Interactive ChessBoard Container */}
          <div className="aspect-square relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#141B29]">
            <ChessBoard
              fen={displayedFen}
              orientation={orientation}
              onMove={
                previewMoveIdx === null &&
                tempBoardFen === null &&
                isUserTurn &&
                (phase === 'showing' || phase === 'incorrect' || phase === 'retrying_missed')
                  ? handleMove
                  : undefined
              }
              interactive={
                previewMoveIdx === null &&
                tempBoardFen === null &&
                isUserTurn &&
                (phase === 'showing' || phase === 'incorrect' || phase === 'retrying_missed')
              }
              lastMove={lastMoveHighlight}
              arrows={effectiveArrows}
              correctSquares={correctSquares}
              incorrectSquares={incorrectSquares}
              alternativeSquares={alternativeSquares}
              dimmed={previewMoveIdx !== null}
            />

            {/* Floating "Back to current position" pill when previewing historical breadcrumb move (ChessAtlas Kr) */}
            {previewMoveIdx !== null && (
              <div className="absolute top-3 inset-x-0 z-40 flex justify-center pointer-events-none">
                <button
                  type="button"
                  onClick={() => setPreviewMoveIdx(null)}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-stone-950/90 hover:bg-stone-900 border border-white/20 px-4 py-1.5 text-xs font-bold text-white shadow-xl transition-transform active:scale-95 cursor-pointer"
                >
                  <ArrowCounterClockwise size={14} className="text-amber-400" />
                  <span>Back to current position</span>
                </button>
              </div>
            )}
          </div>

          {/* Bottom Player Material Bar */}
          {boardMaterial && (
            <MaterialDifferenceBar
              material={orientation === 'white' ? boardMaterial.white : boardMaterial.black}
              pieceColor={orientation === 'white' ? 'black' : 'white'}
              playerName={orientation === 'white' ? 'You (White)' : 'Opponent (White)'}
              className="w-full px-1"
            />
          )}
        </div>

        {/* Right Column: Training Panel (Coach narration, Breadcrumb notation, Action CTAs) */}
        <div className="w-full lg:w-[420px] rounded-2xl border border-white/10 bg-[#0E131F] p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-xl">
          <div className="flex flex-col gap-4">
            {/* Mascot Coach Narration Speech Bubble */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/10">
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  coachExpression === 'happy'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : coachExpression === 'sad'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : coachExpression === 'thinking'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-white/10 text-gray-300'
                }`}
              >
                {coachExpression === 'happy' ? (
                  <Smiley size={24} weight="fill" />
                ) : coachExpression === 'sad' ? (
                  <SmileySad size={24} weight="fill" />
                ) : (
                  <SmileyMeh size={24} weight="fill" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
                    {phase === 'retrying_missed' || phase === 'preparing_retry'
                      ? 'Missed Move Drill'
                      : trainingMode === 'learn'
                      ? 'Guided Learn Coach'
                      : 'Repertoire Recall'}
                  </span>
                  {phase === 'retrying_missed' && (
                    <span className="rounded bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-300">
                      Retry {retryQueueIdx + 1}/{missedSteps.length}
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm font-semibold text-white leading-relaxed">
                  {phase === 'preparing_retry' ? (
                    <span className="text-amber-300">
                      Let&apos;s retry {missedSteps.length} missed move{missedSteps.length > 1 ? 's' : ''} before completing this line!
                    </span>
                  ) : alternativeMoveBanner ? (
                    <span className="text-amber-300">{alternativeMoveBanner}</span>
                  ) : wrongMoveFeedback ? (
                    <span className="text-rose-300">{wrongMoveFeedback}</span>
                  ) : phase === 'line_complete' ? (
                    <span className="text-emerald-300">
                      Variation mastered! Every move in this line is locked into memory.
                    </span>
                  ) : phase === 'retrying_missed' ? (
                    <span className="text-amber-200">
                      Play the correct repertoire move from memory for this missed position.
                    </span>
                  ) : phase === 'opponent_thinking' ? (
                    <span className="text-blue-300">
                      Opponent is responding with {orientation === 'white' ? 'Black' : 'White'}...
                    </span>
                  ) : isUserTurn ? (
                    <span>
                      {trainingMode === 'learn' && expectedMove ? (
                        <>
                          Play <strong className="font-mono text-emerald-400">{expectedMove.san}</strong> on the board (step {stepIndex + 1}/{activeLine?.moves.length || 1})
                        </>
                      ) : (
                        <>
                          Your turn: Recall {orientation}&apos;s move (step {stepIndex + 1}/{activeLine?.moves.length || 1})
                        </>
                      )}
                    </span>
                  ) : (
                    <span>Preparing next position...</span>
                  )}
                </p>
              </div>
            </div>

            {/* Alternative Repertoire Move Banner (ChessAtlas Ca in useVariationPage-DuKpsf-3.js) */}
            {alternativeMoveBanner && (
              <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center gap-2 text-xs text-amber-200 font-medium">
                <Sparkle size={16} weight="fill" className="text-amber-400 shrink-0" />
                <span>{alternativeMoveBanner}</span>
              </div>
            )}

            {/* Preparing Missed-Move Retry Progress Card (ChessAtlas preparing_retry) */}
            {phase === 'preparing_retry' && (
              <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/35 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                  <span>Preparing missed moves drill...</span>
                  <span className="font-mono">{missedSteps.length} to review</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-black/40 overflow-hidden">
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 1.35, ease: 'linear' }}
                    className="h-full bg-amber-400 rounded-full"
                  />
                </div>
              </div>
            )}

            {/* Move History Breadcrumb Trail (Interactive ChessAtlas es pills) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-gray-400 px-1">
                <span>Move Trail (click move to preview)</span>
                <span className="font-mono">
                  {stepIndex} / {activeLine?.moves.length || 0} moves
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1 p-2 rounded-xl bg-black/30 border border-white/[0.06] text-xs font-mono min-h-[52px]">
                {playedMoves.length === 0 ? (
                  <span className="text-gray-500 text-xs italic px-1">Starting position</span>
                ) : (
                  playedMoves.map((m, idx) => {
                    const isPreviewed = previewMoveIdx === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPreviewMoveIdx(isPreviewed ? null : idx)}
                        className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-xs transition-all cursor-pointer ${
                          isPreviewed
                            ? 'bg-amber-400 text-stone-950 ring-2 ring-amber-300 shadow-sm'
                            : m.turn === orientation
                            ? m.isCorrect
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                            : 'bg-blue-500/15 text-blue-300 border border-blue-500/25 hover:bg-blue-500/25'
                        }`}
                        title="Click to preview this position on the board"
                      >
                        {m.turn === 'white' ? `${Math.floor(idx / 2) + 1}. ` : ''}
                        {m.san}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Hint Box (if active) */}
            {showingHint && expectedMove && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300 font-mono">
                <Lightbulb size={16} className="text-emerald-400 shrink-0" />
                <span>
                  Hint: Expected move is <strong>{expectedMove.san}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Action CTAs and Navigation */}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.08]">
            {phase === 'line_complete' ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleNextLine}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 py-3.5 text-sm font-extrabold text-stone-950 transition-transform active:scale-[0.98] cursor-pointer shadow-lg"
                >
                  <span>Next Variation (Space)</span>
                  <ArrowRight size={18} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={handleRestartLine}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 py-2.5 text-xs font-bold text-gray-300 hover:text-white transition-colors cursor-pointer"
                >
                  <ArrowCounterClockwise size={15} />
                  <span>Drill Again (R)</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShowHint}
                  disabled={!isUserTurn || showingHint}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 py-2.5 text-xs font-bold text-gray-300 hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  <Lightbulb size={16} className="text-amber-400" />
                  <span>Hint (H)</span>
                </button>

                <button
                  type="button"
                  onClick={handleShowSolution}
                  disabled={!isUserTurn}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 py-2.5 text-xs font-bold text-gray-300 hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  <Eye size={16} className="text-blue-400" />
                  <span>Solution (S)</span>
                </button>

                <button
                  type="button"
                  onClick={handleRestartLine}
                  className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
                  title="Restart Line (R)"
                >
                  <ArrowCounterClockwise size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
