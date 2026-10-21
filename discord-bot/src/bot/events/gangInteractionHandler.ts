import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  MessageReaction,
  PartialMessageReaction,
  User,
  PartialUser,
  Client,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction,
  Guild,
} from 'discord.js';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from 'discord.js';
import { prisma } from '../../database/database';
import { childLogger } from '../../utils/logger';
import { Colors } from '../../constants';
import { formatNumber } from '../../utils/format';
import {
  createSuccessEmbed,
  createErrorEmbed,
  createInfoEmbed,
} from '../../utils/embeds';
import { resolveComponentEmoji } from '../../utils/emoji';
import {
  getAllGangs,
  getUserGang,
  changeGang,
  ensureGangChannel,
  getOrFindGangChannel,
  enableGangs,
  disableGangs,
  ensureGuildRecord,
  createGangRole,
  createAllGangRoles,
  invalidateUserGangCache,
  castBossVote,
  OMERTA_PERMANENT_BOSS_ID,
} from '../../services/gangs/gangService';

const log = childLogger('gangInteractionHandler');

export const OMERTA_APPROVE_EMOJI = '<:11_check_green:1548395771852754944>';
export const OMERTA_APPROVE_EMOJI_ID = '1548395771852754944';
export const OMERTA_APPROVE_EMOJI_NAME = '11_check_green';

export const OMERTA_DISAPPROVE_EMOJI = '<:uncheck:1552217326890389565>';
export const OMERTA_DISAPPROVE_EMOJI_ID = '1552217326890389565';
export const OMERTA_DISAPPROVE_EMOJI_NAME = 'uncheck';

const processingPetitions = new Set<string>();

export async function handleGangButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;

  const customId = interaction.customId;

  // Buttons that open modals (omerta_petition_open) cannot be deferred in advance
  const isModalOpener = customId === 'omerta_petition_open';
  if (!isModalOpener && typeof interaction.deferUpdate === 'function') {
    await interaction.deferUpdate().catch(() => undefined);
  }

  const respond = async (options: any) => {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(options).catch((err) => {
        log.error({ err, customId }, 'Failed to editReply in handleGangButton');
      });
    }
    return interaction.update(options).catch((err) => {
      log.error({ err, customId }, 'Failed to update in handleGangButton');
    });
  };

  if (customId === 'gang_enable') {
    // 1. Enable gangs first (persists guild record + guildSettings)
    await enableGangs(interaction.guildId, interaction.guild.name);

    // 2. Only NOW create the designated channel when the button is clicked!
    const channel = await ensureGangChannel(interaction.guild);

    const channelMsg = channel
      ? ` Designated channel: <#${channel.id}>.`
      : ' (Note: designated `#gangs` channel could not be created automatically. Grant the bot `Manage Channels` permission or create a `#gangs` channel manually).';
    await respond({
      embeds: [createSuccessEmbed(`Gangs enabled on this server!${channelMsg} Use \`/gangjoin\` to join a gang.`)],
      components: [],
    });
  } else if (customId === 'gang_disable') {
    await disableGangs(interaction.guildId, interaction.guild.name);

    await respond({
      embeds: [createSuccessEmbed("Gangs disabled on this server. All gang roles will remain but new joins won't get roles.")],
      components: [],
    });
  } else if (customId === 'gang_configure') {
    const view = await renderGangConfigurationView(interaction.guild);
    await respond({
      embeds: [view.embed],
      components: view.components,
    });
  } else if (customId === 'gang_overview') {
    const view = await renderGangOverviewView(interaction.guild);
    await respond({
      embeds: [view.embed],
      components: view.components,
    });
  } else if (customId === 'gang_create_all_roles') {
    const result = await createAllGangRoles(interaction.guild);
    if (!result.success) {
      await respond({
        embeds: [createErrorEmbed(result.message ?? 'Failed to create roles', 'Role Creation Error')],
      });
      return;
    }
    const view = await renderGangConfigurationView(interaction.guild);
    await respond({
      embeds: [view.embed],
      components: view.components,
    });
  } else if (customId.startsWith('gang_create_role_')) {
    const gangId = customId.replace('gang_create_role_', '');
    const result = await createGangRole(interaction.guild, gangId);
    if (!result.success) {
      await respond({
        embeds: [createErrorEmbed(result.message ?? 'Failed to create role', 'Role Creation Error')],
      });
      return;
    }
    const view = await renderGangConfigurationView(interaction.guild);
    await respond({
      embeds: [view.embed],
      components: view.components,
    });
  } else if (customId.startsWith('gang_join_')) {
    await handleGangJoin(interaction, customId.replace('gang_join_', ''));
  } else if (customId.startsWith('gang_assign_')) {
    await handleGangAssign(interaction);
  } else if (customId.startsWith('gang_change_to_')) {
    await handleGangChangeButton(interaction, customId.replace('gang_change_to_', ''));
  } else if (customId === 'omerta_petition_open') {
    await handleOmertaPetitionButton(interaction);
  } else if (customId === 'omerta_petition_cancel') {
    await handleOmertaRetreatButton(interaction);
  }
}

