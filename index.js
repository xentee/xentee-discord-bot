import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials,
  ChannelType, PermissionsBitField,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder
} from 'discord.js';
import { getCandidatesFromLooseInput } from './src/services/pricempire.js';

/* ---------- Helpers d'affichage ---------- */
// Clé canonique: on enlève tirets/espaces et on met en minuscules
function canonKey(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

// Dictionnaire canon (clé = canonKey du préfixe)
const CANON_WEAPONS = new Map(Object.entries({
  awp: 'AWP',
  ak47: 'AK-47',
  m4a4: 'M4A4',
  m4a1s: 'M4A1-S',
  mp9: 'MP9',
  mp7: 'MP7',
  mp5sd: 'MP5-SD',
  ump45: 'UMP-45',
  p90: 'P90',
  ppbizon: 'PP-Bizon',
  sg553: 'SG 553',
  ssg08: 'SSG 08',
  g3sg1: 'G3SG1',
  scar20: 'SCAR-20',
  aug: 'AUG',
  famas: 'FAMAS',
  galilar: 'Galil AR',
  usps: 'USP-S',
  p2000: 'P2000',
  glock18: 'Glock-18',
  p250: 'P250',
  cz75auto: 'CZ75-Auto',
  fiveseven: 'Five-SeveN',
  tec9: 'Tec-9',
  deserteagle: 'Desert Eagle',
  r8revolver: 'R8 Revolver',
  mac10: 'MAC-10',
  nova: 'Nova',
  xm1014: 'XM1014',
  mag7: 'MAG-7',
  sawedoff: 'Sawed-Off',
  negev: 'Negev',
  m249: 'M249'
}));

function enforceWeaponPrefixCasing(name) {
  const pipeIdx = name.indexOf(' | ');
  if (pipeIdx <= 0) return name;
  const rawPrefix = name.slice(0, pipeIdx).trim();

  // Tolérer variantes: "AK 47", "SSG08", "UMP45", etc.
  const norm = canonKey(
    rawPrefix
      .replace(/\bAK[\s-]?47\b/i, 'AK-47')
      .replace(/\bM4A1[\s-]?S\b/i, 'M4A1-S')
      .replace(/\bMP5[\s-]?SD\b/i, 'MP5-SD')
      .replace(/\bUMP[\s-]?45\b/i, 'UMP-45')
      .replace(/\bPP[\s-]?Bizon\b/i, 'PP-Bizon')
      .replace(/\bSG[\s-]?553\b/i, 'SG 553')
      .replace(/\bSSG[\s-]?0?8\b/i, 'SSG 08')
      .replace(/\bSCAR[\s-]?20\b/i, 'SCAR-20')
      .replace(/\bGlock[\s-]?18\b/i, 'Glock-18')
      .replace(/\bCZ75[\s-]?Auto\b/i, 'CZ75-Auto')
      .replace(/\bFive[\s-]?SeveN\b/i, 'Five-SeveN')
      .replace(/\bTec[\s-]?9\b/i, 'Tec-9')
      .replace(/\bR8[\s-]?Revolver\b/i, 'R8 Revolver')
      .replace(/\bMAC[\s-]?10\b/i, 'MAC-10')
      .replace(/\bXM[\s-]?1014\b/i, 'XM1014')
      .replace(/\bMAG[\s-]?7\b/i, 'MAG-7')
      .replace(/\bSawed[\s-]?Off\b/i, 'Sawed-Off')
  );

  const canon = CANON_WEAPONS.get(norm);
  if (!canon) return name;
  return canon + name.slice(pipeIdx);
}

function prettifyName(raw) {
  if (!raw) return raw;
  let s = String(raw);
  
  s = s.replace(/^\s*ak[\s-]?47\b/i, 'AK-47 ');
  // retirer StatTrak™, tranches de prix, "listed"
  s = s.replace(/StatTrak™\s*/gi, '');
  s = s.replace(/\$\s?\d[\d,]*(?:\.\d+)?\s*-\s*\$\s?\d[\d,]*(?:\.\d+)?/g, '');
  s = s.replace(/(?:-?\s*)?\b(?:\d+\s*)?listed\b/gi, '');

  // retirer "Souvenir"
  s = s.replace(/\(?\bSouvenir\b\)?[\s|:–-]*/gi, '');
  s = s.replace(/Souvenir(?=[A-Z0-9])/gi, '');

  // cas particuliers Pricempire pour les caisses
  //  - préfixe "Container" collé à "Operation ..."
  s = s.replace(/^Container(?=[A-Z])/i, '');
  //  - prix seul qui traîne: "$7." ou "$1.23"
  s = s.replace(/\$\s?\d[\d,]*(?:\.\d+)?\.?/g, '');
  //  - "Weapon Case$7." -> "Weapon Case"
  s = s.replace(/Weapon Case\s*$/i, 'Weapon Case');

  // normaliser espaces
  s = s.replace(/\s{2,}/g, ' ').trim();

  s = s.replace(
    /(Kukri Knife|Skeleton Knife|Nomad Knife|Survival Knife|Paracord Knife|Classic Knife|M9 Bayonet|Huntsman Knife|Falchion Knife|Butterfly Knife|Shadow Daggers|Navaja Knife|Stiletto Knife|Talon Knife|Ursus Knife|Flip Knife|Gut Knife|Karambit|Bowie Knife|Bayonet|AK-47|M4A1-S|M4A4|AUG|SG 553|Galil AR|FAMAS|AWP|SSG 08|SCAR-20|G3SG1|Nova|XM1014|MAG-7|Sawed-Off|M249|Negev|MAC-10|MP9|MP7|MP5-SD|UMP-45|P90|PP-Bizon|USP-S|Glock-18|P2000|Dual Berettas|P250|CZ75-Auto|Five-SeveN|Tec-9|Desert Eagle|R8 Revolver|Driver Gloves|Hand Wraps|Moto Gloves|Specialist Gloves|Sport Gloves|Bloodhound Gloves|Hydra Gloves|Broken Fang Gloves)(?=[A-Z])/gi,
    '$1 | '
  );

  s = s.replace(
    /^(Kukri Knife|Skeleton Knife|Nomad Knife|Survival Knife|Paracord Knife|Classic Knife|M9 Bayonet|Huntsman Knife|Falchion Knife|Butterfly Knife|Shadow Daggers|Navaja Knife|Stiletto Knife|Talon Knife|Ursus Knife|Flip Knife|Gut Knife|Karambit|Bowie Knife|Bayonet|AK-47|M4A1-S|M4A4|AUG|SG 553|Galil AR|FAMAS|AWP|SSG 08|SCAR-20|G3SG1|Nova|XM1014|MAG-7|Sawed-Off|M249|Negev|MAC-10|MP9|MP7|MP5-SD|UMP-45|P90|PP-Bizon|USP-S|Glock-18|P2000|Dual Berettas|P250|CZ75-Auto|Five-SeveN|Tec-9|Desert Eagle|R8 Revolver|Driver Gloves|Hand Wraps|Moto Gloves|Specialist Gloves|Sport Gloves|Bloodhound Gloves|Hydra Gloves|Broken Fang Gloves)\s+(?!\|)(.+)$/i,
    '$1 | $2'
  );

  // ➜ forcer la casse du préfixe arme (AWP, AK-47, M4A4, MP9, etc.)
  s = enforceWeaponPrefixCasing(s);

  return s;
}

function wearDisplay(w) {
  if (!w) return '';
  return w.startsWith('ST_') ? w.slice(3) : w;
}

function formatDisplayName(item) {
  // Agents / Cases / Gloves: jamais StatTrak™
  if (item?.type === 'agent' || item?.type === 'case' || item?.type === 'gloves') {
    return item?.display_name || '';
  }
  return `${item?.is_st ? 'StatTrak™ ' : ''}${item?.display_name || ''}`;
}

/* ---------- Ranking & filtering for search results ---------- */
const WEAPON_TOKENS = [
  'ak','ak-47','m4a1-s','m4a4','awp','ssg','scout','g3sg1','scar','aug','sg','galil','famas',
  'glock','usp','p2000','p250','cz75','five-seven','tec-9','deagle','desert','r8',
  'mac-10','mp9','mp7','mp5','mp5-sd','ump','p90','bizon',
  'nova','xm1014','mag-7','sawed','m249','negev',
  'karambit','bayonet','flip','gut','bowie','falchion','huntsman','shadow','butterfly',
  'stiletto','talon','ursus','navaja','paracord','survival','classic','nomad','skeleton','kukri',
  'driver','hand wraps','moto','specialist','sport','bloodhound','hydra','broken fang'
];

const CASE_HINTS = ['case','crate','container','weapon case','operation case','esports case'];

function normalizeStr(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isCaseIndexTile(name = '') {
  const s = normalizeStr(name);
  return (
    s.startsWith('case index') ||
    s.includes('weapon cases & special cases') ||
    s === 'case index' ||
    s.includes('operation cases, weapon cases')
  );
}

function queryWantsCases(q) {
  const nq = normalizeStr(q);
  return CASE_HINTS.some(h => nq.includes(h));
}

function hasWeaponToken(str) {
  const s = normalizeStr(str);
  return WEAPON_TOKENS.some(t => s.includes(t));
}

/** Retourne les candidats triés + filtrés selon la query */
function rankAndFilterCandidates(query, candidates) {
  const nq = normalizeStr(query);

  // 1) split par type
  const normal = [];
  const cases = [];
  for (const c of candidates) {
    // skip la tuile d’index “Case Index…”
    if (c.type === 'case' && isCaseIndexTile(c.name)) continue;
    (c.type === 'case' ? cases : normal).push(c);
  }

  // 2) garder/écarter les cases
  let pool = [];
  if (queryWantsCases(query)) {
    pool = [...cases, ...normal]; // l’utilisateur cherche des caisses: on laisse tout, cases d’abord après le tri
  } else {
    pool = normal.length ? normal : candidates; // si on a des non-cases, on vire les cases; sinon on garde tout
  }

  // 3) scoring
  const qTokens = nq.split(/[\s|]+/).filter(Boolean);
  function score(c) {
    const name = normalizeStr(c.name || c.market_hash_name || '');
    let s = 0;

    // exact phrase boost
    if (name.includes(nq)) s += 50;

    // tokens présents
    for (const t of qTokens) {
      if (t && name.includes(t)) s += 10;
    }

    // proximité “adjacente” des 2 premiers tokens
    if (qTokens.length >= 2) {
      const pair = qTokens[0] + ' ' + qTokens[1];
      if (name.includes(pair)) s += 8;
    }

    // bonus si on détecte un token d’arme
    if (hasWeaponToken(name)) s += 6;

    // petit malus pour les cases si la query ne les vise pas
    if (c.type === 'case' && !queryWantsCases(query)) s -= 20;

    return s;
  }

  return [...pool].map((c, idx) => ({ c, idx, sc: score(c) }))
    .sort((a, b) => b.sc - a.sc || a.idx - b.idx)
    .map(x => x.c);
}

/* ---------- ENV ---------- */
const {
  DISCORD_TOKEN, GUILD_ID,
  TICKET_CHANNEL_ID, TICKET_CATEGORY_ID, STAFF_ROLE_ID
} = process.env;

/* ---------- Client ---------- */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
});

