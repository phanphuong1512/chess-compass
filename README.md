# Chess Compass (Grandmaster Repertoire System)

Advanced, offline-first, highly aesthetic chess repertoire and training web application synthesizing the best features of Chess Compass, Chess Prep Pro, Chessbook, and OpeningTree.

## Features
- **Transposition-Aware Directed Acyclic Graph (DAG)**: Positions converge across distinct move orders.
- **FSRS-6 Adaptive Spaced Repetition**: Memory stability, difficulty, and retrievability algorithm.
- **Real-Game Sync & Deviation Finder Loop**: Ply-by-ply analysis of games from Lichess and Chess.com.
- **OpeningTree Scouting & Explorer**: Real stats, win rates, and preparation depth telemetry.
- **Interactive Diagram Graph**: Infinite pan, zoom, visual branch collapse (`+3`), and inspector panel.
- **Offline-First Persistence**: Dexie.js (IndexedDB) with Cloudflare D1 synchronization.

## Getting Started

```bash
# Install dependencies
npm install

# Start local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Build for Production

```bash
npm run build
npm run start
```
