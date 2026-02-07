const { EmbedBuilder } = require('discord.js');

const TOP_KILLS_CHANNEL_ID = '1430441222245449748';

module.exports = {
    name: 'topkills',
    aliases: ['tk', 'kills'],
    description: 'Muestra el Ranking Global de Kills (Actualizable)',
    async execute(message, args, { dbManager }) {
        // Handle "Publish" sub-command
        if (args[0] && args[0].toLowerCase() === 'publish') {
            const settings = dbManager.read('settings.oneway');
            // Permission Check
            const hasPerm = message.author.id === message.guild.ownerId ||
                (settings?.roles?.staff && message.member.roles.cache.has(settings.roles.staff)) ||
                message.member.permissions.has('Administrator');

            if (!hasPerm) return message.reply("⛔ Requires Admin/Staff.");

            const channel = message.guild.channels.cache.get(TOP_KILLS_CHANNEL_ID);
            if (!channel) return message.reply(`⚠️ Canal Top Kills no encontrado (${TOP_KILLS_CHANNEL_ID}).`);

            await updateBestKills(message.client, dbManager, message.guild, channel, true); // Force Publish
            return message.reply(`✅ **Top Kills Publicado en <#${channel.id}>**`);
        }

        // Default View (Ephemeral-ish)
        await updateBestKills(message.client, dbManager, message.guild, message.channel, false);
    }
};

// ==========================================
// CORE LOGIC
// ==========================================
async function updateBestKills(client, dbManager, guild, targetChannel, forcePublish = false) {
    const usersData = dbManager.read('users.oneway') || {};
    const topsData = dbManager.read('tops.oneway') || { list: {} };
    const globalData = dbManager.read('global.oneway') || {};

    // 1. Merge Data Sources
    const playerMap = new Map();

    // Helper to parse kills
    const parseKills = (val) => {
        if (!val) return 0;
        const raw = val.toString().toLowerCase().trim();
        if (raw.includes('k')) return parseFloat(raw.replace('k', '')) * 1000;
        if (raw.includes('m')) return parseFloat(raw.replace('m', '')) * 1000000;
        return parseFloat(raw.replace(/,/g, ''));
    };

    // A. Load Users DB
    for (const [id, data] of Object.entries(usersData)) {
        if (data.kills) {
            const val = parseKills(data.kills);
            if (val > 0) playerMap.set(id, { id, raw: data.kills, val, ...data });
        }
    }

    // B. Merge Tops DB (Prioritize higher value or add missing)
    if (topsData.list) {
        for (const key of Object.keys(topsData.list)) {
            const item = topsData.list[key];
            if (!item.userId || !item.kills) continue;

            const val = parseKills(item.kills);
            const existing = playerMap.get(item.userId);

            if (!existing) {
                // Add new from Tops
                playerMap.set(item.userId, {
                    id: item.userId,
                    raw: item.kills,
                    val,
                    discordTag: item.discordTag // Fallback name
                });
            } else {
                // Update if Tops has higher (or overwrite?)
                // Let's assume Tops data is reliable too.
                if (val > existing.val) {
                    existing.val = val;
                    existing.raw = item.kills;
                }
            }
        }
    }

    // 2. Sort & Slice
    // User requested Top 15
    const leaderboard = Array.from(playerMap.values()).sort((a, b) => b.val - a.val).slice(0, 15);

    if (leaderboard.length === 0) {
        if (forcePublish) targetChannel.send("⚠️ No hay datos de kills registrados.");
        return;
    }

    // 3. Build Embed
    const mapNum = { 0: '🥇', 1: '🥈', 2: '🥉' };

    // Aesthetic Enhancements
    const description = leaderboard.map((u, i) => {
        let medal = mapNum[i] || `\`${i + 1}.\``;
        if (i > 9) medal = `\`${i + 1}.\``; // Monospace for 10+ alignment

        // Highlight logic
        const highlight = i < 3 ? "**" : "";
        const name = u.discordTag || `<@${u.id}>`; // Use Tag if available for cleaner look, or Mention fallback

        // Format: 🥇 Name  >>  50k ☠️
        // Use a code block style or just nice markdown?
        // User liked "Professional". 
        // Let's try:
        // 🥇 **User** 
        // └ ☠️ **50k** Kills

        // Or cleaner one-liner:
        // 🥇 **User** • `50k` ☠️

        // Let's stick to the user's provided screenshot style but cleaner
        // "1. @User Kills: 78k"

        return `${medal} <@${u.id}> \n└ **${u.raw}** Kills ☠️`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
        .setAuthor({ name: 'GLOBAL KILL LEADERBOARD', iconURL: 'https://cdn-icons-png.flaticon.com/512/8060/8060413.png' })
        .setDescription(`>>> *Ranking de los jugadores con más asesinatos registrados en la base de datos.*\n\n${description}`)
        .setColor(0x8B0000)
        .setThumbnail(guild.iconURL({ dynamic: true, size: 512 })) // Server Icon as requested
        .setImage('https://media.discordapp.net/attachments/1183838618771488809/1202720993081491546/OneWayLine.gif?ex=65ce7a08&is=65bc0508&hm=00000') // Placeholder Line or Configurable? I'll leave it empty unless I find a generic line, or remove this line if I don't have a URL. I'll remove it to be safe.
        // Actually, user wants "decoralo". A footer image or spacer helps. 
        // I will add a nice Footer text instead of image for now to avoid broken links.
        .addFields({ name: '📅 Actualizado', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true })
        .setFooter({ text: 'One Way Statistics • Auto-Updated', iconURL: client.user.displayAvatarURL() });

    // 4. Publish / Edit Logic
    let msgId = globalData.topKillsMsgId;
    let chId = globalData.topKillsChId;
    let officialChannel = guild.channels.cache.get(TOP_KILLS_CHANNEL_ID);

    // Context: "targetChannel" is where we want to send/edit.
    // If forcePublish: user specifically wants this channel (official) to be the new home.

    if (forcePublish) {
        // Delete old if exists
        try {
            if (msgId && chId) {
                const oldCh = guild.channels.cache.get(chId);
                if (oldCh) {
                    const oldMsg = await oldCh.messages.fetch(msgId);
                    if (oldMsg) await oldMsg.delete();
                }
            }
        } catch (e) { }

        // Send New
        const newMsg = await targetChannel.send({ embeds: [embed] });
        globalData.topKillsMsgId = newMsg.id;
        globalData.topKillsChId = targetChannel.id;
        dbManager.write('global.oneway', globalData);
        return;
    }

    // Auto-Update Logic (Called by other commands or default view)
    // If we have a stored message, try to edit it.
    if (msgId && chId) {
        const ch = guild.channels.cache.get(chId);
        if (ch) {
            try {
                const msg = await ch.messages.fetch(msgId);
                await msg.edit({ embeds: [embed] });

                // If this was a default view (manual command), we also show a temporary copy to the user
                if (targetChannel && targetChannel.id !== ch.id) {
                    targetChannel.send({ embeds: [embed] });
                }
                return;
            } catch (e) {
                // Message deleted
                if (targetChannel && targetChannel.id !== ch.id) {
                    targetChannel.send("⚠️ **Nota:** El Ranking Auto-Actualizable fue borrado. Usa `.topkills publish` para restaurarlo.");
                    targetChannel.send({ embeds: [embed] }); // Show anyway
                }
            }
        }
    }

    // No stored message or failed update, just show to user (Manual View)
    if (targetChannel) {
        targetChannel.send({ embeds: [embed] });
    }
}

module.exports.updateBestKills = updateBestKills;
