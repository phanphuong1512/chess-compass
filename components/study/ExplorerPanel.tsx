'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Key,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
  BookOpen,
  Cpu,
  Trophy,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import type { ExplorerResult, ExplorerMove, LichessCloudEval, LichessTablebase, LichessUser } from '@/types/chess';
import {
  queryExplorer,
  queryMastersExplorer,
  fetchCloudEval,
  fetchTablebase,
  verifyLichessToken,
  getSavedLichessToken,
  LichessAuthError,
} from '@/lib/api/lichess';

interface ExplorerPanelProps {
  fen: string;
  onSelectMove?: (san: string) => void;
}

const RATING_GROUPS = [
  { label: '1400-1600', values: [1400, 1600] },
  { label: '1600-1800', values: [1600, 1800] },
  { label: '1800-2000', values: [1800, 2000] },
  { label: '2000-2200', values: [2000, 2200] },
  { label: '2200-2500', values: [2200, 2500] },
  { label: '2500+', values: [2500] },
];

export default function ExplorerPanel({ fen, onSelectMove }: ExplorerPanelProps) {
  const [source, setSource] = useState<'masters' | 'community'>('masters');
  const [result, setResult] = useState<ExplorerResult | null>(null);
  const [cloudEval, setCloudEval] = useState<LichessCloudEval | null>(null);
  const [tablebase, setTablebase] = useState<LichessTablebase | null>(null);
  const [loading, setLoading] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedRatings, setSelectedRatings] = useState([1800, 2000, 2200, 2500]);
  const [showRatingFilter, setShowRatingFilter] = useState(false);

  // Token management
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [connectedUser, setConnectedUser] = useState<LichessUser | null>(null);
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [tokenSuccessMsg, setTokenSuccessMsg] = useState<string | null>(null);

  // Initialize saved token
  useEffect(() => {
    const saved = getSavedLichessToken();
    if (saved) {
      setTokenInput(saved);
      // Verify in background
      verifyLichessToken(saved).then((res) => {
        if (res.valid && res.user) {
          setConnectedUser(res.user);
        }
      });
    }
  }, []);

  // Fetch Cloud Eval and Tablebase independently (No Auth required for these two!)
  useEffect(() => {
    let cancelled = false;

    // 1. Cloud Stockfish
    fetchCloudEval(fen).then((evalData) => {
      if (!cancelled) setCloudEval(evalData);
    });

    // 2. 7-piece Tablebase
    fetchTablebase(fen).then((tbData) => {
      if (!cancelled) setTablebase(tbData);
    });

    return () => {
      cancelled = true;
    };
  }, [fen]);

  // Fetch Opening Explorer data (Masters or Community)
  const fetchExplorer = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      let data: ExplorerResult;
      if (source === 'masters') {
        data = await queryMastersExplorer(fen);
      } else {
        data = await queryExplorer(fen, { ratings: selectedRatings });
      }

      setResult(data);
      setAuthRequired(false);
    } catch (err) {
      if (err instanceof LichessAuthError) {
        setAuthRequired(true);
        setResult(null);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to query Lichess Explorer');
        setResult(null);
      }
    } finally {
      setLoading(false);
    }
  }, [fen, source, selectedRatings]);

  useEffect(() => {
    const timer = setTimeout(fetchExplorer, 250);
    return () => clearTimeout(timer);
  }, [fetchExplorer]);

  const handleSaveAndVerifyToken = async () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      localStorage.removeItem('hb_lichess_token');
      setConnectedUser(null);
      setAuthRequired(true);
      setShowTokenDialog(false);
      return;
    }

    setVerifyingToken(true);
    const check = await verifyLichessToken(trimmed);
    setVerifyingToken(false);

    if (check.valid && check.user) {
      localStorage.setItem('hb_lichess_token', trimmed);
      setConnectedUser(check.user);
      setAuthRequired(false);
      setTokenSuccessMsg(`Connected as @${check.user.username}`);
      setTimeout(() => {
        setTokenSuccessMsg(null);
        setShowTokenDialog(false);
      }, 1500);
      fetchExplorer();
    } else {
      setErrorMessage(check.error || 'Token verification failed. Please check your token.');
    }
  };

  const totalGames = result ? result.white + result.draws + result.black : 0;

  const getMoveStats = (move: ExplorerMove) => {
    const total = move.white + move.draws + move.black;
    if (total === 0) return { whiteP: 33, drawP: 34, blackP: 33, total: 0 };
    return {
      whiteP: (move.white / total) * 100,
      drawP: (move.draws / total) * 100,
      blackP: (move.black / total) * 100,
      total,
    };
  };

  return (
    <div className="flex flex-col gap-3 text-white">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-[#10B981]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-200">
            Lichess Explorer
          </h3>
        </div>

        {/* Source Toggle: Masters vs Community */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-lg bg-black/40 border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => setSource('masters')}
              className={`rounded-md px-2.5 py-1 text-[0.65rem] font-semibold transition-colors cursor-pointer ${
                source === 'masters'
                  ? 'bg-amber-400 text-gray-950 shadow-xs'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Masters (2M+)
            </button>
            <button
              type="button"
              onClick={() => setSource('community')}
              className={`rounded-md px-2.5 py-1 text-[0.65rem] font-semibold transition-colors cursor-pointer ${
                source === 'community'
                  ? 'bg-[#10B981] text-white shadow-xs'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Lichess Games
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowTokenDialog((v) => !v)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[0.65rem] font-medium border transition-colors cursor-pointer ${
              connectedUser
                ? 'border-[#10B981]/40 bg-[#10B981]/15 text-[#10B981] hover:bg-[#10B981]/25'
                : 'border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
            title="Manage Lichess Personal Access Token"
          >
            <Key className="h-3 w-3" />
            <span>{connectedUser ? `@${connectedUser.username}` : 'Token'}</span>
          </button>
        </div>
      </div>

      {/* Cloud Stockfish Evaluation Banner (Always live, Zero Auth needed) */}
      {cloudEval && cloudEval.pvs && cloudEval.pvs.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-purple-400 shrink-0" />
            <div>
              <span className="font-semibold text-purple-200">
                Stockfish Cloud (Depth {cloudEval.depth}):{' '}
              </span>
              <span className="font-mono font-bold text-white">
                {cloudEval.pvs[0].cp !== undefined
                  ? `${cloudEval.pvs[0].cp > 0 ? '+' : ''}${(cloudEval.pvs[0].cp / 100).toFixed(2)}`
                  : cloudEval.pvs[0].mate !== undefined
                    ? `M${cloudEval.pvs[0].mate}`
                    : '0.00'}
              </span>
            </div>
          </div>
          <span className="text-[0.65rem] font-mono text-purple-300/80 truncate max-w-[180px]">
            {cloudEval.pvs[0].moves.split(' ').slice(0, 4).join(' ')}...
          </span>
        </div>
      )}

      {/* Tablebase solution banner if endgame <= 7 pieces */}
      {tablebase && tablebase.category && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="font-semibold text-emerald-200 capitalize">
              7-Piece Tablebase: {tablebase.category}
              {tablebase.dtm ? ` in ${Math.abs(tablebase.dtm)} moves (DTM)` : ''}
            </span>
          </div>
          {tablebase.moves.length > 0 && (
            <span className="font-mono text-emerald-300 font-bold">
              Best: {tablebase.moves[0].san}
            </span>
          )}
        </div>
      )}

      {/* Token Modal / Configuration Dialog */}
      {showTokenDialog && (
        <div className="rounded-xl border border-white/10 bg-[#1E293B] p-4 text-xs shadow-2xl animate-in fade-in">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#10B981]" />
              <span className="font-bold text-white">Lichess Personal Access Token</span>
            </div>
            <button
              type="button"
              onClick={() => setShowTokenDialog(false)}
              className="text-gray-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>

          <p className="text-[0.72rem] text-gray-300 mb-3 leading-relaxed">
            Lichess yêu cầu Personal Access Token để truy vấn Opening Explorer (chống DDoS và tự động hóa quá tải).
            Token này hoàn toàn <strong className="text-[#10B981]">miễn phí</strong> và không cần cấp bất kỳ quyền đặc biệt nào (scopes: none).
          </p>

          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Dán token 'lip_...' vào đây"
                className="flex-1 rounded-lg bg-black/50 border border-white/20 px-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-[#10B981]"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveAndVerifyToken()}
              />
              <button
                type="button"
                onClick={handleSaveAndVerifyToken}
                disabled={verifyingToken}
                className="rounded-lg bg-[#10B981] px-4 py-2 font-bold text-white hover:bg-[#059669] transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                {verifyingToken ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>Lưu & Xác thực</span>
              </button>
            </div>

            {tokenSuccessMsg && (
              <p className="text-[0.7rem] text-emerald-400 font-semibold">{tokenSuccessMsg}</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[0.7rem]">
            <a
              href="https://lichess.org/account/oauth/token/create?description=Grandmaster+Atlas"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[#10B981] hover:underline font-medium"
            >
              <span>Tạo token 1-click trên Lichess</span>
              <ExternalLink className="h-3 w-3" />
            </a>

            {connectedUser && (
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('hb_lichess_token');
                  setTokenInput('');
                  setConnectedUser(null);
                  setAuthRequired(true);
                }}
                className="text-red-400 hover:underline cursor-pointer"
              >
                Xóa Token
              </button>
            )}
          </div>
        </div>
      )}

      {/* Auth Required State (Clean prompt when unauthenticated) */}
      {authRequired && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-amber-400 mb-2" />
          <h4 className="text-sm font-bold text-white mb-1">
            Yêu cầu kết nối Lichess Token
          </h4>
          <p className="text-xs text-gray-300 max-w-md mx-auto mb-3 leading-relaxed">
            Để xem thống kê trực tiếp hàng triệu ván cờ từ Lichess Opening Explorer, bạn cần nhập một Personal Access Token miễn phí.
          </p>
          <div className="flex items-center justify-center gap-2">
            <a
              href="https://lichess.org/account/oauth/token/create?description=Grandmaster+Atlas"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-gray-950 hover:bg-amber-300 transition-colors"
            >
              <span>1. Tạo Token trên Lichess</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <button
              type="button"
              onClick={() => setShowTokenDialog(true)}
              className="rounded-lg bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors cursor-pointer"
            >
              2. Dán Token vào đây
            </button>
          </div>
        </div>
      )}

      {/* Rating Filter (Community Mode) */}
      {source === 'community' && (
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] text-gray-400 uppercase tracking-wider font-semibold">
            Bộ lọc Elo
          </span>
          <button
            type="button"
            onClick={() => setShowRatingFilter(!showRatingFilter)}
            className="flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 text-[0.65rem] text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            Ratings <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      )}

      {showRatingFilter && source === 'community' && (
        <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-black/40 p-2">
          {RATING_GROUPS.map((group) => {
            const isSelected = group.values.some((v) => selectedRatings.includes(v));
            return (
              <button
                key={group.label}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    setSelectedRatings(selectedRatings.filter((r) => !group.values.includes(r)));
                  } else {
                    setSelectedRatings([...selectedRatings, ...group.values]);
                  }
                }}
                className={`rounded px-2 py-0.5 text-[0.6rem] font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#10B981] text-white font-bold'
                    : 'bg-white/5 text-gray-400 hover:text-gray-200'
                }`}
              >
                {group.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading Spinner */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-[#10B981]" />
          <span className="text-xs text-gray-400">Đang tải dữ liệu Lichess thực tế...</span>
        </div>
      )}

      {/* Error message */}
      {errorMessage && !authRequired && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-center">
          <p className="text-xs text-red-300">{errorMessage}</p>
          <button
            type="button"
            onClick={fetchExplorer}
            className="mt-2 inline-flex items-center gap-1 text-[0.65rem] text-red-400 hover:underline cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" /> Thử lại
          </button>
        </div>
      )}

      {/* Real Live Opening Explorer Data */}
      {!loading && result && (
        <>
          {/* Total stats banner */}
          {totalGames > 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex h-3.5 w-full overflow-hidden rounded-full shadow-inner bg-black/50">
                <div
                  className="bg-white transition-all"
                  style={{ width: `${(result.white / totalGames) * 100}%` }}
                  title={`Trắng thắng: ${((result.white / totalGames) * 100).toFixed(1)}%`}
                />
                <div
                  className="bg-gray-500 transition-all"
                  style={{ width: `${(result.draws / totalGames) * 100}%` }}
                  title={`Hòa: ${((result.draws / totalGames) * 100).toFixed(1)}%`}
                />
                <div
                  className="bg-gray-800 transition-all"
                  style={{ width: `${(result.black / totalGames) * 100}%` }}
                  title={`Đen thắng: ${((result.black / totalGames) * 100).toFixed(1)}%`}
                />
              </div>

              <div className="mt-2 flex justify-between text-[0.68rem] text-gray-300 font-mono">
                <span className="font-semibold text-white">
                  {totalGames.toLocaleString()} ván
                </span>
                <span>
                  {((result.white / totalGames) * 100).toFixed(0)}% W /{' '}
                  {((result.draws / totalGames) * 100).toFixed(0)}% D /{' '}
                  {((result.black / totalGames) * 100).toFixed(0)}% B
                </span>
              </div>

              {result.opening && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-[#8B5CF6] font-semibold border-t border-white/5 pt-1.5">
                  <BookOpen className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {result.opening.eco} · {result.opening.name}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-gray-500 italic">
              Không có ván cờ nào trong cơ sở dữ liệu ở thế cờ này.
            </p>
          )}

          {/* Moves Table */}
          {result.moves.length > 0 && (
            <div className="text-xs">
              <div className="grid grid-cols-[2.5rem_1.2fr_2.5rem_1.8fr] gap-x-1 px-1.5 pb-1 text-[0.65rem] font-bold uppercase text-gray-400 border-b border-white/10 mb-1">
                <span>Nước đi</span>
                <span>Số ván</span>
                <span>Avg Elo</span>
                <span className="text-right pr-1">Tỉ lệ thắng</span>
              </div>

              <div className="space-y-0.5 max-h-[300px] overflow-y-auto [scrollbar-width:thin]">
                {result.moves.map((move) => {
                  const stats = getMoveStats(move);
                  return (
                    <button
                      key={move.san}
                      type="button"
                      onClick={() => onSelectMove?.(move.san)}
                      className="grid w-full grid-cols-[2.5rem_1.2fr_2.5rem_1.8fr] items-center gap-x-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/10 group cursor-pointer"
                    >
                      <span className="font-mono font-bold text-white group-hover:text-[#10B981]">
                        {move.san}
                      </span>
                      <span className="text-gray-300 text-[0.7rem] font-mono">
                        {stats.total.toLocaleString()}
                      </span>
                      <span className="text-gray-400 text-[0.7rem] font-mono">
                        {move.averageRating || '—'}
                      </span>
                      <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-white/10 bg-black/40">
                        <div className="bg-white" style={{ width: `${stats.whiteP}%` }} />
                        <div className="bg-gray-500" style={{ width: `${stats.drawP}%` }} />
                        <div className="bg-gray-800" style={{ width: `${stats.blackP}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Master Games Section */}
          {result.topGames && result.topGames.length > 0 && (
            <div className="mt-2 border-t border-white/[0.08] pt-2">
              <h4 className="text-[0.65rem] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                Ván cờ Đại kiện tướng tiêu biểu ({result.topGames.length})
              </h4>
              <div className="space-y-1">
                {result.topGames.map((game) => (
                  <a
                    key={game.id}
                    href={`https://lichess.org/${game.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-lg bg-white/[0.02] border border-white/5 px-2.5 py-1.5 text-[0.68rem] hover:bg-white/[0.06] transition-colors group"
                  >
                    <div className="truncate">
                      <span className="font-medium text-white group-hover:text-[#10B981]">
                        {game.white.name} ({game.white.rating}) vs {game.black.name} ({game.black.rating})
                      </span>
                      <span className="ml-1 text-[0.6rem] text-gray-500">{game.year}</span>
                    </div>
                    <span className="ml-2 font-mono font-bold shrink-0 text-gray-300">
                      {game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '½-½'}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
