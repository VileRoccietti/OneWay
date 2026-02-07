const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    StringSelectMenuBuilder,
    Colors
} = require('discord.js');
const roblox = require('../utils/roblox');

const TOPS_CHANNEL_ID = '1442105620487602309';

module.exports = {
    name: 'top',
    aliases: ['tops'],
    description: 'Gestión del Top Clan (Granular Dashboard - 10 Slots)',
    async execute(message, args, { dbManager }) {
        const settings = dbManager.read('settings.oneway');
        const hasPerm = message.author.id === message.guild.ownerId || (settings?.roles?.staff && message.member.roles.cache.has(settings.roles.staff)) || message.member.permissions.has('Administrator');

        if (args[0] === 'publish') {
            if (!hasPerm) return message.reply("⛔ Sin permisos.");
            const channel = message.guild.channels.cache.get(TOPS_CHANNEL_ID);
            if (!channel) return message.reply("⚠️ Canal no encontrado.");

            await updateLeaderboard(message.client, dbManager, message.guild, true); // true = Force New
            return message.reply("✅ **Top Leaderboard Publicado.**");
        }

        // ==========================================
        // ADD (INSERT & SHIFT DOWN)
        // ==========================================
        if (args[0] === 'add') {
            if (!hasPerm) return message.reply("⛔ Sin permisos.");

            // Resolve Target: Mention OR ID
            let target = message.mentions.members.first();
            let targetId = null;

            // Arg parsing: .top add <User/ID> <Slot> OR .top add <Slot> <User/ID>
            const arg1 = args[1];
            const arg2 = args[2];

            // Try to find Slot first (1-15)
            let slot = parseInt([arg1, arg2].find(a => a && a.match(/^\d+$/) && parseInt(a) <= 15));

            // If we found a slot, the OTHER arg is likely the user
            const potentialUserArg = (arg1 == slot) ? arg2 : arg1;

            if (!target && potentialUserArg) {
                // Try resolving ID
                const rawId = potentialUserArg.replace(/[<@!>]/g, '');
                if (rawId.match(/^\d{17,19}$/)) {
                    try {
                        target = await message.guild.members.fetch(rawId);
                        targetId = rawId;
                    } catch (e) {
                        return message.reply("⚠️ Usuario no encontrado en el servidor.");
                    }
                }
            }

            if (!target) return message.reply("⚠️ Debes mencionar al usuario o proporcionar una ID válida.");

            if (!slot || slot < 1 || slot > 15) return message.reply("⚠️ Slot inválido (1-15).");

            const tops = dbManager.read('tops.oneway') || { list: {} };

            // Convert to Array
            let arr = [];
            for (let i = 1; i <= 15; i++) {
                if (tops.list[i]) arr.push({ ...tops.list[i], rank: i });
                else arr.push({ rank: i, userId: null, discordTag: "Vacio", kills: "N/A" });
            }

            // Clean Array (Sort just in case)
            arr.sort((a, b) => a.rank - b.rank);

            // Shift Logic: Insert at Index (Slot - 1)
            // If we insert at 4 (Rank 5), old 4 becomes 5.
            const newEntry = {
                userId: target.id,
                discordTag: target.displayName,
                kills: "0",
                region: "N/A",
                platform: "PC",
                link: "N/A",
                avatar: target.user.displayAvatarURL(),
                rank: slot
            };

            // Remove 1 element from the end to keep size, insert at POS
            arr.splice(slot - 1, 0, newEntry);
            arr.pop(); // Remove the last one (overflow)

            // Rebuild Object
            const newList = {};
            arr.forEach((item, index) => {
                newList[index + 1] = { ...item, rank: (index + 1).toString() };
            });

            tops.list = newList;
            dbManager.write('tops.oneway', tops);
            await updateLeaderboard(message.client, dbManager, message.guild);
            return message.reply(`✅ **Top Added:** ${target.displayName} insertado en Slot ${slot}. (Los demás bajaron)`);
        }

        // ==========================================
        // REMOVE (DELETE & SHIFT UP)
        // ==========================================
        if (args[0] === 'remove' || args[0] === 'rem') {
            if (!hasPerm) return message.reply("⛔ Sin permisos.");
            const arg = args[1];
            if (!arg) return message.reply("⚠️ Menciona usuario o Slot.");

            const tops = dbManager.read('tops.oneway') || { list: {} };

            // Identify Slot
            let slotToRemove = -1;
            if (arg.match(/^\d+$/)) {
                slotToRemove = parseInt(arg);
            } else {
                const uid = arg.replace(/[<@!>]/g, '');
                for (const [k, v] of Object.entries(tops.list)) {
                    if (v.userId === uid) { slotToRemove = parseInt(k); break; }
                }
            }

            if (slotToRemove === -1 || !tops.list[slotToRemove]) return message.reply("⚠️ No encontrado.");

            // Convert to Array
            let arr = [];
            for (let i = 1; i <= 15; i++) {
                if (tops.list[i]) arr.push({ ...tops.list[i], rank: i });
                else arr.push({ rank: i, userId: null, discordTag: "Vacio" });
            }

            // Sort
            arr.sort((a, b) => a.rank - b.rank);

            // Remove (Splice)
            arr.splice(slotToRemove - 1, 1);

            // Add Empty at end to fill 10/15
            arr.push({ userId: null, discordTag: "Vacio", rank: 15 });

            // Rebuild
            const newList = {};
            arr.forEach((item, index) => {
                newList[index + 1] = { ...item, rank: (index + 1).toString() };
            });

            tops.list = newList;
            dbManager.write('tops.oneway', tops);
            await updateLeaderboard(message.client, dbManager, message.guild);
            return message.reply(`✅ **Top Removed:** Slot ${slotToRemove} eliminado. (Los demás subieron)`);
        }

        // ==========================================
        // MOVE (SWAP)
        // ==========================================
        if (args[0] === 'move') {
            if (!hasPerm) return; // Silent Denial
            const argA = args[1];
            const argB = args[2];

            if (!argA || !argB) return message.reply("⚠️ Uso: `.top move <A> <B>` (Intercambia slots)");

            const tops = dbManager.read('tops.oneway') || { list: {} };

            const resolve = (input) => {
                if (input.match(/^\d+$/) && !input.match(/^\d{17,19}$/) && parseInt(input) <= 15) return parseInt(input);
                let uid = input.startsWith('<@') ? input.replace(/[<@!>]/g, '') : input;
                for (const [k, v] of Object.entries(tops.list)) {
                    if (v.userId === uid) return parseInt(k);
                }
                return null;
            };

            const slotA = resolve(argA);
            const slotB = resolve(argB);

            if (!slotA || !slotB) return message.reply("⚠️ Slots inválidos o usuario no encontrado en Top.");

            // Swap
            const dataA = tops.list[slotA.toString()] || { rank: slotA.toString(), userId: null, discordTag: "Vacio" };
            const dataB = tops.list[slotB.toString()] || { rank: slotB.toString(), userId: null, discordTag: "Vacio" };

            // We swap content but try to preserve rank ID if needed? 
            // Actually usually we just swap the object reference but update the internal rank key.
            const temp = { ...dataA, rank: slotB.toString() };
            const newA = { ...dataB, rank: slotA.toString() };

            tops.list[slotA.toString()] = newA;
            tops.list[slotB.toString()] = temp;

            dbManager.write('tops.oneway', tops);
            await updateLeaderboard(message.client, dbManager, message.guild);
            return message.reply(`✅ **Top Swap:** Slot ${slotA} ↔ Slot ${slotB}.`);
        }

        if (args[0] === 'manage') {
            if (!hasPerm) return message.reply("⛔ Sin permisos.");

            // --- MAIN PANEL (SELECT MENU) ---
            const tops = dbManager.read('tops.oneway') || { messageId: null, list: {} };

            // Generate Options 1-15
            const options = [];
            let descriptionList = "";

            for (let i = 1; i <= 15; i++) {
                const t = tops.list[i.toString()] || {};
                const name = t.discordTag || "Vacio";
                options.push({
                    label: `Top ${i} - ${name}`,
                    value: `top_${i}`,
                    description: t.userId ? `ID: ${t.userId}` : "Sin asignar",
                    emoji: '🏆'
                });
                descriptionList += `**${i}.** ${name}\n`;
            }

            const menuRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_top_slot')
                    .setPlaceholder('Selecciona el Top a editar...')
                    .addOptions(options)
            );

            const embedMain = new EmbedBuilder()
                .setTitle('🛠️ GESTOR DE TOPS (1-15)')
                .setDescription(`**Estado Actual:**\n${descriptionList}\n\n*Selecciona del menú abajo para editar.*`)
                .setColor(0x2B2D31);

            const mainMsg = await message.reply({
                embeds: [embedMain],
                components: [menuRow]
            });

            const mainCollector = mainMsg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 300000 });

            mainCollector.on('collect', async i => {
                if (i.user.id !== message.author.id) return i.reply({ content: "No.", ephemeral: true });

                const topNum = i.values[0].split('_')[1];
                mainCollector.stop(); // Switch to Sub-Dashboard

                // Load Data
                const currentData = tops.list[topNum] || {
                    userId: null,
                    discordTag: "Vacio",
                    kills: "N/A",
                    region: "N/A",
                    platform: "N/A",
                    link: "N/A",
                    avatar: null,
                    rank: topNum
                };

                // Local State for Edition
                let editData = { ...currentData };
                // Fetch initial user if ID exists to populate display name / rank
                let member = null;
                if (editData.userId) {
                    try { member = await message.guild.members.fetch(editData.userId); } catch (e) { }
                }

                // --- SUB DASHBOARD ---
                const generateEmbed = () => {
                    const usersDB = dbManager.read('users.oneway') || {};
                    const userRank = editData.userId ? usersDB[editData.userId] : null;
                    const TIER_MAP = { 'H': 'High', 'M': 'Mid', 'L': 'Low' };
                    const SUBTIER_MAP = { 'S': 'Strong', 'T': 'Stable', 'W': 'Weak' };
                    // Robust rank expansion logic from step 432
                    const tRaw = userRank && userRank.tier ? userRank.tier.toString() : '';
                    const sRaw = userRank && userRank.subtier ? userRank.subtier.toString() : '';
                    const tVal = TIER_MAP[tRaw] || TIER_MAP[tRaw.toUpperCase()] || tRaw;
                    const sVal = SUBTIER_MAP[sRaw] || SUBTIER_MAP[sRaw.toUpperCase()] || sRaw;

                    const rankStr = userRank ? `Phase ${userRank.phase} ${tVal} ${sVal}` : "⚠️ Unranked / Not in DB";

                    return new EmbedBuilder()
                        .setTitle(`📝 EDITANDO: TOP ${topNum}`)
                        .setDescription(`**Jugador Actual:** ${editData.discordTag} (<@${editData.userId || '?'}>)`)
                        .addFields(
                            { name: '👤 Usuario', value: editData.discordTag, inline: true },
                            { name: '⚔️ Kills', value: editData.kills, inline: true },
                            { name: '📊 Rank (Auto)', value: rankStr, inline: true },
                            { name: '🌍 Región', value: editData.region, inline: true },
                            { name: '🎮 Plataforma', value: editData.platform, inline: true },
                            { name: '🔗 Link', value: `[Link](${editData.link})`, inline: true }
                        )
                        .setThumbnail(editData.avatar || message.guild.iconURL())
                        .setColor('Blue');
                };

                const generateRows = () => [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('field_user').setLabel('👤 User').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('field_kills').setLabel('⚔️ Kills').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('field_region').setLabel('🌍 Region').setStyle(ButtonStyle.Secondary)
                    ),
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('field_plat').setLabel('🎮 Platform').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('field_link').setLabel('🔗 Link').setStyle(ButtonStyle.Secondary)
                    ),
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('action_save').setLabel('💾 GUARDAR & PUBLICAR').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('action_cancel').setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
                    )
                ];

                await i.update({ content: `✅ Dashboard cargado para **Top ${topNum}**.`, components: [], embeds: [] });
                const dashboardMsg = await message.channel.send({ embeds: [generateEmbed()], components: generateRows() });

                const editCollector = dashboardMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });

                editCollector.on('collect', async subI => {
                    if (subI.user.id !== message.author.id) return subI.reply({ content: "No.", ephemeral: true });

                    if (subI.customId === 'action_cancel') {
                        await subI.update({ content: "❌ Cancelado.", components: [], embeds: [] });
                        return editCollector.stop();
                    }

                    if (subI.customId === 'action_save') {
                        // SAVE LOGIC
                        tops.list[topNum] = { ...editData, rank: topNum, updatedAt: Date.now() };
                        dbManager.write('tops.oneway', tops);

                        await subI.update({ content: "✅ Guardando...", components: [] });
                        await updateLeaderboard(message.client, dbManager, message.guild);
                        await dashboardMsg.edit({ content: `✅ **Top ${topNum} Actualizado.**`, embeds: [generateEmbed()], components: [] });
                        return editCollector.stop();
                    }

                    // FIELD EDITS
                    let promptText = "";
                    let fieldName = "";

                    switch (subI.customId) {
                        case 'field_user': promptText = "Menciona al nuevo usuario (o ID):"; fieldName = "userId"; break;
                        case 'field_kills': promptText = "Ingresa las Kills (ej: 51k):"; fieldName = "kills"; break;
                        case 'field_region': promptText = "Ingresa la Región (ej: Miami):"; fieldName = "region"; break;
                        case 'field_plat': promptText = "Ingresa la Plataforma (ej: PC):"; fieldName = "platform"; break;
                        case 'field_link': promptText = "Ingresa el Link de Roblox:"; fieldName = "link"; break;
                    }

                    await subI.deferUpdate(); // Acknowledge button click
                    const promptMsg = await message.channel.send({ content: `📝 **Editando ${fieldName}**: ${promptText}` });

                    try {
                        const collected = await message.channel.awaitMessages({
                            filter: m => m.author.id === message.author.id,
                            max: 1,
                            time: 60000,
                            errors: ['time']
                        });

                        const response = collected.first();
                        const value = response.content;

                        // Apply Logic
                        if (fieldName === 'userId') {
                            let uid = value.replace(/[<@!>]/g, '');
                            try {
                                const newMember = await message.guild.members.fetch(uid);
                                editData.userId = uid;
                                editData.discordTag = newMember.displayName;
                            } catch (e) {
                                message.channel.send("⚠️ Usuario no encontrado, guardando ID raw.");
                                editData.userId = uid;
                                editData.discordTag = "Unknown";
                            }
                        } else if (fieldName === 'link') {
                            editData.link = value;
                            const rid = roblox.getUserIdFromLink(value);
                            if (rid) {
                                editData.avatar = await roblox.getAvatarHeadshot(rid);
                            }
                        } else {
                            editData[fieldName] = value;
                        }

                        // Refresh Dashboard
                        await dashboardMsg.edit({ embeds: [generateEmbed()] });

                        // Cleanup
                        await promptMsg.delete().catch(() => { });
                        await response.delete().catch(() => { });

                    } catch (e) {
                        await promptMsg.delete().catch(() => { });
                    }
                });
            });
        }
    },
};

