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
  isTraderAvailable,
  getNextWednesdayStart,
  getCurrentWednesdayEnd,
  getTraderSellPrice,
  getEligibleExchangeItems,
  sellItemToTrader,
  exchangeItemWithTrader,
  getUserExchangedToday,
  DAILY_TRADER_EXCHANGE_LIMIT,
} from '../../services/economy/traderService';
import { getUserInventory } from '../../services/gangs/gangService';
import { RARITY_LABELS, getItemById } from '../../services/economy/itemRegistry';
import { renderMarketCatalogView } from './blackmarketHandler';
import { createSuccessEmbed, createErrorEmbed } from '../../utils/embeds';
import { formatNumber } from '../../utils/format';
import { resolveComponentEmoji } from '../../utils/emoji';
import { Colors } from '../../constants';
import { childLogger } from '../../utils/logger';

const log = childLogger('traderHandler');

export const TRADER_EMOJIS = {
  TRADER: '<:39_gasmask:1551660068871868466>',
  SCHEDULE: '<:14_download_tray:1548658846355038218>',
  MONEYBAG: '<:04_moneybag:1551659970083430612>',
  EXCHANGE: '<:11_retweet_repost:1548658597301588059>',
  NEXT_ARRIVAL: '<:07_refresh_sync:1548658829355655289>',
} as const;

/**
 * Renders the closed view when the Wandering Trader is not in town today.
 */
