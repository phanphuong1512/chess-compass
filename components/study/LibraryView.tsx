'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Star,
  Check,
  Sparkles,
  ArrowRight,
  Shield,
  Layers,
  Search,
} from 'lucide-react';
import type { ChessColor } from '@/types/chess';

interface LibraryCourse {
  id: string;
  title: string;
  color: ChessColor;
  moves: string;
  variationsCount: number;
  depth: number;
  rating: number;
  author: string;
  gradient: string;
  description: string;
  firstMoves: Array<{ from: string; to: string; san: string }>;
}

const MASTER_COURSES: LibraryCourse[] = [
  {
    id: 'course_vienna',
    title: 'Vienna Game: Attack & Gambit',
    color: 'white',
    moves: '1. e4 e5 2. Nc3',
    variationsCount: 28,
    depth: 14,
    rating: 4.9,
    author: 'Grandmaster Compass Academy',
    gradient: 'from-[#064E3B] via-[#047857] to-[#B45309]',
    description: 'Dynamic, aggressive opening avoiding dry Italian/Ruy Lopez lines while retaining deadly piece activity.',
    firstMoves: [
      { from: 'e2', to: 'e4', san: 'e4' },
      { from: 'e7', to: 'e5', san: 'e5' },
      { from: 'b1', to: 'c3', san: 'Nc3' },
    ],
  },
  {
    id: 'course_caro_kann',
    title: 'Caro-Kann: Solid as Granite',
    color: 'black',
    moves: '1. e4 c6',
    variationsCount: 42,
    depth: 16,
    rating: 4.9,
    author: 'Grandmaster Compass Academy',
    gradient: 'from-[#1E1B4B] via-[#312E81] to-[#4338CA]',
    description: 'Impenetrable defense against 1.e4 with clear pawn structures and harmonious piece development.',
    firstMoves: [
      { from: 'e2', to: 'e4', san: 'e4' },
      { from: 'c7', to: 'c6', san: 'c6' },
      { from: 'd2', to: 'd4', san: 'd4' },
      { from: 'd7', to: 'd5', san: 'd5' },
    ],
  },
  {
    id: 'course_sicilian_classical',
    title: 'Sicilian Defense: Classical & Dragon',
    color: 'black',
    moves: '1. e4 c5 2. Nf3 d6',
    variationsCount: 54,
    depth: 18,
    rating: 4.8,
    author: 'Grandmaster Compass Academy',
    gradient: 'from-[#831843] via-[#9D174D] to-[#BE185D]',
    description: 'The highest-scoring counter-attacking response against 1.e4 with fighting imbalances and sharp play.',
    firstMoves: [
      { from: 'e2', to: 'e4', san: 'e4' },
      { from: 'c7', to: 'c5', san: 'c5' },
      { from: 'g1', to: 'f3', san: 'Nf3' },
      { from: 'd7', to: 'd6', san: 'd6' },
    ],
  },
  {
    id: 'course_kings_indian',
    title: "King's Indian: Mar del Plata Attack",
    color: 'black',
    moves: '1. d4 Nf6 2. c4 g6',
    variationsCount: 38,
    depth: 16,
    rating: 4.9,
    author: 'Grandmaster Compass Academy',
    gradient: 'from-[#78350F] via-[#92400E] to-[#B45309]',
    description: 'Legendary kingside pawn storm weapon championed by Kasparov and Fischer against 1.d4.',
    firstMoves: [
      { from: 'd2', to: 'd4', san: 'd4' },
      { from: 'g8', to: 'f6', san: 'Nf6' },
      { from: 'c2', to: 'c4', san: 'c4' },
      { from: 'g7', to: 'g6', san: 'g6' },
    ],
  },
  {
    id: 'course_catalan',
    title: 'The Catalan System: Modern Harmony',
    color: 'white',
    moves: '1. d4 Nf6 2. c4 e6 3. g3',
    variationsCount: 32,
    depth: 15,
    rating: 4.8,
    author: 'Grandmaster Compass Academy',
    gradient: 'from-[#14532D] via-[#166534] to-[#15803D]',
    description: 'Positional boa-constrictor favored by Kramnik and Carlsen, radiating immense pressure along the h1-a8 diagonal.',
    firstMoves: [
      { from: 'd2', to: 'd4', san: 'd4' },
      { from: 'g8', to: 'f6', san: 'Nf6' },
      { from: 'c2', to: 'c4', san: 'c4' },
      { from: 'e7', to: 'e6', san: 'e6' },
      { from: 'g2', to: 'g3', san: 'g3' },
    ],
  },
  {
    id: 'course_english',
    title: 'English Opening: Flexible Architecture',
    color: 'white',
    moves: '1. c4',
    variationsCount: 26,
    depth: 14,
    rating: 4.7,
    author: 'Grandmaster Compass Academy',
    gradient: 'from-[#312E81] via-[#1E1B4B] to-[#0F172A]',
    description: 'Hypermodern approach controlling the d5 square from the flank with rich transpositional potential.',
    firstMoves: [
      { from: 'c2', to: 'c4', san: 'c4' },
    ],
  },
];

