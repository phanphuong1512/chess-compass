'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  Search,
  Download,
  Loader2,
  ExternalLink,
  Plus,
  Play,
  CheckCircle2,
  Zap,
  TrendingDown,
  Sparkles,
  BookOpen,
  Filter,
  Check,
} from 'lucide-react';
import type { DeviationReport, ImportedGame, Repertoire } from '@/types/chess';
import { fetchLichessGames, fetchLichessUser } from '@/lib/api/lichess';
import { fetchChessComGames, fetchChessComProfile } from '@/lib/api/chesscom';
import { detectDeviations, type AnalysisSummary } from '@/lib/chess/deviations';
import { RepertoireDAG, fenToNodeId } from '@/lib/chess/dag';
import { db } from '@/lib/db';

interface DeviationDashboardProps {
  deviations: DeviationReport[];
  onAddToTraining: (deviation: DeviationReport) => void;
  dag?: RepertoireDAG;
  activeRepertoire?: Repertoire | null;
  onDeviationsDetected?: (newDevs: DeviationReport[]) => void;
  onAddMoveToRepertoire?: (fen: string, san: string) => void;
}

export default function DeviationDashboard({
  deviations,
  onAddToTraining,
  dag,
  activeRepertoire,
  onDeviationsDetected,
  onAddMoveToRepertoire,
}: DeviationDashboardProps) {
  const [platform, setPlatform] = useState<'lichess' | 'chesscom'>('lichess');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [games, setGames] = useState<ImportedGame[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'player' | 'opponent'>('all');

  // Popular test usernames for 1-click test
  const quickUsers = useMemo(() => {
    return platform === 'lichess'
      ? ['penguingm1', 'german11', 'thibault']
      : ['hikaru', 'magnuscarlsen', 'danyanych'];
  }, [platform]);

  // Fetch real games from Lichess or Chess.com API
  const handleFetch = useCallback(async (userToFetch?: string) => {
    const targetUser = (userToFetch || username).trim();
    if (!targetUser) return;

    setLoading(true);
    setFetchError(null);
    setSummary(null);

    try {
      let fetchedGames: ImportedGame[];
      if (platform === 'lichess') {
        fetchedGames = await fetchLichessGames(targetUser, 30);
      } else {
        fetchedGames = await fetchChessComGames(targetUser, 2);
      }

      setGames(fetchedGames);

      // Automatically run deviation detection if DAG & repertoire exist
      if (dag && activeRepertoire && fetchedGames.length > 0) {
        setAnalyzing(true);
        const result = await detectDeviations(fetchedGames, dag, targetUser, activeRepertoire, {
          maxGames: 30,
          evaluate: true,
        });

        setSummary(result);

        // Save newly found deviations to DB
        if (result.deviations.length > 0) {
          for (const dev of result.deviations) {
            await db.deviations.put(dev);
          }
          if (onDeviationsDetected) {
            onDeviationsDetected(result.deviations);
          }
        }
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Không thể tải ván cờ');
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  }, [platform, username, dag, activeRepertoire, onDeviationsDetected]);

  // Filter deviations
  const displayDeviations = useMemo(() => {
    const list = summary?.deviations || deviations;
    if (filterType === 'player') return list.filter((d) => !d.isOpponentDeviation);
    if (filterType === 'opponent') return list.filter((d) => d.isOpponentDeviation);
    return list;
  }, [summary, deviations, filterType]);

  return (
    <div className="flex flex-col gap-5 text-white">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Zap className="h-5 w-5 text-[#10B981]" />
            Real-Game Sync & Deviation Finder
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Tải ván đấu thực tế từ Lichess / Chess.com và tự động phát hiện nước đi lệch khỏi Repertoire DAG ({activeRepertoire?.name || 'Repertoire'})
          </p>
        </div>
      </div>

      {/* Sync Games Control Card */}
      <div className="rounded-2xl border border-white/10 bg-[#141B29] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
          <Download className="h-4 w-4 text-[#10B981]" />
          Đồng bộ ván đấu trực tiếp
        </h3>

        {/* Platform Selector */}
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => setPlatform('lichess')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
              platform === 'lichess'
                ? 'bg-[#10B981] text-white'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            Lichess.org (NDJSON API)
          </button>
          <button
            type="button"
            onClick={() => setPlatform('chesscom')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
              platform === 'chesscom'
                ? 'bg-[#10B981] text-white'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            Chess.com (Public REST API)
          </button>
        </div>

        {/* Username Input and Fetch Button */}
        <div className="flex gap-2">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={`Nhập username ${platform === 'lichess' ? 'Lichess' : 'Chess.com'}...`}
            className="flex-1 rounded-xl border border-white/15 bg-black/40 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none transition-colors focus:border-[#10B981]"
            onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
          />
          <button
            type="button"
            onClick={() => handleFetch()}
            disabled={loading || !username.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-[#10B981] px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#059669] disabled:opacity-50 cursor-pointer shadow-md shrink-0"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span>{loading ? 'Đang tải...' : 'Tải & Phân tích'}</span>
          </button>
        </div>

        {/* Quick Test Presets */}
        <div className="mt-2.5 flex items-center gap-2 text-[0.7rem] text-gray-400">
          <span>Thử nhanh với:</span>
          {quickUsers.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => {
                setUsername(u);
                handleFetch(u);
              }}
              className="rounded bg-white/5 px-2 py-0.5 text-gray-300 hover:bg-[#10B981]/20 hover:text-[#10B981] transition-colors cursor-pointer font-mono"
            >
              @{u}
            </button>
          ))}
        </div>

        {fetchError && (
          <p className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
            {fetchError}
          </p>
        )}

        {/* Live sync stats */}
        {games.length > 0 && (
          <div className="mt-3 flex items-center justify-between text-xs text-gray-300 border-t border-white/10 pt-3">
            <span className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>
                Đã tải <strong className="text-white">{games.length} ván đấu thực tế</strong> từ {platform === 'lichess' ? 'Lichess' : 'Chess.com'}
              </span>
            </span>
            {analyzing && (
              <span className="flex items-center gap-1.5 text-amber-300">
                <Loader2 className="h-3 w-3 animate-spin" />
                Đang đối chiếu Repertoire DAG & Cloud Stockfish...
              </span>
            )}
          </div>
        )}
      </div>

      {/* Analysis Summary Card */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
            <span className="text-2xl font-bold text-white font-mono">{summary.totalAnalyzed}</span>
            <p className="text-[0.7rem] text-gray-400 uppercase tracking-wider mt-1">
              Ván đã đối chiếu
            </p>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-center">
            <span className="text-2xl font-bold text-red-400 font-mono">
              {summary.playerDeviations}
            </span>
            <p className="text-[0.7rem] text-red-300 uppercase tracking-wider mt-1">
              Bạn đi chệch Repertoire
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-center">
            <span className="text-2xl font-bold text-amber-400 font-mono">
              {summary.opponentDeviations}
            </span>
            <p className="text-[0.7rem] text-amber-300 uppercase tracking-wider mt-1">
              Đối thủ đi nước mới (Novelty)
            </p>
          </div>
        </div>
      )}

      {/* Deviations List */}
      <div className="rounded-2xl border border-white/10 bg-[#141B29] p-5">
        <div className="flex items-center justify-between mb-4 border-b border-white/[0.08] pb-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Danh sách lệch chuẩn ({displayDeviations.length})
          </h3>

          {/* Filter options */}
          <div className="flex items-center gap-1 rounded-lg bg-black/40 border border-white/10 p-0.5 text-[0.65rem]">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`rounded px-2.5 py-1 font-semibold transition-colors cursor-pointer ${
                filterType === 'all' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setFilterType('player')}
              className={`rounded px-2.5 py-1 font-semibold transition-colors cursor-pointer ${
                filterType === 'player' ? 'bg-red-500/30 text-red-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              Bạn đi sai
            </button>
            <button
              type="button"
              onClick={() => setFilterType('opponent')}
              className={`rounded px-2.5 py-1 font-semibold transition-colors cursor-pointer ${
                filterType === 'opponent' ? 'bg-amber-500/30 text-amber-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              Nước mới đối thủ
            </button>
          </div>
        </div>

        {displayDeviations.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400/60 mb-2" />
            <p className="text-sm font-medium text-gray-300">
              Không có độ lệch nào trong danh sách.
            </p>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              Nhập tên người chơi ở trên và nhấn &quot;Tải &amp; Phân tích&quot; để tìm các nước đi bạn hoặc đối thủ đã lệch khỏi Repertoire.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[500px] overflow-y-auto [scrollbar-width:thin]">
            {displayDeviations.map((dev, i) => (
              <div
                key={dev.id ?? i}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 transition-colors hover:bg-white/[0.05]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.65rem] text-gray-300">
                        Nước {Math.ceil(dev.deviationPly / 2)} (Ply {dev.deviationPly})
                      </span>

                      {dev.isOpponentDeviation ? (
                        <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.2 text-[0.6rem] font-bold text-amber-300">
                          Đối thủ đi mới
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-500/15 border border-red-500/30 px-2 py-0.2 text-[0.6rem] font-bold text-red-300">
                          Bạn đi chệch
                        </span>
                      )}

                      <span className="text-[0.68rem] text-gray-400">
                        {dev.platform === 'lichess' ? 'Lichess' : 'Chess.com'} · @{dev.playerUsername} ({dev.playerColor})
                      </span>
                    </div>

                    <p className="text-sm text-white pt-0.5">
                      Đã đi: <span className="font-mono font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">{dev.playedMove}</span>
                      {dev.preparedMove ? (
                        <>
                          {' '}thay vì nước chuẩn bị:{' '}
                          <span className="font-mono font-bold text-[#10B981] bg-[#10B981]/10 px-1.5 py-0.5 rounded">
                            {dev.preparedMove}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 ml-1 italic">
                          (Chưa có nước chuẩn bị đối phó trong Repertoire)
                        </span>
                      )}
                    </p>

                    {dev.centipawnLoss !== undefined && (
                      <p className="text-[0.68rem] text-amber-300 flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" />
                        Độ tổn thất Centipawn: ~{dev.centipawnLoss} cp
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onAddMoveToRepertoire && dev.isOpponentDeviation && (
                      <button
                        type="button"
                        onClick={() => onAddMoveToRepertoire(dev.positionFen, dev.playedMove)}
                        className="flex items-center gap-1 rounded-lg bg-amber-400/15 border border-amber-400/30 px-2.5 py-1 text-[0.68rem] font-bold text-amber-300 hover:bg-amber-400/25 transition-colors cursor-pointer"
                        title="Thêm nước này vào Repertoire DAG"
                      >
                        <BookOpen className="h-3 w-3" /> + Repertoire
                      </button>
                    )}

                    {!dev.addedToTraining ? (
                      <button
                        type="button"
                        onClick={() => onAddToTraining(dev)}
                        className="flex items-center gap-1 rounded-lg bg-[#10B981]/20 border border-[#10B981]/40 px-2.5 py-1 text-[0.68rem] font-bold text-[#10B981] hover:bg-[#10B981]/30 transition-colors cursor-pointer"
                        title="Đưa vào lịch ôn tập FSRS hôm nay"
                      >
                        <Plus className="h-3 w-3" /> Luyện tập (FSRS)
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 text-[0.65rem] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                        <CheckCircle2 className="h-3 w-3" /> Đã xếp lịch
                      </span>
                    )}

                    {dev.gameId && (
                      <a
                        href={
                          dev.platform === 'lichess'
                            ? `https://lichess.org/${dev.gameId}`
                            : `https://www.chess.com/game/live/${dev.gameId}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center h-6 w-6 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        title="Xem ván gốc"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
