const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'strikes',
    description: 'Sistema de advertencias y sanciones',
    async execute(message, args, { dbManager, CHANNELS }) {
        const settings = dbManager.read('settings.oneway');
        const hasPerm = message.author.id === message.guild.ownerId || (settings?.roles?.staff && message.member.roles.cache.has(settings.roles.staff)) || message.member.permissions.has('Administrator');

        if (!hasPerm) return message.reply("⛔ Requiere Staff.");

        const action = args[0] ? args[0].toLowerCase() : 'view';

        // Retrieve Target
        // Logic: .strikes action @User
        let target = message.mentions.members.first();
        if (!target) {
            const idArg = args.find(arg => arg.match(/^\d{17,19}$/));
            if (idArg) { try { target = await message.guild.members.fetch(idArg); } catch (e) { } }
        }

        const users = dbManager.read('users.oneway') || {};

        // ==========================================
        // VIEW
        // ==========================================
        if (action === 'view') {
            if (!target) return message.reply("⚠️ Mention user.");
            const data = users[target.id] || {};
            const strikes = data.strikes || [];

            if (strikes.length === 0) return message.reply(`✅ **${target.displayName}** no tiene strikes.`);

            const list = strikes.map((s, i) => `**${i + 1}.** ${s.reason} - <t:${Math.floor(s.date / 1000)}:R> (Mod: <@${s.mod}>)`).join('\n');
            const embed = new EmbedBuilder()
                .setTitle(`⚠️ Strikes: ${target.displayName}`)
                .setDescription(list)
                .setColor('Orange')
                .setFooter({ text: `Total: ${strikes.length}` });

            return message.reply({ embeds: [embed] });
        }

        // ==========================================
        // ADD
        // ==========================================
        if (action === 'add') {
            if (!target) return message.reply("⚠️ Mention user.");
            const reason = args.slice(2).join(' ') || "No especificado"; // args: [add, @user, reason...] OR [add, reason...] if user mentioned elsewhere?
            // Standard arg parsing might be messy if mention is index 1.
            // Cleaner: Filter args like phase.js logic, but usually args[0]=add, args[1]=Mention(parsed out by mentions.first but present in args string?). 
            // Let's rely on standard 'args' which separates by space.
            // If mention is args[1], reason is slice(2).
            // If mention not in args[1], find where mention/ID is index then slice after.

            // Robust Reason Extraction
            const content = message.content.split(' ').slice(1); // Remove command .strikes
            const actionStr = content.shift(); // remove 'add'
            // Remove target string (ID or Mention)
            const reasonParts = content.filter(w => !w.startsWith('<@') && !w.match(/^\d{17,19}$/));
            const finalReason = reasonParts.join(' ') || "No especificado";

            if (!users[target.id]) users[target.id] = {};
            if (!users[target.id].strikes) users[target.id].strikes = [];

            users[target.id].strikes.push({
                reason: finalReason,
                date: Date.now(),
                mod: message.author.id
            });
            dbManager.write('users.oneway', users);

            const count = users[target.id].strikes.length;
            message.reply(`⚠️ **Strike añadido** a ${target}. Total: ${count}\n📝 Razón: ${finalReason}`);

            // Log
            const logChannel = message.guild.channels.cache.get(CHANNELS.AUDIT_LOG); // Or specific Strike Log
            if (logChannel) {
                logChannel.send(`⚠️ **STRIKE ADDED**\nUser: ${target.user.tag}\nMod: ${message.author.tag}\nReason: ${finalReason}\nTotal: ${count}`);
            }
            return;
        }

        // ==========================================
        // REMOVE
        // ==========================================
        if (action === 'remove' || action === 'clear') {
            if (!target) return message.reply("⚠️ Mention user.");
            if (!users[target.id] || !users[target.id].strikes) return message.reply("⚠️ No tiene strikes.");

            if (action === 'clear' || args[2] === 'all') {
                users[target.id].strikes = [];
                dbManager.write('users.oneway', users);
                return message.reply(`✅ Strikes de ${target} limpiados.`);
            }

            const indexOp = parseInt(args.find(a => a.match(/^\d+$/) && !a.match(/^\d{17,19}$/))); // Find small number
            if (!indexOp || indexOp < 1 || indexOp > users[target.id].strikes.length) return message.reply("⚠️ Especifica el número de strike a borrar (ver `.strikes view`).");

            users[target.id].strikes.splice(indexOp - 1, 1);
            dbManager.write('users.oneway', users);
            return message.reply(`✅ Strike #${indexOp} eliminado.`);
        }

        message.reply("Uso: `.strikes <add/remove/view/clear> @User [Razón]`");
    }
};
