# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Serious chess players, club players, and tournament competitors (rating 1200–2400+) who want to build, memorize, and stress-test their opening repertoire against real games.

## Product Purpose
Grandmaster Atlas (Chess Compass) transforms chess opening study from static memorization into active, scientific mastery. It automatically cross-references your played online games (Lichess & Chess.com) against your repertoire tree (DAG), pinpointing exact deviation moves and scheduling personalized FSRS-6 spaced-repetition drills.

## Positioning
Unlike passive repertoire viewers, Chess Compass unifies a bidirectional Repertoire DAG with automated online game sync, FSRS-6 spaced repetition, and Cloud Stockfish deviation analysis in a single, high-performance web instrument.

## Operating Context
Desktop & mobile web browsers during pre-game opening preparation, post-match game review, and daily tactical/spaced-repetition drill routines.

## Capabilities and Constraints
- Repertoire DAG with branch management, transposition handling, and FEN tree exploration.
- Cloudflare OpenNext + Cloudflare Workers edge runtime with D1 remote database and Cloudflare Secrets.
- FSRS-6 spaced repetition scheduling (stability, difficulty, due date).
- Automatic Lichess (NDJSON API) and Chess.com (Public REST API) game sync & deviation detection.
- Fast interactive chessboard powered by Chessground and chess.js.
- Cloud Stockfish centipawn loss evaluation for candidate deviations.

## Brand Commitments
- Visual aesthetic: "The Precision Instrument" — dark obsidian canvas (`#0B0F17`), solid slate surfaces (`#141B29`), and gold/amber (`#F59E0B`) precision accents.
- Zero decorative slop: No gratuitous gradients, no emoji icons, no unnecessary rest shadows, no decorative card side-tabs.
- High-density, high-legibility typographic and data layout.

## Evidence on Hand
- Full opening DAG builder and viewer (`app/study/page.tsx`, `components/study/RepertoireDashboard.tsx`).
- FSRS-6 drill engine with spaced repetition cards (`lib/fsrs/scheduler.ts`, `lib/db/index.ts`).
- Game sync and deviation detection (`lib/api/lichess.ts`, `lib/api/chesscom.ts`, `lib/chess/deviations.ts`).
- Cloudflare D1 schema migrations (`schema.sql`).

## Product Principles
1. **Active over passive**: Always turn game mistakes into trainable flashcards.
2. **Precision and restraint**: Every visual element serves orientation and data density.
3. **Edge-native speed**: Zero-latency interactions and local-first Dexie caching paired with Cloudflare D1 cloud persistence.

## Accessibility & Inclusion
- WCAG AA contrast compliance across all text surfaces.
- Explicit keyboard focus rings (`:focus-visible`) and full keyboard navigation support for chess moves.
- Full responsive support with dynamic viewport height (`100dvh`) preventing mobile browser jitter.
