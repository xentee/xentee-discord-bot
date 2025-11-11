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
function prettifyName(raw) {
  if (!raw) return raw;
  let s = String(raw);

  // retirer StatTrak™, tranches de prix, "listed"
  s = s.replace(/StatTrak™\s*/gi, '');
  s = s.replace(/\$\s?\d[\d,]*(?:\.\d+)?\s*-\s*\$\s?\d[\d,]*(?:\.\d+)?/g, '');
  s = s.replace(/(?:-?\s*)?\b(?:\d+\s*)?listed\b/gi, '');

  // retirer "Souvenir" en toutes formes :
  // - mot isolé (avec ou sans parenthèses), + séparateurs qui suivent
  s = s.replace(/\(?\bSouvenir\b\)?[\s|:–-]*/gi, '');
  // - cas collé : "SouvenirMP9", "SouvenirAWP", etc.
  s = s.replace(/Souvenir(?=[A-Z0-9])/gi, '');

  // normaliser espaces
  s = s.replace(/\s{2,}/g, ' ').trim();

  // ajouter " | " quand nom d'arme collé à la skin (inclut AUG maintenant)
  s = s.replace(
  /(Kukri Knife|Skeleton Knife|Nomad Knife|Survival Knife|Paracord Knife|Classic Knife|M9 Bayonet|Huntsman Knife|Falchion Knife|Butterfly Knife|Shadow Daggers|Navaja Knife|Stiletto Knife|Talon Knife|Ursus Knife|Flip Knife|Gut Knife|Karambit|Bowie Knife|Bayonet|AK-47|M4A1-S|M4A4|AUG|SG 553|Galil AR|FAMAS|AWP|SSG 08|SCAR-20|G3SG1|Nova|XM1014|MAG-7|Sawed-Off|M249|Negev|MAC-10|MP9|MP7|MP5-SD|UMP-45|P90|PP-Bizon|USP-S|Glock-18|P2000|Dual Berettas|P250|CZ75-Auto|Five-SeveN|Tec-9|Desert Eagle|R8 Revolver|Driver Gloves|Hand Wraps|Moto Gloves|Specialist Gloves|Sport Gloves|Bloodhound Gloves|Hydra Gloves|Broken Fang Gloves)(?=[A-Z])/g,
  '$1 | '
);


  return s;
}

function wearDisplay(w) {
  return w?.startsWith('ST_') ? w.slice(3) : w;
}

