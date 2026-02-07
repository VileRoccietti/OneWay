const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ComponentType,
    Colors
} = require('discord.js');
const roblox = require('../utils/roblox');
const config = require('../config.json');

// --- HELPER: FORMAT RANK ---
const TIER_MAP = { 'H': 'High', 'M': 'Mid', 'L': 'Low', 'h': 'High', 'm': 'Mid', 'l': 'Low' };
const SUBTIER_MAP = { 'S': 'Strong', 'T': 'Stable', 'W': 'Weak', 's': 'Strong', 't': 'Stable', 'w': 'Weak' };
function getFullRank(p, t, s) {
    if (!p) return "Unranked";
    return `Phase ${p} ${TIER_MAP[t] || t} ${SUBTIER_MAP[s] || s}`;
}

module.exports = {
    name: 'profile',
    aliases: ['edit', 'manage'],
    description: 'Master Admin: Editor Completo de Usuario (Line, Top, Rank)',
    async execute(message, args, { dbManager }) {
        const settings = dbManager.read('settings.oneway');
        const hasPerm = message.author.id === message.guild.ownerId || (settings?.roles?.staff && message.member.roles.cache.has(settings.roles.staff)) || message.member.permissions.has('Administrator');

        if (!hasPerm) return message.reply("⛔ Requiere Staff.");

        // --- TARGET RESOLUTION ---
        let target = message.mentions.members.first();
        if (!target) {
            const idArg = args.find(arg => arg.match(/^\d{17,19}$/));
            if (idArg) { try { target = await message.guild.members.fetch(idArg); } catch (e) { } }
        }
        if (!target) return message.reply("⚠️ Debes mencionar a un usuario o dar su ID.\nUso: `.edit @User` o `.edit <ID>`");

        // --- LOAD DATA ---
        const users = dbManager.read('users.oneway') || {};
        if (!users[target.id]) users[target.id] = {};
        let userData = users[target.id];

        const tops = dbManager.read('tops.oneway') || { list: {} };
        // Check if in top
        let topSlot = null;
        for (const [slot, data] of Object.entries(tops.list)) {
            if (data.userId === target.id) {
                topSlot = slot;
                break;
            }
        }

        // --- UI GENERATORS ---
        const getHomeEmbed = () => {
            const rankStr = getFullRank(userData.phase, userData.tier, userData.subtier);
            const topStr = topSlot ? `🏆 Top ${topSlot}` : "❌ Not in Top";
            const featsCount = Array.isArray(userData.feats) ? userData.feats.length : (userData.feats ? userData.feats.split('\n').length : 0);

            return new EmbedBuilder()
                .setTitle(`🛠️ MASTER PROFILE: ${target.displayName}`)
                .setDescription(`**ID:** \`${target.id}\`\n**Estado:** Editando perfil completo.`)
                .addFields(
                    { name: '📊 TSBL Rank', value: rankStr, inline: true },
                    { name: '🏆 Top Status', value: topStr, inline: true },
                    { name: '👤 Nickname', value: target.displayName, inline: true },
                    { name: '⚔️ Combat Stats', value: `Kills: ${userData.kills || 'N/A'}\nRegion: ${userData.region || 'N/A'}\nPlat: ${userData.platform || 'N/A'}`, inline: false },
                    { name: '📜 Feats', value: `${featsCount} Registrados`, inline: true },
                    { name: '🔗 Roblox', value: userData.link || 'Unlinked', inline: true }
                )
                .setThumbnail(userData.avatar || target.user.displayAvatarURL())
                .setColor(0x5865F2) // Blurple
                .setTimestamp();
        };

        const getMenuRow = () => {
            return new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('master_menu')
                    .setPlaceholder('📂 Selecciona Categoría a Editar...')
                    .addOptions([
                        { label: 'Información General', description: 'Region, Kills, Plataforma, Link', value: 'cat_general', emoji: '📝' },
                        { label: 'Rango & Phase', description: 'Phase, Tier, Subtier + Auto Roles', value: 'cat_rank', emoji: '📊' },
                        { label: 'Gestión de Tops', description: 'Asignar/Quitar Slot de Top', value: 'cat_top', emoji: '🏆' },
                        { label: 'Identidad & Nick', description: 'Forzar Nickname Formateado', value: 'cat_identity', emoji: '👤' },
                        { label: 'Logros / Feats', description: 'Añadir/Quitar Logros', value: 'cat_feats', emoji: '📜' },
                    ])
            );
        };

        const mainMsg = await message.reply({ embeds: [getHomeEmbed()], components: [getMenuRow()] });
        const collector = mainMsg.createMessageComponentCollector({ time: 600000 }); // 10 mins

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) return i.reply({ content: "No.", ephemeral: true });

            // --- NAVIGATION ---
            if (i.componentType === ComponentType.StringSelect) {
                const selection = i.values[0];

                if (selection === 'cat_general') {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_kills').setLabel('Kills').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('btn_region').setLabel('Region').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('btn_plat').setLabel('Platform').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('btn_link').setLabel('Roblox Link').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('btn_back').setLabel('🔙 Volver').setStyle(ButtonStyle.Danger)
                    );
                    await i.update({ embeds: [getHomeEmbed().setDescription("📝 **Modo Edición: General**\nSelecciona el campo a modificar.")], components: [row] });
                }

                else if (selection === 'cat_rank') {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_phase').setLabel('Phase (0-5)').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('btn_tier').setLabel('Tier (H/M/L)').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('btn_sub').setLabel('Sub (S/T/W)').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('btn_apply_roles').setLabel('✅ Aplicar Roles').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('btn_back').setLabel('🔙').setStyle(ButtonStyle.Danger)
                    );
                    await i.update({ embeds: [getHomeEmbed().setDescription("📊 **Modo Edición: Rango**\nDefine los valores y usa 'Aplicar Roles'.")], components: [row] });
                }

                else if (selection === 'cat_top') {
                    // Show current top status
                    const topInfo = topSlot ? `Actualmente **Top ${topSlot}**` : "No está en el Top.";
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_set_top').setLabel('🏆 Asignar Slot (1-10)').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('btn_remove_top').setLabel('🗑️ Quitar de Top').setStyle(ButtonStyle.Danger).setDisabled(!topSlot),
                        new ButtonBuilder().setCustomId('btn_back').setLabel('🔙').setStyle(ButtonStyle.Secondary)
                    );
                    await i.update({ embeds: [getHomeEmbed().setDescription(`🏆 **Gestión de Tops**\n${topInfo}`)], components: [row] });
                }

                else if (selection === 'cat_identity') {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_fix_nick').setLabel('✨ Auto-Fix Nickname').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('btn_custom_nick').setLabel('✏️ Custom Nick').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('btn_back').setLabel('🔙').setStyle(ButtonStyle.Danger)
                    );
                    await i.update({ embeds: [getHomeEmbed().setDescription("👤 **Identidad**\nEl Auto-Fix usará el formato `Name (P#)`.")], components: [row] });
                }

                else if (selection === 'cat_feats') {
                    // List 5 feats
                    let feats = Array.isArray(userData.feats) ? userData.feats : (userData.feats ? userData.feats.split('\n') : []);
                    const preview = feats.slice(0, 5).map(f => `> ${f}`).join('\n') || "Ninguno";
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_add_feat').setLabel('➕ Añadir Feat').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('btn_clear_feats').setLabel('🗑️ Limpiar Todo').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('btn_back').setLabel('🔙').setStyle(ButtonStyle.Secondary)
                    );
                    await i.update({ embeds: [getHomeEmbed().setDescription(`📜 **Gestión de Feats**\nÚltimos 5:\n${preview}`)], components: [row] });
                }
            }

            // --- BUTTON ACTIONS ---
            if (i.componentType === ComponentType.Button) {
                if (i.customId === 'btn_back') {
                    await i.update({ embeds: [getHomeEmbed()], components: [getMenuRow()] });
                    return;
                }

                // --- GENERAL ---
                if (['btn_kills', 'btn_region', 'btn_plat', 'btn_link'].includes(i.customId)) {
                    await promptInput(i, message, target, userData, i.customId.replace('btn_', ''), dbManager);
                    // Refresh current view (General)
                    // We need to know context. Hacky: Just refresh home.
                    await mainMsg.edit({ embeds: [getHomeEmbed()] });
                    return;
                }

                // --- FEATS ---
                if (i.customId === 'btn_add_feat') {
                    await promptInput(i, message, target, userData, 'feat_add', dbManager);
                    await mainMsg.edit({ embeds: [getHomeEmbed()] });
                    return;
                }
                if (i.customId === 'btn_clear_feats') {
                    userData.feats = [];
                    dbManager.write('users.oneway', users);
                    await i.reply({ content: "✅ Feats limpiados.", ephemeral: true });
                    await mainMsg.edit({ embeds: [getHomeEmbed()] });
                    return;
                }

                // --- RANK ---
                if (['btn_phase', 'btn_tier', 'btn_sub'].includes(i.customId)) {
                    await promptInput(i, message, target, userData, i.customId.replace('btn_', ''), dbManager);
                    await mainMsg.edit({ embeds: [getHomeEmbed()] });
                    return;
                }
                if (i.customId === 'btn_apply_roles') {
                    await i.deferUpdate();
                    await applyRoles(message, target, userData, config);
                    await i.followUp({ content: "✅ Roles sincronizados con la database.", ephemeral: true });
                    return;
                }

                // --- IDENTITY ---
                if (i.customId === 'btn_fix_nick') {
                    const phase = userData.phase || '0';
                    const oldNick = target.displayName;
                    const cleanName = oldNick.replace(/\s*\(P\d+\)$/, '').replace(/^\[.*?\]\s*/, '');
                    const newNick = `${cleanName} (P${phase})`;
                    try {
                        await target.setNickname(newNick);
                        await i.reply({ content: `✅ Nickname actualizado: \`${newNick}\``, ephemeral: true });
                        await mainMsg.edit({ embeds: [getHomeEmbed()] });
                    } catch (e) { i.reply({ content: "❌ Error de permisos.", ephemeral: true }); }
                    return;
                }
                if (i.customId === 'btn_custom_nick') {
                    await promptInput(i, message, target, userData, 'nickname', dbManager);
                    await mainMsg.edit({ embeds: [getHomeEmbed()] });
                    return;
                }

                // --- TOP ---
                if (i.customId === 'btn_remove_top') {
                    if (topSlot) {
                        tops.list[topSlot] = {
                            userId: null, discordTag: "Vacio", kills: "N/A",
                            region: "N/A", platform: "N/A", link: "N/A", avatar: null, rank: topSlot
                        };
                        dbManager.write('tops.oneway', tops);
                        topSlot = null; // Update local state
                        await i.reply({ content: "✅ Removido del Top.", ephemeral: true });
                        await mainMsg.edit({ embeds: [getHomeEmbed()] });
                    }
                    return;
                }
                if (i.customId === 'btn_set_top') {
                    await promptInput(i, message, target, userData, 'top_slot', dbManager, tops);
                    // Reload top slot status
                    for (const [slot, data] of Object.entries(tops.list)) {
                        if (data.userId === target.id) { topSlot = slot; break; }
                    }
                    await mainMsg.edit({ embeds: [getHomeEmbed()] });
                    return;
                }
            }
        });
    }
};