async function handleGangChangeButton(interaction: ButtonInteraction, targetGangName: string): Promise<void> {
  // Acknowledge interaction immediately (< 50ms) to prevent Discord 3s timeout (DiscordAPIError 10062)
  if (typeof interaction.deferUpdate === 'function') {
    await interaction.deferUpdate().catch(() => undefined);
  }

  const respond = async (options: any) => {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(options).catch((err) => {
        log.error({ err }, 'Failed to editReply in handleGangChangeButton');
      });
    }
    return interaction.update(options).catch((err) => {
      log.error({ err }, 'Failed to update in handleGangChangeButton');
    });
  };

  const result = await changeGang(interaction.user.id, targetGangName, interaction.guild ?? undefined);

  if (!result.success) {
    await respond({
      embeds: [createErrorEmbed(result.message, 'Defection Rejected')],
      components: [],
    });
    return;
  }

  const { oldGang, newGang, totalSeized, itemsWiped } = result;

  const embed = new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle(`⚡ Gang Defection Decreed — ${interaction.user.username}`)
    .setDescription(
      `You have broken your blood oath with **${oldGang?.displayName}** and defected to **${newGang?.displayName}**!\n\n` +
        `The underworld code is absolute. As retribution for your betrayal, your assets have been seized:\n\n` +
        `> <:19_contractdocument:1551660016514240532> **New Allegiance:** ${newGang?.emoji} **${newGang?.displayName}**\n` +
        `> <:35_backpack:1551660057995780246> **Inventory Cleared:** \`${itemsWiped ?? 0} item(s) destroyed\`\n` +
        `> <:54_bank:1551660106582859927> **Tribute Seized:** \`$${formatNumber(totalSeized ?? 0)}\` transferred into **${oldGang?.displayName}** Treasury!\n` +
        `> <:07_refresh_sync:1548658829355655289> **Tenure Reset:** Re-inducted as a fresh recruit`,
    )
    .setFooter({ text: 'Betrayal has its price. Protect your new colors.' })
    .setTimestamp();

  await respond({ embeds: [embed], components: [] });
}

