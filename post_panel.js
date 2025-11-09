import 'dotenv/config';
import {
  Client, GatewayIntentBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType
} from 'discord.js';

const { DISCORD_TOKEN, GUILD_ID, TICKET_CHANNEL_ID } = process.env;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  const guild = await client.guilds.fetch(GUILD_ID).catch(()=>null);
  if (!guild) { console.error('❌ GUILD_ID invalide ou bot non invité.'); process.exit(1); }

  const ch = guild.channels.cache.get(TICKET_CHANNEL_ID);
  if (!ch || ch.type !== ChannelType.GuildText) {
    console.error('❌ TICKET_CHANNEL_ID doit pointer vers un salon texte.');
    process.exit(1);
  }

  const embed = new EmbedBuilder()
    .setTitle('🎟️ Create my ticket')
    .setDescription('🇺🇸 Click to create a private channel and start.\n🇫🇷 Clique pour créer un salon privé et commencer.')
    .setTimestamp(new Date());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_ticket')
      .setLabel('Create my ticket')
      .setStyle(ButtonStyle.Primary)
  );

  await ch.send({ embeds: [embed], components: [row] });
  console.log('✅ Panneau envoyé.');
  process.exit(0);
});

client.login(DISCORD_TOKEN);
