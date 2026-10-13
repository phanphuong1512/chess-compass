-- ============================================================================
-- CHESSATLAS / GRANDMASTER ATLAS (GMA) D1 SCHEMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS study_repertoires (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL CHECK(color IN ('white', 'black')),
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS study_nodes (
  id TEXT PRIMARY KEY, -- normalized FEN
  fen TEXT NOT NULL,
  comments TEXT DEFAULT '',
  annotations TEXT DEFAULT '[]', -- JSON string
  engine_eval TEXT,
  explorer_stats TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS study_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  san TEXT NOT NULL,
  uci TEXT NOT NULL,
  repertoire_id TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  annotation TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (repertoire_id) REFERENCES study_repertoires(id) ON DELETE CASCADE,
  UNIQUE (from_node_id, to_node_id, san, repertoire_id)
);

CREATE INDEX IF NOT EXISTS idx_study_edges_from_rep ON study_edges(from_node_id, repertoire_id);
CREATE INDEX IF NOT EXISTS idx_study_edges_rep ON study_edges(repertoire_id);

CREATE TABLE IF NOT EXISTS study_cards (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  repertoire_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'new',
  stability REAL NOT NULL DEFAULT 0.0,
  difficulty REAL NOT NULL DEFAULT 0.0,
  elapsed_days REAL NOT NULL DEFAULT 0.0,
  scheduled_days REAL NOT NULL DEFAULT 0.0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  last_review INTEGER NOT NULL DEFAULT 0,
  due_date INTEGER NOT NULL,
  FOREIGN KEY (node_id) REFERENCES study_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (repertoire_id) REFERENCES study_repertoires(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_study_cards_due ON study_cards(due_date);
CREATE INDEX IF NOT EXISTS idx_study_cards_rep ON study_cards(repertoire_id);

CREATE TABLE IF NOT EXISTS study_review_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  state TEXT NOT NULL,
  stability REAL NOT NULL,
  difficulty REAL NOT NULL,
  reviewed_at INTEGER NOT NULL,
  FOREIGN KEY (card_id) REFERENCES study_cards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS study_deviations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('lichess', 'chesscom')),
  player_username TEXT NOT NULL,
  player_color TEXT NOT NULL CHECK(player_color IN ('white', 'black')),
  deviation_ply INTEGER NOT NULL,
  played_move TEXT NOT NULL,
  prepared_move TEXT,
  position_fen TEXT NOT NULL,
  centipawn_loss REAL,
  is_opponent_deviation INTEGER NOT NULL DEFAULT 0,
  repertoire_id TEXT NOT NULL,
  added_to_training INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (repertoire_id) REFERENCES study_repertoires(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_study_deviations_rep ON study_deviations(repertoire_id);

-- Initial seed for Vienna Game, 1.e4 Master Systems, and Sicilian Defense
INSERT OR IGNORE INTO study_repertoires (id, name, color, description, created_at, updated_at) VALUES
('rep_vienna', 'Vienna Game', 'white', 'Dynamic 1.e4 e5 2.Nc3 repertoire with aggressive kingside lines', 1741270000000, 1741270000000),
('rep_white_e4', 'White: 1.e4 Master Systems', 'white', 'Grandmaster 1.e4 repertoire covering Italian, Sicilian, French & Caro-Kann', 1741270000000, 1741270000000),
('rep_black_sicilian', 'Black: Sicilian Defense', 'black', 'Fighting responses against 1.e4 with the Sicilian', 1741270000000, 1741270000000);
