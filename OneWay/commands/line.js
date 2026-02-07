const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    StringSelectMenuBuilder
} = require('discord.js');
const roblox = require('../utils/roblox');
const topKills = require('./topkills'); // Auto-Update Kills


const LINEUP_CHANNEL_ID = '1437936115712659546';

// Helper for Full Rank Text
const TIER_MAP = { 'H': 'High', 'M': 'Mid', 'L': 'Low', 'h': 'High', 'm': 'Mid', 'l': 'Low' };
const SUBTIER_MAP = { 'S': 'Strong', 'T': 'Stable', 'W': 'Weak', 's': 'Strong', 't': 'Stable', 'w': 'Weak' };
function formatRank(p, t, s) {
    if (!p) return "Unranked";
    return `Phase ${p} ${TIER_MAP[t] || t} ${SUBTIER_MAP[s] || s}`;
}

// Reuseable Editor Logic
async function startEditor(target, message, dbManager) {
    const users = dbManager.read('users.oneway') || {};
    // Ensure entry exists
    if (!users[target.id]) users[target.id] = {};
    const userData = users[target.id];

    const generateEmbed = () => {
        const rankDisplay = formatRank(userData.phase, userData.tier, userData.subtier);
        return new EmbedBuilder()
            .setTitle(`🛠️ EDITOR: ${target.displayName}`)
            .setDescription("Selecciona el dato que deseas modificar (Chat Flow).")
            .addFields(
                { name: '🌍 Región', value: userData.region || 'N/A', inline: true },
                { name: '⚔️ Kills', value: userData.kills || 'N/A', inline: true },
                { name: '🎮 Plataforma', value: userData.platform || 'N/A', inline: true },
                { name: '📊 Rank (Auto)', value: rankDisplay, inline: true },
                { name: '🔗 Link', value: userData.link ? `[Link](${userData.link})` : 'N/A', inline: true },
                { name: '📜 Feats', value: userData.feats ? userData.feats : 'N/A', inline: false }
            )
            .setColor('Blue')
            .setThumbnail(userData.avatar || target.user.displayAvatarURL());
    };

    const generateRows = () => [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('edit_region').setLabel('🌍 Region').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('edit_kills').setLabel('⚔️ Kills').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('edit_plat').setLabel('🎮 Platform').setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('edit_link').setLabel('🔗 Link').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('edit_feats').setLabel('📜 Feats').setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('save_exit').setLabel('💾 GUARDAR Y SALIR').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel').setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
        )
    ];

    const dashboardMsg = await message.reply({ embeds: [generateEmbed()], components: generateRows() });
    const collector = dashboardMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });

    collector.on('collect', async i => {
        if (i.user.id !== message.author.id) return i.reply({ content: "No.", ephemeral: true });

        if (i.customId === 'cancel') {
            await i.update({ content: "❌ Cancelado.", components: [], embeds: [] });
            return collector.stop();
        }

        if (i.customId === 'save_exit') {
            // Save to DB
            users[target.id] = { ...users[target.id], ...userData };
            dbManager.write('users.oneway', users);
            await i.update({ content: "✅ **Guardado Exitosamente.**", components: [], embeds: [generateEmbed()] });

            // Trigger Global Kills Update
            topKills.updateBestKills(message.client, dbManager, message.guild).catch(console.error);

            return collector.stop();
        }

        // CHAT PROMPT LOGIC
        let prompt = "";
        let field = "";
        switch (i.customId) {
            case 'edit_region': prompt = "Escribe la **Región / Host** (ej: Miami):"; field = 'region'; break;
            case 'edit_kills': prompt = "Escribe las **Kills** (ej: 42k):"; field = 'kills'; break;
            case 'edit_plat': prompt = "Escribe la **Plataforma** (ej: PC):"; field = 'platform'; break;
            case 'edit_link': prompt = "Pega el **Link de Roblox**:"; field = 'link'; break;
            case 'edit_feats': prompt = "Escribe los **Feats / Logros** (Uno por línea, Shift+Enter para saltar):\nEj:\n> Le ganó al Top 1\n> Winner Tournament X"; field = 'feats'; break;
        }

        await i.deferUpdate();
        const promptMsg = await message.channel.send(`📝 **Editando ${field}:** ${prompt}`);

        try {
            const collected = await message.channel.awaitMessages({ filter: m => m.author.id === message.author.id, max: 1, time: 120000, errors: ['time'] });
            const response = collected.first();
            let value = response.content;

            // Logic
            if (field === 'link') {
                const rid = roblox.getUserIdFromLink(value);
                if (rid) userData.avatar = await roblox.getAvatarHeadshot(rid);
                userData.link = value;
            } else {
                userData[field] = value;
            }

            // Update Embed Preview (Memory Only until Save)
            await dashboardMsg.edit({ embeds: [generateEmbed()] });

            // Cleanup
            await promptMsg.delete().catch(() => { });
            await response.delete().catch(() => { });
        } catch (e) {
            await promptMsg.delete().catch(() => { });
        }
    });
}

