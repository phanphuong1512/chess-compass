'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Swords,
  Upload,
  Clipboard,
  Link as LinkIcon,
  FileText,
  Sparkles,
  ChevronRight,
  Check
} from 'lucide-react';
import {
  ChessKnightIcon,
  ChessPawnIcon,
  ChessKingIcon,
  ChessBishopIcon,
} from '@/components/icons/ChessPieceIcons';
import type { ChessColor, Repertoire } from '@/types/chess';

interface NewRepertoireModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    name: string;
    color: ChessColor;
    coverStyle?: string;
    pgnText?: string;
  }) => Promise<void>;
  onOpenGameSync?: () => void;
}

const COVER_STYLES: Array<{
  id: string;
  label: string;
  gradient: string;
  piece: 'knight' | 'pawn' | 'king' | 'bishop';
}> = [
  { id: 'vienna', label: 'Castle & Knight', gradient: 'from-emerald-800 to-amber-900', piece: 'knight' },
  { id: 'sicilian', label: 'Dark Citadel', gradient: 'from-purple-900 to-slate-900', piece: 'pawn' },
  { id: 'classical', label: 'Royal Sun', gradient: 'from-amber-700 to-yellow-900', piece: 'king' },
  { id: 'caro', label: 'Forest Citadel', gradient: 'from-teal-900 to-emerald-950', piece: 'bishop' },
];

