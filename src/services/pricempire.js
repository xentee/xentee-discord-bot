// src/services/pricempire.js
import got from 'got';
import * as cheerio from 'cheerio';

// --- catalogue armes/gants ---
const WEAPONS = [
  'Kukri Knife','Skeleton Knife','Nomad Knife','Survival Knife','Paracord Knife','Classic Knife',
  'M9 Bayonet','Huntsman Knife','Falchion Knife','Butterfly Knife','Shadow Daggers','Navaja Knife',
  'Stiletto Knife','Talon Knife','Ursus Knife','Flip Knife','Gut Knife','Karambit','Bowie Knife','Bayonet',
  'AK-47','M4A1-S','M4A4','AUG','SG 553','Galil AR','FAMAS','AWP','SSG 08','SCAR-20','G3SG1',
  'Nova','XM1014','MAG-7','Sawed-Off','M249','Negev',
  'MAC-10','MP9','MP7','MP5-SD','UMP-45','P90','PP-Bizon',
  'USP-S','Glock-18','P2000','Dual Berettas','P250','CZ75-Auto','Five-SeveN','Tec-9','Desert Eagle','R8 Revolver',
  'Driver Gloves','Hand Wraps','Moto Gloves','Specialist Gloves','Sport Gloves','Bloodhound Gloves','Hydra Gloves','Broken Fang Gloves'
];

// slugs pour détecter l’arme dans /cs2-items/skin/<slug>
const WEAPON_SLUGS = WEAPONS.map(name => ({ name, slug: slugify(name) }));

const UA_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
  'referer': 'https://pricempire.com/'
};
const GOT_OPTS = { headers: UA_HEADERS, http2: false, throwHttpErrors: false, timeout: { request: 15000 }, retry: { limit: 1 } };

/* ---------------- Helpers ---------------- */
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/™/g, '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
function titleFromSlug(slug) {
  // "neo-noir" -> "Neo Noir" (titre simplifié)
  return slug.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
}

