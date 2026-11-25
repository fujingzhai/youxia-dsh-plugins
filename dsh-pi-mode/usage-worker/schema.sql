CREATE TABLE IF NOT EXISTS usage_day (
  day TEXT NOT NULL,
  week TEXT NOT NULL,
  week_code TEXT NOT NULL,
  version TEXT NOT NULL,
  modes INTEGER NOT NULL CHECK (modes BETWEEN 1 AND 7),
  code_mode INTEGER NOT NULL CHECK (code_mode IN (0, 1)),
  PRIMARY KEY (day, week_code, version)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS usage_archive (
  period TEXT NOT NULL,
  starts TEXT NOT NULL,
  version TEXT NOT NULL,
  active INTEGER NOT NULL,
  pi INTEGER NOT NULL,
  pi_plus INTEGER NOT NULL,
  pi_im INTEGER NOT NULL,
  code_mode INTEGER NOT NULL,
  PRIMARY KEY (period, starts, version)
) WITHOUT ROWID;

CREATE VIEW IF NOT EXISTS usage_live AS
WITH per_install AS (
  SELECT period, CASE period WHEN 'day' THEN day ELSE week END AS starts,
         CASE version_scope WHEN 'each' THEN version ELSE '' END AS version_group,
         MAX((modes & 1) != 0) AS pi, MAX((modes & 2) != 0) AS pi_plus,
         MAX((modes & 4) != 0) AS pi_im, MAX(code_mode) AS code_mode
  FROM usage_day
  CROSS JOIN (SELECT 'day' AS period UNION ALL SELECT 'week')
  CROSS JOIN (SELECT 'each' AS version_scope UNION ALL SELECT 'all')
  GROUP BY period, starts, version_group, week_code
)
SELECT period, starts, version_group AS version, COUNT(*) AS active,
       SUM(pi) AS pi, SUM(pi_plus) AS pi_plus, SUM(pi_im) AS pi_im, SUM(code_mode) AS code_mode
FROM per_install
GROUP BY period, starts, version_group;

CREATE VIEW IF NOT EXISTS usage_stats AS
SELECT * FROM usage_archive
UNION ALL
SELECT live.* FROM usage_live AS live
WHERE NOT EXISTS (
  SELECT 1 FROM usage_archive AS saved
  WHERE saved.period = live.period AND saved.starts = live.starts
);
