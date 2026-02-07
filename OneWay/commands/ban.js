const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'ban',
    description: 'Banea a un usuario del servidor',
    async execute(message, args, { CHANNELS }) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply("⛔ No tienes permisos para banear miembros.");
        }

        let target = message.mentions.members.first();
        if (!target) {
            const idArg = args[0];
            if (idArg && idArg.match(/^\d{17,19}$/)) {
                try { target = await message.guild.members.fetch(idArg); } catch (e) { }
            }
        }
        const reason = args.slice(1).join(' ') || "Razón no especificada";

        if (!target) return message.reply("⚠️ Menciona a un usuario o usa su ID para banear.");
        if (!target.bannable) return message.reply("❌ No puedo banear a este usuario (Es admin o tiene rol superior).");

        try {
            await target.ban({ reason: `Baneado por ${message.author.tag}: ${reason}` });
            message.channel.send(`🔫 **${target.user.tag}** ha sido baneado.`);

            // Log
            const logChannel = message.guild.channels.cache.get(CHANNELS.AUDIT_LOG);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ USER BANNED')
                    .addFields(
                        { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
                        { name: 'Moderator', value: message.author.tag, inline: true },
                        { name: 'Reason', value: reason }
                    )
                    .setColor('DarkRed')
                    .setTimestamp();
                logChannel.send({ embeds: [embed] });
            }

        } catch (e) {
            console.error(e);
            message.reply("❌ Error al intentar banear.");
        }
    }
};
