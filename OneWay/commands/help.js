const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    name: 'help',
    description: 'Muestra el menú de ayuda profesional',
    async execute(message, args, { dbManager }) {
        console.log(`[DEBUG] .help executed by: ${message.author.tag} | Message ID: ${message.id}`);
        const client = message.client;

        const embed = new EmbedBuilder()
            .setTitle('📖 ONE WAY SYSTEM V4.0')
            .setDescription("*Plataforma de Gestión Competitiva de Alto Nivel*")
            .setColor(0x2B2D31)
            .setThumbnail(message.guild.iconURL({ dynamic: true }))
            .addFields(
                {
                    name: '🏆 TOP PLAYERS SYSTEM', value:
                        "```ini\n" +
                        "[ .top manage ] 🛠️ Panel de Control Tops (1-15)\n" +
                        "[ .top publish ] 📢 Publicar Embed (Forzar)\n" +
                        "[ .top add @User <Slot> ] Insertar (Desplaza abajo)\n" +
                        "[ .top remove <Slot> ] Eliminar (Desplaza arriba)\n" +
                        "[ .top move <A> <B> ] ↔ Intercambiar Slot\n" +
                        "> Abre menú visual para editar\n" +
                        "> posiciones y avatares.\n" +
                        "```"
                },
                {
                    name: '☠️ TOP KILLS SYSTEM', value:
                        "```ini\n" +
                        "[ .topkills ] ☠️ Ver Ranking Global\n" +
                        "[ .topkills publish ] 📢 Publicar Embed Oficial\n" +
                        "[ .setkills @User <K> ] Asignar Kills Rápido\n" +
                        "> Se actualiza y ordena automáticamente.\n" +
                        "```"
                },
                {
                    name: '🚩 GESTIÓN DE EVENTOS', value:
                        "```ini\n" +
                        "[ .event <Nombre> ] Crear Zona Temporal\n" +
                        "> Crea Categoría + Chat + Voz\n" +
                        "> Incluye panel de auto-borrado.\n" +
                        "```"
                },
                {
                    name: '🔰 GESTIÓN DE LINEUP', value:
                        "```ini\n" +
                        "[ .line view ] Ver Panel Lineup\n" +
                        "[ .line manage ] 🛠️ Menú de Selección (Todos)\n" +
                        "[ .line move <A> <B> ] ↔ Mover Posición\n" +
                        "[ .line edit @User ] Editor Directo\n" +
                        "[ .line publish ] 📢 Publicar Embeds\n" +
                        "-----------------------------------------\n" +
                        "[ .subline view ] Ver Panel Sub-Line\n" +
                        "[ .subline manage ] 🛠️ Menú de Selección\n" +
                        "[ .subline move <A> <B> ] ↔ Mover Posición\n" +
                        "[ .subline publish ] 📢 Publicar Embeds\n" +
                        "```"
                },
                {
                    name: '🛡️ ADMIN & REPUTACIÓN', value:
                        "```ini\n" +
                        "[ .profile / .edit @User ] Master Editor (🔥)\n" +
                        "[ .strikes add/view @User ] Gestión de Faltas\n" +
                        "[ .feats add/view @User ] Gestión de Logros\n" +
                        "[ .blacklist add <ID/User> ] Banear + DB\n" +
                        "[ .phase 1 high strong @U ] Asignar Rango TSBL\n" +
                        "[ .ban/kick @User ] Moderación Básica\n" +
                        "[ .setup ] Configuración de Roles\n" +
                        "```"
                }
            )
            .setFooter({ text: 'One Way • Developed by Antigravity', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }
};
