import {
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  getUserCatalog,
  buyMarketItem,
  sellMarketItem,
} from '../../services/economy/blackmarketService';
import { getUserEconomy } from '../../services/economy/economyService';
import { getUserInventory } from '../../services/gangs/gangService';
import { RARITY_LABELS, getItemById } from '../../services/economy/itemRegistry';
import { createSuccessEmbed, createErrorEmbed } from '../../utils/embeds';
import { formatNumber } from '../../utils/format';
import { resolveComponentEmoji } from '../../utils/emoji';
import { Colors } from '../../constants';
import { childLogger } from '../../utils/logger';

const log = childLogger('blackmarketHandler');

/**
 * Computes next midnight UTC timestamp for catalog reset.
 */
function getNextMidnightUtc(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return Math.floor(next.getTime() / 1000);
}

/**
 * Renders the daily 7-item buy catalog view with buying dropdown menu and action buttons.
 */
export async function renderMarketCatalogView(userId: string) {
  const catalog = await getUserCatalog(userId);
  const nextResetUnix = getNextMidnightUtc();

  const embed = new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle('<:53_safe:1551660104271667230> The Underworld Blackmarket — Daily Catalog')
    .setDescription(
      `<:07_refresh_sync:1548658829355655289> **Next Catalog Rotation:** <t:${nextResetUnix}:R> (<t:${nextResetUnix}:t>)`,
    )
    .setFooter({
      text: 'Blackmarket • Purchases are personal and do not deplete other players’ stocks.',
    })
    .setTimestamp();

  const selectOptions = [];

  for (const item of catalog) {
    const isOutOfStock = item.remainingStock <= 0;
    const stockDisplay = isOutOfStock
      ? 'Out of Stock'
      : `${item.remainingStock} available`;

    embed.addFields({
      name: `${item.emoji} ${item.name} • ${RARITY_LABELS[item.rarity].badge}`,
      value:
        `> **Price:** \`$${formatNumber(item.buyPrice)}\` | **Stock:** \`${stockDisplay}\`\n` +
        `> *${item.description}*`,
      inline: false,
    });

    selectOptions.push({
      label: `${item.name} ($${formatNumber(item.buyPrice)})`,
      description: isOutOfStock
        ? 'Out of daily stock for you'
        : `${item.remainingStock} available today • ${RARITY_LABELS[item.rarity].label}`,
      value: item.id,
      emoji: resolveComponentEmoji(item.emoji),
    });
  }

  const rows: ActionRowBuilder<any>[] = [];

  // Dropdown menu to select an item to buy
  const buySelectMenu = new StringSelectMenuBuilder()
    .setCustomId('market_buy_select')
    .setPlaceholder('Select an item to purchase from today’s catalog...')
    .addOptions(selectOptions.slice(0, 25));

  rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buySelectMenu));

  // Action buttons: Buy (active), Sell, Refresh, Trader
  const buyBtn = new ButtonBuilder()
    .setCustomId('market_view_catalog')
    .setLabel('Buy')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);

  const sellBtn = new ButtonBuilder()
    .setCustomId('market_view_inventory')
    .setLabel('Sell')
    .setStyle(ButtonStyle.Secondary);

  const refreshBtn = new ButtonBuilder()
    .setCustomId('market_refresh_catalog')
    .setLabel('Refresh')
    .setStyle(ButtonStyle.Secondary);

  const traderBtn = new ButtonBuilder()
    .setCustomId('trader_back_main')
    .setLabel('Trader')
    .setEmoji(resolveComponentEmoji('<:39_gasmask:1551660068871868466>'))
    .setStyle(ButtonStyle.Secondary);

  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buyBtn, sellBtn, refreshBtn, traderBtn));

  return { embed, components: rows };
}

/**
 * Renders the item purchase screen where the user can manually set or select quantity.
 */