export function renderTraderClosedView(_userId?: string) {
  const nextArrival = getNextWednesdayStart();
  const nextArrivalUnix = Math.floor(nextArrival.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle(`${TRADER_EMOJIS.TRADER} The Wandering Shadow Trader — Currently Away`)
    .setDescription(
      `*The cobblestone back-alleys are deserted. The mysterious traveling merchant and his heavily guarded caravan have moved on from the city.*` +
      `\n\n> ${TRADER_EMOJIS.SCHEDULE} **Schedule:** The Trader visits globally every **Wednesday through Thursday** (00:00 Wed – 23:59 Thu UTC).` +
      `\n> ${TRADER_EMOJIS.MONEYBAG} **Premium Rates:** Buys blackmarket contraband at **1.75× (+75%)** blackmarket cost price!` +
      `\n> ${TRADER_EMOJIS.EXCHANGE} **Barter Exchange:** Swap up to **5 total items per day** (10 total across Wed & Thu) 1:1 for another item in its rarity tier!` +
      `\n\n${TRADER_EMOJIS.NEXT_ARRIVAL} **Next Arrival:** <t:${nextArrivalUnix}:R> (<t:${nextArrivalUnix}:f>)`,
    )
    .setFooter({
      text: 'The Shadow Trader • Available globally Wednesday through Thursday.',
    })
    .setTimestamp();

  const marketBtn = new ButtonBuilder()
    .setCustomId('trader_to_blackmarket')
    .setLabel('Visit Blackmarket')
    .setEmoji(resolveComponentEmoji('<:49_warehouse:1551660095694184458>'))
    .setStyle(ButtonStyle.Secondary);

  const refreshBtn = new ButtonBuilder()
    .setCustomId('trader_refresh')
    .setLabel('Check Status')
    .setEmoji(resolveComponentEmoji(TRADER_EMOJIS.NEXT_ARRIVAL))
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(marketBtn, refreshBtn);

  return { embed, components: [row] };
}

/**
 * Renders the active Wednesday Trader overview with user stash options and bonus rates.
 */
export async function renderTraderMainView(userId: string) {
  const [inventory, exchangedToday] = await Promise.all([
    getUserInventory(userId),
    getUserExchangedToday(userId),
  ]);
  const remainingDailyExchanges = Math.max(0, DAILY_TRADER_EXCHANGE_LIMIT - exchangedToday);
  const departure = getCurrentWednesdayEnd();
  const departureUnix = Math.floor(departure.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle(`${TRADER_EMOJIS.TRADER} The Wandering Shadow Trader — Wednesday & Thursday Smuggler's Caravan`)
    .setDescription(
      `*A shadowy caravan draped in heavy velvet has anchored in the docks. The merchant is trading in high-grade contraband today.*` +
      `\n\n> ${TRADER_EMOJIS.SCHEDULE} **Schedule:** Global Wednesday through Thursday rotation (00:00 Wed – 23:59 Thu UTC).` +
      `\n> ${TRADER_EMOJIS.MONEYBAG} **Premium Cash:** Paying **1.75× (+75%)** above blackmarket cost price.` +
      `\n> ${TRADER_EMOJIS.EXCHANGE} **Daily Barter Limit:** \`${remainingDailyExchanges} / ${DAILY_TRADER_EXCHANGE_LIMIT} items left today\` *(10 total across Wed & Thu)*.` +
      `\n\n${TRADER_EMOJIS.NEXT_ARRIVAL} **Caravan Departure:** <t:${departureUnix}:R> (<t:${departureUnix}:t>)`,
    )
    .setFooter({
      text: 'Wandering Trader • Available globally Wednesday through Thursday.',
    })
    .setTimestamp();

  const rows: ActionRowBuilder<any>[] = [];

  if (inventory.length === 0) {
    embed.addFields({
      name: '<:15_blackcrate:1551660006473076796> Your Stash is Empty',
      value:
        '> You do not possess any contraband to sell or trade today.\n' +
        '> *Acquire wares from the blackmarket or score loot from heists and crimes to trade.*',
    });

    const emptyMenu = new StringSelectMenuBuilder()
      .setCustomId('trader_item_empty')
      .setPlaceholder('No items in your stash to trade')
      .addOptions([
        {
          label: 'Empty Stash',
          value: 'none',
          description: 'Obtain blackmarket items to trade them here on Wednesdays and Thursdays',
        },
      ])
      .setDisabled(true);

    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(emptyMenu));
  } else {
    const selectOptions = [];

    for (const item of inventory) {
      const reg = getItemById(item.itemId);
      const regularUnitSell = reg?.sellPrice ?? item.value;
      const traderUnitSell = getTraderSellPrice(reg ?? item.itemId);
      const rarityBadge = reg ? RARITY_LABELS[reg.rarity].badge : '';
      const rarityLabel = reg ? RARITY_LABELS[reg.rarity].label : 'Item';

      embed.addFields({
        name: `${reg?.emoji ?? '<:19_contractdocument:1551660016514240532>'} ${item.name} × ${item.quantity} • ${rarityBadge}`,
        value:
          (reg?.buyPrice ? `> **Blackmarket Cost:** \`$${formatNumber(reg.buyPrice)}\` | ` : `> **Regular Fence:** \`$${formatNumber(regularUnitSell)}\` | `) +
          `${TRADER_EMOJIS.MONEYBAG} **Trader Pays:** \`$${formatNumber(traderUnitSell)}\` *(+75% Profit!)*\n` +
          `> ${TRADER_EMOJIS.EXCHANGE} *Or barter for any other ${rarityLabel} item.*`,
        inline: false,
      });

      selectOptions.push({
        label: `${item.name} (x${item.quantity})`,
        description: `Trader pays $${formatNumber(traderUnitSell)} cash (+75% profit) or trade for ${rarityLabel}`,
        value: item.itemId,
        emoji: reg ? resolveComponentEmoji(reg.emoji) : undefined,
      });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('trader_item_select')
      .setPlaceholder('Select an item from your stash to sell or exchange...')
      .addOptions(selectOptions.slice(0, 25));

    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
  }

  // Action buttons
  const refreshBtn = new ButtonBuilder()
    .setCustomId('trader_refresh')
    .setLabel('Refresh')
    .setEmoji(resolveComponentEmoji(TRADER_EMOJIS.NEXT_ARRIVAL))
    .setStyle(ButtonStyle.Secondary);

  // Fix button: Use .setEmoji() rather than raw emoji string inside .setLabel()
  const marketBtn = new ButtonBuilder()
    .setCustomId('trader_to_blackmarket')
    .setLabel('Visit Blackmarket')
    .setEmoji(resolveComponentEmoji('<:49_warehouse:1551660095694184458>'))
    .setStyle(ButtonStyle.Secondary);

  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(refreshBtn, marketBtn));

  return { embed, components: rows };
}

/**
 * Renders the detail view for a specific item the user wants to deal with the Trader.
 */
export async function renderTraderItemDetailView(userId: string, itemId: string) {
  const [inventory, exchangedToday] = await Promise.all([
    getUserInventory(userId),
    getUserExchangedToday(userId),
  ]);
  const existing = inventory.find((i) => i.itemId === itemId);

  if (!existing || existing.quantity <= 0) {
    return renderTraderMainView(userId);
  }

  const reg = getItemById(itemId);
  const regularUnitSell = reg?.sellPrice ?? existing.value;
  const traderUnitSell = getTraderSellPrice(reg ?? existing.itemId);
  const rarityBadge = reg ? RARITY_LABELS[reg.rarity].badge : '';
  const rarityLabel = reg ? RARITY_LABELS[reg.rarity].label : 'Item';
  const totalTraderPayout = traderUnitSell * existing.quantity;
  const remainingDailyExchanges = Math.max(0, DAILY_TRADER_EXCHANGE_LIMIT - exchangedToday);

  const embed = new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle(`${TRADER_EMOJIS.TRADER} Trader Deal: ${reg?.emoji ?? '<:19_contractdocument:1551660016514240532>'} ${existing.name}`)
    .setDescription(
      `*The merchant inspects the ${existing.name} under a brass loupe and nods approvingly.*\n\n` +
      `> **Owned in Stash:** \`${existing.quantity}x\`\n` +
      (reg?.buyPrice ? `> **Blackmarket Cost Price:** \`$${formatNumber(reg.buyPrice)}\`\n` : `> **Standard Fence Rate:** \`$${formatNumber(regularUnitSell)}\`\n`) +
      `> ${TRADER_EMOJIS.MONEYBAG} **Trader Premium Rate:** \`$${formatNumber(traderUnitSell)}\` **(+75% Profit over Cost)**\n` +
      `> ${TRADER_EMOJIS.EXCHANGE} **Daily Barter Allowance:** \`${remainingDailyExchanges} / ${DAILY_TRADER_EXCHANGE_LIMIT} remaining today\`\n\n` +
      `Choose what you want in exchange for this item:\n` +
      `• ${TRADER_EMOJIS.MONEYBAG} **Liquidate for Cash:** Receive **$${formatNumber(traderUnitSell)}** each.\n` +
      `• ${TRADER_EMOJIS.EXCHANGE} **Barter for Item:** Trade 1:1 for any other **${rarityLabel}** item of your choice.`,
    )
    .setFooter({
      text: 'Wandering Trader • Choose cash liquidation or item barter.',
    })
    .setTimestamp();

  if (reg?.description) {
    embed.addFields({
      name: `About ${reg.name} • ${rarityBadge}`,
      value: `> *${reg.description}*`,
    });
  }

  const btnRow = new ActionRowBuilder<ButtonBuilder>();

  // Button 1: Sell 1x for cash
  btnRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`trader_cash_1_${existing.itemId}`)
      .setLabel(`Take Cash ($${formatNumber(traderUnitSell)})`)
      .setEmoji(resolveComponentEmoji(TRADER_EMOJIS.MONEYBAG))
      .setStyle(ButtonStyle.Success),
  );

  // Button 2: Sell all for cash (if quantity > 1)
  if (existing.quantity > 1) {
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`trader_cash_all_${existing.itemId}`)
        .setLabel(`Sell All ${existing.quantity}x ($${formatNumber(totalTraderPayout)})`)
        .setEmoji(resolveComponentEmoji(TRADER_EMOJIS.MONEYBAG))
        .setStyle(ButtonStyle.Success),
    );
  }

  // Button 3: Manual quantity cash modal button
  btnRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`trader_btn_modal_cash_${existing.itemId}`)
      .setLabel('✏️ Set Cash Qty')
      .setStyle(ButtonStyle.Secondary),
  );

  // Button 4: Barter for an item
  btnRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`trader_open_barter_${existing.itemId}`)
      .setLabel(`Barter for Item`)
      .setEmoji(resolveComponentEmoji(TRADER_EMOJIS.EXCHANGE))
      .setStyle(ButtonStyle.Primary),
  );

  // Button 5: Back to stash
  btnRow.addComponents(
    new ButtonBuilder()
      .setCustomId('trader_back_main')
      .setLabel('↩️ Back')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, components: [btnRow] };
}

