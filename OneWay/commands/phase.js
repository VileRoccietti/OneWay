const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

const PHASES = ['0', '1', '2', '3', '4', '5'];
const TIERS = { 'high': 'H', 'mid': 'M', 'low': 'L' };
const SUBTIER_MAP = {
    'strong': 'S',
    'stable': 'T',
    'weak': 'W'
};

module.exports = {
    name: 'phase',
    description: 'Establece el rango TSBL y actualiza roles automáticamente',
    async execute(message, args, { dbManager, CHANNELS }) {
        const settings = dbManager.read('settings.oneway');
        // Permission: Owner OR Staff Role OR Tryouter Role (1430378400350212137)
        const isOwner = message.author.id === message.guild.ownerId;
        const isStaff = settings?.roles?.staff && message.member.roles.cache.has(settings.roles.staff);
        const isTryouter = settings?.roles?.tryouter && message.member.roles.cache.has(settings.roles.tryouter);

        if (!isOwner && !isStaff && !isTryouter) return; // Silent Denial

        let target = message.mentions.members.first();
        if (!target) {
            const idArg = args.find(arg => arg.match(/^\d{17,19}$/));
            if (idArg) {
                try { target = await message.guild.members.fetch(idArg); } catch (e) { }
            }
        }
        if (!target) return message.reply("⚠️ Debes mencionar a un usuario o proporcionar su ID válida.");

        // Clean args from mentions and IDs
        const cleanerArgs = args.filter(arg => !arg.startsWith('<@') && !arg.match(/^\d{17,19}$/) && arg !== 'set');

        if (cleanerArgs.length < 3) return message.reply("Uso Correcto: `.phase <0-5> <High/Mid/Low> <Strong/Stable/Weak> @User`");

        let phase = null;
        let tier = null;
        let subtier = null;

        // Smart Parse
        for (const arg of cleanerArgs) {
            const lower = arg.toLowerCase();
            if (PHASES.includes(lower) && phase === null) phase = lower;
            else if (TIERS[lower] && tier === null) tier = lower;
            else if (SUBTIER_MAP[lower] && subtier === null) subtier = lower;
        }

        if (!phase || !tier || !subtier) {
            return message.reply("⚠️ Datos incompletos. Asegúrate de escribir Phase(#), Tier(High/Mid/Low) y SubTier(Strong/Stable/Weak).");
        }



        const phaseStr = `P${phase}`;
        const tierInitial = TIERS[tier];
        const subtierInitial = SUBTIER_MAP[subtier];

        // --- DATABASE UPDATE ---
        const users = dbManager.read('users.oneway') || {};
        users[target.id] = {
            phase,
            tier: tierInitial,
            subtier: subtierInitial,
            lastUpdate: Date.now()
        };
        dbManager.write('users.oneway', users);

        // --- NICKNAME UPDATE ---
        // --- NICKNAME UPDATE ---
        const oldNick = target.displayName;
        // Clean old (P#) or [Prefix] if they exist to avoid duplication/mess
        const cleanName = oldNick.replace(/\s*\(P\d+\)$/, '').replace(/^\[.*?\]\s*/, '');
        const newNick = `${cleanName} (P${phase})`;
        let nickStatus = "✅ Updated";

        try {
            await target.setNickname(newNick);
        } catch (e) {
            nickStatus = "⚠️ Perm. Error";
        }

        // --- AUTO-ROLE LOGIC ---
        let roleStatus = "✅ Roles Updated";
        try {
            const newPhaseRoleId = config.phaseRoles[phase];
            const newTierRoleId = config.tierRoles[tier];
            const newSubTierRoleId = config.subTierRoles[subtier];

            const allRankRoles = [
                ...Object.values(config.phaseRoles),
                ...Object.values(config.tierRoles),
                ...Object.values(config.subTierRoles)
            ];

            const rolesToRemove = allRankRoles.filter(id =>
                id !== newPhaseRoleId && id !== newTierRoleId && id !== newSubTierRoleId
            );

            const toRemove = target.roles.cache.filter(r => rolesToRemove.includes(r.id));
            if (toRemove.size > 0) await target.roles.remove(toRemove);

            const toAdd = [];
            if (newPhaseRoleId) toAdd.push(newPhaseRoleId);
            if (newTierRoleId) toAdd.push(newTierRoleId);
            if (newSubTierRoleId) toAdd.push(newSubTierRoleId);

            if (toAdd.length > 0) await target.roles.add(toAdd);

        } catch (e) {
            console.error(e);
            roleStatus = "⚠️ Role Error";
        }

        // --- LOGGING ---
        const logChannel = message.guild.channels.cache.get(CHANNELS.TRYOUTS_RESULTS);
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setTitle('🧬 TSBL RANK UPDATE')
                .setThumbnail(target.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setColor(0x9B59B6)
                .addFields(
                    { name: '👤 User', value: `${target} \n(\`${target.id}\`)`, inline: true },
                    { name: '👮 Updated By', value: `${message.author}`, inline: true },
                    { name: '📊 Rank', value: `**Phase ${phase}**\n${tier.toUpperCase()} ${subtier.toUpperCase()}`, inline: true },
                    { name: '🏷️ Tag', value: `\`${newNick}\``, inline: true }
                )
                .setFooter({ text: 'One Way Automation', iconURL: message.guild.iconURL() })
                .setTimestamp();

            logChannel.send({ embeds: [embed] });
        }

        message.reply(`✅ **${target.user.username}** actualizado a **Phase ${phase} ${tier} ${subtier}**.`);
    }
};
