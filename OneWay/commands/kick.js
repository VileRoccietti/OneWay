const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'kick',
    description: 'Expulsa a un usuario del servidor',
    async execute(message, args, { CHANNELS }) {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return message.reply("⛔ No tienes permisos para expulsar miembros.");
        }

        let target = message.mentions.members.first();
        if (!target) {
            const idArg = args[0];
            if (idArg && idArg.match(/^\d{17,19}$/)) {
                try { target = await message.guild.members.fetch(idArg); } catch (e) { }
            }
        }
        const reason = args.slice(1).join(' ') || "Razón no especificada";

        if (!target) return message.reply("⚠️ Menciona a un usuario o usa su ID para expulsar.");
        if (!target.kickable) return message.reply("❌ No puedo expulsar a este usuario.");

        try {
            await target.kick(`Expulsado por ${message.author.tag}: ${reason}`);
            message.channel.send(`boot **${target.user.tag}** ha sido expulsado.`);

            // Log
            const logChannel = message.guild.channels.cache.get(CHANNELS.AUDIT_LOG);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('👢 USER KICKED')
                    .addFields(
                        { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
                        { name: 'Moderator', value: message.author.tag, inline: true },
                        { name: 'Reason', value: reason }
                    )
                    .setColor('Orange')
                    .setTimestamp();
                logChannel.send({ embeds: [embed] });
            }

        } catch (e) {
            console.error(e);
            message.reply("❌ Error al intentar expulsar.");
        }
    }
};