function formatDisplayName(item) {
  // Ajoute "StatTrak™ " si nécessaire
  return `${item?.is_st ? 'StatTrak™ ' : ''}${item?.display_name || ''}`;
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

const ticketState = new Map(); // channelId -> { lang:'EN'|'FR', paymethod:string|null, items:[], extra:string|null, _pending?:{} }
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
          ? 'Ta méthode (Revolut, PayPal F&F, Crypto...)'
          : 'Your method (Revolut, PayPal F&F, Crypto...)')
        .setStyle(TextInputStyle.Short).setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(tx));
      return i.showModal(modal);
    }

    /* PAYMENT_METHOD → SELL_OR_BUY */
    if (i.isModalSubmit() && i.customId === 'pm_modal') {
      const st = getState(i.channel.id);
      st.paymethod = i.fields.getTextInputValue('pm_text')?.trim();

      return i.reply({
        content: st.lang === 'FR' ? 'Tu veux **vendre** ou **acheter** des skins ?' : 'Do you want to **sell** or **buy** skins?',
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
            ? 'Liste des items en stock (bientôt). Tu peux écrire ici ce que tu cherches.'
            : 'Items in stock (soon). You can write here what you’re looking for.'
        });
      }

      // SELL_1: Add item
      return i.reply({
        content: st.lang === 'FR'
          ? 'Ajoute un item. Tape ce que tu veux (ex: "kara tiger tooth").'
          : 'Add an item. Type what you want (e.g., "kara tiger tooth").',
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('add_item_open')
              .setLabel(st.lang === 'FR' ? 'Ajouter un item' : 'Add item')
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
        .setTitle(st.lang === 'FR' ? 'Recherche (texte libre)' : 'Search (free text)');

      const q = new TextInputBuilder()
        .setCustomId('q_text')
        .setLabel(st.lang === 'FR' ? 'Ex: "kara tiger tooth"' : 'e.g., "kara tiger tooth"')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(80)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(q));
      return i.showModal(modal);
    }

    /* Après input: candidats via /item/{input} (fallback /search) avec timeout */
    if (i.isModalSubmit() && i.customId === 'add_item_free') {
      const st = getState(i.channel.id);
      console.log('[modal] add_item_free received');
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
            ? 'Aucun résultat ou délai dépassé. Clique “Affiner la recherche” et essaye un autre terme (ex: "karambit tiger").'
            : 'No results or timed out. Click “Refine search” and try another term (e.g., "karambit tiger").',
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('add_item_open').setLabel(st.lang === 'FR' ? 'Affiner la recherche' : 'Refine search').setStyle(ButtonStyle.Secondary)
            )
          ]
        });
      }

      // garder les candidats (on n'affiche qu'un label nettoyé)
      st._pending = { candidates };
      const pretty = candidates.map(c => ({ ...c, display: prettifyName(c.name) }));
      const lines = pretty.map((c, idx) => `${idx + 1}. ${c.display}`);
      const msg = (st.lang === 'FR'
        ? 'Résultats trouvés (sélectionne ci-dessous ou **entre le numéro**):\n'
        : 'Results found (pick below or **enter the number**):\n') + lines.join('\n');

      const select = new StringSelectMenuBuilder()
        .setCustomId('pick_by_select')
        .setPlaceholder(st.lang === 'FR' ? 'Choisir un résultat' : 'Pick a result')
        .addOptions(
          pretty.slice(0, 25).map((c, idx) => ({
            label: `${idx + 1}. ${c.display}`.slice(0, 100),
            value: String(idx)
          }))
        );

      const askNumberBtn = new ButtonBuilder()
        .setCustomId('pick_number_open')
        .setLabel(st.lang === 'FR' ? 'Entrer un numéro' : 'Enter a number')
        .setStyle(ButtonStyle.Secondary);

      await i.editReply({
        content: msg,
        components: [
          new ActionRowBuilder().addComponents(select),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('pick_number_open')
              .setLabel(st.lang === 'FR' ? 'Entrer un numéro' : 'Enter a number')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('refine_search')
              .setLabel(st.lang === 'FR' ? 'Nouvelle recherche' : 'Refine search')
              .setStyle(ButtonStyle.Secondary)
          )
        ]
      });
    }

    /* Bouton → modal "enter number" */
    if (i.isButton() && i.customId === 'pick_number_open') {
      const st = getState(i.channel.id);
      const modal = new ModalBuilder()
        .setCustomId('pick_number_modal')
        .setTitle(st.lang === 'FR' ? 'Choisir un numéro' : 'Pick a number');

      const num = new TextInputBuilder()
        .setCustomId('num_text')
        .setLabel(st.lang === 'FR' ? 'Numéro dans la liste' : 'Number in the list')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(2);

      modal.addComponents(new ActionRowBuilder().addComponents(num));
      return i.showModal(modal);
    }

    // Bouton "Refine search" → réouvrir la saisie libre et reset du pending
    if (i.isButton() && i.customId === 'refine_search') {
      const st = getState(i.channel.id);
      st._pending = undefined; // on repart de zéro pour la sélection

      const modal = new ModalBuilder()
        .setCustomId('add_item_free')
        .setTitle(st.lang === 'FR' ? 'Recherche (texte libre)' : 'Search (free text)');

      const q = new TextInputBuilder()
        .setCustomId('q_text')
        .setLabel(st.lang === 'FR' ? 'Ex: "kara tiger tooth"' : 'e.g., "kara tiger tooth"')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(80)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(q));
      return i.showModal(modal);
    }


    /* Sélection via le menu → demander StatTrak ? */
    if (i.isStringSelectMenu() && i.customId === 'pick_by_select') {
      const st = getState(i.channel.id);
      const idx = parseInt(i.values[0], 10);
      const pick = st._pending?.candidates?.[idx];
      if (!pick) return i.reply({ content: 'Invalid selection.', ephemeral: true });

      st._pending = { hash: pick.market_hash_name, st: false }; // st=false par défaut
      return askStatTrak(i, st);
    }

    /* Sélection via numéro → demander StatTrak ? */
    if (i.isModalSubmit() && i.customId === 'pick_number_modal') {
      const st = getState(i.channel.id);
      const num = parseInt(i.fields.getTextInputValue('num_text') || '0', 10);
      const idx = num - 1;
      const pick = st._pending?.candidates?.[idx];
      if (!pick) {
        return i.reply({ content: st.lang === 'FR' ? 'Numéro invalide.' : 'Invalid number.', ephemeral: true });
      }

      st._pending = { hash: pick.market_hash_name, st: false };
      return askStatTrak(i, st);
    }

    /* ---- StatTrak ? ---- */
    async function askStatTrak(inter, st) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('st_yes').setLabel('StatTrak: Yes').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('st_no').setLabel('StatTrak: No').setStyle(ButtonStyle.Danger)
      );

      const txt = st.lang === 'FR' ? 'StatTrak ?' : 'StatTrak?';
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

      // ensuite: wear simple
      const wearSelect = new StringSelectMenuBuilder()
        .setCustomId('pick_wear_simple')
        .setPlaceholder(st.lang === 'FR' ? 'Sélectionne l’état' : 'Select wear')
        .addOptions([
          { label: 'Factory New (FN)', value: 'FN' },
          { label: 'Minimal Wear (MW)', value: 'MW' },
          { label: 'Field-Tested (FT)', value: 'FT' },
          { label: 'Well-Worn (WW)', value: 'WW' },
          { label: 'Battle-Scarred (BS)', value: 'BS' }
        ]);

      return i.reply({
        content: st.lang === 'FR' ? 'Choisis l’état :' : 'Choose wear:',
        components: [ new ActionRowBuilder().addComponents(wearSelect) ]
      });
    }

    /* Wear simple → on enregistre directement l’item (plus de quantité) */
    if (i.isStringSelectMenu() && i.customId === 'pick_wear_simple') {
      const st = getState(i.channel.id);
      if (!st._pending?.hash) {
        return i.reply({ content: st.lang === 'FR' ? 'Contexte perdu, recommence.' : 'Context lost, start again.', ephemeral: true });
      }

      const wear = i.values[0]; // FN/MW/FT/WW/BS
      const isSt = !!st._pending.st;
      const rawName = st._pending.hash;

      const item = {
        hash_name: rawName,
        display_name: prettifyName(rawName),
        is_st: isSt,
        wear: isSt ? `ST_${wear}` : wear
      };

      // reset pending et push
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

    /* Done → demander "Informations supplémentaires" (optionnel) */
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
        .setLabel(st.lang === 'FR' ? 'Détails utiles (optionnel)' : 'Useful details (optional)')
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

      const list = st.items
        .map(x => `• ${formatDisplayName(x)} (${wearDisplay(x.wear)})`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setTitle(st.lang === 'FR' ? 'Prévisualisation' : 'Preview')
        .setDescription(list)
        .setTimestamp(new Date());

      if (st.extra) {
        embed.addFields({
          name: st.lang === 'FR' ? 'Informations supplémentaires' : 'Additional info',
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
          : 'Next: fetch Buff + Liquidity (we’ll wire it next).'
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