/**
 * Renders the barter selection view where the user chooses which item to receive in exchange.
 */
export async function renderTraderBarterView(userId: string, offeredItemId: string) {
  const [inventory, exchangedToday] = await Promise.all([
    getUserInventory(userId),
    getUserExchangedToday(userId),
  ]);
  const existing = inventory.find((i) => i.itemId === offeredItemId);

  if (!existing || existing.quantity <= 0) {
    return renderTraderMainView(userId);
  }

  const offeredReg = getItemById(offeredItemId);
  const eligibleItems = getEligibleExchangeItems(offeredItemId);
  const rarityLabel = offeredReg ? RARITY_LABELS[offeredReg.rarity].label : 'Same Rarity';
  const remainingDailyExchanges = Math.max(0, DAILY_TRADER_EXCHANGE_LIMIT - exchangedToday);

  const embed = new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle(`${TRADER_EMOJIS.EXCHANGE} Barter Exchange: ${offeredReg?.emoji ?? '<:19_contractdocument:1551660016514240532>'} ${existing.name}`)
    .setDescription(
      `*Select which **${rarityLabel}** item from the Trader's cache you want to receive in exchange for your **${existing.name}**.*\n\n` +
      `> **Offered Item:** ${offeredReg?.emoji ?? ''} **${existing.name}** *(Stash: ${existing.quantity}x)*\n` +
      `> ${TRADER_EMOJIS.EXCHANGE} **Exchange Ratio:** 1 : 1\n` +
      `> ${TRADER_EMOJIS.SCHEDULE} **Daily Barter Allowance:** \`${remainingDailyExchanges} / ${DAILY_TRADER_EXCHANGE_LIMIT} left today\` *(10 total across Wed & Thu)*\n\n` +
      `*Select an item below, then choose how many you want to exchange.*`,
    )
    .setFooter({
      text: 'Wandering Trader • Up to 5 total items exchanged per day.',
    })
    .setTimestamp();

  const rows: ActionRowBuilder<any>[] = [];

  if (remainingDailyExchanges <= 0) {
    embed.addFields({
      name: 'Daily Barter Limit Reached',
      value: '> You have already used all **5 item exchanges** for today. The merchant will accept new barters tomorrow!',
    });
  } else if (eligibleItems.length === 0) {
    embed.addFields({
      name: 'No Eligible Exchange Items',
      value: '> The Trader has no alternative items in this rarity tier right now.',
    });
  } else {
    const selectOptions = eligibleItems.map((item) => ({
      label: item.name,
      description: item.description.length > 50 ? `${item.description.slice(0, 47)}...` : item.description,
      value: item.id,
      emoji: resolveComponentEmoji(item.emoji),
    }));

    const barterMenu = new StringSelectMenuBuilder()
      .setCustomId(`trader_barter_select_${offeredItemId}`)
      .setPlaceholder(`Choose a ${rarityLabel} item to receive in exchange...`)
      .addOptions(selectOptions.slice(0, 25));

    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(barterMenu));
  }

  const backBtn = new ButtonBuilder()
    .setCustomId(`trader_item_view_${offeredItemId}`)
    .setLabel('↩️ Back to Offer')
    .setStyle(ButtonStyle.Secondary);

  const mainBtn = new ButtonBuilder()
    .setCustomId('trader_back_main')
    .setLabel('🏠 Stash Overview')
    .setStyle(ButtonStyle.Secondary);

  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn, mainBtn));

  return { embed, components: rows };
}