// --- HELPER FUNCTIONS ---

async function promptInput(interaction, message, target, userData, field, dbManager, topsData = null) {
    let promptText = "";
    switch (field) {
        case 'kills': promptText = "Ingresa Kills (ej: 42k):"; break;
        case 'region': promptText = "Ingresa Región (ej: NA East):"; break;
        case 'plat': promptText = "Ingresa Plataforma (PC/Mobile):"; field = "platform"; break;
        case 'link': promptText = "Ingresa Link de Roblox (Actualiza Avatar):"; break;
        case 'phase': promptText = "Phase (0-5):"; break;
        case 'tier': promptText = "Tier (High/Mid/Low):"; break;
        case 'sub': promptText = "Subtier (Strong/Stable/Weak):"; field = "subtier"; break;
        case 'feat_add': promptText = "Escribe el logro:"; break;
        case 'nickname': promptText = "Nuevo Nickname:"; break;
        case 'top_slot': promptText = "Número de Slot (1-10):"; break;
    }

    await interaction.deferUpdate();
    const promptMsg = await message.channel.send(`✍️ **Editando ${field}:** ${promptText}`);

    try {
        const collected = await message.channel.awaitMessages({ filter: m => m.author.id === message.author.id, max: 1, time: 60000, errors: ['time'] });
        const val = collected.first().content;

        // LOGIC
        if (field === 'link') {
            userData.link = val;
            const rid = roblox.getUserIdFromLink(val);
            if (rid) userData.avatar = await roblox.getAvatarHeadshot(rid);
        }
        else if (field === 'feat_add') {
            // Ensure Array
            let currentFeats = Array.isArray(userData.feats) ? userData.feats : (userData.feats ? userData.feats.split('\n') : []);
            currentFeats.push(val);
            userData.feats = currentFeats;
        }
        else if (field === 'nickname') {
            await target.setNickname(val).catch(() => message.channel.send("❌ Error permisos Nick."));
        }
        else if (field === 'top_slot') {
            const slot = val;
            if (!['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].includes(slot)) {
                message.channel.send("❌ Slot inválido (1-10).");
            } else {
                // Clear old slot if exists
                for (const [s, data] of Object.entries(topsData.list)) {
                    if (data.userId === target.id) {
                        topsData.list[s] = { userId: null, discordTag: "Vacio", rank: s, kills: "N/A", region: "N/A", platform: "N/A", link: "N/A", avatar: null };
                    }
                }
                // Assign new
                topsData.list[slot] = {
                    userId: target.id,
                    discordTag: target.displayName,
                    kills: userData.kills || "N/A",
                    region: userData.region || "N/A",
                    platform: userData.platform || "N/A",
                    link: userData.link || "N/A",
                    avatar: userData.avatar || target.user.displayAvatarURL(),
                    rank: slot,
                    updatedAt: Date.now()
                };
                dbManager.write('tops.oneway', topsData);
                message.channel.send(`✅ Asignado al Top ${slot}.`);
            }
        }
        else {
            userData[field] = val;
        }

        // SAVE USER DATA
        dbManager.write('users.oneway', dbManager.read('users.oneway')); // write the reference we modified

        await promptMsg.delete().catch(() => { });
        await collected.first().delete().catch(() => { });

    } catch (e) {
        await promptMsg.delete().catch(() => { });
    }
}

async function applyRoles(message, target, userData, config) {
    if (!userData.phase) return;
    const phase = userData.phase;
    const tier = userData.tier ? userData.tier.toLowerCase() : null;
    const sub = userData.subtier ? userData.subtier.toLowerCase() : null;

    // Use full map from config logic if possible, simplified here
    const phaseId = config.phaseRoles[phase];
    const tierId = config.tierRoles[tier];
    const subId = config.subTierRoles[sub];

    const allRankRoles = [
        ...Object.values(config.phaseRoles),
        ...Object.values(config.tierRoles),
        ...Object.values(config.subTierRoles)
    ];

    const toRemove = target.roles.cache.filter(r => allRankRoles.includes(r.id) && r.id !== phaseId && r.id !== tierId && r.id !== subId);
    if (toRemove.size > 0) await target.roles.remove(toRemove);

    const toAdd = [];
    if (phaseId) toAdd.push(phaseId);
    if (tierId) toAdd.push(tierId);
    if (subId) toAdd.push(subId);
    if (toAdd.length > 0) await target.roles.add(toAdd);
}