export async function renderGangOverviewView(guild: Guild) {
  const [allGangs, serverGangSettings, gangChannel] = await Promise.all([
    getAllGangs(),
    prisma.serverGangSettings.findMany({
      where: { guildId: guild.id },
      include: { gang: true },
    }),
    getOrFindGangChannel(guild),
  ]);

  const channelDisplay = gangChannel ? `<#${gangChannel.id}>` : '`#gangs`';

  const gangList =
    serverGangSettings
      .map((setting) => `${setting.gang.emoji} **${setting.gang.displayName}** - Role: <@&${setting.roleId}>`)
      .join('\n') || 'No gangs configured yet';

  const embed = createInfoEmbed(
    `**Status:** Enabled\n\n**Configured Gangs:**\n${gangList}`,
    'Gang Setup Status',
  ).addFields([
    { name: 'Total Gangs', value: `${serverGangSettings.length}/6`, inline: true },
    { name: 'Available Gangs', value: `${allGangs.length}`, inline: true },
    { name: '📢 Syndicate Dispatch Channel', value: channelDisplay, inline: false },
  ]);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('gang_disable')
      .setLabel('Disable Gangs')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('gang_configure')
      .setLabel('Configure Roles')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('gang_create_all_roles')
      .setLabel(serverGangSettings.length === 6 ? 'All Roles Configured' : 'All Roles')
      .setStyle(ButtonStyle.Success)
      .setDisabled(serverGangSettings.length === 6),
  );

  return { embed, components: [row] };
}