const ticketState = new Map(); // channelId -> { lang:'EN'|'FR', paymethod:null|string, items:[], extra:null|string, _pending?:{} }
function getState(chId) {
  if (!ticketState.has(chId)) ticketState.set(chId, { lang: 'EN', paymethod: null, items: [], extra: null });
  return ticketState.get(chId);
}

client.once('ready', () => console.log(`🤖 Connected as ${client.user.tag}`));

/* ---------- Utils ---------- */
function ticketName(user) {
  const base = user.username?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
  return `ticket-${base}-${user.discriminator ?? String(user.id).slice(-4)}`;
}

async function createPrivateTicketChannel(guild, opener) {
  const category = guild.channels.cache.get(TICKET_CATEGORY_ID);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error('Catégorie SKINS invalide (TICKET_CATEGORY_ID).');
  }

  const everyone = guild.roles.everyone;
  const overwrites = [
    { id: everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: opener.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
  ];

  const ch = await guild.channels.create({
    name: ticketName(opener),
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    topic: `Ticket de ${opener.tag} — cashtrade`
  });

  ticketState.set(ch.id, { lang: 'EN', paymethod: null, items: [], extra: null });
  return ch;
}

/* ---------- Interactions ---------- */
client.on('interactionCreate', async (i) => {
  try {
    /* ENTRY */
    if (i.isButton() && i.customId === 'open_ticket') {
      await i.deferReply({ ephemeral: true });
      const guild = await client.guilds.fetch(GUILD_ID);
      const ch = await createPrivateTicketChannel(guild, i.user);

      await ch.send({
        content: `<@${i.user.id}> ${STAFF_ROLE_ID ? `<@&${STAFF_ROLE_ID}>` : ''}`,
        embeds: [new EmbedBuilder()
          .setTitle('Choose your language / Choisis ta langue')
          .setDescription('Pick a language to continue.\nChoisis une langue pour continuer.')
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('lang_EN').setLabel('🇺🇸').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('lang_FR').setLabel('🇫🇷').setStyle(ButtonStyle.Secondary)
          )
        ]
      });

      return i.editReply({ content: `Ticket created: <#${ch.id}>` });
    }

    /* LANGUAGE → PAYMENT_METHOD */
    if (i.isButton() && (i.customId === 'lang_EN' || i.customId === 'lang_FR')) {
      const st = getState(i.channel.id);
      st.lang = i.customId === 'lang_FR' ? 'FR' : 'EN';

      const modal = new ModalBuilder()
        .setCustomId('pm_modal')
        .setTitle(st.lang === 'FR' ? 'Méthode de paiement' : 'Payment method');

      const tx = new TextInputBuilder()
        .setCustomId('pm_text')
        .setLabel(st.lang === 'FR'
          ? 'Méthode de paiement (ex: Revolut)'
          : 'Payment method (e.g. Revolut)')
        .setStyle(TextInputStyle.Short).setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(tx));
      return i.showModal(modal);
    }

    /* PAYMENT_METHOD → SELL_OR_BUY */
    if (i.isModalSubmit() && i.customId === 'pm_modal') {
      const st = getState(i.channel.id);
      st.paymethod = i.fields.getTextInputValue('pm_text')?.trim();

      return i.reply({
        content: st.lang === 'FR'
          ? 'Tu veux **vendre** à Xentee, ou **acheter** chez Xentee ?'
          : 'Do you want to **sell** to Xentee, or **buy** from Xentee?',
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('act_SELL').setLabel(st.lang === 'FR' ? 'Vendre' : 'Sell').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('act_BUY').setLabel(st.lang === 'FR' ? 'Acheter' : 'Buy').setStyle(ButtonStyle.Primary)
          )
        ]
      });
    }

    /* SELL / BUY */
    if (i.isButton() && (i.customId === 'act_SELL' || i.customId === 'act_BUY')) {
      const st = getState(i.channel.id);

      if (i.customId === 'act_BUY') {
        return i.reply({
          content: st.lang === 'FR'
            ? 'Stock à venir ici. Pour l’instant, écris simplement ce que tu recherches.'
            : 'Stock will appear here soon. For now, just type what you’re looking for.'
        });
      }

      // SELL_1: Add item
      return i.reply({
        content: st.lang === 'FR'
          ? 'Ajoute un item (skin, gants, **agent**, **caisse**). Tape quelques mots-clés (ex: "kara tiger tooth", "hand wraps", "sir bloody", "fracture case").'
          : 'Add an item (skin, gloves, **agent**, **case**). Type a few keywords (e.g., "kara tiger tooth", "hand wraps", "sir bloody", "fracture case").',
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('add_item_open')
              .setLabel(st.lang === 'FR' ? 'Rechercher un item' : 'Search an item')
              .setStyle(ButtonStyle.Success)
          )
        ]
      });
    }

    /* SELL_1: modal input libre */
    if (i.isButton() && i.customId === 'add_item_open') {
      const st = getState(i.channel.id);
      const modal = new ModalBuilder()
        .setCustomId('add_item_free')
        .setTitle(st.lang === 'FR' ? 'Recherche d’item' : 'Item search');

      const q = new TextInputBuilder()
        .setCustomId('q_text')
        .setLabel(st.lang === 'FR'
          ? 'Mots-clés (ex: kara tiger tooth)'
          : 'Keywords (e.g. kara tiger tooth)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(80)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(q));
      return i.showModal(modal);
    }

    /* Après input: candidats via /item/{input} (fallback /search) avec timeout */
    if (i.isModalSubmit() && i.customId === 'add_item_free') {
      const st = getState(i.channel.id);
      await i.deferReply({ ephemeral: true });

      const query = i.fields.getTextInputValue('q_text').trim();

      const MAX = 10000;
      const timeoutPromise = new Promise((res) => setTimeout(() => res('__TIMEOUT__'), MAX));

      let candidates = [];
      try {
        const result = await Promise.race([ getCandidatesFromLooseInput(query), timeoutPromise ]);
        if (result === '__TIMEOUT__') {
          console.warn('[modal] Pricempire timed out after', MAX, 'ms');
          candidates = [];
        } else {
          candidates = Array.isArray(result) ? result : [];
        }
      } catch (e) {
        console.warn('[modal] getCandidatesFromLooseInput error:', e?.message || e);
        candidates = [];
      }

      if (!candidates.length) {
        return i.editReply({
          content: st.lang === 'FR'
            ? 'Aucun résultat. Essaie avec d’autres mots-clés (ex: "karambit tiger", "sport gloves vice", "fracture case").'
            : 'No results. Try other keywords (e.g., "karambit tiger", "sport gloves vice", "fracture case").',
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('add_item_open')
                .setLabel(st.lang === 'FR' ? 'Nouvelle recherche' : 'New search')
                .setStyle(ButtonStyle.Secondary)
            )
          ]
        });
      }

      // garder les candidats (on n'affiche qu'un label nettoyé)
      const ranked = rankAndFilterCandidates(query, candidates);
      st._pending = { candidates: ranked };

      // IMPORTANT: index stable et unique
      const pretty = ranked.map((c, idx) => ({
        ...c,
        idx,
        display: prettifyName(c.name),
        tag: (c.type === 'agent' ? ' (Agent)' : c.type === 'gloves' ? ' (Gloves)' : c.type === 'case' ? ' (Case)' : '')
      }));

      const lines = pretty.map((c, i2) => `${i2 + 1}. ${c.display}${c.tag}`);
      const msg = (st.lang === 'FR'
        ? 'Résultats trouvés : choisis dans la liste ci-dessous.\n'
        : 'Results found: pick from the list below.\n') + lines.join('\n');

      const select = new StringSelectMenuBuilder()
        .setCustomId('pick_by_select')
        .setPlaceholder(st.lang === 'FR' ? 'Sélectionner un item' : 'Select an item')
        .addOptions(
          pretty.slice(0, 25).map((c) => ({
            label: `${(c.display + c.tag).slice(0, 100)}`,
            value: String(c.idx) // unique
          }))
        );

      await i.editReply({
        content: msg,
        components: [
          new ActionRowBuilder().addComponents(select),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('add_item_open')
              .setLabel(st.lang === 'FR' ? 'Nouvelle recherche' : 'New search')
              .setStyle(ButtonStyle.Secondary)
          )
        ]
      });
    }

    /* Sélection via le menu → route par type */
    if (i.isStringSelectMenu() && i.customId === 'pick_by_select') {
      const st = getState(i.channel.id);
      const idx = parseInt(i.values[0], 10);
      const pick = st._pending?.candidates?.[idx];
      if (!pick) return i.reply({ content: 'Invalid selection.', ephemeral: true });

      st._pending = { hash: pick.market_hash_name, type: pick.type || 'skin', st: false };

      if (st._pending.type === 'agent') {
        // Agents: ajout direct
        const item = {
          hash_name: st._pending.hash,
          display_name: prettifyName(st._pending.hash),
          is_st: false,
          wear: null,
          type: 'agent'
        };
        delete st._pending;
        st.items.push(item);

        return i.reply({
          content: st.lang === 'FR'
            ? `Ajouté : **${formatDisplayName(item)}**`
            : `Added: **${formatDisplayName(item)}**`,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('add_item_open').setLabel(st.lang === 'FR' ? 'Ajouter un autre item' : 'Add another item').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('add_done').setLabel(st.lang === 'FR' ? 'Terminer' : 'Done').setStyle(ButtonStyle.Success)
            )
          ]
        });
      }

      if (st._pending.type === 'case') {
        // Cases: demander quantité, puis ajout
        return askCaseQuantity(i, st);
      }

      if (st._pending.type === 'gloves') {
        // Gants: pas de StatTrak → aller direct sur wear
        return askWear(i, st);
      }

      // Skins: StatTrak ? puis wear
      return askStatTrak(i, st);
    }

    /* ---- Quantité pour CASES ---- */
    async function askCaseQuantity(inter, st) {
      const modal = new ModalBuilder()
        .setCustomId('qty_case_modal')
        .setTitle(st.lang === 'FR' ? 'Quantité de caisses' : 'Cases quantity');

      const qty = new TextInputBuilder()
        .setCustomId('qty_case_text')
        .setLabel(st.lang === 'FR' ? 'Combien de caisses ?' : 'How many cases?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(qty));
      if (inter.deferred || inter.replied) {
        return inter.followUp({ content: st.lang === 'FR' ? 'Indique la quantité :' : 'Enter the quantity:', components: [] })
          .then(() => inter.showModal(modal));
      } else {
        return inter.showModal(modal);
      }
    }

    if (i.isModalSubmit() && i.customId === 'qty_case_modal') {
      const st = getState(i.channel.id);
      const qty = Math.max(1, parseInt(i.fields.getTextInputValue('qty_case_text') || '1', 10));
      if (!st._pending?.hash || st._pending.type !== 'case') {
        return i.reply({ content: st.lang === 'FR' ? 'Contexte perdu, recommence.' : 'Context lost, start again.', ephemeral: true });
      }

      const item = {
        hash_name: st._pending.hash,
        display_name: prettifyName(st._pending.hash),
        is_st: false,
        wear: null,
        type: 'case',
        qty
      };

      delete st._pending;
      st.items.push(item);

      return i.reply({
        content: st.lang === 'FR'
          ? `Ajouté : **${formatDisplayName(item)}** x${qty}`
          : `Added: **${formatDisplayName(item)}** x${qty}`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('add_item_open').setLabel(st.lang === 'FR' ? 'Ajouter un autre item' : 'Add another item').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('add_done').setLabel(st.lang === 'FR' ? 'Terminer' : 'Done').setStyle(ButtonStyle.Success)
          )
        ]
      });
    }

    /* ---- StatTrak ? (skins uniquement) ---- */
    async function askStatTrak(inter, st) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('st_yes').setLabel(st.lang === 'FR' ? 'StatTrak : Oui' : 'StatTrak: Yes').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('st_no').setLabel(st.lang === 'FR' ? 'StatTrak : Non' : 'StatTrak: No').setStyle(ButtonStyle.Secondary)
      );

      const txt = st.lang === 'FR' ? 'Veux-tu la version **StatTrak** ?' : 'Do you want the **StatTrak** version?';
      if (inter.deferred || inter.replied) {
        return inter.followUp({ content: txt, components: [row] });
      } else {
        return inter.reply({ content: txt, components: [row] });
      }
    }

    if (i.isButton() && (i.customId === 'st_yes' || i.customId === 'st_no')) {
      const st = getState(i.channel.id);
      if (!st._pending?.hash) return i.reply({ content: 'Context lost.', ephemeral: true });
      st._pending.st = i.customId === 'st_yes';
      return askWear(i, st);
    }

    /* ---- Wear (skins + gants) ---- */
    async function askWear(inter, st) {
      const wearSelect = new StringSelectMenuBuilder()
        .setCustomId('pick_wear_simple')
        .setPlaceholder(st.lang === 'FR' ? 'Choisis l’état (FN/MW/FT/WW/BS)' : 'Choose wear (FN/MW/FT/WW/BS)')
        .addOptions([
          { label: 'Factory New (FN)', value: 'FN' },
          { label: 'Minimal Wear (MW)', value: 'MW' },
          { label: 'Field-Tested (FT)', value: 'FT' },
          { label: 'Well-Worn (WW)', value: 'WW' },
          { label: 'Battle-Scarred (BS)', value: 'BS' }
        ]);

      const txt = st.lang === 'FR' ? 'Sélectionne l’état (wear) :' : 'Select the wear:';
      if (inter.deferred || inter.replied) {
        return inter.followUp({ content: txt, components: [ new ActionRowBuilder().addComponents(wearSelect) ] });
      } else {
        return inter.reply({ content: txt, components: [ new ActionRowBuilder().addComponents(wearSelect) ] });
      }
    }

    /* Wear → on enregistre l’item (skins/gants) */
    if (i.isStringSelectMenu() && i.customId === 'pick_wear_simple') {
      const st = getState(i.channel.id);
      if (!st._pending?.hash) {
        return i.reply({ content: st.lang === 'FR' ? 'Contexte perdu, recommence.' : 'Context lost, start again.', ephemeral: true });
      }

      const wear = i.values[0]; // FN/MW/FT/WW/BS
      const isSt = st._pending.type === 'skin' ? !!st._pending.st : false;
      const rawName = st._pending.hash;

      const item = {
        hash_name: rawName,
        display_name: prettifyName(rawName),
        is_st: isSt,
        wear: isSt ? `ST_${wear}` : wear,
        type: st._pending.type || 'skin'
      };

      delete st._pending;
      st.items.push(item);

      const wearTxt = wearDisplay(item.wear);
      const addedLine = wearTxt
        ? (st.lang === 'FR'
            ? `Ajouté : **${formatDisplayName(item)}** (${wearTxt})`
            : `Added: **${formatDisplayName(item)}** (${wearTxt})`)
        : (st.lang === 'FR'
            ? `Ajouté : **${formatDisplayName(item)}**`
            : `Added: **${formatDisplayName(item)}**`);

      return i.reply({
        content: addedLine,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('add_item_open').setLabel(st.lang === 'FR' ? 'Ajouter un autre item' : 'Add another item').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('add_done').setLabel(st.lang === 'FR' ? 'Terminer' : 'Done').setStyle(ButtonStyle.Success)
          )
        ]
      });
    }

    /* Terminer → demander "Informations supplémentaires" (optionnel) */
    if (i.isButton() && i.customId === 'add_done') {
      const st = getState(i.channel.id);
      if (!st.items.length) {
        return i.reply({ content: st.lang === 'FR' ? 'Aucun item. Ajoute-en au moins un.' : 'No items yet. Please add one.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('extra_modal')
        .setTitle(st.lang === 'FR' ? 'Informations supplémentaires' : 'Additional information');

      const extra = new TextInputBuilder()
        .setCustomId('extra_text')
        .setLabel(st.lang === 'FR'
          ? 'Infos utiles (float/pattern/Souvenir)'
          : 'Useful details (float/pattern/Souvenir)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500);

      modal.addComponents(new ActionRowBuilder().addComponents(extra));
      return i.showModal(modal);
    }

    /* Soumission des informations supplémentaires → Preview */
    if (i.isModalSubmit() && i.customId === 'extra_modal') {
      const st = getState(i.channel.id);
      st.extra = (i.fields.getTextInputValue('extra_text') || '').trim() || null;

      const list = st.items.map(x => {
        const baseName = formatDisplayName(x);
        if (x.type === 'agent') {
          return `• ${baseName}`;
        }
        if (x.type === 'case') {
          const qty = x.qty ? ` x${x.qty}` : '';
          return `• ${baseName}${qty}`;
        }
        const wd = wearDisplay(x.wear);
        return wd ? `• ${baseName} (${wd})` : `• ${baseName}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle(st.lang === 'FR' ? 'Récapitulatif de ta demande' : 'Your request summary')
        .setDescription(list)
        .setTimestamp(new Date());

      if (st.extra) {
        embed.addFields({
          name: st.lang === 'FR' ? 'Infos supplémentaires' : 'Additional info',
          value: st.extra
        });
      }

      return i.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('go_fetch').setLabel(st.lang === 'FR' ? 'Calculer estimation' : 'Compute estimate').setStyle(ButtonStyle.Primary)
          )
        ]
      });
    }

    /* placeholder SELL_FETCH */
    if (i.isButton() && i.customId === 'go_fetch') {
      const st = getState(i.channel.id);
      return i.reply({
        content: st.lang === 'FR'
          ? 'Étape suivante: récupération Buff + Liquidité (on branche juste après).'
          : 'Next: fetch Buff prices + Liquidity (we’ll wire it next).'
      });
    }

  } catch (err) {
    console.error(err);
    try {
      if (i.deferred || i.replied) await i.followUp({ content: '❌ Une erreur est survenue.' });
      else await i.reply({ content: '❌ Une erreur est survenue.', ephemeral: true });
    } catch {}
  }
});

client.login(DISCORD_TOKEN);