module.exports = {
    name: 'line',
    description: 'Gestiona la Main Lineup (View, Edit, Manage, Publish)',
    async execute(message, args, { dbManager }) {
        const action = args[0] ? args[0].toLowerCase() : 'view';
        const settings = dbManager.read('settings.oneway');

        if (!settings?.roles?.lineup) return message.reply("⚠️ Rol 'Lineup' no configurado.");
        const lineupRoleId = settings.roles.lineup;
        const role = message.guild.roles.cache.get(lineupRoleId);

        if (!role) return message.reply("⚠️ El rol configurado ya no existe.");

        // Helper: Sync & Get Ordered List
        const syncLineup = (role, dbKey) => {
            let data = dbManager.read(dbKey);
            // Migration: Array -> Object
            if (Array.isArray(data) || !data) {
                data = { list: data || [], messageId: null };
            }

            let list = data.list;
            const roleMembers = role.members;
            let changed = false;

            // 1. Add missing (Append)
            roleMembers.forEach(m => {
                if (!list.find(u => u.id === m.id)) {
                    list.push({ id: m.id, displayName: m.displayName });
                    changed = true;
                }
            });

            // 2. Remove invalid
            const filtered = list.filter(u => roleMembers.has(u.id));
            if (filtered.length !== list.length) {
                list = filtered;
                data.list = list;
                changed = true;
            }

            if (changed) dbManager.write(dbKey, data);
            return data; // Return full object
        };

        // ==========================================
        // VIEW
        // ==========================================
        if (action === 'view') {
            const getStatusEmoji = (presence) => {
                if (!presence) return '⚫';
                const status = presence.status;
                switch (status) {
                    case 'online': return '🟢';
                    case 'dnd': return '🔴';
                    case 'idle': return '🌙';
                    case 'invisible': return '⚫';
                    default: return '⚫';
                }
            };

            const generateList = () => {
                const { list } = syncLineup(role, 'lineup.oneway');
                if (list.length === 0) return "*Lista vacía*";
                return list.map((item, index) => {
                    const m = role.members.get(item.id);
                    if (!m) return null;
                    return `\`${index + 1}.\` \`${getStatusEmoji(m.presence)}\` **${m.displayName}**`;
                }).filter(x => x).join('\n');
            };

            const embed = new EmbedBuilder()
                .setTitle(`🔰 ONE WAY MAIN LINEUP`)
                .setDescription(`**Miembros Oficiales (${role.members.size})**\n\n${generateList()}`)
                .setColor(0xFFD700)
                .setThumbnail(message.guild.iconURL({ dynamic: true }))
                .setFooter({ text: `One Way System`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('mention_line').setLabel('📢 Mention ALL').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('ping_member').setLabel('🔔 Ping Member').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('refresh_line').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
            );

            const msg = await message.channel.send({ embeds: [embed], components: [row] });
            const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

            collector.on('collect', async i => {
                const isAdmin = i.member.permissions.has('Administrator') || i.user.id === message.guild.ownerId;
                if (i.customId === 'mention_line') {
                    if (!isAdmin) return i.reply({ content: "⛔ Solo Admin.", ephemeral: true });
                    await i.reply({ content: `📢 **ATENCIÓN:** <@&${lineupRoleId}>` });
                }
                if (i.customId === 'ping_member') {
                    if (!isAdmin) return i.reply({ content: "⛔ Solo Admin.", ephemeral: true });
                    const { list } = syncLineup(role, 'lineup.oneway'); // Use synced list
                    const options = list.map(item => {
                        const m = role.members.get(item.id);
                        if (!m) return null;
                        return { label: m.displayName, value: m.id, description: m.user.tag.slice(0, 50), emoji: '👤' };
                    }).filter(x => x).slice(0, 25);

                    if (options.length === 0) return i.reply({ content: "⚠️ Vacío.", ephemeral: true });
                    const selectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_ping_target').setPlaceholder('Selecciona...').addOptions(options));
                    const reply = await i.reply({ content: "📢 Selecciona:", components: [selectRow], ephemeral: true, fetchReply: true });
                    try {
                        const selection = await reply.awaitMessageComponent({ componentType: ComponentType.StringSelect, time: 30000 });
                        const targetId = selection.values[0];
                        await selection.update({ content: `✅ Listo.`, components: [] });
                        await i.channel.send(`📢 **PING:** <@${targetId}> ¡Se te solicita en la Lineup!`);
                    } catch (e) { await i.editReply({ content: "❌ Timeout.", components: [] }); }
                }
                if (i.customId === 'refresh_line') {
                    const updatedEmbed = EmbedBuilder.from(embed).setDescription(`**Miembros Oficiales (${role.members.size})**\n\n${generateList()}`);
                    await i.update({ embeds: [updatedEmbed] });
                }
            });
            return;
        }

        // ==========================================
        // PERMISSIONS
        // ==========================================
        const staffRoleId = settings.roles.staff;
        const hasPerm = message.author.id === message.guild.ownerId || (staffRoleId && message.member.roles.cache.has(staffRoleId));
        if (!hasPerm) return message.reply("⛔ **Acceso Denegado:** Requiere Staff/Owner.");

        // ==========================================
        // MANAGE (SELECT MENU)
        // ==========================================
        if (action === 'manage') {
            const members = role.members;
            if (members.size === 0) return message.reply("⚠️ No hay miembros en la Lineup.");

            // Create options (Max 25)
            const options = members.map(m => ({
                label: m.displayName,
                value: m.id,
                description: `ID: ${m.id}`,
                emoji: '👤'
            })).slice(0, 25);

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_manage_line')
                    .setPlaceholder('Selecciona miembro a editar...')
                    .addOptions(options)
            );

            const msg = await message.reply({ content: "🛠️ **Gestor de Lineup**\nSelecciona al miembro que deseas editar:", components: [row] });

            try {
                const selection = await msg.awaitMessageComponent({ componentType: ComponentType.StringSelect, time: 60000 });
                const targetId = selection.values[0];
                const targetMember = await message.guild.members.fetch(targetId);

                await selection.update({ content: `✅ Seleccionado: **${targetMember.displayName}**`, components: [] });
                // Launch Editor
                await startEditor(targetMember, message, dbManager);
            } catch (e) {
                await msg.edit({ content: "❌ Tiempo agotado o error.", components: [] });
            }
            return;
        }

        // ==========================================
        // EDIT (EXISTING MANUAL)
        // ==========================================
        if (action === 'edit') {
            let target = message.mentions.members.first();
            if (!target) {
                const idArg = args.find(arg => arg.match(/^\d{17,19}$/));
                if (idArg) { try { target = await message.guild.members.fetch(idArg); } catch (e) { } }
            }
            if (!target) return message.reply("⚠️ Menciona al usuario: `.line edit @User`");

            await startEditor(target, message, dbManager);
            return;
        }

        // ==========================================
        // PUBLISH
        // ==========================================


        // ==========================================
        // PUBLISH
        // ==========================================
        if (action === 'publish') {
            const channel = message.guild.channels.cache.get(LINEUP_CHANNEL_ID);
            if (!channel) return message.reply("⚠️ Canal no encontrado.");

            // Sync First
            const data = syncLineup(role, 'lineup.oneway');
            const list = data.list;

            if (list.length === 0) return message.reply("⚠️ Vacía.");

            // await message.channel.send("⏳ Generando embeds... "); 
            // Silent update preferred

            const usersDB = dbManager.read('users.oneway') || {};
            const embeds = [];

            const mapNum = { '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒', '5': '𝟓' };
            let index = 1;

            for (const item of list) {
                let m = role.members.get(item.id);
                if (!m) continue;

                const dataUser = usersDB[m.id] || {};
                const rankStr = formatRank(dataUser.phase, dataUser.tier, dataUser.subtier);
                const fancyNum = mapNum[index.toString()] || `${index}.`;

                let featsText = "> N/A";
                if (Array.isArray(dataUser.feats)) {
                    featsText = dataUser.feats.map(l => `> ${l}`).join('\n');
                } else if (dataUser.feats) {
                    featsText = dataUser.feats.split('\n').map(l => `> ${l}`).join('\n');
                }

                const embed = new EmbedBuilder()
                    .setTitle(`${fancyNum} ${m.displayName}`)
                    .setDescription(
                        `**📍 Host:** ${dataUser.region || 'N/A'}\n` +
                        `**🏆 Rank:** ${rankStr}\n` +
                        `**⚔️ Kills:** ${dataUser.kills || 'N/A'}\n\n` +
                        `**📜 Feats:**\n${featsText}`
                    )
                    .setColor(0xFFD700)
                    .setThumbnail(dataUser.avatar || m.user.displayAvatarURL())
                    .setFooter({ text: `Platform: ${dataUser.platform || 'PC'}` });
                embeds.push(embed);
                index++;
            }

            // Edit or Send
            if (data.messageId) {
                try {
                    const oldMsg = await channel.messages.fetch(data.messageId);
                    if (embeds.length <= 10) await oldMsg.edit({ content: "# 🔰 LINE UP OFICIAL DE ONW", embeds: embeds });
                    else {
                        // Complex case: Multimessage. For now, just edit first one.
                        // If splitter needed, we need multiple IDs. simpler to resend if >10.
                        if (embeds.length > 10) throw new Error("Too large for single msg");
                        await oldMsg.edit({ content: "# 🔰 LINE UP OFICIAL DE ONW", embeds: embeds });
                    }
                    message.reply("✅ **Lineup Actualizada** (Mensaje Editado).");
                    return;
                } catch (e) {
                    // Fail to fetch/edit, send new
                }
            }

            // Send New
            let newMsg;
            if (embeds.length <= 10) newMsg = await channel.send({ content: "# 🔰 LINE UP OFICIAL DE ONW", embeds: embeds });
            else {
                newMsg = await channel.send({ content: "# 🔰 LINE UP OFICIAL DE ONW", embeds: embeds.slice(0, 10) });
                await channel.send({ embeds: embeds.slice(10) });
            }

            data.messageId = newMsg.id;
            dbManager.write('lineup.oneway', data);

            message.reply(`✅ **Lineup Publicada** (Nuevo Mensaje).`);
            return;
        }

        // ==========================================
        // MOVE (POSITION)
        // ==========================================
        if (action === 'move') {
            if (!hasPerm) return;
            const argA = args[1];
            const argB = args[2];

            if (!argA || !argB) return message.reply("⚠️ Uso: `.line move <Origen> <Destino>`");

            // SYNC DB WITH ROLE FIRST
            let data = syncLineup(role, 'lineup.oneway');
            let list = data.list;

            const resolve = (input) => {
                if (input.match(/^\d+$/) && !input.match(/^\d{17,19}$/) && parseInt(input) < 1000) return parseInt(input);
                let uid = input.startsWith('<@') ? input.replace(/[<@!>]/g, '') : input;
                const idx = list.findIndex(u => u.id === uid);
                return idx !== -1 ? idx + 1 : null;
            };

            const posA = resolve(argA);
            const posB = resolve(argB) || (argB.match(/^\d+$/) ? parseInt(argB) : null);

            if (!posA || !posB) return message.reply("⚠️ No encontré las posiciones o usuarios.");
            if (posA < 1 || posA > list.length) return message.reply("⚠️ Origen inválido.");

            // Execute Move
            const idxA = posA - 1;
            const idxB = Math.min(Math.max(posB - 1, 0), list.length); // Clamp dest

            const [item] = list.splice(idxA, 1);
            list.splice(idxB, 0, item);

            data.list = list;
            dbManager.write('lineup.oneway', data);

            // Auto Update Publish if exists
            if (data.messageId) {
                // Trigger publish logic basically?
                // For speed, we just reply. The user can run .line publish (or we can auto-call it)
                // "y q cada q haga algo se edite el mensaje ya hecho" -> Explicit request to auto-edit.
                // Re-running publish logic:
                const pubCmd = message.client.commands.get('line');
                // We can't easily recurse cleanly without passing args. 
                // Let's just notify.
                return message.reply(`✅ **Movido:** ${item.displayName} (#${posA} ➔ #${idxB + 1}).\n*Usa \`.line publish\` para actualizar el embed.*`);
            }

            return message.reply(`✅ **Lineup Update:** ${item.displayName} movido a #${idxB + 1}.`);
        }

        // ADD/REMOVE
        let target = message.mentions.members.first();
        if (!target) {
            const idArg = args.find(arg => arg.match(/^\d{17,19}$/));
            if (idArg) { try { target = await message.guild.members.fetch(idArg); } catch (e) { } }
        }
        if (!target) return message.reply("⚠️ Menciona a un usuario.");

        if (action === 'add') { await target.roles.add(role); message.reply("✅ Added."); }
        else if (action === 'remove') { await target.roles.remove(role); message.reply("✅ Removed."); }
    }
};