/**
 * Renders the barter quantity confirmation screen where user sets how many items to exchange.
 */
export async function renderTraderBarterQuantityView(
  userId: string,
  offeredItemId: string,
  desiredItemId: string,
) {
  const [inventory, exchangedToday] = await Promise.all([
    getUserInventory(userId),
    getUserExchangedToday(userId),
  ]);
  const existing = inventory.find((i) => i.itemId === offeredItemId);
  const offered = getItemById(offeredItemId);
  const desired = getItemById(desiredItemId);

  if (!existing || existing.quantity <= 0 || !offered || !desired) {
    return renderTraderMainView(userId);
  }

  const remainingDailyExchanges = Math.max(0, DAILY_TRADER_EXCHANGE_LIMIT - exchangedToday);
  const maxCanTrade = Math.min(existing.quantity, remainingDailyExchanges);

  const embed = new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle(`${TRADER_EMOJIS.EXCHANGE} Barter: ${offered.name} ➔ ${desired.name}`)
    .setDescription(
      `*Confirm how many units of ${offered.name} to barter for ${desired.name}:*\n\n` +
      `> **Give:** ${offered.emoji} **${offered.name}** *(You own: ${existing.quantity}x)*\n` +
      `> **Receive:** ${desired.emoji} **${desired.name}**\n` +
      `> ${TRADER_EMOJIS.SCHEDULE} **Daily Allowance Left:** \`${remainingDailyExchanges} / ${DAILY_TRADER_EXCHANGE_LIMIT} items\` *(10 total for Wed & Thu)*\n` +
      `> **Max You Can Barter Now:** \`${maxCanTrade} unit(s)\`\n\n` +
      `*Select a quick quantity below or click ✏️ Set Quantity to enter a custom amount.*`,
    )
    .setFooter({
      text: 'Wandering Trader • Item-for-item barter exchange.',
    })
    .setTimestamp();

  const btnRow = new ActionRowBuilder<ButtonBuilder>();

  if (maxCanTrade >= 1) {
    // Exchange 1x
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`trader_barter_exec_${offered.id}_${desired.id}_1`)
        .setLabel('Exchange 1x')
        .setEmoji(resolveComponentEmoji(TRADER_EMOJIS.EXCHANGE))
        .setStyle(ButtonStyle.Primary),
    );

    // Exchange Max (if > 1)
    if (maxCanTrade > 1) {
      btnRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`trader_barter_exec_${offered.id}_${desired.id}_${maxCanTrade}`)
          .setLabel(`Exchange Max (${maxCanTrade}x)`)
          .setEmoji(resolveComponentEmoji(TRADER_EMOJIS.EXCHANGE))
          .setStyle(ButtonStyle.Success),
      );
    }

    // Modal custom quantity button
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`trader_btn_modal_barter_${offered.id}_${desired.id}`)
        .setLabel('✏️ Set Quantity')
        .setStyle(ButtonStyle.Secondary),
    );
  } else {
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId('trader_no_allowance_btn')
        .setLabel('Daily Barter Limit Reached (0 left)')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
  }

  // Back button
  btnRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`trader_open_barter_${offered.id}`)
      .setLabel('↩️ Choose Other Item')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, components: [btnRow] };
}