function stripNoise(s) {
  if (!s) return s;
  let t = String(s);
  t = t.replace(/StatTrak™\s*/gi, '');
  t = t.replace(/\(?\bSouvenir\b\)?[\s|:–-]*/gi, '');
  t = t.replace(/Souvenir(?=[A-Z0-9])/gi, '');
  t = t.replace(/\$\s?\d[\d,]*(?:\.\d+)?\s*-\s*\$\s?\d[\d,]*(?:\.\d+)?/g, '');
  t = t.replace(/\$\s?\d[\d,]*(?:\.\d+)?/g, '');
  t = t.replace(/\b\d{1,3}(?:,\d{3})*\s*offers?\b/gi, '');
  t = t.replace(/\b(?:\d+\s*)?listed\b/gi, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}
function insertPipeBetweenWeaponAndFinish(s) {
  if (!s) return s;
  const rx = new RegExp('(' + WEAPONS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=[A-Z0-9(])');
  return s.replace(rx, '$1 | ');
}
function looksLikeSkinNameOrAgent(s) {
  if (!s) return false;
  if (/\b(Factory New|Minimal Wear|Field-?Tested|Well-?Worn|Battle-?Scarred)\b/i.test(s)) return false;
  if (/\boffers?\b/i.test(s)) return false;
  if (/\$\s?\d/.test(s)) return false;

  // valide si "arme/gants" connus OU si ça ressemble à un agent (souvent "Name | Faction")
  const hasWeapon = new RegExp('\\b(' + WEAPONS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b').test(s);
  const looksAgent = /\s\|\s/.test(s) && !hasWeapon; // heuristique simple: "Nom | Faction", sans arme
  return hasWeapon || looksAgent;
}
function toLabelClean(raw) {
  // 1) nettoyage
  let s = stripNoise(raw);
  // 2) séparer arme | finish si collés (pour skins/gants)
  s = insertPipeBetweenWeaponAndFinish(s);
  // 3) Neo-Noir -> Neo Noir (uniquement dans la *finish*)
  const parts = s.split(' | ');
  if (parts.length >= 2) {
    const weaponOrName = parts[0];
    const right = parts.slice(1).join(' | ');
    const rightFixed = right.replace(/-/g, ' ');
    s = `${weaponOrName} | ${rightFixed}`;
  }
  return s;
}

/* -------------- Réseau -------------- */
async function fetchHtml(url) {
  const res = await got(url, GOT_OPTS);
  if (res.statusCode >= 400) {
    console.warn('[pricempire] GET', res.statusCode, url);
    return '';
  }
  return res.body || '';
}

/* -------------- Extraction -------------- */
function extractFromHtml(html, acc) {
  const $ = cheerio.load(html);

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href) return;

    // (A) Vrais liens d'item -> on utilise le HASH comme libellé (complet)
    const mItem = href.match(/^\/item\/730\/([^?#]+)/) || href.match(/^\/item\/([^?#]+)/);
    if (mItem) {
      const hash = decodeURIComponent(mItem[1]);   // ex: "USP-S | Neo-Noir"
      acc.push({ name: hash, market_hash_name: hash, type: inferTypeFromHash(hash) });
      return;
    }

    // (B) /cs2-items/skin/<slug> ...
    const mSkin = href.match(/^\/cs2-items\/skin\/([^/?#]+)/i);
    if (mSkin) {
      const slug = mSkin[1].toLowerCase(); // "usp-s-neo-noir"
      const found = WEAPON_SLUGS.find(w => slug === w.slug || slug.startsWith(w.slug + '-'));
      if (!found) return;
      const finishSlug = slug.slice(found.slug.length).replace(/^-/, '');
      const finishName = finishSlug ? titleFromSlug(finishSlug) : '';
      const label = finishName ? `${found.name} | ${finishName}` : found.name;
      acc.push({ name: label, market_hash_name: label, type: 'skin' });
      return;
    }

    // (C) /cs2-items/glove(s)/<slug> ...  (accepte singulier/pluriel)
    const mGloves = href.match(/^\/cs2-items\/glove(s)?\/([^/?#]+)/i);
    if (mGloves) {
      const slug = mGloves[2].toLowerCase();
      const found = WEAPON_SLUGS.find(w => slug === w.slug || slug.startsWith(w.slug + '-'));
      let label;
      if (found) {
        const variantSlug = slug.slice(found.slug.length).replace(/^-/, '');
        const variant = variantSlug ? titleFromSlug(variantSlug) : '';
        label = variant ? `${found.name} | ${variant}` : found.name;
      } else {
        // fallback: simple Title Case
        label = titleFromSlug(slug);
      }
      acc.push({ name: label, market_hash_name: label, type: 'gloves' });
      return;
    }


    // (D) /cs2-items/agent/<slug> ...  (NOUVEAU)
    const mAgent = href.match(/^\/cs2-items\/agent\/([^/?#]+)/i);
    if (mAgent) {
      const slug = mAgent[1].toLowerCase(); // ex: "sir-bloody-darryl-royale-the-professionals"
      // On formate en Title Case, puis si on trouve " | " absent, on essaye d'insérer avant "The ..."
      let title = titleFromSlug(slug); // "Sir Bloody Darryl Royale The Professionals"
      if (!/\s\|\s/.test(title)) {
        // simple heuristique: insérer " | " avant "The " / "Le " / "La " / "Les "
        title = title.replace(/\s(The|Le|La|Les)\s/i, ' | $1 ');
      }
      acc.push({ name: title, market_hash_name: title, type: 'agent' });
      return;
    }
  });
}

function inferTypeFromHash(hash) {
  // simple heuristique via arme/gants connues
  const hasWeapon = new RegExp('\\b(' + WEAPONS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b').test(hash);
  if (hasWeapon) {
    if (/\b(Gloves|Wraps)\b/i.test(hash)) return 'gloves';
    return 'skin';
  }
  // sinon, probable agent (hash comme "Lt. Commander Ricksaw | NSWC SEAL")
  if (/\s\|\s/.test(hash)) return 'agent';
  return 'skin';
}

/* -------------- API publique -------------- */
export async function getCandidatesFromLooseInput(q) {
  const out = [];

  // 1) tentative /item/{q}
  try {
    const url1 = `https://pricempire.com/item/${encodeURIComponent(q)}`;
    const html1 = await fetchHtml(url1);
    if (html1) extractFromHtml(html1, out);
  } catch (e) {
    console.warn('[pricempire] /item request failed:', e.name || e.message || e);
  }

  // 2) fallback /search
  if (out.length < 10) {
    try {
      const url2 = `https://pricempire.com/search?app=730&q=${encodeURIComponent(q)}`;
      const html2 = await fetchHtml(url2);
      if (html2) extractFromHtml(html2, out);
    } catch (e) {
      console.warn('[pricempire] /search request failed:', e.name || e.message || e);
    }
  }

  // 3) nettoyage + dédup + limite
  const seen = new Set();
  const clean = out
    .map(x => ({ ...x, label: toLabelClean(x.name) }))
    .filter(x => x.label && looksLikeSkinNameOrAgent(x.label))
    .filter(x => {
      const key = x.market_hash_name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);

  // format pour index.js, avec le type
  return clean.map(x => ({
    name: x.label,
    market_hash_name: x.market_hash_name,
    type: x.type || 'skin'
  }));
}
