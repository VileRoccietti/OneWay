const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ComponentType
} = require('discord.js');

module.exports = {
    name: 'war',
    description: 'Inicia una Crew Battle 5v5 (Survivor System)',
    async execute(message, args, { dbManager }) {
        const rivalName = args.join(' ') || "Clan Rival";

        const settings = dbManager.read('settings.oneway');
        if (!settings?.roles?.lineup) return message.reply("⚠️ Configuración incompleta. Usa `.setup` primero.");


        // Fetch Cache quietly
        // await message.guild.members.fetch(); // Removing force fetch to avoid rate limits, assuming intent works.

        const lineupRole = message.guild.roles.cache.get(settings.roles.lineup);
        const subRole = message.guild.roles.cache.get(settings.roles.sublineup);

        let eligible = new Map();
        if (lineupRole) lineupRole.members.forEach(m => eligible.set(m.id, m));
        if (subRole) subRole.members.forEach(m => eligible.set(m.id, m));

        if (eligible.size < 5) return message.reply(`⚠️ No hay suficientes miembros en Lineup/Sub (Mínimo 5). Encontrados: ${eligible.size}`);

        const selectOptions = Array.from(eligible.values()).map(m => ({
            label: m.displayName,
            value: m.id,
            description: m.user.tag.slice(0, 50)
        })).slice(0, 25);

        const rowSelect = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_roster')
                .setPlaceholder('📋 Selecciona los 5 Jugadores (En Orden)')
                .setMinValues(5)
                .setMaxValues(5)
                .addOptions(selectOptions)
        );

        const setupMsg = await message.channel.send({
            content: "⚔️ **SETUP CREW BATTLE**",
            components: [rowSelect]
        });

        const filter = i => i.user.id === message.author.id;
        try {
            const selection = await setupMsg.awaitMessageComponent({ filter, componentType: ComponentType.StringSelect, time: 60000 });

            const selectedIds = selection.values;
            const roster = selectedIds.map(id => ({
                id,
                name: eligible.get(id).displayName,
                alive: true
            }));

            let hostLives = 5;
            let rivalLives = 5;
            let currentIndex = 0;

            const updateBattleEmbed = () => {
                const currentFighter = roster[currentIndex];
                const fighterStatus = roster.map((p, i) => {
                    if (i < currentIndex) return `⚫ ~~${p.name}~~`;
                    if (i === currentIndex) return `⚔️ **${p.name}**`;
                    return `⚪ ${p.name}`;
                }).join('\n');

                const heartsHost = '🟦'.repeat(hostLives) + '⚫'.repeat(5 - hostLives);
                const heartsRival = '🟥'.repeat(rivalLives) + '⚫'.repeat(5 - rivalLives);

                return new EmbedBuilder()
                    .setTitle(`⚔️ WAR: ONE WAY vs ${rivalName.toUpperCase()}`)
                    .setDescription(`**SURVIVOR 5v5**\n\n**Marcador Global**\n${heartsHost} **${hostLives}** - **${rivalLives}** ${heartsRival}`)
                    .addFields(
                        { name: '🛡️ One Way Team', value: fighterStatus, inline: true },
                        { name: `🗡️ ${rivalName}`, value: `*Esperando oponente...*`, inline: true }
                    )
                    .setColor(0x8B0000) // Dark Red
                    .setThumbnail(message.guild.iconURL())
                    .setFooter({ text: `Luchando Ahora: ${currentFighter.name}`, iconURL: message.author.displayAvatarURL() })
                    .setTimestamp();
            };

            const actions = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('win_round').setLabel('Win Round').setEmoji('✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('lose_round').setLabel('Lose Round').setEmoji('❌').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('match_end').setLabel('End War').setEmoji('⏹️').setStyle(ButtonStyle.Secondary)
            );

            await selection.update({ content: "", embeds: [updateBattleEmbed()], components: [actions] });

            const gameCollector = setupMsg.createMessageComponentCollector({ componentType: ComponentType.Button });

            gameCollector.on('collect', async i => {
                if (i.user.id !== message.author.id) return i.reply({ content: "Solo el host controla la war.", ephemeral: true });

                if (i.customId === 'win_round') {
                    rivalLives--;
                    if (rivalLives <= 0) {
                        gameCollector.stop('host_victory');
                        rivalLives = 0;
                    }
                } else if (i.customId === 'lose_round') {
                    hostLives--;
                    if (roster[currentIndex]) roster[currentIndex].alive = false;
                    currentIndex++;
                    if (hostLives <= 0 || currentIndex >= 5) {
                        gameCollector.stop('rival_victory');
                        hostLives = 0;
                    }
                } else if (i.customId === 'match_end') {
                    gameCollector.stop('force_end');
                }

                if (!gameCollector.ended) {
                    await i.update({ embeds: [updateBattleEmbed()] });
                }
            });

            gameCollector.on('end', async (collected, reason) => {
                const finalEmbed = new EmbedBuilder()
                    .setTitle(`🏆 WAR FINALIZED: ${reason === 'host_victory' ? 'ONE WAY WINS' : (reason === 'rival_victory' ? rivalName.toUpperCase() + ' WINS' : 'CANCELLED')}`)
                    .setDescription(`**Final Score:** ${hostLives} - ${rivalLives}`)
                    .setColor(reason === 'host_victory' ? 'Green' : (reason === 'rival_victory' ? 'Red' : 'Grey'))
                    .setTimestamp();

                await setupMsg.edit({ components: [], embeds: [finalEmbed] });

                const wars = dbManager.read('wars.oneway') || [];
                wars.push({
                    type: 'crew_battle',
                    rival: rivalName,
                    score: `${hostLives}-${rivalLives}`,
                    roster: roster,
                    timestamp: Date.now()
                });
                dbManager.write('wars.oneway', wars);
            });

        } catch (e) {
            console.log(e);
            setupMsg.edit({ content: "❌ Tiempo de selección agotado o error.", components: [] });
        }
    }
};
