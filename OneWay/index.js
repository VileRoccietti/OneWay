const { Client, GatewayIntentBits, Collection, EmbedBuilder, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const config = require('./config.json');
const dbManager = require('./utils/dbManager');
const topCommand = require('./commands/top');

// Initialize Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

client.commands = new Collection();

// --- CONSTANTS ---
const CHANNELS = {
  TRYOUTS_RESULTS: '1469111793128443964',
  TRYOUTS_ALERTS: '1430693336775397446',
  EVENTS: '1469123888796532891',
  GENERAL: '1417173140848771154', // No enviar logs aquí
  COMPLAINTS: '1430449055368220784',
  DOUBTS: '1469097372737863927',
  BLACKLIST_LOG: '1469133557493665844',
  ACTIVITY_CHECK: '1460500237134332068',
  AUDIT_LOG: '1469354377801109749'
};

// --- LOADER ---
const commandsPath = path.join(__dirname, 'commands');
// Ensure commands dir exists
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('name' in command && 'execute' in command) {
    client.commands.set(command.name, command);
    console.log(`[CMD] Loaded: ${command.name}`);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "name" or "execute" property.`);
  }
}

// --- EVENTS ---

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  dbManager.init();
  const guild = client.guilds.cache.first(); // Assuming single guild bot or primary guild
  if (guild) topCommand.updateLeaderboard(client, dbManager, guild).catch(console.error);

  const BOOT_ID = Math.floor(Math.random() * 10000);
  console.log(`[BOOT] System Initialized | Instance ID: ${BOOT_ID} | PID: ${process.pid}`);


  // --- CRON JOB ---
  // 14:00 Bogota time
  // Node-cron timezone string for Bogota is 'America/Bogota'
  cron.schedule('0 14 * * *', () => {
    const channel = client.channels.cache.get(CHANNELS.ACTIVITY_CHECK);
    if (channel) {
      const settings = dbManager.read('settings.oneway');
      const roles = settings?.roles || {};

      // Construct mention string if roles exist
      let mentions = "";
      if (roles.lineup) mentions += `<@&${roles.lineup}> `;
      if (roles.sublineup) mentions += `<@&${roles.sublineup}> `;

      // Simple fallback if configured/not configured
      const content = mentions
        ? `${mentions}\n📊 **ACTIVITY CHECK DIARIO**\nPor favor reacciona para confirmar tu asistencia a los eventos de hoy.`
        : `📊 **ACTIVITY CHECK DIARIO**\n(Roles no configurados con .setup)\nPor favor reportarse.`;

      channel.send(content)
        .then(msg => msg.react('✅'))
        .catch(console.error);
    }
  }, {
    timezone: "America/Bogota"
  });
});

// Guild Member Add - Auto Ban Blacklist
client.on('guildMemberAdd', async member => {
  const settings = dbManager.read('settings.oneway');
  const blacklist = settings?.blacklist || [];

  if (blacklist.includes(member.id)) {
    try {
      await member.ban({ reason: 'One Way Blacklist: Auto-Ban' });

      const auditChannel = member.guild.channels.cache.get(CHANNELS.AUDIT_LOG);
      if (auditChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🛡️ AUTO-BAN TRIGGERED')
          .setDescription(`**User:** ${member.user.tag} (${member.id})\n**Reason:** User is in Blacklist Database.`)
          .setColor('Red')
          .setTimestamp();
        auditChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error(`Failed to autoban ${member.id}:`, error);
    }
  }
});

// Message Create - Command Handler
client.on('messageCreate', async message => {
  if (!message.content.startsWith(config.prefix) || message.author.bot) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName) ||
    client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

  if (!command) return;

  // --- STAFF CHECK GLOBALLY ---
  const settings = dbManager.read('settings.oneway');
  const staffRoleId = settings?.roles?.staff;
  const tryouterRoleId = settings?.roles?.tryouter;
  const isOwner = message.author.id === config.ownerId || message.author.id === message.guild.ownerId;

  // Lógica de Permisos:
  // 1. Owner: Acceso Total
  // 2. Staff: Acceso Total (si tiene el rol)
  // 3. Tryouter: Acceso SOLO a .phase

  if (isOwner) {
    // Owner pass
  } else {
    const hasStaffRole = staffRoleId && message.member.roles.cache.has(staffRoleId);
    const hasTryouterRole = tryouterRoleId && message.member.roles.cache.has(tryouterRoleId);

    // Si es Staff, pasa todo
    if (hasStaffRole) {
      // Pass
    }
    // Si es Tryouter y el comando es 'phase', pasa
    else if (hasTryouterRole && commandName === 'phase') {
      // Pass
    }
    // Bloquear todo lo demás
    else {
      return;
    }
  }

  try {
    await command.execute(message, args, { dbManager, CHANNELS });
  } catch (error) {
    console.error(error);
    message.reply('❌ Hubo un error ejecutando el comando.');
  }
});

client.login(config.token);