export async function renderMarketItemDetailView(userId: string, itemId: string) {
  const [catalog, userEco] = await Promise.all([
    getUserCatalog(userId),
    getUserEconomy(userId),
  ]);

  const item = catalog.find((c) => c.id === itemId);
  if (!item) {
    return renderMarketCatalogView(userId);
  }

  const unitPrice = item.buyPrice ?? 0;
  const maxAfford = unitPrice > 0
    ? Math.min(item.remainingStock, Math.floor(userEco.wallet / unitPrice))
    : 0;

  const embed = new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle(`<:53_safe:1551660104271667230> Purchase: ${item.emoji} ${item.name} • ${RARITY_LABELS[item.rarity].badge}`)
    .setDescription(
      `*Review item specs and set how many units you wish to purchase:*\n\n` +
      `> **Unit Price:** \`$${formatNumber(unitPrice)}\`\n` +
      `> **Your Liquid Cash:** \`$${formatNumber(userEco.wallet)}\`\n` +
      `> **Daily Stock Left:** \`${item.remainingStock} available\`\n` +
      `> **Max You Can Purchase:** \`${maxAfford} unit(s)\`\n\n` +
      `*${item.description}*`,
    )
    .setFooter({
      text: 'Blackmarket • Set exact quantity manually or use quick purchase buttons.',
    })
    .setTimestamp();

  const rows: ActionRowBuilder<any>[] = [];
  const btnRow = new ActionRowBuilder<ButtonBuilder>();

  if (item.remainingStock <= 0) {
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId('market_sold_out_btn')
        .setLabel('Sold Out for Today')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
  } else if (userEco.wallet < unitPrice) {
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId('market_no_cash_btn')
        .setLabel(`Insufficient Funds ($${formatNumber(unitPrice)} needed)`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
    );
  } else {
    // Buy 1x
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`market_buy_exec_${item.id}_1`)
        .setLabel(`Buy 1x ($${formatNumber(unitPrice)})`)
        .setStyle(ButtonStyle.Primary),
    );

    // Buy Max (if > 1)
    if (maxAfford > 1) {
      btnRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`market_buy_exec_${item.id}_${maxAfford}`)
          .setLabel(`Buy All (${maxAfford}x - $${formatNumber(unitPrice * maxAfford)})`)
          .setStyle(ButtonStyle.Success),
      );
    }

    // Manual custom quantity modal button
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`market_btn_modal_buy_${item.id}`)
        .setLabel('✏️ Set Quantity')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  // Back to catalog button
  btnRow.addComponents(
    new ButtonBuilder()
      .setCustomId('market_view_catalog')
      .setLabel('↩️ Back to Catalog')
      .setStyle(ButtonStyle.Secondary),
  );

  rows.push(btnRow);

  return { embed, components: rows };
}

/**
 * Renders the inventory selling view with selling dropdown menu and action buttons.
 */
export async function renderMarketFenceView(userId: string) {
  const inventory = await getUserInventory(userId);

  const embed = new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle('<:53_safe:1551660104271667230> The Underworld Blackmarket — Sell Stash')
    .setDescription(
      `Select an item from your personal inventory to sell for clean cash.\n\n` +
        `> **Legendary Items:** Sell for **$30,000,000**\n` +
        `> **Mythic Items:** Sell for **$450,000 - $500,000**`,
    )
    .setFooter({
      text: 'Blackmarket • All sales are final and directly credited to your wallet.',
    })
    .setTimestamp();

  const rows: ActionRowBuilder<any>[] = [];

  if (inventory.length === 0) {
    embed.addFields({
      name: 'Stash Empty',
      value: '> You have no items in your inventory to sell right now.',
    });

    const emptyMenu = new StringSelectMenuBuilder()
      .setCustomId('market_sell_empty')
      .setPlaceholder('No items available in your stash to sell')
      .addOptions([
        {
          label: 'Empty Stash',
          value: 'none',
          description: 'Acquire items first to sell them here',
        },
      ])
      .setDisabled(true);

    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(emptyMenu));
  } else {
    const selectOptions = [];

    for (const item of inventory) {
      const reg = getItemById(item.itemId);
      const unitSellPrice = reg?.sellPrice ?? item.value;
      const rarityBadge = reg ? RARITY_LABELS[reg.rarity].badge : '';

      embed.addFields({
        name: `${reg?.emoji ?? '<:19_contractdocument:1551660016514240532>'} ${item.name} × ${item.quantity} • ${rarityBadge}`,
        value: `> **Unit Sell Rate:** \`$${formatNumber(unitSellPrice)}\`\n> *Total Value:* \`$${formatNumber(unitSellPrice * item.quantity)}\``,
        inline: false,
      });

      selectOptions.push({
        label: `${item.name} (x${item.quantity})`,
        description: `Sell for $${formatNumber(unitSellPrice)} each`,
        value: item.itemId,
        emoji: reg ? resolveComponentEmoji(reg.emoji) : undefined,
      });
    }

    const sellSelectMenu = new StringSelectMenuBuilder()
      .setCustomId('market_sell_select')
      .setPlaceholder('Select an item from your stash to liquidate...')
      .addOptions(selectOptions.slice(0, 25));

    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sellSelectMenu));
  }

  // Action buttons: Buy, Sell (active), Refresh, Trader
  const buyBtn = new ButtonBuilder()
    .setCustomId('market_view_catalog')
    .setLabel('Buy')
    .setStyle(ButtonStyle.Secondary);

  const sellBtn = new ButtonBuilder()
    .setCustomId('market_view_inventory')
    .setLabel('Sell')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);

  const refreshBtn = new ButtonBuilder()
    .setCustomId('market_refresh_inventory')
    .setLabel('Refresh')
    .setStyle(ButtonStyle.Secondary);

  const traderBtn = new ButtonBuilder()
    .setCustomId('trader_back_main')
    .setLabel('Trader')
    .setEmoji(resolveComponentEmoji('<:39_gasmask:1551660068871868466>'))
    .setStyle(ButtonStyle.Secondary);

  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buyBtn, sellBtn, refreshBtn, traderBtn));

  return { embed, components: rows };
}