export async function renderGangConfigurationView(guild: Guild) {
  const allGangs = await getAllGangs();
  const serverGangSettings = await prisma.serverGangSettings.findMany({
    where: { guildId: guild.id },
  });

  const settingMap = new Map(serverGangSettings.map((s) => [s.gangId, s.roleId]));

  const gangLines: string[] = [];
  let configuredCount = 0;

  for (const gang of allGangs) {
    const roleId = settingMap.get(gang.id);
    const role = roleId ? (guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null))) : null;
    if (role) {
      configuredCount++;
      gangLines.push(`${gang.emoji} **${gang.displayName}** → <@&${role.id}>`);
    } else {
      gangLines.push(`${gang.emoji} **${gang.displayName}** → <:10_warning_triangle:1548395769562665174> *Missing role*`);
    }
  }

  const embed = createInfoEmbed(
    `Manage server roles for each syndicate gang.\n\n` +
      `Create all roles at once with **All Roles**, click an individual gang below to create its missing role, or select an existing custom role from the menu.\n\n` +
      `**Current Status:**\n${gangLines.join('\n')}`,
    '🎩 Configure Gang Roles',
  ).addFields([
    { name: 'Configured', value: `${configuredCount}/6`, inline: true },
    { name: 'Missing', value: `${allGangs.length - configuredCount}/6`, inline: true },
  ]);

  const rows: (ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<RoleSelectMenuBuilder>)[] = [];

  // Row 1: Actions (All Roles, Overview)
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('gang_create_all_roles')
      .setLabel(configuredCount === 6 ? 'All Roles Configured' : 'All Roles')
      .setStyle(ButtonStyle.Success)
      .setDisabled(configuredCount === 6),
    new ButtonBuilder()
      .setCustomId('gang_overview')
      .setLabel('Overview')
      .setStyle(ButtonStyle.Secondary),
  );
  rows.push(actionRow);

  // Rows 2 & 3: 3 buttons per row for each gang
  const gangButtons = allGangs.map((gang) => {
    const roleId = settingMap.get(gang.id);
    const role = roleId ? guild.roles.cache.get(roleId) : null;
    if (role) {
      return new ButtonBuilder()
        .setCustomId(`gang_role_status_${gang.id}`)
        .setEmoji(resolveComponentEmoji(gang.emoji))
        .setLabel(`✓ ${gang.displayName}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);
    } else {
      return new ButtonBuilder()
        .setCustomId(`gang_create_role_${gang.id}`)
        .setEmoji(resolveComponentEmoji(gang.emoji))
        .setLabel(`+ ${gang.displayName}`)
        .setStyle(ButtonStyle.Primary);
    }
  });

  const rowA = new ActionRowBuilder<ButtonBuilder>().addComponents(gangButtons.slice(0, 3));
  const rowB = new ActionRowBuilder<ButtonBuilder>().addComponents(gangButtons.slice(3, 6));
  rows.push(rowA, rowB);

  // Row 4: Dropdown to map existing custom role
  const selectMenu = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('gang_role_select')
      .setPlaceholder('Or select an existing custom role to manually link...'),
  );
  rows.push(selectMenu);

  return { embed, components: rows };
}

export async function handleGangRoleSelect(interaction: RoleSelectMenuInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;

  if (typeof interaction.deferUpdate === 'function') {
    await interaction.deferUpdate().catch(() => undefined);
  }

  const respond = async (options: any) => {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(options).catch((err) => {
        log.error({ err }, 'Failed to editReply in handleGangRoleSelect');
      });
    }
    return interaction.update(options).catch((err) => {
      log.error({ err }, 'Failed to update in handleGangRoleSelect');
    });
  };

  const roleId = interaction.values[0];
  const role = interaction.guild.roles.cache.get(roleId) ?? (await interaction.guild.roles.fetch(roleId).catch(() => null));

  // Show gang selection with buttons
  const allGangs = await getAllGangs();
  const gangButtons = allGangs.map((gang) =>
    new ButtonBuilder()
      .setCustomId(`gang_assign_${gang.id}_${roleId}`)
      .setEmoji(resolveComponentEmoji(gang.emoji))
      .setLabel(gang.displayName)
      .setStyle(ButtonStyle.Primary),
  );

  // Create action rows (2 buttons per row)
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < gangButtons.length; i += 2) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(gangButtons[i]);
    if (gangButtons[i + 1]) {
      row.addComponents(gangButtons[i + 1]);
    }
    rows.push(row);
  }

  const roleName = role?.name ?? 'Unknown';

  await respond({
    embeds: [
      createInfoEmbed('**Configure Gang Roles**').setDescription(
        `Selected role: **${roleName}**\n\nSelect which gang this role represents.`,
      ),
    ],
    components: rows,
  });
}

async function handleGangAssign(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;

  const respond = async (options: any) => {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(options).catch((err) => {
        log.error({ err }, 'Failed to editReply in handleGangAssign');
      });
    }
    return interaction.update(options).catch((err) => {
      log.error({ err }, 'Failed to update in handleGangAssign');
    });
  };

  const [gangId, roleId] = interaction.customId.replace('gang_assign_', '').split('_');

  // Ensure guild exists in database before saving serverGangSettings
  await ensureGuildRecord(interaction.guildId, interaction.guild.name);

  // Save the gang role configuration
  await prisma.serverGangSettings.upsert({
    where: {
      guildId_gangId: {
        guildId: interaction.guildId,
        gangId: gangId,
      },
    },
    update: { roleId },
    create: {
      guildId: interaction.guildId,
      gangId: gangId,
      roleId: roleId,
    },
  });

  const gang = await prisma.gang.findUnique({ where: { id: gangId } });
  const role = interaction.guild.roles.cache.get(roleId) ?? (await interaction.guild.roles.fetch(roleId).catch(() => null));
  const roleName = role?.name ?? 'Unknown';

  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('gang_configure')
      .setLabel('Configure Roles')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('gang_overview')
      .setLabel('Overview')
      .setStyle(ButtonStyle.Secondary),
  );

  await respond({
    embeds: [createSuccessEmbed(`Role **${roleName}** has been assigned to **${gang?.displayName ?? 'Gang'}** ${gang?.emoji ?? ''}`)],
    components: [backRow],
  });
}

async function handleGangJoin(interaction: ButtonInteraction, gangId: string): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;

  const respond = async (options: any) => {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(options).catch((err) => {
        log.error({ err }, 'Failed to editReply in handleGangJoin');
      });
    }
    return interaction.update(options).catch((err) => {
      log.error({ err }, 'Failed to update in handleGangJoin');
    });
  };

  // Check if user already has a gang
  const existingMembership = await getUserGang(interaction.user.id);
  if (existingMembership) {
    await respond({
      embeds: [createErrorEmbed(`You're already a member of **${existingMembership.gang.displayName}**. Use a different command to leave first.`)],
      components: [],
    });
    return;
  }

  const gang = await prisma.gang.findFirst({
    where: {
      OR: [{ id: gangId }, { name: gangId.toLowerCase() }],
    },
  });

  if (!gang) {
    await respond({
      embeds: [createErrorEmbed('Selected gang could not be found.')],
      components: [],
    });
    return;
  }

  // Omertà is restricted: People cannot simply join it!
  if (gang.name.toLowerCase() === 'omerta') {
    const omertaEmbed = new EmbedBuilder()
      .setColor(Colors.NEUTRAL)
      .setTitle('<:59_mafiaboss:1551660120591827084> The Gates of Omertà Are Sealed')
      .setDescription(
        `*You reach for the sacred black crest of Omertà as if entry into the inner sanctum of the underworld could ever be so casually claimed.*\n\n` +
          `**Pause and question your worth.**\n\n` +
          `Look at your track record. Look at your resolve. Are you truly prepared for a faction where silence is not merely a virtue, but the unforgiving law of survival? A single whisper of weakness, a stray glance to outsiders, or a tremor in your loyalty does not earn a reprimand—it commands a shallow grave.\n\n` +
          `**Omertà is the syndicate of the true elites.** We do not recruit from the common gutters, nor do we welcome street runners looking for casual refuge. Those who wear our crest operate beyond the reach of law and outside the petty squabbles of ordinary syndicates.\n\n` +
          `If you genuinely believe you possess the pedigree, the absolute discipline, and the cold ruthlessness to stand shoulder-to-shoulder with the syndicate's elite... you do not simply join. **You petition the High Table.**\n\n` +
          `Drop a message below. Your words will be delivered directly to the High Table of Omertà.\n\n` +
          `*Choose your words with supreme care. The High Table does not grant second audiences.*`,
      )
      .setFooter({ text: 'Omertà • Silence is loyalty, betrayal is death.' });

    const petitionBtn = new ButtonBuilder()
      .setCustomId('omerta_petition_open')
      .setLabel('Drop Message to the High Table')
      .setStyle(ButtonStyle.Primary);

    const retreatBtn = new ButtonBuilder()
      .setCustomId('omerta_petition_cancel')
      .setLabel('Retreat in Silence')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(petitionBtn, retreatBtn);

    await respond({
      embeds: [omertaEmbed],
      components: [row],
    });
    return;
  }

  // Join the gang for other gangs
  if (typeof interaction.deferUpdate === 'function' && !interaction.deferred) {
    await interaction.deferUpdate().catch(() => undefined);
  }

  await prisma.userGangMembership.create({
    data: {
      userId: interaction.user.id,
      gangId: gang.id,
    },
  });

  invalidateUserGangCache(interaction.user.id);

  // Give them the role on this server if configured
  const serverGangSetting = await prisma.serverGangSettings.findUnique({
    where: {
      guildId_gangId: {
        guildId: interaction.guildId,
        gangId: gang.id,
      },
    },
  });

  let roleMessage = '';
  if (serverGangSetting) {
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await member.roles.add(serverGangSetting.roleId);
      roleMessage = `\n\n<:11_check_green:1548395771852754944> You've been given the **${gang.displayName}** role on this server.`;
    } catch {
      roleMessage = `\n\n<:10_warning_triangle:1548395769562665174> Failed to give you the gang role (role hierarchy issue).`;
    }
  }

  await respond({
    embeds: [
      createSuccessEmbed(`Welcome to the ${gang.displayName} family, ${interaction.user.username}!${roleMessage}`).setColor(
        Colors.NEUTRAL,
      ),
    ],
    components: [],
  });
}