/**
 * Handles button interactions for the Wandering Trader.
 */
export async function handleTraderButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  const userId = interaction.user.id;

  // 1. Modals: DO NOT deferUpdate before calling showModal
  if (customId.startsWith('trader_btn_modal_cash_')) {
    const itemId = customId.replace('trader_btn_modal_cash_', '');
    const inventory = await getUserInventory(userId);
    const existing = inventory.find((i) => i.itemId === itemId);
    const maxStash = existing?.quantity ?? 1;

    const modal = new ModalBuilder()
      .setCustomId(`trader_modal_cash_${itemId}`)
      .setTitle(`Sell ${existing?.name ?? 'Contraband'} for Cash`.slice(0, 45));

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

  if (customId.startsWith('trader_btn_modal_barter_')) {
    const parts = customId.split('_');
    // trader_btn_modal_barter_<offeredId>_<desiredId>
    const desiredId = parts.pop()!;
    const offeredId = parts.slice(4).join('_');

    const [inventory, exchangedToday] = await Promise.all([
      getUserInventory(userId),
      getUserExchangedToday(userId),
    ]);
    const existing = inventory.find((i) => i.itemId === offeredId);
    const remainingDailyExchanges = Math.max(0, DAILY_TRADER_EXCHANGE_LIMIT - exchangedToday);
    const maxCanTrade = Math.min(existing?.quantity ?? 1, remainingDailyExchanges);

    const modal = new ModalBuilder()
      .setCustomId(`trader_modal_barter_${offeredId}_${desiredId}`)
      .setTitle(`Barter ${existing?.name ?? 'Contraband'}`.slice(0, 45));

    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel(`Quantity to exchange (1 - ${maxCanTrade})`)
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
    await Promise.resolve(interaction.deferUpdate()).catch(() => undefined);
  }

  try {
    if (customId === 'trader_back_main' || customId === 'trader_refresh') {
      const view = isTraderAvailable()
        ? await renderTraderMainView(userId)
        : renderTraderClosedView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    } else if (customId === 'trader_to_blackmarket') {
      const view = await renderMarketCatalogView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    } else if (customId.startsWith('trader_item_view_')) {
      const itemId = customId.replace('trader_item_view_', '');
      const view = isTraderAvailable()
        ? await renderTraderItemDetailView(userId, itemId)
        : renderTraderClosedView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    } else if (customId.startsWith('trader_open_barter_')) {
      const itemId = customId.replace('trader_open_barter_', '');
      const view = isTraderAvailable()
        ? await renderTraderBarterView(userId, itemId)
        : renderTraderClosedView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    } else if (customId.startsWith('trader_cash_1_')) {
      const itemId = customId.replace('trader_cash_1_', '');
      const result = await sellItemToTrader(userId, itemId, 1);

      if (!result.success) {
        const errorEmbed = createErrorEmbed(result.message, 'Sale Declined');
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => undefined);
      } else {
        const item = result.item!;
        const successNotice = createSuccessEmbed(
          `${TRADER_EMOJIS.MONEYBAG} You sold **1x ${item.name}** to the Wandering Trader for **$${formatNumber(result.totalPayout)}** cash (+75% profit over blackmarket cost)!\n\n` +
          `> **Remaining in Stash:** \`${result.remainingInInventory}\`\n` +
          `> **Wallet Balance:** \`$${formatNumber(result.newWallet)}\``,
          'Contraband Sold',
        );
        await interaction.followUp({ embeds: [successNotice], ephemeral: true }).catch(() => undefined);
      }

      const view = isTraderAvailable()
        ? await renderTraderMainView(userId)
        : renderTraderClosedView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    } else if (customId.startsWith('trader_cash_all_')) {
      const itemId = customId.replace('trader_cash_all_', '');
      const inventory = await getUserInventory(userId);
      const existing = inventory.find((i) => i.itemId === itemId);
      const quantityToSell = existing?.quantity ?? 1;

      const result = await sellItemToTrader(userId, itemId, quantityToSell);

      if (!result.success) {
        const errorEmbed = createErrorEmbed(result.message, 'Sale Declined');
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => undefined);
      } else {
        const item = result.item!;
        const successNotice = createSuccessEmbed(
          `${TRADER_EMOJIS.MONEYBAG} You sold **${quantityToSell}x ${item.name}** to the Wandering Trader for **$${formatNumber(result.totalPayout)}** cash (+75% profit over blackmarket cost)!\n\n` +
          `> **Remaining in Stash:** \`${result.remainingInInventory}\`\n` +
          `> **Wallet Balance:** \`$${formatNumber(result.newWallet)}\``,
          'Contraband Liquidated',
        );
        await interaction.followUp({ embeds: [successNotice], ephemeral: true }).catch(() => undefined);
      }

      const view = isTraderAvailable()
        ? await renderTraderMainView(userId)
        : renderTraderClosedView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    } else if (customId.startsWith('trader_barter_exec_')) {
      const parts = customId.split('_');
      // trader_barter_exec_<offeredId>_<desiredId>_<quantity>
      const quantity = parseInt(parts.pop() ?? '1', 10) || 1;
      const desiredItemId = parts.pop()!;
      const offeredItemId = parts.slice(3).join('_');

      const result = await exchangeItemWithTrader(userId, offeredItemId, desiredItemId, quantity);

      if (!result.success) {
        const errorEmbed = createErrorEmbed(result.message, 'Barter Failed');
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => undefined);
      } else {
        const offered = result.offeredItem!;
        const desired = result.desiredItem!;
        const successNotice = createSuccessEmbed(
          `${TRADER_EMOJIS.EXCHANGE} You traded **${quantity}x ${offered.name}** for **${quantity}x ${desired.name}** (${desired.emoji}) with the Wandering Trader!\n\n` +
          `> **Remaining ${offered.name} in Stash:** \`${result.remainingOfferedInInventory}\`\n` +
          `> **Daily Barter Allowance Left:** \`${result.remainingDailyExchanges} / ${DAILY_TRADER_EXCHANGE_LIMIT}\` *(10 total for Wed & Thu)*`,
          'Barter Sealed',
        );
        await interaction.followUp({ embeds: [successNotice], ephemeral: true }).catch(() => undefined);
      }

      const view = isTraderAvailable()
        ? await renderTraderMainView(userId)
        : renderTraderClosedView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    }
  } catch (err) {
    log.error({ err, customId, userId }, 'Error handling trader button');
  }
}

