const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ComponentType
} = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'setup',
    description: 'Panel de Configuración Avanzado (Roles & Sistema)',
    async execute(message, args, { dbManager }) {
        if (message.author.id !== config.ownerId && message.author.id !== message.guild.ownerId) {
            return message.reply("⛔ **Acceso Denegado:** Solo Owner.");
        }

        // --- DASHBOARD GGENERATOR ---
        const generateDashboard = () => {
            const settings = dbManager.read('settings.oneway') || { roles: {} };
            const r = settings.roles || {};

            // Status Icons
            const st = (id) => id ? `✅ <@&${id}>` : "❌ **No Configurado**";

            const embed = new EmbedBuilder()
                .setTitle('⚙️ ONE WAY SYSTEM CONFIGURATION')
                .setDescription("**Panel de Control Principal**\nSelecciona una categoría para editar la configuración del servidor.")
                .addFields(
                    { name: '🛡️ ROLES DE STAFF', value: `Staff (Admin/Mod): ${st(r.staff)}`, inline: false },
                    { name: '🔰 ROLES DE LINEUP', value: `Main Lineup: ${st(r.lineup)}\nSub Lineup: ${st(r.sublineup)}`, inline: false },
                    { name: '🧬 ROLES DE TRYOUT', value: `Tryouter (Access): ${st(r.tryouter)}`, inline: false }
                )
                .setColor(0x2B2D31)
                .setThumbnail(message.guild.iconURL({ dynamic: true }))
                .setFooter({ text: 'Selecciona una opción abajo' });

            return embed;
        };

        const generateMenu = () => {
            return new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('setup_menu')
                    .setPlaceholder('Selecciona Categoría...')
                    .addOptions([
                        { label: 'Configurar Roles Clave', value: 'roles_main', description: 'Lineup, Sub, Staff, Tryouter', emoji: '🛡️' },
                        { label: 'Cerrar Panel', value: 'close_setup', description: 'Guardar y salir', emoji: '❌' }
                    ])
            );
        };

        const msg = await message.reply({ embeds: [generateDashboard()], components: [generateMenu()] });
        const collector = msg.createMessageComponentCollector({ time: 300000 }); // 5 min

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) return i.reply({ content: "⛔", ephemeral: true });

            const val = i.values ? i.values[0] : i.customId;

            if (val === 'close_setup') {
                await i.update({ content: "✅ **Configuración Finalizada.**", components: [], embeds: [generateDashboard()] });
                return collector.stop();
            }

            if (val === 'roles_main') {
                // Show Buttons for specific roles
                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('set_lineup').setLabel('🔰 Main Lineup').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('set_sub').setLabel('🔹 Sub Lineup').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('set_staff').setLabel('🛡️ Staff').setStyle(ButtonStyle.Danger)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('set_tryouter').setLabel('🧬 Tryouter').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('back_home').setLabel('↩️ Volver').setStyle(ButtonStyle.Secondary)
                );

                await i.update({
                    content: "👇 **Selecciona el Rol a configurar:**",
                    embeds: [],
                    components: [row1, row2]
                });
                return;
            }

            if (val === 'back_home') {
                await i.update({ content: null, embeds: [generateDashboard()], components: [generateMenu()] });
                return;
            }

            // --- ROLE SETTERS ---
            const roleKeyMap = {
                'set_lineup': 'lineup',
                'set_sub': 'sublineup',
                'set_staff': 'staff',
                'set_tryouter': 'tryouter'
            };

            const targetKey = roleKeyMap[val];
            if (targetKey) {
                await i.deferUpdate();
                const promptMsg = await message.channel.send(`📝 **Configurando ${val.replace('set_', '').toUpperCase()}:**\nPor favor menciona el rol o pega la ID (tienes 60s).`);

                try {
                    const collected = await message.channel.awaitMessages({
                        filter: m => m.author.id === message.author.id,
                        max: 1,
                        time: 60000,
                        errors: ['time']
                    });

                    const response = collected.first();
                    const role = response.mentions.roles.first();
                    const roleId = role ? role.id : response.content.trim();

                    // Validation
                    if (!/^\d{17,19}$/.test(roleId)) {
                        await message.channel.send("❌ **ID Inválida.** Operación cancelada.");
                    } else {
                        // Save
                        const settings = dbManager.read('settings.oneway') || { roles: {} };
                        if (!settings.roles) settings.roles = {};
                        settings.roles[targetKey] = roleId;
                        dbManager.write('settings.oneway', settings);

                        await message.channel.send(`✅ **Rol Actualizado:** Key \`${targetKey}\` -> <@&${roleId}>`);
                    }

                    // Refresh Main Dashboard
                    await msg.edit({ content: null, embeds: [generateDashboard()], components: [generateMenu()] });

                    // Cleanup
                    await promptMsg.delete().catch(() => { });
                    await response.delete().catch(() => { });

                } catch (e) {
                    await promptMsg.delete().catch(() => { });
                    await message.channel.send("❌ **Tiempo agotado.**");
                    await msg.edit({ content: null, embeds: [generateDashboard()], components: [generateMenu()] });
                }
            }
        });
    }
};
