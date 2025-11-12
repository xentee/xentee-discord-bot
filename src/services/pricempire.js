// src/services/pricempire.js
import got from 'got';
import * as cheerio from 'cheerio';

/**
 * getCandidatesFromLooseInput(q)
 * - Tente d'abord l'ancienne route /item/{q}
 * - Puis fallback sur /search?app=730&q=
 * - Parse les <a href> vers /cs2-items/* ou /item/730/*
 * - Renvoie { name, market_hash_name, type }
 */
export async function getCandidatesFromLooseInput(q) {
  const acc = [];
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36';
  const common = { headers: { 'user-agent': ua }, timeout: { request: 9000 }, http2: true, retry: { limit: 0 } };

  // 1) Ancienne route: /item/{input}
  try {
    const url1 = `https://pricempire.com/item/${encodeURIComponent(q)}`;
    const html1 = await got(url1, common).text();
    extractFromHtml(html1, acc);
  } catch (_) {}

  // 2) Fallback: /search?app=730&q=
  if (acc.length < 3) {
    try {
      const url2 = `https://pricempire.com/search?app=730&q=${encodeURIComponent(q)}`;
      const html2 = await got(url2, common).text();
      extractFromHtml(html2, acc);
    } catch (_) {}
  }

  // Dédup par market_hash_name
  const seen = new Set();
  const uniq = [];
  for (const it of acc) {
    const k = (it.market_hash_name || it.name || '').toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    // Heuristique finale pour type si manquant
    if (!it.type) it.type = inferTypeFromHash(it.market_hash_name || it.name);
    // On garde seulement ce qui ressemble à (skin|gloves|agent|case)
    if (looksLikeSupported(it)) uniq.push(it);
  }

  return uniq.slice(0, 15);
}

/* -------------------- Parsing helpers -------------------- */

function extractFromHtml(html, acc) {
  const $ = cheerio.load(html);

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    let text = $(el).text().trim();
    if (!href) return;

    // Normaliser un peu le texte brut
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) text = decodeFromHref(href);

    // (A) /cs2-items/skin/<slug>
    const mSkin = href.match(/^\/cs2-items\/skin\/([^/?#]+)/i);
    if (mSkin) {
      const slug = mSkin[1];
      const label = titleFromSlug(slug);
      acc.push({
        name: label,
        market_hash_name: label,
        type: 'skin'
      });
      return;
    }

    // (B) /cs2-items/glove(s)/<slug>   ← accepte singulier/pluriel
    const mGloves = href.match(/^\/cs2-items\/glove(s)?\/([^/?#]+)/i);
    if (mGloves) {
      const slug = mGloves[2];
      const label = titleFromSlug(slug);
      acc.push({
        name: label,
        market_hash_name: label,
        type: 'gloves'
      });
      return;
    }

    // (C) /cs2-items/agent(s)?/<slug>
    const mAgent = href.match(/^\/cs2-items\/agent(s)?\/([^/?#]+)/i);
    if (mAgent) {
      const slug = mAgent[2];
      const label = titleFromSlug(slug);
      acc.push({
        name: label,
        market_hash_name: label,
        type: 'agent'
      });
      return;
    }

    // (D) /cs2-items/case/<slug>  ← NOUVEAU: CAISSES
    const mCase = href.match(/^\/cs2-items\/case\/([^/?#]+)/i);
    if (mCase) {
      const slug = mCase[1];
      const label = titleFromSlug(slug);
      acc.push({
        name: label,
        market_hash_name: label,
        type: 'case'
      });
      return;
    }

    // (E) Ancienne page item /item/730/<market_hash_name_encoded>
    const mOld = href.match(/^\/item\/730\/(.+)$/i);
    if (mOld) {
      const decoded = decodeURIComponent(mOld[1]);
      const label = cleanName(decoded || text);
      acc.push({
        name: label,
        market_hash_name: label,
        type: inferTypeFromHash(label)
      });
      return;
    }

    // (F) Heuristique: si le texte ressemble à "... Case", tag as case
    if (/\bCase\b/i.test(text) && !/Sticker|Patch|Music Kit|Pin|Graffiti/i.test(text)) {
      const label = cleanName(text);
      acc.push({
        name: label,
        market_hash_name: label,
        type: 'case'
      });
      return;
    }
  });
}

function decodeFromHref(href) {
  try {
    const last = href.split('/').filter(Boolean).pop() || '';
    return titleFromSlug(decodeURIComponent(last));
  } catch {
    return href;
  }
}

function titleFromSlug(slug) {
  // slug → “Nice Title Case”
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (m, c) => c.toUpperCase())
    .replace(/\bCs2\b/i, 'CS2')
    .replace(/\bAwP\b/g, 'AWP')
    .replace(/\bUsp S\b/g, 'USP-S')
    .replace(/\bSsg 08\b/g, 'SSG 08');
}

function cleanName(s) {
  // Nettoyage léger (le “gros” nettoyage UX est fait côté index.js→prettifyName)
  return String(s).replace(/\s+/g, ' ').trim();
}

function looksLikeSupported(it) {
  const s = (it.name || '').toLowerCase();
  if (!s) return false;

  // Cases
  if (it.type === 'case' || /\bcase\b/.test(s)) return true;

  // Gloves
  if (it.type === 'gloves' || /\b(gloves|wraps)\b/.test(s)) return true;

  // Agents
  if (it.type === 'agent' || /\bagent\b/.test(s)) return true;

  // Skins “classiques”: heuristique armes courantes
  if (it.type === 'skin') return true;
  if (/\b(ak-?47|m4a1-?s|m4a4|awp|usp-?s|glock|deagle|desert eagle|p250|famas|galil|aug|sg 553|ssg 08|sc(ar)?-20|g3sg1|nova|xm1014|mag-7|sawed-?off|mac-10|mp9|mp7|mp5-?sd|ump-45|p90|pp-?bizon|cz75-?auto|five-?seven|tec-9|r8|bayonet|karambit|m9 bayonet|butterfly|talon|stiletto|ursus|navaja|falchion|bowie|shadow daggers|huntsman|classic|paracord|survival|nomad|skeleton|kukri)\b/i.test(s)) {
    return true;
  }

  return false;
}

/**
 * Tente d’inférer le type à partir du hash/nom.
 */
function inferTypeFromHash(hash) {
  if (!hash) return 'skin';
  if (/\b(Agent)\b/i.test(hash)) return 'agent';
  if (/\b(Case)\b/i.test(hash)) return 'case';
  if (/\b(Gloves|Wraps)\b/i.test(hash)) return 'gloves';
  return 'skin';
}