/**
 * Handles dropdown select menu interactions for the Wandering Trader.
 */
export async function handleTraderSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (typeof interaction.deferUpdate === 'function') {
    await Promise.resolve(interaction.deferUpdate()).catch(() => undefined);
  }

  const customId = interaction.customId;
  const userId = interaction.user.id;
  const selectedValue = interaction.values[0];

  try {
    if (customId === 'trader_item_select') {
      const view = isTraderAvailable()
        ? await renderTraderItemDetailView(userId, selectedValue)
        : renderTraderClosedView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    } else if (customId.startsWith('trader_barter_select_')) {
      const offeredItemId = customId.replace('trader_barter_select_', '');
      const desiredItemId = selectedValue;

      // Open barter quantity screen
      const view = isTraderAvailable()
        ? await renderTraderBarterQuantityView(userId, offeredItemId, desiredItemId)
        : renderTraderClosedView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    }
  } catch (err) {
    log.error({ err, customId, userId }, 'Error handling trader select');
  }
}

/**
 * Handles modal submissions for manually specifying sell or exchange quantities with the Trader.
 */
export async function handleTraderModal(interaction: ModalSubmitInteraction): Promise<void> {
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
    if (customId.startsWith('trader_modal_cash_')) {
      const itemId = customId.replace('trader_modal_cash_', '');
      const result = await sellItemToTrader(userId, itemId, quantity);

      if (!result.success) {
        const errorEmbed = createErrorEmbed(result.message, 'Sale Declined');
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => undefined);
      } else {
        const item = result.item!;
        const successNotice = createSuccessEmbed(
          `${TRADER_EMOJIS.MONEYBAG} You sold **${quantity}x ${item.name}** to the Wandering Trader for **$${formatNumber(result.totalPayout)}** cash (+75% profit over blackmarket cost)!\n\n` +
          `> **Remaining in Stash:** \`${result.remainingInInventory}\`\n` +
          `> **Wallet Balance:** \`$${formatNumber(result.newWallet)}\``,
          'Contraband Sold',
        );
        await interaction.followUp({ embeds: [successNotice], ephemeral: true }).catch(() => undefined);
      }

      const view = isTraderAvailable()
        ? await renderTraderMainView(userId)
        : renderTraderClosedView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    } else if (customId.startsWith('trader_modal_barter_')) {
      const parts = customId.split('_');
      // trader_modal_barter_<offeredId>_<desiredId>
      const desiredId = parts.pop()!;
      const offeredId = parts.slice(3).join('_');

      const result = await exchangeItemWithTrader(userId, offeredId, desiredId, quantity);

      if (!result.success) {
        const errorEmbed = createErrorEmbed(result.message, 'Barter Failed');
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => undefined);
      } else {
        const offered = result.offeredItem!;
        const desired = result.desiredItem!;
        const successNotice = createSuccessEmbed(
          `${TRADER_EMOJIS.EXCHANGE} You traded **${quantity}x ${offered.name}** for **${quantity}x ${desired.name}** (${desired.emoji}) with the Wandering Trader!\n\n` +
          `> **Remaining ${offered.name} in Stash:** \`${result.remainingOfferedInInventory}\`\n` +
          `> **Daily Barter Allowance Left:** \`${result.remainingDailyExchanges} / ${DAILY_TRADER_EXCHANGE_LIMIT}\` *(10 total for Wed & Thu)*`,
          'Barter Sealed',
        );
        await interaction.followUp({ embeds: [successNotice], ephemeral: true }).catch(() => undefined);
      }

      const view = isTraderAvailable()
        ? await renderTraderMainView(userId)
        : renderTraderClosedView(userId);
      await interaction.editReply({
        embeds: [view.embed],
        components: view.components,
      });
    }
  } catch (err) {
    log.error({ err, customId, userId }, 'Error processing trader modal submit');
  }
}
