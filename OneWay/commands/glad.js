const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'glad',
    description: 'Inicia un 1v1 competitivo',
    async execute(message, args, { dbManager, CHANNELS }) {
        let opponent = message.mentions.users.first();
        if (!opponent) {
            const idArg = args[0];
            if (idArg && idArg.match(/^\d{17,19}$/)) {
                try { opponent = await message.client.users.fetch(idArg); } catch (e) { }
            }
        }
        if (!opponent) return message.reply("⚠️ Debes mencionar a un oponente o usar su ID. Uso: `.glad @user/ID`");

        const guild = message.guild;
        const category = message.channel.parent;

        // Create temp channel
        const channelName = `glad-${message.author.username}-vs-${opponent.username}`;

        try {
            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionsBitField.Flags.ViewChannel],
                    },
                    {
                        id: message.author.id,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                    },
                    {
                        id: opponent.id,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                    },
                ],
            });

            message.reply(`✅ **Glad Iniciado:** <#${channel.id}>`);

            // Initialize Controls
            let strikes = { [message.author.id]: 0, [opponent.id]: 0 };
            let timer = null;

            const updateEmbed = () => {
                return new EmbedBuilder()
                    .setTitle('⚔️ 1v1 GLADIATOR')
                    .setDescription(`**${message.author.username}** vs **${opponent.username}**`)
                    .addFields(
                        { name: `${message.author.username}`, value: `${'⚠️'.repeat(strikes[message.author.id]) || 'Sin Strikes'}`, inline: true },
                        { name: `${opponent.username}`, value: `${'⚠️'.repeat(strikes[opponent.id]) || 'Sin Strikes'}`, inline: true }
                    )
                    .setColor('Gold');
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('strike_p1').setLabel(`Strike ${message.author.username}`).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('strike_p2').setLabel(`Strike ${opponent.username}`).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('timer').setLabel('⏱️ 12s Timer').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('end').setLabel('Terminar & Log').setStyle(ButtonStyle.Success)
            );

            const panel = await channel.send({ embeds: [updateEmbed()], components: [row] });

            const collector = channel.createMessageComponentCollector();

            collector.on('collect', async i => {
                await i.deferUpdate();

                if (i.customId === 'timer') {
                    if (timer) clearInterval(timer);
                    await channel.send("⏱️ **Timer Iniciado: 12 segundos...**");
                    setTimeout(() => channel.send("🔔 **TIEMPO CUMPLIDO - ATACAR AHORA**"), 12000);
                }

                if (i.customId === 'strike_p1') {
                    strikes[message.author.id]++;
                    if (strikes[message.author.id] >= 3) {
                        channel.send(`🏆 **GANADOR AUTOMÁTICO:** ${opponent.username} (Por acumulación de Strikes)`);
                        collector.stop('dsq');
                    } else {
                        await panel.edit({ embeds: [updateEmbed()] });
                        channel.send(`⚠️ **Strike para ${message.author.username}**`);
                    }
                }

                if (i.customId === 'strike_p2') {
                    strikes[opponent.id]++;
                    if (strikes[opponent.id] >= 3) {
                        channel.send(`🏆 **GANADOR AUTOMÁTICO:** ${message.author.username} (Por acumulación de Strikes)`);
                        collector.stop('dsq');
                    } else {
                        await panel.edit({ embeds: [updateEmbed()] });
                        channel.send(`⚠️ **Strike para ${opponent.username}**`);
                    }
                }

                if (i.customId === 'end') {
                    // Ask who won
                    await channel.send("📝 **¿Quién ganó?** Escribe `p1` (Hosting) o `p2` (Oponente).");
                    const filter = m => ['p1', 'p2'].includes(m.content.toLowerCase()) && (m.author.id === message.author.id || m.author.id === opponent.id);
                    const winnerMsg = await channel.awaitMessages({ filter, max: 1, time: 30000 });

                    if (winnerMsg.size > 0) {
                        const winCode = winnerMsg.first().content.toLowerCase();
                        const winner = winCode === 'p1' ? message.author : opponent;
                        const loser = winCode === 'p1' ? opponent : message.author;

                        // Log Result
                        const logChannel = message.guild.channels.cache.get(CHANNELS.TRYOUTS_RESULTS) || message.channel;
                        const logEmbed = new EmbedBuilder()
                            .setTitle('⚔️ GLAD RESULT')
                            .setDescription(`**Winner:** ${winner.username}\n**Loser:** ${loser.username}`)
                            .addFields({ name: 'Strikes', value: `P1: ${strikes[message.author.id]} | P2: ${strikes[opponent.id]}` })
                            .setColor('Green')
                            .setTimestamp();

                        logChannel.send({ embeds: [logEmbed] });

                        // Save DB
                        const wars = dbManager.read('wars.oneway') || [];
                        wars.push({ type: 'glad', winner: winner.id, loser: loser.id, timestamp: Date.now() });
                        dbManager.write('wars.oneway', wars);

                        channel.send("✅ **Reportado.** Cerrando canal en 5s...");
                        setTimeout(() => channel.delete(), 5000);
                    }
                }
            });

        } catch (error) {
            console.error(error);
            message.reply("❌ Error creando el canal de Glad.");
        }
    }
};
