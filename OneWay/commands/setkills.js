const topKills = require('./topkills'); // Import the update function

module.exports = {
    name: 'setkills',
    description: 'Asigna cantidad de Kills a un usuario (Acceso Rápido)',
    async execute(message, args, { dbManager }) {
        const settings = dbManager.read('settings.oneway');

        // Permissions
        const hasPerm = message.author.id === message.guild.ownerId ||
            (settings?.roles?.staff && message.member.roles.cache.has(settings.roles.staff)) ||
            message.member.permissions.has('Administrator');

        if (!hasPerm) return message.reply("⛔ Sin permisos.");

        const target = message.mentions.members.first();
        const amount = args[1]; // Usually args[1] if mention is first, but mention can be anywhere.

        // Robust Arg parsing
        // .setkills @User 50k
        // .setkills 50k @User

        if (!target) return message.reply("⚠️ Debes mencionar a un usuario.");

        // Find the amount arg (not the mention)
        const rawAmount = args.find(a => !a.includes(target.id));

        if (!rawAmount) return message.reply("⚠️ Debes especificar la cantidad (ej: 50k).");

        // Save to DB
        const users = dbManager.read('users.oneway') || {};
        if (!users[target.id]) users[target.id] = {};

        users[target.id].kills = rawAmount;
        // Optional: Update basic fields if missing
        users[target.id].discordTag = target.displayName;

        dbManager.write('users.oneway', users);

        message.reply(`✅ **Kills Actualizadas:** ${target.displayName} ➔ **${rawAmount}**`);

        // Trigger Leaderboard Update
        try {
            await topKills.updateBestKills(message.client, dbManager, message.guild);
        } catch (e) {
            console.error(e);
        }
    }
};
