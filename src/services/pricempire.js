// src/services/pricempire.js
import got from 'got';
import * as cheerio from 'cheerio';

// ——— Catalogues pour nettoyage/structure ———
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

const UA_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
  'referer': 'https://pricempire.com/'
};

const GOT_OPTS = {
  headers: UA_HEADERS,
  http2: false,                // évite certains TLS/CF h2 quirks
  throwHttpErrors: false,      // on gère nous-mêmes 403/503
  timeout: { request: 15000 }, // 15s
  retry: { limit: 1 }          // petit retry
};

// ——— Helpers d’hygiène ———
function stripNoise(s) {
  if (!s) return s;
  let t = String(s);

  // Retirer StatTrak™, Souvenir (toutes formes, y compris collé)
  t = t.replace(/StatTrak™\s*/gi, '');
  t = t.replace(/\(?\bSouvenir\b\)?[\s|:–-]*/gi, '');
  t = t.replace(/Souvenir(?=[A-Z0-9])/gi, '');

  // Retirer plages de prix et prix unitaires
  t = t.replace(/\$\s?\d[\d,]*(?:\.\d+)?\s*-\s*\$\s?\d[\d,]*(?:\.\d+)?/g, '');
  t = t.replace(/\$\s?\d[\d,]*(?:\.\d+)?/g, '');

  // Retirer offers / listed
  t = t.replace(/\b\d{1,3}(?:,\d{3})*\s*offers?\b/gi, '');
  t = t.replace(/\b(?:\d+\s*)?listed\b/gi, '');

  // Normaliser espaces
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

function insertPipeBetweenWeaponAndFinish(s) {
  if (!s) return s;
  const rx = new RegExp(
    '(' + WEAPONS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=[A-Z0-9(])'
  );
  return s.replace(rx, '$1 | ');
}

function looksLikeSkinName(s) {
  if (!s) return false;
  // rejeter les lignes qui ressemblent à un état/prix/offres
  if (/\b(Factory New|Minimal Wear|Field-?Tested|Well-?Worn|Battle-?Scarred)\b/i.test(s)) return false;
  if (/\boffers?\b/i.test(s)) return false;
  if (/\$\s?\d/.test(s)) return false;

  // doit contenir au moins un type d’arme/gants
  const hasWeapon = new RegExp('\\b(' + WEAPONS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b').test(s);
  return hasWeapon;
}

function toLabelClean(raw) {
  return insertPipeBetweenWeaponAndFinish(stripNoise(raw));
}

// ——— Extraction HTML ———
function extractFromHtml(html, acc) {
  const $ = cheerio.load(html);

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href) return;

    // 1) Vrai item link: /item/730/<hash> | /item/<hash>
    let m =
      href.match(/^\/item\/730\/([^?#]+)/) ||
      href.match(/^\/item\/([^?#]+)/);

    if (m) {
      const hash = decodeURIComponent(m[1]);
      const txt = ($(el).text() || '').replace(/\s+/g, ' ').trim();
      if (!txt) return;
      acc.push({ name: txt, market_hash_name: hash });
      return;
    }

    // 2) Fallback: /cs2-items/...  (pas de hash propre, on utilisera le texte)
    if (/^\/cs2-items\//.test(href)) {
      const txt = ($(el).text() || '').replace(/\s+/g, ' ').trim();
      if (!txt) return;
      // on met le label nettoyé comme "hash" de secours (on le gardera seulement pour l’affichage)
      const label = toLabelClean(txt);
      if (!looksLikeSkinName(label)) return;
      acc.push({ name: label, market_hash_name: label });
      return;
    }
  });
}

// ——— Téléchargement (log des statuts) ———
async function fetchHtml(url) {
  const res = await got(url, GOT_OPTS);
  if (res.statusCode >= 400) {
    console.warn('[pricempire] GET', res.statusCode, url);
    return '';
  }
  return res.body || '';
}

// ——— API principale ———
export async function getCandidatesFromLooseInput(q) {
  const out = [];

  // 1) ancienne page item (souvent redirige bien)
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

  // Nettoyage + dédup
  const seen = new Set();
  const clean = out
    .map(x => {
      const label = toLabelClean(x.name);
      return { ...x, label };
    })
    .filter(x => x.label && looksLikeSkinName(x.label))
    .filter(x => {
      const key = x.market_hash_name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);

  // format attendu par index.js
  return clean.map(x => ({
    name: x.label,
    market_hash_name: x.market_hash_name
  }));
}
