const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'blacklist',
    description: 'Añade un usuario a la blacklist (ID Discord o Usuario Roblox)',
    async execute(message, args, { dbManager, CHANNELS }) {
        const settings = dbManager.read('settings.oneway') || { roles: {}, blacklist: [] };
        // Check perm - Blacklist usually restricted
        const hasPerm = message.author.id === message.guild.ownerId || (settings?.roles?.staff && message.member.roles.cache.has(settings.roles.staff)) || message.member.permissions.has('Administrator');

        if (action === 'view') {
            // View might be public? Usually yes. If restricted, add check here.
            // keeping view public for blacklist is common, but 'remove'/'add' needs check.
        } else {
            if (!hasPerm) return;
        }

        const action = args[0] ? args[0].toLowerCase() : 'view';

        // ==========================================
        // VIEW
        // ==========================================
        if (action === 'view') {
            if (settings.blacklist.length === 0) return message.reply("✅ Blacklist vacía.");

            // Format list
            const list = settings.blacklist.map((entry, index) => {
                if (typeof entry === 'string') return `\`${index + 1}.\` ${entry} (Legacy)`;
                return `\`${index + 1}.\` **${entry.value}** (${entry.type}) - ${entry.reason}`;
            }).join('\n');

            // Chunk if too long
            if (list.length > 2000) {
                return message.reply(`⚠️ **Blacklist muy larga (${settings.blacklist.length})**. Mostrando últimos 10:\n${list.slice(-1000)}`);
            }

            const embed = new EmbedBuilder()
                .setTitle('🚨 ONE WAY BLACKLIST')
                .setDescription(list)
                .setColor('DarkRed');
            return message.reply({ embeds: [embed] });
        }

        // ==========================================
        // REMOVE
        // ==========================================
        if (action === 'remove') {
            const query = args[1];
            if (!query) return message.reply("⚠️ Uso: `.blacklist remove <ID/User/Index>`");

            const initialLength = settings.blacklist.length;
            // Filter by Index (1-based) or Value
            const index = parseInt(query);
            if (!isNaN(index) && index > 0 && index <= initialLength) {
                settings.blacklist.splice(index - 1, 1);
            } else {
                settings.blacklist = settings.blacklist.filter(e => {
                    const val = typeof e === 'string' ? e : e.value;
                    return val !== query;
                });
            }

            if (settings.blacklist.length === initialLength) return message.reply("⚠️ No encontrado.");

            dbManager.write('settings.oneway', settings);
            return message.reply(`✅ **${query}** eliminado de la blacklist.`);
        }

        // ==========================================
        // ADD
        // ==========================================
        if (action === 'add') {
            const identifier = args[1];
            const reason = args.slice(2).join(' ') || "Sin razón";
            const proof = message.attachments.first() ? message.attachments.first().url : null;

            if (!identifier) return message.reply("⚠️ Uso: `.blacklist add <DiscordID/RobloxUser> <Razón> (Adjuntar pruebas opcional)`");

            // Check Duplicate
            const exists = settings.blacklist.find(e => {
                const val = typeof e === 'string' ? e : e.value;
                return val === identifier;
            });
            if (exists) return message.reply("⚠️ Ya está en la blacklist.");

            // Detect Type
            const isId = identifier.match(/^\d{17,19}$/);
            const type = isId ? 'discord' : 'roblox';

            const entry = {
                value: identifier,
                type: type,
                reason: reason,
                proof: proof,
                date: Date.now(),
                moderator: message.author.id
            };

            settings.blacklist.push(entry);
            dbManager.write('settings.oneway', settings);

            // Ban Action (Discord Only)
            let banned = false;
            if (type === 'discord') {
                try {
                    const member = await message.guild.members.fetch(identifier).catch(() => null);
                    if (member && member.bannable) {
                        await member.ban({ reason: `Blacklist Autotrap: ${reason}` });
                        banned = true;
                    } else if (!member) {
                        await message.guild.members.ban(identifier, { reason: `Blacklist Autotrap: ${reason}` }).catch(() => { });
                        banned = true; // Pre-ban
                    }
                } catch (e) { }
            }

            // Log
            const logChannel = message.guild.channels.cache.get(CHANNELS.BLACKLIST_LOG);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('🚨 USER BLACKLISTED')
                    .addFields(
                        { name: 'Target', value: `${identifier} (${type})`, inline: true },
                        { name: 'Moderator', value: message.author.tag, inline: true },
                        { name: 'Reason', value: reason },
                        { name: 'Auto-Ban', value: banned ? '✅ Executed' : '❌ N/A' }
                    )
                    .setColor('DarkRed')
                    .setTimestamp();
                if (proof) embed.setImage(proof);
                logChannel.send({ embeds: [embed] });
            }

            return message.reply(`✅ **${identifier}** añadido a la blacklist.${banned ? " (Baneado)" : ""}`);
        }

        return message.reply("Uso: `.blacklist <add/remove/view>`");
    }
};