/**
 * Renders the detail view for selling an item from stash with manual quantity control.
 */
export async function renderMarketSellDetailView(userId: string, itemId: string) {
  const inventory = await getUserInventory(userId);
  const existing = inventory.find((i) => i.itemId === itemId);

  if (!existing || existing.quantity <= 0) {
    return renderMarketFenceView(userId);
  }

  const reg = getItemById(itemId);
  const unitPrice = reg?.sellPrice ?? existing.value;
  const totalValue = unitPrice * existing.quantity;

  const embed = new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle(`<:53_safe:1551660104271667230> Liquidate Contraband: ${reg?.emoji ?? ''} ${existing.name}`)
    .setDescription(
      `*Set how many units of ${existing.name} to liquidate for clean street cash:*\n\n` +
      `> **Owned in Stash:** \`${existing.quantity}x\`\n` +
      `> **Unit Street Value:** \`$${formatNumber(unitPrice)}\`\n` +
      `> **Total Stash Value:** \`$${formatNumber(totalValue)}\``,
    )
    .setFooter({
      text: 'Blackmarket • Clean cash will be credited directly to your liquid wallet.',
    })
    .setTimestamp();

  const btnRow = new ActionRowBuilder<ButtonBuilder>();

  // Sell 1x
  btnRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`market_sell_exec_${existing.itemId}_1`)
      .setLabel(`Sell 1x ($${formatNumber(unitPrice)})`)
      .setStyle(ButtonStyle.Success),
  );

  // Sell All (if > 1)
  if (existing.quantity > 1) {
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`market_sell_exec_${existing.itemId}_${existing.quantity}`)
        .setLabel(`Sell All (${existing.quantity}x - $${formatNumber(totalValue)})`)
        .setStyle(ButtonStyle.Success),
    );
  }

  // Set quantity modal button
  btnRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`market_btn_modal_sell_${existing.itemId}`)
      .setLabel('✏️ Set Quantity')
      .setStyle(ButtonStyle.Secondary),
  );

  // Back to fence
  btnRow.addComponents(
    new ButtonBuilder()
      .setCustomId('market_view_inventory')
      .setLabel('↩️ Back to Stash')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, components: [btnRow] };
}

/**
 * Handles button interactions for the blackmarket.
 */
export async function handleMarketButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  const userId = interaction.user.id;

  // 1. Modal triggers: must NOT call deferUpdate() before showing modal
  if (customId.startsWith('market_btn_modal_buy_')) {
    const itemId = customId.replace('market_btn_modal_buy_', '');
    const catalog = await getUserCatalog(userId);
    const item = catalog.find((c) => c.id === itemId);
    const maxStock = item?.remainingStock ?? 5;

    const modal = new ModalBuilder()
      .setCustomId(`market_modal_buy_${itemId}`)
      .setTitle(`Purchase ${item?.name ?? 'Contraband'}`.slice(0, 45));

    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel(`Quantity to buy (1 - ${maxStock})`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(4);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput));
    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith('market_btn_modal_sell_')) {
    const itemId = customId.replace('market_btn_modal_sell_', '');
    const inventory = await getUserInventory(userId);
    const existing = inventory.find((i) => i.itemId === itemId);
    const maxStash = existing?.quantity ?? 1;

    const modal = new ModalBuilder()
      .setCustomId(`market_modal_sell_${itemId}`)
      .setTitle(`Sell ${existing?.name ?? 'Contraband'}`.slice(0, 45));

    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel(`Quantity to sell (1 - ${maxStash})`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(4);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput));
    await interaction.showModal(modal);
    return;
  }

  // 2. Standard buttons: defer update
  if (typeof interaction.deferUpdate === 'function') {
    await interaction.deferUpdate().catch(() => undefined);
  }

  try {
    if (customId === 'market_view_inventory' || customId === 'market_refresh_inventory') {
      const view = await renderMarketFenceView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    } else if (
      customId === 'market_view_catalog' ||
      customId === 'market_refresh_catalog' ||
      customId === 'market_refresh_view'
    ) {
      const view = await renderMarketCatalogView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    } else if (customId.startsWith('market_buy_exec_')) {
      const parts = customId.split('_');
      // market_buy_exec_<itemId>_<quantity>
      const quantity = parseInt(parts.pop() ?? '1', 10) || 1;
      const itemId = parts.slice(3).join('_');

      const result = await buyMarketItem(userId, itemId, quantity);
      if (!result.success) {
        const errorEmbed = createErrorEmbed(result.message, 'Purchase Declined');
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => undefined);
      } else {
        const item = result.item!;
        const successNotice = createSuccessEmbed(
          `You purchased **${quantity}x ${item.name}** for **$${formatNumber(result.totalPrice)}**!\n\n` +
            `> **Daily Stock Left:** \`${result.remainingStock}\`\n\n` +
            `*Item has been stashed into your /inventory.*`,
          'Acquisition Complete',
        );
        await interaction.followUp({ embeds: [successNotice], ephemeral: true }).catch(() => undefined);
      }

      const view = await renderMarketCatalogView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    } else if (customId.startsWith('market_sell_exec_')) {
      const parts = customId.split('_');
      // market_sell_exec_<itemId>_<quantity>
      const quantity = parseInt(parts.pop() ?? '1', 10) || 1;
      const itemId = parts.slice(3).join('_');

      const result = await sellMarketItem(userId, itemId, quantity);
      if (!result.success) {
        const errorEmbed = createErrorEmbed(result.message, 'Transaction Failed');
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => undefined);
      } else {
        const item = result.item!;
        const successNotice = createSuccessEmbed(
          `You sold **${quantity}x ${item.name}** for **$${formatNumber(result.totalPayout)}** clean cash!\n\n` +
            `> <:35_backpack:1551660057995780246> **Remaining in Stash:** \`${result.remainingInInventory}\``,
          'Contraband Liquidated',
        );
        await interaction.followUp({ embeds: [successNotice], ephemeral: true }).catch(() => undefined);
      }

      const view = await renderMarketFenceView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    }
  } catch (err) {
    log.error({ err, customId, userId }, 'Error handling market button');
  }
}

