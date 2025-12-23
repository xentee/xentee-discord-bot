# CS2 Items Database (SQLite)

Location: `data/cs2-items.db`

## Deployment (create + import)

1) Create the SQLite schema (tables + FTS).
2) Run the import script to populate the DB from ByMykel sources.

Example (from repo root):

```bash
sqlite3 data/cs2-items.db < schema.sql
node scripts/import_items_en.js
```

Notes:
- The import script clears existing rows in all tables before inserting.
- The script fetches remote JSON files (skins, base weapons, cases/crates, agents).

## Tables

### `items`

- Main catalog table (one row per item: skin/case/agent).
- `id` TEXT PRIMARY KEY  
  - For skins with patterns: `skinId:patternId`
- `kind` TEXT (`skin`, `case`, `agent`)
- `image` TEXT
- `market_hash_name` TEXT
- `weapon_type` TEXT (slug, e.g. `karambit`, `m9-bayonet`, `ak-47`)
- `pattern_id` TEXT (e.g. `am_doppler_phase2`)
- `pattern_name` TEXT (e.g. `Doppler`, `Gamma Doppler`)

### `item_text`

- Primary localized name for each item (used for display and search).
- `item_id` TEXT
- `lang` TEXT (`en`)
- `name` TEXT
- `name_norm` TEXT

### `item_aliases`

- Alternate names/shortcuts used for search matching.
- `item_id` TEXT
- `lang` TEXT (`en`)
- `alias` TEXT
- `alias_norm` TEXT

### FTS5 tables

- Full-text search indexes for fast matching.
- `item_text_fts`
- `item_aliases_fts`

### `item_variants`

- Variant rows for price-bearing versions (wear, StatTrak, Souvenir, etc.).
- `id` TEXT PRIMARY KEY
- `item_id` TEXT (FK to `items.id`)
- `wear` TEXT (e.g. `FN`, `MW`, `FT`, `WW`, `BS`, or NULL)
- `stat_trak` INTEGER (0/1)
- `souvenir` INTEGER (0/1)
- `phase` TEXT (optional, for phase-based variants)
- `market_hash_name` TEXT (optional)

### `item_prices`

- Prices per variant and source (e.g. Buff, CSFloat).
- `variant_id` TEXT (FK to `item_variants.id`)
- `source` TEXT (e.g. `buff`, `csfloat`)
- `price` REAL
- `date_last_update` TEXT

## Search (example)

One row per item, ordered by BM25:

```sql
SELECT
  t.item_id,
  t.name,
  bm25(item_aliases_fts) AS rank
FROM item_aliases_fts
JOIN item_text t ON t.item_id = item_aliases_fts.item_id AND t.lang = 'en'
WHERE item_aliases_fts MATCH ?
GROUP BY t.item_id
ORDER BY rank
LIMIT 25;
```
