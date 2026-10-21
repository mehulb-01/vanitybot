import { ButtonInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import {
  getHeistLobby,
  joinHeistLobby,
  leaveHeistLobby,
  cancelHeistLobby,
  executeHeist,
} from '../../services/gangs/heistService';
import { buildHeistLobbyEmbed, buildHeistLobbyComponents } from '../commands/gangs/heist';
import { createErrorEmbed } from '../../utils/embeds';
import { formatNumber } from '../../utils/format';
import { Colors } from '../../constants';

export async function handleHeistButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  // Expected formats: heist:<action>:<lobbyId>
  const action = parts[1];
  const lobbyId = parts[2];

  const lobby = getHeistLobby(lobbyId);
  if (!lobby) {
    await interaction.reply({
      embeds: [createErrorEmbed('This heist lobby has expired or is no longer available.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'join') {
    const result = await joinHeistLobby(lobbyId, interaction.user.id);
    if (!result.success) {
      await interaction.reply({
        embeds: [createErrorEmbed(result.message)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferUpdate();
    const embed = buildHeistLobbyEmbed(lobby);
    const components = buildHeistLobbyComponents(lobby);
    await interaction.editReply({ embeds: [embed], components });
  } else if (action === 'leave') {
    const result = leaveHeistLobby(lobbyId, interaction.user.id);
    if (!result.success) {
      await interaction.reply({
        embeds: [createErrorEmbed(result.message)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferUpdate();
    const embed = buildHeistLobbyEmbed(lobby);
    const components = buildHeistLobbyComponents(lobby);
    await interaction.editReply({ embeds: [embed], components });
  } else if (action === 'cancel') {
    const result = cancelHeistLobby(lobbyId, interaction.user.id);
    if (!result.success) {
      await interaction.reply({
        embeds: [createErrorEmbed(result.message)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferUpdate();
    const embed = new EmbedBuilder()
      .setColor(Colors.NEUTRAL)
      .setTitle('<:10_warning_triangle:1548395769562665174> Heist Operation Disbanded')
      .setDescription(`The heist operation was called off by the leader <@${interaction.user.id}>.`);
    await interaction.editReply({ embeds: [embed], components: [] });
  } else if (action === 'start') {
    if (interaction.user.id !== lobby.hostId) {
      await interaction.reply({
        embeds: [createErrorEmbed('Only the heist leader who launched the lobby can commence the operation.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (lobby.members.length < 6) {
      await interaction.reply({
        embeds: [createErrorEmbed(`A syndicate heist requires exactly 6 operatives to commence (currently ${lobby.members.length}/6).`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferUpdate();
    try {
      const outcome = await executeHeist(lobbyId, interaction.user.id);
      const crewMentions = outcome.crewUserIds.map((id, idx) => `**#${idx + 1}** <@${id}>`).join('\n');

      if (outcome.success) {
        const victoryEmbed = new EmbedBuilder()
          .setColor(Colors.NEUTRAL)
          .setTitle(`<:info:1551698028404936746> MASSIVE HEIST COMPLETED! — ${outcome.category.name}`)
          .setDescription(
            `The 6-operative syndicate crew executed a flawless entry and exfiltration at **${outcome.category.name}**!\n\n` +
              `<:04_moneybag:1551659970083430612> Total Loot Plundered: $${formatNumber(outcome.totalLoot)}\n` +
              `<:05_goldcoins:1551659972473913485> Take per Operative: +$${formatNumber(outcome.sharePerMember)}\n` +
              `<:54_bank:1551660106582859927> Gang Treasury Bonus: +$${formatNumber(outcome.treasuryBonusPerGang)} (per faction)\n` +
              `<:21_dice_pair:1548395581985128458> Success Chance: ${outcome.finalSuccessRate}%\n\n` +
              `<:66_crewcrown:1551660137482162357> Participating Crew:\n${crewMentions}`,
          )
          .setFooter({ text: 'All payouts have been deposited directly into member wallets. Protect your fortune with /deposit.' });

        await interaction.editReply({ embeds: [victoryEmbed], components: [] });
      } else {
        const failureEmbed = new EmbedBuilder()
          .setColor(Colors.NEUTRAL)
          .setTitle(`<:04_siren_alarm:1548395756988268684> HEIST BUSTED BY POLICIA! — ${outcome.category.name}`)
          .setDescription(
            `Policia heavy siege unit intercepted the crew! Tactical cruisers and riot barriers sealed off all escape vectors!\n\n` +
              `<:10_warning_triangle:1548395769562665174> Impound Fine: -$${formatNumber(outcome.finePerMember)} (each member)\n` +
              `<:04_siren_alarm:1548395756988268684> Policia Detention: ${outcome.jailMinutes} minutes in holding (each member)\n` +
              `<:21_dice_pair:1548395581985128458> Calculated Odds: ${outcome.finalSuccessRate}%\n\n` +
              `<:66_crewcrown:1551660137482162357> Apprehended Crew:\n${crewMentions}`,
          )
          .setFooter({ text: 'Gang comrades on the outside can spring members early using /bail.' });

        await interaction.editReply({ embeds: [failureEmbed], components: [] });
      }
    } catch (err: any) {
      await interaction.followUp({
        embeds: [createErrorEmbed(err.message || 'An error occurred while executing the heist.')],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
