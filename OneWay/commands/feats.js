const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'feats',
    description: 'Gestión de Logros / Feats del Jugador',
    async execute(message, args, { dbManager }) {
        const settings = dbManager.read('settings.oneway');
        const hasPerm = message.author.id === message.guild.ownerId || (settings?.roles?.staff && message.member.roles.cache.has(settings.roles.staff)) || message.member.permissions.has('Administrator');

        if (!hasPerm) return message.reply("⛔ Requiere Staff.");

        const action = args[0] ? args[0].toLowerCase() : 'view';

        // Target Logic
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

            // Normalize
            let featsList = [];
            if (Array.isArray(data.feats)) featsList = data.feats;
            else if (data.feats) featsList = data.feats.split('\n');

            if (featsList.length === 0) return message.reply(`✅ **${target.displayName}** no tiene logros registrados.`);

            const list = featsList.map((f, i) => `\`${i + 1}.\` ${f}`).join('\n');
            const embed = new EmbedBuilder()
                .setTitle(`🏆 Feats / Logros: ${target.displayName}`)
                .setDescription(list)
                .setColor('Gold');
            return message.reply({ embeds: [embed] });
        }

        // ==========================================
        // ADD
        // ==========================================
        if (action === 'add') {
            if (!target) return message.reply("⚠️ Mention user.");

            // Extract Text
            const content = message.content.split(' ').slice(1);
            content.shift(); // remove 'add'
            const rawText = content.filter(w => !w.startsWith('<@') && !w.match(/^\d{17,19}$/)).join(' ');

            if (!rawText) return message.reply("⚠️ Escribe el logro.");

            if (!users[target.id]) users[target.id] = {};

            // Normalize to Array
            let currentFeats = [];
            if (Array.isArray(users[target.id].feats)) {
                currentFeats = users[target.id].feats;
            } else if (users[target.id].feats) {
                currentFeats = users[target.id].feats.split('\n');
            }

            currentFeats.push(rawText);
            users[target.id].feats = currentFeats;
            dbManager.write('users.oneway', users);

            message.reply(`✅ **Logro añadido:** ${rawText}`);
            return;
        }

        // ==========================================
        // REMOVE
        // ==========================================
        if (action === 'remove') {
            if (!target) return message.reply("⚠️ Mention user.");
            const indexOp = parseInt(args.find(a => a.match(/^\d+$/) && !a.match(/^\d{17,19}$/)));

            if (!users[target.id]) return message.reply("⚠️ Sin datos.");

            // Normalize
            let currentFeats = Array.isArray(users[target.id].feats) ? users[target.id].feats : (users[target.id].feats ? users[target.id].feats.split('\n') : []);

            if (!indexOp || indexOp < 1 || indexOp > currentFeats.length) return message.reply("⚠️ Número inválido (ver `.feats view`).");

            const removed = currentFeats.splice(indexOp - 1, 1);
            users[target.id].feats = currentFeats;
            dbManager.write('users.oneway', users);

            message.reply(`✅ Eliminado: ${removed[0]}`);
            return;
        }

        message.reply("Uso: `.feats <add/remove/view> @User [Texto]`");
    }
};