async function updateLeaderboard(client, dbManager, guild, force = false) {
    const TOPS_CHANNEL_ID = '1442105620487602309';
    const topsData = dbManager.read('tops.oneway');
    if (!topsData || !topsData.list) return;

    const channel = guild.channels.cache.get(TOPS_CHANNEL_ID);
    if (!channel) return;

    const sortedTops = Object.values(topsData.list).sort((a, b) => parseInt(a.rank) - parseInt(b.rank));
    const embeds = [];
    const mapNum = {
        '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒', '5': '𝟓',
        '6': '𝟔', '7': '𝟕', '8': '𝟖', '9': '𝟗', '10': '𝟏𝟎',
        '11': '𝟏𝟏', '12': '𝟏𝟐', '13': '𝟏𝟑', '14': '𝟏𝟒', '15': '𝟏𝟓'
    };

    for (const top of sortedTops) {
        if (parseInt(top.rank) > 15) continue; // Safety Cap

        const usersDB = dbManager.read('users.oneway') || {};
        const userRank = usersDB[top.userId];

        const TIER_MAP = { 'h': 'High', 'm': 'Mid', 'l': 'Low', 'H': 'High', 'M': 'Mid', 'L': 'Low' };
        const SUBTIER_MAP = { 's': 'Strong', 't': 'Stable', 'w': 'Weak', 'S': 'Strong', 'T': 'Stable', 'W': 'Weak' };

        let tRaw = userRank && userRank.tier ? userRank.tier.toString() : '';
        let sRaw = userRank && userRank.subtier ? userRank.subtier.toString() : '';

        let tVal = TIER_MAP[tRaw] || TIER_MAP[tRaw.toUpperCase()] || tRaw;
        let sVal = SUBTIER_MAP[sRaw] || SUBTIER_MAP[sRaw.toUpperCase()] || sRaw;

        const rankStr = userRank ? `Phase ${userRank.phase} ${tVal} ${sVal}` : "N/A";

        const fancyNum = mapNum[top.rank] || top.rank;
        const name = top.discordTag || "Vacío";
        const title = `${fancyNum}. ${name} ┃ ${top.userId ? `<@${top.userId}>` : "Vacío"}`;

        const embed = new EmbedBuilder()
            .setDescription(
                `**${title}**\n` +
                `━━━━━✥┃・𝐈𝐧𝐟𝐨/𝐩𝐡・┃✥━━━━━\n` +
                `・𝑹𝒂𝒏𝒌: **${rankStr}**\n` +
                `・𝑲𝒊𝒍𝒍𝒔: **${top.kills || 'N/A'}**\n` +
                `・𝑷𝒆𝒓𝒇𝒊𝒍: [Roblox Profile](${top.link || '#'})\n` +
                `━━━━━✥┃・𝐑𝐄𝐆𝐈𝐎𝐍・┃✥━━━━━\n` +
                `・ ${top.region || 'N/A'}\n` +
                `━━━━━✥┃・𝐄𝐱𝐭𝐫𝐚・┃✥━━━━━\n` +
                `𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎: **${top.platform || 'PC'}**`
            )
            .setColor(0x000000);

        if (top.avatar) embed.setThumbnail(top.avatar);

        embeds.push(embed);
    }
    // --- CHUNKING LOGIC (Max 10 per message) ---
    const chunks = [];
    for (let i = 0; i < embeds.length; i += 10) {
        chunks.push(embeds.slice(i, i + 10));
    }

    try {
        // 1. Cleanup Old Messages
        // Support legacy 'messageId' (string) and new 'messageIds' (array)
        const oldIds = [];
        if (topsData.messageIds && Array.isArray(topsData.messageIds)) {
            oldIds.push(...topsData.messageIds);
        } else if (topsData.messageId) {
            oldIds.push(topsData.messageId);
        }

        if (force || oldIds.length !== chunks.length) {
            // If forcing OR number of messages changed, delete all old and send fresh
            for (const id of oldIds) {
                try {
                    const msg = await channel.messages.fetch(id);
                    if (msg) await msg.delete();
                } catch (e) { }
            }
            topsData.messageIds = []; // Clear DB ref
            topsData.messageId = null; // Clear legacy

            // Send New
            const newIds = [];
            for (let i = 0; i < chunks.length; i++) {
                const content = i === 0 ? "# 🏆 ONE WAY TOP PLAYERS" : ""; // Title only on first msg
                const msg = await channel.send({ content: content, embeds: chunks[i] });
                newIds.push(msg.id);
            }
            topsData.messageIds = newIds;
            dbManager.write('tops.oneway', topsData);
            return;
        }

        // 2. Edit Existing (If counts match)
        // We assume oldIds.length === chunks.length here
        const newIds = [];
        let rebuild = false;

        for (let i = 0; i < chunks.length; i++) {
            const msgId = oldIds[i];
            try {
                const msg = await channel.messages.fetch(msgId);
                const content = i === 0 ? "# 🏆 ONE WAY TOP PLAYERS" : "";
                await msg.edit({ content: content, embeds: chunks[i] });
                newIds.push(msg.id);
            } catch (e) {
                // message deleted? Trigger full rebuild next time or now?
                // Let's force rebuild now to be safe
                console.log(`Top Message ${msgId} missing. Rebuilding all.`);
                rebuild = true;
                break;
            }
        }

        if (rebuild) {
            // Delete what we can of the old ones
            for (const id of oldIds) {
                try { (await channel.messages.fetch(id)).delete(); } catch (e) { }
            }
            // Send New
            const finalIds = [];
            for (let i = 0; i < chunks.length; i++) {
                const content = i === 0 ? "# 🏆 ONE WAY TOP PLAYERS" : "";
                const msg = await channel.send({ content: content, embeds: chunks[i] });
                finalIds.push(msg.id);
            }
            topsData.messageIds = finalIds;
            topsData.messageId = null;
            dbManager.write('tops.oneway', topsData);
        }

    } catch (e) {
        console.error(e);
    }
}

module.exports.updateLeaderboard = updateLeaderboard;