/**
 * Handles dropdown select menu interactions for buying and selling.
 */
export async function handleMarketSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (typeof interaction.deferUpdate === 'function') {
    await interaction.deferUpdate().catch(() => undefined);
  }

  const customId = interaction.customId;
  const userId = interaction.user.id;
  const selectedItemId = interaction.values[0];

  try {
    if (customId === 'market_buy_select') {
      // Open item detail purchase view with quantity options
      const view = await renderMarketItemDetailView(userId, selectedItemId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    } else if (customId === 'market_sell_select') {
      // Open item sell detail view with quantity options
      const view = await renderMarketSellDetailView(userId, selectedItemId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    }
  } catch (err) {
    log.error({ err, customId, userId }, 'Error handling market select');
  }
}

/**
 * Handles modal submissions for manually specifying buy/sell quantity.
 */
export async function handleMarketModal(interaction: ModalSubmitInteraction): Promise<void> {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const rawQuantity = interaction.fields.getTextInputValue('quantity').trim();
  const quantity = parseInt(rawQuantity, 10);

  if (isNaN(quantity) || quantity <= 0) {
    await interaction.reply({
      embeds: [createErrorEmbed('Please enter a valid positive whole number.', 'Invalid Quantity')],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate().catch(() => undefined);

  try {
    if (customId.startsWith('market_modal_buy_')) {
      const itemId = customId.replace('market_modal_buy_', '');
      const result = await buyMarketItem(userId, itemId, quantity);

      if (!result.success) {
        const errorEmbed = createErrorEmbed(result.message, 'Purchase Declined');
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => undefined);
      } else {
        const item = result.item!;
        const successNotice = createSuccessEmbed(
          `You purchased **${quantity}x ${item.name}** for **$${formatNumber(result.totalPrice)}**!\n\n` +
            `> **Daily Stock Left:** \`${result.remainingStock}\`\n\n` +
            `*Item has been stashed into your /inventory.*`,
          'Acquisition Complete',
        );
        await interaction.followUp({ embeds: [successNotice], ephemeral: true }).catch(() => undefined);
      }

      const view = await renderMarketCatalogView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    } else if (customId.startsWith('market_modal_sell_')) {
      const itemId = customId.replace('market_modal_sell_', '');
      const result = await sellMarketItem(userId, itemId, quantity);

      if (!result.success) {
        const errorEmbed = createErrorEmbed(result.message, 'Transaction Failed');
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => undefined);
      } else {
        const item = result.item!;
        const successNotice = createSuccessEmbed(
          `You sold **${quantity}x ${item.name}** for **$${formatNumber(result.totalPayout)}** clean cash!\n\n` +
            `> <:35_backpack:1551660057995780246> **Remaining in Stash:** \`${result.remainingInInventory}\``,
          'Contraband Liquidated',
        );
        await interaction.followUp({ embeds: [successNotice], ephemeral: true }).catch(() => undefined);
      }

      const view = await renderMarketFenceView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    }
  } catch (err) {
    log.error({ err, customId, userId }, 'Error processing market modal submit');
  }
}
