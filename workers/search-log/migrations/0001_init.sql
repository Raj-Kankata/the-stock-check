CREATE TABLE IF NOT EXISTS search_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  query TEXT NOT NULL,
  ticker TEXT,
  picked INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_log_ts ON search_log (ts);
CREATE INDEX IF NOT EXISTS idx_search_log_query ON search_log (query);
CREATE INDEX IF NOT EXISTS idx_search_log_ticker ON search_log (ticker);
