import {
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import {
  CRIME_OPERATIONS,
  getActiveCrimeSession,
  startCrimeSession,
  updateCrimeSession,
  resolveCrime,
} from '../../services/gangs/crimeService';
import { getUserEconomy } from '../../services/economy/economyService';
import { getUserGang } from '../../services/gangs/gangService';
import { createErrorEmbed } from '../../utils/embeds';
import { formatNumber } from '../../utils/format';
import { Colors } from '../../constants';

export async function handleCrimeButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;

  const parts = interaction.customId.split(':');
  const action = parts[1];

  try {
    if (action === 'select') {
      const crimeId = parts[2];
      const targetUserId = parts[3];

      if (interaction.user.id !== targetUserId) {
        await interaction.reply({
          embeds: [createErrorEmbed("This isn't your crime operation. Run `/crime` to start your own.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Immediately acknowledge to prevent 10062 Unknown interaction timeout
      await interaction.deferUpdate();

      // Quick parallel verification
      const [userEco, userGang] = await Promise.all([
        getUserEconomy(interaction.user.id),
        getUserGang(interaction.user.id),
      ]);

      if (!userGang) {
        await interaction.followUp({
          embeds: [createErrorEmbed("You're no longer in a gang. Rejoin with `/gangjoin`.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const isJailed = userEco.jailUntil ? userEco.jailUntil.getTime() > Date.now() : false;
      if (isJailed) {
        const remainingSeconds = Math.ceil((userEco.jailUntil!.getTime() - Date.now()) / 1000);
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const prisonEmbed = new EmbedBuilder()
          .setColor(Colors.NEUTRAL)
          .setTitle('<:56_prison:1551660112391704747> You are in The Prison!')
          .setDescription(
            `Remaining sentence: ${minutes}m ${seconds}s.\nWait it out or have a gang brother spring you with \`/bail user:@${interaction.user.username}\`.`,
          );
        await interaction.followUp({
          embeds: [prisonEmbed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const crime = CRIME_OPERATIONS[crimeId];
      if (!crime) return;

      // Randomly pick one of the scenarios in rotation for this crime
      const scenarioIndex = Math.floor(Math.random() * crime.scenarios.length);
      const scenario = crime.scenarios[scenarioIndex] ?? crime.scenarios[0];

      startCrimeSession(interaction.user.id, interaction.guildId, crimeId, scenarioIndex);

      const embed = new EmbedBuilder()
        .setColor(Colors.NEUTRAL)
        .setTitle(`${crime.emoji} ${crime.name} — Phase 1: Infiltration`)
        .setDescription(
          `**Scenario:** ${scenario.title}\n` +
            `**Target Intel:** ${crime.description}\n` +
            `**Risk Tier:** \`${crime.riskLabel}\`\n` +
            `**Expected Loot:** \`$${formatNumber(crime.minPayout)} - $${formatNumber(crime.maxPayout)}\`\n\n` +
            `**Situation:**\n${scenario.stage1.prompt}`,
        )
        .setFooter({ text: 'Choose your tactical approach within 60 seconds.' });

      const buttons = scenario.stage1.choices.map((choice) =>
        new ButtonBuilder()
          .setCustomId(`crime:s1:${crimeId}:${scenarioIndex}:${choice.id}:${interaction.user.id}`)
          .setLabel(choice.label)
          .setStyle(ButtonStyle.Primary),
      );

      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      for (let i = 0; i < buttons.length; i += 2) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 2));
        rows.push(row);
      }

      await interaction.editReply({
        embeds: [embed],
        components: rows,
      });
    } else if (action === 's1') {
      let crimeId: string;
      let scenarioIndex: number;
      let choiceId: string;
      let targetUserId: string;

      if (parts.length >= 6) {
        crimeId = parts[2];
        scenarioIndex = parseInt(parts[3], 10);
        choiceId = parts[4];
        targetUserId = parts[5];
      } else {
        crimeId = parts[2];
        choiceId = parts[3];
        targetUserId = parts[4];
        scenarioIndex = getActiveCrimeSession(interaction.user.id)?.scenarioIndex ?? 0;
      }

      if (interaction.user.id !== targetUserId) {
        await interaction.reply({
          embeds: [createErrorEmbed("This isn't your crime operation. Run `/crime` to start your own.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Immediately acknowledge
      await interaction.deferUpdate();

      const crime = CRIME_OPERATIONS[crimeId];
      if (!crime) return;

      const scenario = crime.scenarios[scenarioIndex] ?? crime.scenarios[0];
      const chosen = scenario.stage1.choices.find((c) => c.id === choiceId) ?? scenario.stage1.choices[0];

      updateCrimeSession(interaction.user.id, {
        stage1ChoiceId: choiceId,
        stage1Mod: chosen.successMod,
        stage1Narrative: chosen.narrativeText,
      });

      const embed = new EmbedBuilder()
        .setColor(Colors.NEUTRAL)
        .setTitle(`${crime.emoji} ${crime.name} — Phase 2: Crisis & Getaway`)
        .setDescription(
          `**Scenario:** ${scenario.title}\n` +
            `**Phase 1 Execution:**\n*${chosen.narrativeText}*\n\n` +
            `**Complication Triggered:**\n${scenario.stage2.prompt}`,
        )
        .setFooter({ text: 'Make your getaway choice carefully. Policia is closing in!' });

      const buttons = scenario.stage2.choices.map((choice) =>
        new ButtonBuilder()
          .setCustomId(`crime:s2:${crimeId}:${scenarioIndex}:${choice.id}:${interaction.user.id}`)
          .setLabel(choice.label)
          .setStyle(ButtonStyle.Primary),
      );

      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      for (let i = 0; i < buttons.length; i += 2) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 2));
        rows.push(row);
      }

      await interaction.editReply({
        embeds: [embed],
        components: rows,
      });
    } else if (action === 's2') {
      let crimeId: string;
      let scenarioIndex: number;
      let choiceId: string;
      let targetUserId: string;

      if (parts.length >= 6) {
        crimeId = parts[2];
        scenarioIndex = parseInt(parts[3], 10);
        choiceId = parts[4];
        targetUserId = parts[5];
      } else {
        crimeId = parts[2];
        choiceId = parts[3];
        targetUserId = parts[4];
        scenarioIndex = getActiveCrimeSession(interaction.user.id)?.scenarioIndex ?? 0;
      }

      if (interaction.user.id !== targetUserId) {
        await interaction.reply({
          embeds: [createErrorEmbed("This isn't your crime operation. Run `/crime` to start your own.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Immediately acknowledge
      await interaction.deferUpdate();

      const crime = CRIME_OPERATIONS[crimeId];
      const session = getActiveCrimeSession(interaction.user.id);
      const scenario = crime?.scenarios[scenarioIndex] ?? crime?.scenarios[0];
      const stage1ChoiceId = session?.stage1ChoiceId ?? scenario?.stage1.choices[0].id ?? 'choice1';

      const result = await resolveCrime(
        interaction.user.id,
        crimeId,
        stage1ChoiceId,
        choiceId,
        scenarioIndex,
      );

      if (result.success) {
        const successEmbed = new EmbedBuilder()
          .setColor(Colors.NEUTRAL)
          .setTitle(`<:info:1551698028404936746> OPERATION PULLED OFF! — ${crime.name}`)
          .setDescription(
            `Phase 1: ${result.stage1Narrative}\n` +
              `Phase 2: ${result.stage2Narrative}\n\n` +
              `You completely outmaneuvered Policia surveillance and secured the payout!`,
          )
          .addFields(
            {
              name: '<:04_moneybag:1551659970083430612> Total Payout',
              value: `+$${formatNumber(result.payout)}`,
              inline: true,
            },
            {
              name: '<:05_goldcoins:1551659972473913485> Current Wallet',
              value: `$${formatNumber(result.newWallet)}`,
              inline: true,
            },
            {
              name: '<:21_dice_pair:1548395581985128458> Success Chance',
              value: `${result.finalSuccessRate}%`,
              inline: true,
            },
          )
          .setFooter({ text: 'Deposit your loot safely with /deposit before the cops come looking.' })
          .setTimestamp();

        await interaction.editReply({
          embeds: [successEmbed],
          components: [],
        });
      } else {
        const fineLine =
          result.finePaid > 0
            ? `-$${formatNumber(result.finePaid)}`
            : 'Wallet empty — no cash seized.';

        const failureEmbed = new EmbedBuilder()
          .setColor(Colors.NEUTRAL)
          .setTitle(`<:04_siren_alarm:1548395756988268684> BUSTED BY POLICIA! — ${crime.name}`)
          .setDescription(
            `Phase 1: ${result.stage1Narrative}\n` +
              `Phase 2: ${result.stage2Narrative}\n\n` +
              `Sirens shrieked and Policia tactical cruisers cut off your escape route! You were thrown against the pavement and hauled off to the holding precinct.`,
          )
          .addFields(
            {
              name: '<:04_moneybag:1551659970083430612> Impound Fine',
              value: fineLine,
              inline: true,
            },
            {
              name: '<:56_prison:1551660112391704747> Policia Detention',
              value: `${result.jailMinutes} minute(s) in custody`,
              inline: true,
            },
            {
              name: '<:05_goldcoins:1551659972473913485> Remaining Wallet',
              value: `$${formatNumber(result.newWallet)}`,
              inline: true,
            },
          )
          .setFooter({ text: 'A fellow gang member can post your bond early using /bail @you.' })
          .setTimestamp();

        await interaction.editReply({
          embeds: [failureEmbed],
          components: [],
        });
      }
    }
  } catch (err: any) {
    if (err?.code === 10062) return;
    throw err;
  }
}