export default function NewRepertoireModal({
  isOpen,
  onClose,
  onCreate,
  onOpenGameSync,
}: NewRepertoireModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<ChessColor>('white');
  const [selectedCover, setSelectedCover] = useState('vienna');
  const [pgnSource, setPgnSource] = useState<'paste' | 'lichess' | 'file'>('paste');
  const [pgnText, setPgnText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        color,
        coverStyle: selectedCover,
        pgnText: pgnText.trim() || undefined,
      });
      setName('');
      setPgnText('');
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPgnText(String(event.target?.result || ''));
      };
      reader.readAsText(file);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-[560px] rounded-2xl border border-white/10 bg-[#141B29] p-6 shadow-2xl text-white my-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Header */}
          <div className="mb-5">
            <h2 className="text-xl font-bold text-white tracking-tight">New repertoire</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Create a new repertoire from scratch or import PGN.
            </p>
          </div>

          {/* Action Callout: Build it from your games */}
          {onOpenGameSync && (
            <div
              onClick={() => {
                onClose();
                onOpenGameSync();
              }}
              className="mb-5 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 hover:bg-amber-500/15 transition-all cursor-pointer group"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                  <Swords className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-amber-300">Build it from your games</h4>
                  <p className="text-[0.7rem] text-gray-400 mt-0.5 leading-snug">
                    We scan your Lichess or Chess.com games and turn the openings you play most into lines.
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-amber-400/70 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Repertoire Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., My Sicilian Repertoire"
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-amber-400/80 focus:ring-1 focus:ring-amber-400/80"
              />
            </div>

            {/* Type Selector (Radio pills) */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">Type</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setColor('white')}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    color === 'white'
                      ? 'border-amber-400 bg-amber-400/15 text-amber-300 font-semibold shadow-xs'
                      : 'border-white/10 bg-white/[0.03] text-gray-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-white border border-gray-300 shrink-0" />
                  White repertoire
                </button>

                <button
                  type="button"
                  onClick={() => setColor('black')}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    color === 'black'
                      ? 'border-amber-400 bg-amber-400/15 text-amber-300 font-semibold shadow-xs'
                      : 'border-white/10 bg-white/[0.03] text-gray-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-900 border border-gray-600 shrink-0" />
                  Black repertoire
                </button>

                <button
                  type="button"
                  onClick={() => setColor('white')}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-gray-400 hover:border-white/20 hover:text-white transition-colors cursor-pointer"
                >
                  <Sparkles className="h-3 w-3 text-purple-400" />
                  Games & puzzles
                </button>
              </div>
            </div>

            {/* Choose Cover Illustration */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Cover Theme (optional)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {COVER_STYLES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCover(c.id)}
                    className={`relative flex flex-col items-center justify-center h-16 rounded-xl border bg-gradient-to-br ${c.gradient} p-2 text-center transition-all cursor-pointer ${
                      selectedCover === c.id
                        ? 'border-amber-400 ring-2 ring-amber-400/60 scale-102'
                        : 'border-white/10 opacity-70 hover:opacity-100 hover:border-white/30'
                    }`}
                  >
                    <div className="mb-1 drop-shadow-md flex items-center justify-center">
                      {c.piece === 'knight' ? (
                        <ChessKnightIcon color={color} size={22} />
                      ) : c.piece === 'pawn' ? (
                        <ChessPawnIcon color={color} size={22} />
                      ) : c.piece === 'king' ? (
                        <ChessKingIcon color={color} size={22} />
                      ) : (
                        <ChessBishopIcon color={color} size={22} />
                      )}
                    </div>
                    <span className="text-[0.65rem] font-medium text-white/90 truncate w-full">
                      {c.label}
                    </span>
                    {selectedCover === c.id && (
                      <div className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-amber-400 flex items-center justify-center text-black">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* PGN (Optional) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-300">PGN (optional)</label>
                <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-[0.65rem]">
                  <button
                    type="button"
                    onClick={() => setPgnSource('paste')}
                    className={`flex items-center gap-1 rounded px-2 py-0.5 transition-colors cursor-pointer ${
                      pgnSource === 'paste'
                        ? 'bg-amber-400/20 text-amber-300 font-semibold'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Clipboard className="h-2.5 w-2.5" /> Paste
                  </button>
                  <button
                    type="button"
                    onClick={() => setPgnSource('lichess')}
                    className={`flex items-center gap-1 rounded px-2 py-0.5 transition-colors cursor-pointer ${
                      pgnSource === 'lichess'
                        ? 'bg-amber-400/20 text-amber-300 font-semibold'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <LinkIcon className="h-2.5 w-2.5" /> Lichess study
                  </button>
                  <button
                    type="button"
                    onClick={() => setPgnSource('file')}
                    className={`flex items-center gap-1 rounded px-2 py-0.5 transition-colors cursor-pointer ${
                      pgnSource === 'file'
                        ? 'bg-amber-400/20 text-amber-300 font-semibold'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <FileText className="h-2.5 w-2.5" /> File
                  </button>
                </div>
              </div>

              {pgnSource === 'file' ? (
                <label className="flex flex-col items-center justify-center h-28 rounded-xl border border-dashed border-white/20 bg-black/30 hover:border-amber-400/50 hover:bg-black/40 transition-colors cursor-pointer">
                  <Upload className="h-5 w-5 text-gray-400 mb-1" />
                  <span className="text-xs text-gray-300 font-medium">Upload .pgn file</span>
                  <span className="text-[0.65rem] text-gray-500 mt-0.5">Drag & drop or browse</span>
                  <input
                    type="file"
                    accept=".pgn,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  {pgnText && (
                    <span className="mt-1 text-[0.65rem] text-emerald-400 font-medium">
                      ✓ File loaded ({pgnText.length} characters)
                    </span>
                  )}
                </label>
              ) : pgnSource === 'lichess' ? (
                <input
                  type="text"
                  placeholder="https://lichess.org/study/xxxx"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-amber-400/80"
                />
              ) : (
                <textarea
                  value={pgnText}
                  onChange={(e) => setPgnText(e.target.value)}
                  placeholder="Paste one or more PGN games&#10;e.g. 1. e4 e5 2. Nc3 Nf6 3. Bc4..."
                  rows={4}
                  className="w-full rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-amber-400/80 resize-none"
                />
              )}
              <span className="block text-[0.65rem] text-gray-500 mt-1">
                Each game becomes a chapter.
              </span>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || isSubmitting}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 px-5 py-2 text-xs font-bold text-gray-950 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 cursor-pointer shadow-md"
              >
                {isSubmitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