async function handleOmertaPetitionButton(interaction: ButtonInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId('omerta_petition_modal')
    .setTitle('Omertà • Petition to the High Table');

  const messageInput = new TextInputBuilder()
    .setCustomId('petition_message')
    .setLabel('Why do you belong among the elites?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('State your pedigree, your vow of silence, and why the High Table should accept you...')
    .setMinLength(10)
    .setMaxLength(1000)
    .setRequired(true);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function handleOmertaRetreatButton(interaction: ButtonInteraction): Promise<void> {
  const respond = async (options: any) => {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(options).catch((err) => {
        log.error({ err }, 'Failed to editReply in handleOmertaRetreatButton');
      });
    }
    return interaction.update(options).catch((err) => {
      log.error({ err }, 'Failed to update in handleOmertaRetreatButton');
    });
  };

  await respond({
    embeds: [
      createInfoEmbed(
        "You wisely stepped back into the shadows before testing the High Table's patience. The gates of Omertà remain closed.",
        'Silence Maintained',
      ).setColor(Colors.NEUTRAL),
    ],
    components: [],
  });
}

export async function handleOmertaPetitionModal(interaction: ModalSubmitInteraction): Promise<void> {
  const message = interaction.fields.getTextInputValue('petition_message');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const bossId = OMERTA_PERMANENT_BOSS_ID;

  try {
    const bossUser = await interaction.client.users.fetch(bossId);
    if (bossUser) {
      const dmEmbed = new EmbedBuilder()
        .setColor(Colors.NEUTRAL)
        .setTitle('<:59_mafiaboss:1551660120591827084> New Omertà Membership Petition')
        .setDescription(
          `An operative is seeking audience and entry into the elite ranks of **Omertà**.\n\n` +
            `**Applicant:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
            `**User ID:** \`${interaction.user.id}\`\n` +
            `**Server Origin:** ${interaction.guild?.name ?? 'Unknown Guild'} (\`${interaction.guildId ?? 'N/A'}\`)\n` +
            `**Transmission Time:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
            `**Operative's Message to the High Table:**\n` +
            `>>> ${message}`,
        )
        .addFields({
          name: '⚖️ High Table Review Protocols',
          value:
            `• React with <:11_check_green:1548395771852754944> to **approve** and induct into Omertà (sends welcome DM).\n` +
            `• React with <:uncheck:1552217326890389565> to **disapprove** (silently rejected, no DM).`,
        })
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({ text: `Omertà Syndicate High Table • Applicant: ${interaction.user.id} | Guild: ${interaction.guildId ?? ''}` })
        .setTimestamp();

      const sentMessage = await bossUser.send({ embeds: [dmEmbed] }).catch((err) => {
        log.warn({ err, bossId }, 'Could not send DM to Omertà High Table (DMs might be closed)');
        return null;
      });

      if (sentMessage && typeof sentMessage.react === 'function') {
        await sentMessage.react(OMERTA_APPROVE_EMOJI).catch((err) => {
          log.warn({ err }, 'Could not add approve reaction to Omertà boss DM');
        });
        await sentMessage.react(OMERTA_DISAPPROVE_EMOJI).catch((err) => {
          log.warn({ err }, 'Could not add disapprove reaction to Omertà boss DM');
        });
      }
    }
  } catch (err) {
    log.warn({ err, bossId }, 'Failed to fetch Omertà High Table user');
  }

  const responseEmbed = new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle('<:59_mafiaboss:1551660120591827084> Your Words Have Reached the Shadows')
    .setDescription(
      `Your petition has been directly transmitted to the High Table of Omertà.\n\n` +
        `The High Table reviews all pleas in complete silence. If you are deemed worthy of standing with the elites, a summons will find you.\n\n` +
        `Until then, remember the law:\n` +
        `*“Silence is loyalty, betrayal is death.”*`,
    )
    .setFooter({ text: 'Omertà • The Syndicate of Elites' });

  await interaction.editReply({
    embeds: [responseEmbed],
  });
}

/**
 * Handles boss reactions to Omertà membership petitions:
 * - <:11_check_green:1548395771852754944> approves the applicant, inducts them into Omertà, and sends a welcome DM.
 * - <:uncheck:1552217326890389565> disapproves the applicant in silence (no DM sent).
 */
export async function processOmertaPetitionReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  client?: Client,
): Promise<{ success: boolean; action?: 'APPROVED' | 'DISAPPROVED'; applicantId?: string }> {
  // 1. Ignore reactions from bots
  if (user.bot) return { success: false };

  // 2. Only the Omertà boss can approve/disapprove
  if (user.id !== OMERTA_PERMANENT_BOSS_ID) return { success: false };

  // 3. Resolve partials
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (err) {
      log.warn({ err }, 'Failed to fetch partial reaction');
      return { success: false };
    }
  }

  if (reaction.message.partial) {
    try {
      await reaction.message.fetch();
    } catch (err) {
      log.warn({ err }, 'Failed to fetch partial reaction message');
      return { success: false };
    }
  }

  if (user.partial) {
    try {
      await user.fetch();
    } catch (err) {
      log.warn({ err }, 'Failed to fetch partial user');
      return { success: false };
    }
  }

  // 4. Verify message is an Omertà petition review
  const message = reaction.message;
  const embed = message.embeds[0];
  if (!embed || !embed.title || !embed.title.includes('New Omertà Membership Petition')) {
    return { success: false };
  }

  // 5. Prevent double processing
  if (
    processingPetitions.has(message.id) ||
    embed.fields?.some((f) => f.name.includes('Verdict') || f.name.includes('Status')) ||
    embed.description?.includes('### Verdict')
  ) {
    return { success: false };
  }

  processingPetitions.add(message.id);

  // 6. Check emoji tapped
  const emojiId = reaction.emoji.id;
  const emojiName = reaction.emoji.name;
  const isApprove = emojiId === OMERTA_APPROVE_EMOJI_ID || emojiName === OMERTA_APPROVE_EMOJI_NAME;
  const isDisapprove = emojiId === OMERTA_DISAPPROVE_EMOJI_ID || emojiName === OMERTA_DISAPPROVE_EMOJI_NAME;

  if (!isApprove && !isDisapprove) {
    return { success: false };
  }

  // 7. Extract applicantId and guildId from embed
  let applicantId = '';
  let guildId = '';

  const userIdMatch = embed.description?.match(/\*\*User ID:\*\*\s*`?([^\n`]+)`?/);
  if (userIdMatch) {
    applicantId = userIdMatch[1].trim();
  } else if (embed.footer?.text) {
    const footerMatch = embed.footer.text.match(/Applicant:\s*([^\s|]+)/);
    if (footerMatch) applicantId = footerMatch[1].trim();
  }

  const guildIdMatch = embed.description?.match(/\*\*Server Origin:\*\*.*?\(`?([^\n`)]+)`?\)/);
  if (guildIdMatch) {
    guildId = guildIdMatch[1].trim();
  } else if (embed.footer?.text) {
    const guildFooterMatch = embed.footer.text.match(/Guild:\s*([^\s|]+)/);
    if (guildFooterMatch) guildId = guildFooterMatch[1].trim();
  }

  if (!applicantId) {
    log.warn({ messageId: message.id }, 'Could not extract applicantId from Omertà petition embed');
    return { success: false };
  }

  const discordClient = client ?? message.client;

  if (isApprove) {
    // A. Induct applicant into Omertà
    let omertaGang = await prisma.gang.findFirst({
      where: { name: 'omerta' },
    });
    if (!omertaGang) {
      omertaGang = await prisma.gang.findFirst({
        where: { id: 'omerta' },
      });
    }

    if (omertaGang) {
      await prisma.userGangMembership.upsert({
        where: { userId: applicantId },
        create: {
          userId: applicantId,
          gangId: omertaGang.id,
        },
        update: {
          gangId: omertaGang.id,
          joinedAt: new Date(),
        },
      });
      invalidateUserGangCache(applicantId);

      // Add gang role if configured on originating server
      if (guildId && guildId !== 'N/A') {
        try {
          const serverSetting = await prisma.serverGangSettings.findUnique({
            where: {
              guildId_gangId: {
                guildId,
                gangId: omertaGang.id,
              },
            },
          });

          if (serverSetting) {
            const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
            if (guild) {
              const member = await guild.members.fetch(applicantId).catch(() => null);
              if (member) {
                await member.roles.add(serverSetting.roleId).catch(() => null);
              }
            }
          }
        } catch (err) {
          log.warn({ err, applicantId, guildId }, 'Failed to assign Omertà role on guild');
        }
      }
    }

    // B. Send DM to approved applicant
    try {
      const applicantUser = await discordClient.users.fetch(applicantId);
      if (applicantUser) {
        const welcomeEmbed = new EmbedBuilder()
          .setColor(Colors.NEUTRAL)
          .setTitle('<:68_crown:1551660143152865441> The High Table Has Spoken — Welcome to Omertà')
          .setDescription(
            `Your petition has been personally reviewed by the **High Table of Omertà**.\n\n` +
              `By sovereign decree, your worth has been recognized and your allegiance accepted. You are now inducted into the inner sanctum of the underworld.\n\n` +
              `<:19_contractdocument:1551660016514240532> Gang: Omertà\n` +
              `<:74_medal:1551660157199581227> Rank: Street Runner (Rank I)\n\n` +
              `From this moment forward, you carry the black crest. Remember the inviolable law of our family:\n\n` +
              `*“Silence is loyalty, betrayal is death.”*`,
          )
          .setFooter({ text: 'Omertà • The Syndicate of Elites' })
          .setTimestamp();

        await applicantUser.send({ embeds: [welcomeEmbed] }).catch((err) => {
          log.warn({ err, applicantId }, 'Could not send Omertà welcome DM to user (DMs may be closed)');
        });
      }
    } catch (err) {
      log.warn({ err, applicantId }, 'Failed to fetch applicant user to send Omertà approval DM');
    }

    // C. Edit boss DM message to show APPROVED
    const updatedEmbed = EmbedBuilder.from(embed)
      .setColor(0x2ecc71)
      .addFields({
        name: '⚖️ High Table Verdict',
        value: `<:11_check_green:1548395771852754944> **APPROVED** by the High Table on <t:${Math.floor(Date.now() / 1000)}:f>.\nApplicant has been inducted into Omertà and notified via DM.`,
      });

    if (typeof message.edit === 'function') {
      await message.edit({ embeds: [updatedEmbed] }).catch(() => null);
    }

    return { success: true, action: 'APPROVED', applicantId };
  } else {
    // DISAPPROVED:
    // [if tapped on by boss, user gets disapproved and does not get any dm]
    const updatedEmbed = EmbedBuilder.from(embed)
      .setColor(0xe74c3c)
      .addFields({
        name: '⚖️ High Table Verdict',
        value: `<:uncheck:1552217326890389565> **DISAPPROVED** by the High Table on <t:${Math.floor(Date.now() / 1000)}:f>.\nApplicant was rejected in complete silence. No notification was sent.`,
      });

    if (typeof message.edit === 'function') {
      await message.edit({ embeds: [updatedEmbed] }).catch(() => null);
    }

    return { success: true, action: 'DISAPPROVED', applicantId };
  }
}

export async function handleBossVoteSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const candidateId = interaction.values[0];
  const result = await castBossVote(interaction.user.id, candidateId);

  if (!result.success) {
    if (result.reason === 'NOMINATED') {
      await interaction.reply({
        content: "You have been nominated for voting this month, don't act smart.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.update({
      embeds: [createErrorEmbed(result.message, 'Ballot Rejected')],
      components: [],
    });
    return;
  }

  await interaction.update({
    embeds: [createSuccessEmbed(result.message, '🗳️ Ballot Accepted')],
    components: [],
  });
}