interface LibraryViewProps {
  onAddCourseToRepertoire: (course: LibraryCourse) => Promise<void>;
}

export default function LibraryView({ onAddCourseToRepertoire }: LibraryViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterColor, setFilterColor] = useState<'all' | 'white' | 'black'>('all');
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const filteredCourses = MASTER_COURSES.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.moves.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesColor = filterColor === 'all' || c.color === filterColor;
    return matchesSearch && matchesColor;
  });

  const handleClone = async (course: LibraryCourse) => {
    setCloningId(course.id);
    try {
      await onAddCourseToRepertoire(course);
      setAddedIds((prev) => new Set(prev).add(course.id));
    } finally {
      setCloningId(null);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] bg-[#0B0F17] p-6 lg:p-8 space-y-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/20 text-amber-400 font-bold">
                🏛️
              </span>
              <h1 className="text-2xl font-extrabold text-white">Opening Repertoire Library</h1>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Curated Grandmaster-level opening repertoires with deep engine-verified lines and explanations.
            </p>
          </div>

          {/* Search & Filter */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search openings..."
                className="w-48 rounded-xl border border-white/10 bg-[#141B29] px-3 py-1.5 pl-8 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400/50"
              />
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            </div>

            <div className="flex rounded-xl border border-white/10 bg-[#141B29] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setFilterColor('all')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${
                  filterColor === 'all' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterColor('white')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${
                  filterColor === 'white' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                White
              </button>
              <button
                type="button"
                onClick={() => setFilterColor('black')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${
                  filterColor === 'black' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Black
              </button>
            </div>
          </div>
        </div>

        {/* Courses Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCourses.map((course) => {
            const isAdded = addedIds.has(course.id);
            const isCloning = cloningId === course.id;

            return (
              <div
                key={course.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111726] shadow-lg hover:border-amber-400/40 transition-all duration-300"
              >
                <div>
                  {/* Visual Header / Banner */}
                  <div className={`relative h-28 w-full bg-gradient-to-br ${course.gradient} p-4 flex flex-col justify-between overflow-hidden`}>
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-black/40 backdrop-blur-xs px-2.5 py-0.5 text-[0.65rem] font-bold text-white border border-white/10">
                        {course.color === 'white' ? '⚪ White Repertoire' : '⚫ Black Repertoire'}
                      </span>
                      <div className="flex items-center gap-1 text-[0.65rem] font-bold text-amber-300 bg-black/40 px-2 py-0.5 rounded-full">
                        <Star className="h-3 w-3 fill-amber-300" />
                        <span>{course.rating}</span>
                      </div>
                    </div>
                    <div className="relative z-10">
                      <span className="font-mono text-xs text-white/90 font-semibold drop-shadow-sm">
                        {course.moves}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-5 space-y-3">
                    <h3 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors">
                      {course.title}
                    </h3>
                    <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
                      {course.description}
                    </p>

                    <div className="flex items-center gap-3 pt-2 text-[0.7rem] text-gray-400">
                      <span className="flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5 text-emerald-400" />
                        <span>{course.variationsCount} variations</span>
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Shield className="h-3.5 w-3.5 text-blue-400" />
                        <span>Depth {course.depth} plies</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="p-5 pt-0">
                  <button
                    type="button"
                    disabled={isAdded || isCloning}
                    onClick={() => handleClone(course)}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                      isAdded
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-white/5 text-white hover:bg-amber-400 hover:text-black border border-white/10'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-400" />
                        <span>Added to My Repertoires</span>
                      </>
                    ) : isCloning ? (
                      <span>Adding to Repertoires...</span>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        <span>Add to My Repertoires</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
