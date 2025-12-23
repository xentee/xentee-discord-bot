/**
 * Lucas FANNER / lucas.fanner@gmail.com / 23.12.2025
 * Import CS2 skins (EN) into SQLite catalog, with weapon_type.
 * Usage: node scripts/import_items_en.js
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const SKINS_URL =
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json";
const BASE_WEAPONS_URL =
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/base_weapons.json";
const CASES_URL =
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json";
const AGENTS_URL =
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/agents.json";
  
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "..", "data", "cs2-items.db");

/* ---------- NORMALIZATION ---------- */

function normalize(s) {
  return s
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyWeapon(s) {
  return normalize(s).replace(/\s+/g, "-");
}

function extractWeaponFromSkinName(name) {
  const i = name.indexOf("|");
  return i === -1 ? name.trim() : name.slice(0, i).trim();
}

function stripTrailingToken(norm, tokens) {
  const parts = norm.split(" ");
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  if (!tokens.includes(last)) return null;
  return parts.slice(0, -1).join(" ");
}

function stripLeadingToken(norm, tokens) {
  const parts = norm.split(" ");
  if (parts.length < 2) return null;
  const first = parts[0];
  if (!tokens.includes(first)) return null;
  return parts.slice(1).join(" ");
}

function buildSimpleAliases(name) {
  const norm = normalize(name);
  const aliases = new Set();
  if (norm) aliases.add(norm);

  const withoutSuffix = stripTrailingToken(norm, ["case", "crate", "agent"]);
  if (withoutSuffix) aliases.add(withoutSuffix);

  const withoutPrefix = stripLeadingToken(norm, ["agent"]);
  if (withoutPrefix) aliases.add(withoutPrefix);

  return aliases;
}

/* ---------- PATTERN / PHASE ---------- */

function patternLabel(patternId, baseName) {
  if (!patternId) return baseName;

  const p = patternId.toLowerCase();

  if (p.includes("phase1")) return `${baseName} (Phase 1)`;
  if (p.includes("phase2")) return `${baseName} (Phase 2)`;
  if (p.includes("phase3")) return `${baseName} (Phase 3)`;
  if (p.includes("phase4")) return `${baseName} (Phase 4)`;

  if (p.includes("ruby")) return `${baseName} (Ruby)`;
  if (p.includes("sapphire")) return `${baseName} (Sapphire)`;
  if (p.includes("blackpearl")) return `${baseName} (Black Pearl)`;
  if (p.includes("emerald")) return `${baseName} (Emerald)`;

  return baseName;
}

function phaseAliases(patternId) {
  if (!patternId) return [];
  const p = patternId.toLowerCase();

  if (p.includes("phase1")) return ["p1", "phase 1"];
  if (p.includes("phase2")) return ["p2", "phase 2"];
  if (p.includes("phase3")) return ["p3", "phase 3"];
  if (p.includes("phase4")) return ["p4", "phase 4"];

  if (p.includes("ruby")) return ["ruby"];
  if (p.includes("sapphire")) return ["sapphire"];
  if (p.includes("blackpearl")) return ["black pearl"];
  if (p.includes("emerald")) return ["emerald"];

  return [];
}

/* ---------- WEAPON SHORT NAMES ---------- */

const WEAPON_ABBREVIATIONS = {
  "karambit": ["kara"],
  "butterfly-knife": ["bfk", "butterfly"],
  "m9-bayonet": ["m9"],
  "bayonet": ["bayo"],
  "huntsman-knife": ["huntsman"],
  "falchion-knife": ["falchion"],
  "bowie-knife": ["bowie"],
  "shadow-daggers": ["daggers"],
  "gut-knife": ["gut"],
  "navaja-knife": ["navaja"],
  "stiletto-knife": ["stiletto"],
  "ursus-knife": ["ursus"],
  "talon-knife": ["talon"],
};

/* ---------- DB ---------- */

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  DELETE FROM item_aliases_fts;
  DELETE FROM item_text_fts;
  DELETE FROM item_aliases;
  DELETE FROM item_text;
  DELETE FROM items;
`);

const insertItem = db.prepare(`
  INSERT INTO items (
    id, kind, image, market_hash_name,
    weapon_type, pattern_id, pattern_name,
    buff_recent_price, float_recent_price,
    date_last_buff_price_update, date_last_float_price_update
  )
  VALUES (
    @id, @kind, @image, @market,
    @weapon, @pattern_id, @pattern_name,
    NULL, NULL, NULL, NULL
  )
`);

const insertText = db.prepare(`
  INSERT INTO item_text (item_id, lang, name, name_norm)
  VALUES (@id, 'en', @name, @norm)
`);

const insertAlias = db.prepare(`
  INSERT INTO item_aliases (item_id, lang, alias, alias_norm)
  VALUES (@id, 'en', @alias, @norm)
`);

const insertTextFTS = db.prepare(`
  INSERT INTO item_text_fts (item_id, lang, name, name_norm)
  VALUES (@id, 'en', @name, @norm)
`);

const insertAliasFTS = db.prepare(`
  INSERT INTO item_aliases_fts (item_id, lang, alias, alias_norm)
  VALUES (@id, 'en', @alias, @norm)
`);

/* ---------- FETCH ---------- */

const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  return res.json();
};

/* ---------- IMPORT ---------- */

const weapons = await fetchJson(BASE_WEAPONS_URL);
const weaponMap = new Map(
  weapons.map((w) => [normalize(w.name), slugifyWeapon(w.name)])
);

const skins = await fetchJson(SKINS_URL);
const cases = await fetchJson(CASES_URL);
const agents = await fetchJson(AGENTS_URL);

let insertedItems = 0;
let insertedAliases = 0;

function insertAliases(itemId, aliases) {
  for (const a of aliases) {
    if (!a) continue;
    const norm = normalize(a);
    if (!norm) continue;
    insertAlias.run({ id: itemId, alias: a, norm });
    insertAliasFTS.run({ id: itemId, alias: a, norm });
    insertedAliases++;
  }
}

const tx = db.transaction(() => {
  for (const it of skins) {
    if (!it.id || !it.name) continue;

    const patternId = it.pattern?.id || null;
    const patternName = it.pattern?.name || null;

    const itemId = patternId ? `${it.id}:${patternId}` : it.id;

    const weaponName =
      it.weapon?.name || extractWeaponFromSkinName(it.name);
    const weaponType =
      weaponMap.get(normalize(weaponName)) || slugifyWeapon(weaponName);

    const finalName = patternLabel(patternId, it.name);

    insertItem.run({
      id: itemId,
      kind: "skin",
      image: it.image || null,
      market: it.market_hash_name || null,
      weapon: weaponType,
      pattern_id: patternId,
      pattern_name: patternName,
    });

    insertedItems++;

    const norm = normalize(finalName);

    insertText.run({ id: itemId, name: finalName, norm });
    insertTextFTS.run({ id: itemId, name: finalName, norm });

    const phase = phaseAliases(patternId)[0];
    const shortNames = WEAPON_ABBREVIATIONS[weaponType] || [];

    const aliases = new Set([normalize(finalName), ...phaseAliases(patternId)]);

    if (patternName) {
      aliases.add(`${weaponType} ${patternName}`);
      if (phase) {
        aliases.add(`${weaponType} ${patternName} ${phase}`);
      }
    }

    if (patternName) {
      for (const s of shortNames) {
        aliases.add(`${s} ${patternName}`);
        if (phase) aliases.add(`${s} ${patternName} ${phase}`);
      }
    }

    insertAliases(itemId, aliases);
  }

  for (const it of cases) {
    if (!it.id || !it.name) continue;

    insertItem.run({
      id: it.id,
      kind: "case",
      image: it.image || null,
      market: it.market_hash_name || null,
      weapon: null,
      pattern_id: null,
      pattern_name: null,
    });

    insertedItems++;

    const norm = normalize(it.name);
    insertText.run({ id: it.id, name: it.name, norm });
    insertTextFTS.run({ id: it.id, name: it.name, norm });

    insertAliases(it.id, buildSimpleAliases(it.name));
  }

  for (const it of agents) {
    if (!it.id || !it.name) continue;

    insertItem.run({
      id: it.id,
      kind: "agent",
      image: it.image || null,
      market: it.market_hash_name || null,
      weapon: null,
      pattern_id: null,
      pattern_name: null,
    });

    insertedItems++;

    const norm = normalize(it.name);
    insertText.run({ id: it.id, name: it.name, norm });
    insertTextFTS.run({ id: it.id, name: it.name, norm });

    insertAliases(it.id, buildSimpleAliases(it.name));
  }
});

tx();

/* ---------- STATS ---------- */

const countSkins = db.prepare(`
  SELECT COUNT(*) AS c FROM items WHERE kind='skin'
`).get().c;

const countCases = db.prepare(`
  SELECT COUNT(*) AS c FROM items WHERE kind='case'
`).get().c;

const countAgents = db.prepare(`
  SELECT COUNT(*) AS c FROM items WHERE kind='agent'
`).get().c;

const countAliases = db.prepare(`
  SELECT COUNT(*) AS c FROM item_aliases WHERE lang='en'
`).get().c;

/* ---------- OUTPUT ---------- */

console.log("Import terminé ✅");
console.log("Skins importés :", countSkins);
console.log("Cases importées :", countCases);
console.log("Agents importés :", countAgents);
console.log("Aliases importés :", countAliases);
