
import type { BotEvent } from '../loaders/eventLoader';
import { childLogger } from '../../utils/logger';
import {
  handleGangButton,
  handleGangRoleSelect,
  handleBossVoteSelect,
  handleOmertaPetitionModal,
} from './gangInteractionHandler';
import { handleMusicButton } from '../../services/music/musicButtonHandler';
import { handleCrimeButton } from './crimeGameHandler';
import { handleHeistButton } from './heistHandler';
import { handleMarketButton, handleMarketSelect } from './blackmarketHandler';
import { handleTraderButton, handleTraderSelect } from './traderHandler';
import { handleEightBallButton } from './eightBallHandler';
import { handleTicTacToeButton } from './tictactoeHandler';
import { checkCooldown, setCooldown } from '../../services/cooldownService';
import { getOrFindGangChannel } from '../../services/gangs/gangService';

const log = childLogger('event:interactionCreate');

const event: BotEvent<'interactionCreate'> = {
  name: 'interactionCreate',
  execute: async (client, interaction) => {
    // Handle button interactions
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('gang_') || interaction.customId.startsWith('omerta_')) {
        await handleGangButton(interaction);
      } else if (interaction.customId.startsWith('music:')) {
        await handleMusicButton(interaction, client);
      } else if (interaction.customId.startsWith('crime:')) {
        await handleCrimeButton(interaction);
      } else if (interaction.customId.startsWith('heist:')) {
        await handleHeistButton(interaction);
      } else if (interaction.customId.startsWith('market_')) {
        await handleMarketButton(interaction);
      } else if (interaction.customId.startsWith('trader_')) {
        await handleTraderButton(interaction);
      } else if (interaction.customId.startsWith('8ball:')) {
        await handleEightBallButton(interaction);
      } else if (interaction.customId.startsWith('ttt:')) {
        await handleTicTacToeButton(interaction);
      }
      return;
    }

    // Handle select menu interactions for gangs
    if (interaction.isRoleSelectMenu()) {
      if (interaction.customId.startsWith('gang_roleselect_') || interaction.customId === 'gang_role_select') {
        await handleGangRoleSelect(interaction);
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'gang_bossvote_select') {
        await handleBossVoteSelect(interaction);
      } else if (interaction.customId.startsWith('market_')) {
        await handleMarketSelect(interaction);
      } else if (interaction.customId.startsWith('trader_')) {
        await handleTraderSelect(interaction);
      }
      return;
    }

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'omerta_petition_modal') {
        await handleOmertaPetitionModal(interaction);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      log.warn({ command: interaction.commandName }, 'Unknown command invoked.');
      await interaction.reply({
        content: "<:10_warning_triangle:1548395769562665174> That command doesn't exist. I checked. Twice.",
        flags: 64, // MessageFlags.Ephemeral
      });
      return;
    }

    // 1. Guild-only and server-context enforcement
    if (command.guildOnly && !interaction.inGuild()) {
      await interaction.reply({
        content: `<:10_warning_triangle:1548395769562665174> \`/${command.data.name}\` requires a server context. Run it inside a server or use it via Personal App inside a server.`,
        flags: 64, // MessageFlags.Ephemeral
      });
      return;
    }

    // Music playback requires a guild voice channel
    if (command.category === 'music' && !interaction.inGuild()) {
      await interaction.reply({
        content: '<:10_warning_triangle:1548395769562665174> Music playback requires a voice channel in a server. Join a voice channel in a server to play tracks.',
        flags: 64, // MessageFlags.Ephemeral
      });
      return;
    }

    // 2. Gang command channel enforcement:
    // Any gang-related command (except /gangsetup) must only be executed in a #gang / #gangs channel.
    if (command.category === 'gangs' && command.data.name !== 'gangsetup') {
      if (!interaction.inGuild() || !interaction.guild) {
        await interaction.reply({
          content: '<:10_warning_triangle:1548395769562665174> Gang operations require a server context. Please run this command in a `#gangs` channel of a server.',
          flags: 64, // MessageFlags.Ephemeral
        });
        return;
      }

      const gangChannel = await getOrFindGangChannel(interaction.guild);
      const currentChannelName = (interaction.channel as any)?.name?.toLowerCase() ?? '';
      const isGangChannel =
        (gangChannel && interaction.channelId === gangChannel.id) ||
        currentChannelName === 'gangs' ||
        currentChannelName === 'gang' ||
        currentChannelName.includes('gang');

      if (!isGangChannel) {
        const channelMention = gangChannel ? `<#${gangChannel.id}>` : '`#gangs`';
        await interaction.reply({
          content: `<:10_warning_triangle:1548395769562665174> Gang operations are strictly prohibited here! You can only execute \`/${interaction.commandName}\` in ${channelMention}.`,
          flags: 64, // MessageFlags.Ephemeral
        });
        return;
      }
    }

    // 2. Permission enforcement
    if (command.requiredPermissions && command.requiredPermissions.length > 0 && interaction.inGuild()) {
      const permissions = interaction.memberPermissions;
      if (!permissions?.has(command.requiredPermissions)) {
        await interaction.reply({
          content: '<:10_warning_triangle:1548395769562665174> You lack the necessary permissions to execute this command.',
          flags: 64, // MessageFlags.Ephemeral
        });
        return;
      }
    }

    // 3. Centralized Cooldown enforcement
    if (command.cooldownMs && command.cooldownMs > 0) {
      const cooldownStatus = await checkCooldown(
        interaction.user.id,
        interaction.commandName,
        command.cooldownMs,
      );
      if (cooldownStatus.onCooldown) {
        const remainingSeconds = Math.max(1, Math.ceil(cooldownStatus.remainingMs / 1000));
        await interaction.reply({
          content: `<:10_warning_triangle:1548395769562665174> Slow down. \`/${interaction.commandName}\` is on cooldown. Try again in ${remainingSeconds}s.`,
          flags: 64, // MessageFlags.Ephemeral
        });
        return;
      }
      await setCooldown(interaction.user.id, interaction.commandName, command.cooldownMs);
    }

    try {
      await command.execute(interaction, client);
    } catch (err: any) {
      if (err?.code === 10062) {
        log.warn({ command: interaction.commandName, user: interaction.user.id }, 'Interaction expired before response was sent (10062).');
        return;
      }
      log.error(
        { err, command: interaction.commandName, user: interaction.user.id },
        'Command execution failed.',
      );

      const payload = {
        content: "<:10_warning_triangle:1548395769562665174> Something broke behind the curtain. I've notified whoever is supposed to fix this.",
        flags: 64, // MessageFlags.Ephemeral
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => undefined);
      } else {
        await interaction.reply(payload).catch(() => undefined);
      }
    }
  },
};

export default event;
