export type GameItemRarity = 'basic' | 'uncommon' | 'rare' | 'mythic' | 'legendary';
export type ItemRarity = GameItemRarity;

export interface GameItem {
  id: string;
  name: string;
  emoji: string;
  rarity: GameItemRarity;
  description: string;
  buyPrice: number | null; // null if item cannot be purchased (e.g. Legendary)
  sellPrice: number;
  dailyStock: number; // Max units available per user per daily catalog
}

export const GAME_ITEMS: GameItem[] = [
  // --- BASIC (5 Items: $2,500 - $4,500 buy, $1,250 - $2,250 sell) ---
  {
    id: 'counterfeit_pendant',
    name: 'Counterfeit Pendant',
    emoji: '<:01_locketphoto:1552360640331386910>',
    rarity: 'basic',
    description: 'A faux-gold pendant set with cubic zirconia, deceptively weighted to pass street appraisal.',
    buyPrice: 2500,
    sellPrice: 1250,
    dailyStock: 5,
  },
  {
    id: 'burner_pager',
    name: 'Burner Pager',
    emoji: '<:02_pager:1552360642713755699>',
    rarity: 'basic',
    description: 'An untraceable analog numeric pager used for encrypted short codes and dead drops.',
    buyPrice: 3200,
    sellPrice: 1600,
    dailyStock: 5,
  },
  {
    id: 'sussy_usb',
    name: 'Sussy USB',
    emoji: '<:03_mysteryusb:1552360644995711076>',
    rarity: 'basic',
    description: 'A suspiciously taped flash drive loaded with corrupted payloads and backdoors.',
    buyPrice: 3800,
    sellPrice: 1900,
    dailyStock: 5,
  },
  {
    id: 'silver_karambit',
    name: 'Silver Karambit',
    emoji: '<:04_karambitknife:1552360648032133211>',
    rarity: 'basic',
    description: 'A curved, nickel-silver tactical blade favored by syndicate street enforcers.',
    buyPrice: 4200,
    sellPrice: 2100,
    dailyStock: 4,
  },
  {
    id: 'militia_dogtags',
    name: 'Militia Dogtags',
    emoji: '<:05_dogtags:1552360650926456853>',
    rarity: 'basic',
    description: 'Tarnished steel tags recovered from rogue paramilitary defectors.',
    buyPrice: 4500,
    sellPrice: 2250,
    dailyStock: 4,
  },

  // --- UNCOMMON (5 Items: $18,000 - $35,000 buy, $9,000 - $17,500 sell) ---
  {
    id: 'lucky_bullet',
    name: 'Lucky Bullet',
    emoji: '<:06_luckybullet:1552360653321273344>',
    rarity: 'uncommon',
    description: 'An engraved hollow-point brass round kept as a superstitious talisman by mob hitmen.',
    buyPrice: 18000,
    sellPrice: 9000,
    dailyStock: 3,
  },
  {
    id: 'encrypted_casette',
    name: 'Encrypted Casette',
    emoji: '<:07_mixtapecassette:1552360656286515200>',
    rarity: 'uncommon',
    description: 'Magnetic tape containing garbled wiretaps and whispered offshore account coordinates.',
    buyPrice: 24000,
    sellPrice: 12000,
    dailyStock: 3,
  },
  {
    id: 'ghostcard',
    name: 'Ghostcard',
    emoji: '<:08_keycardfob:1552360660006867024>',
    rarity: 'uncommon',
    description: 'A cloned magnetic-stripe card programmed to exploit automated cash dispenser loops.',
    buyPrice: 28000,
    sellPrice: 14000,
    dailyStock: 3,
  },
  {
    id: 'fake_passport',
    name: 'Fake Passport',
    emoji: '<:09_passport:1552360662494093422>',
    rarity: 'uncommon',
    description: 'Flawlessly forged diplomatic passport stamped with nonexistent maritime transit visas.',
    buyPrice: 32000,
    sellPrice: 16000,
    dailyStock: 2,
  },
  {
    id: 'bounty_sheet',
    name: 'Bounty Sheet',
    emoji: '<:10_redactedphoto:1552360664884842546>',
    rarity: 'uncommon',
    description: 'An underworld ledger page listing active syndicate bounties and high-value targets.',
    buyPrice: 35000,
    sellPrice: 17500,
    dailyStock: 2,
  },

  // --- RARE (5 Items: $130,000 - $220,000 buy, $65,000 - $110,000 sell) ---
  {
    id: 'auction_ledger',
    name: 'Auction Ledger',
    emoji: '<:11_spellbookcrown:1552360667439431690>',
    rarity: 'rare',
    description: 'Private registry detailing covert private bids, smuggled relics, and illicit buyers.',
    buyPrice: 130000,
    sellPrice: 65000,
    dailyStock: 2,
  },
  {
    id: 'skullcase',
    name: 'Skullcase',
    emoji: '<:12_crackedphoneskull:1552360669884584017>',
    rarity: 'rare',
    description: 'A matte-black armored strongbox branded with a sinister embossed syndicate skull.',
    buyPrice: 155000,
    sellPrice: 77500,
    dailyStock: 2,
  },
  {
    id: 'bloodchip',
    name: 'Bloodchip',
    emoji: '<:13_pokerchipcrown:1552360672464085093>',
    rarity: 'rare',
    description: 'High-stakes underground casino token stained with dry blood, redeemable in the shadows.',
    buyPrice: 175000,
    sellPrice: 87500,
    dailyStock: 2,
  },
  {
    id: 'vanishing_coin',
    name: 'Vanishing Coin',
    emoji: '<:14_sunmoonamulet:1552360674775273482>',
    rarity: 'rare',
    description: 'An illusionist-grade trick coin used by tricksters to cheat high-roller coin tosses.',
    buyPrice: 195000,
    sellPrice: 97500,
    dailyStock: 2,
  },
  {
    id: 'smugglers_compass',
    name: "Smuggler's Compass",
    emoji: '<:15_compass:1552360677463695480>',
    rarity: 'rare',
    description: 'An antique brass navigational compass modified to point toward uncharted coastal coves.',
    buyPrice: 220000,
    sellPrice: 110000,
    dailyStock: 1,
  },

  // --- MYTHIC (4 Items: Over $800,000 buy, $450,000 - $500,000 sell) ---
  {
    id: 'black_ledger',
    name: 'Black Ledger',
    emoji: '<:16_evileyebook:1552360680319881326>',
    rarity: 'mythic',
    description: 'A devastating syndicate extortion journal detailing compromised judges, cops, and ministers.',
    buyPrice: 890000,
    sellPrice: 460000,
    dailyStock: 1,
  },
  {
    id: 'phantom_license',
    name: 'Phantom License',
    emoji: '<:17_blockedidcard:1552360682694119495>',
    rarity: 'mythic',
    description: 'An untouchable sovereign immunity credential forged by international shadow cartels.',
    buyPrice: 980000,
    sellPrice: 480000,
    dailyStock: 1,
  },
  {
    id: 'midnight_key',
    name: 'Midnight Key',
    emoji: '<:18_moonkey:1552360685311230012>',
    rarity: 'mythic',
    description: 'An ornate skeleton key said to open any high-security vault door in the city before dawn.',
    buyPrice: 1100000,
    sellPrice: 495000,
    dailyStock: 1,
  },
  {
    id: 'devils_contract',
    name: "Devil's Contract",
    emoji: '<:19_sealedscroll:1552360687895056474>',
    rarity: 'mythic',
    description: 'A binding, blood-sealed pact written on blackened vellum granting unholy underground fortune.',
    buyPrice: 1250000,
    sellPrice: 500000,
    dailyStock: 1,
  },

  // --- LEGENDARY (3 Items: Unbuyable, Sells for strictly $30,000,000) ---
  {
    id: 'lazarus',
    name: 'Lazarus',
    emoji: '<:20_healthvial:1552360690444931264>',
    rarity: 'legendary',
    description: 'A mythical alchemical vial rumored to cheat death and command ungodly dominion.',
    buyPrice: null,
    sellPrice: 30000000,
    dailyStock: 0,
  },
  {
    id: 'red_mercury',
    name: 'Red Mercury',
    emoji: '<:21_redcrystalcluster:1552360692680761496>',
    rarity: 'legendary',
    description: 'An ultra-rare radioactive compound sought after by global warlords and shadow cartels.',
    buyPrice: null,
    sellPrice: 30000000,
    dailyStock: 0,
  },
  {
    id: 'monarch_brooch',
    name: 'Monarch Brooch',
    emoji: '<:22_jeweledcrown:1552360694874116106>',
    rarity: 'legendary',
    description: 'An imperial royal jewel encrusted with uncut black diamonds and blood rubies.',
    buyPrice: null,
    sellPrice: 30000000,
    dailyStock: 0,
  },
];

export const RARITY_LABELS: Record<GameItemRarity, { label: string; badge: string; color: string }> = {
  basic: {
    label: 'Basic',
    badge: '<:ba:1552403183924674570><:sic:1552403180829155368>',
    color: '#9E9E9E',
  },
  uncommon: {
    label: 'Uncommon',
    badge: '<:unco:1552364386297847888><:mmon:1552364389238046790>',
    color: '#4CAF50',
  },
  rare: {
    label: 'Rare',
    badge: '<:ra:1552404424461258802><:re:1552404421957390408>',
    color: '#2196F3',
  },
  mythic: {
    label: 'Mythic',
    badge: '<:myt:1552385951014199398><:hic:1552385948405469335>',
    color: '#9C27B0',
  },
  legendary: {
    label: 'Legendary',
    badge: '<:legen:1552387382173507584><:dary:1552387379786944612>',
    color: '#FFD700',
  },
};

/**
 * Looks up an item by ID, normalized identifier, or display name (case-insensitive).
 */
export function getItemById(idOrName: string): GameItem | undefined {
  if (!idOrName) return undefined;
  const raw = idOrName.trim().toLowerCase();
  const normalized = raw.replace(/['’\s-]+/g, '_');

  return GAME_ITEMS.find(
    (item) =>
      item.id === idOrName ||
      item.id === raw ||
      item.id === normalized ||
      item.name.toLowerCase() === raw ||
      item.name.toLowerCase().replace(/['’\s-]+/g, '_') === normalized,
  );
}

export function getAllItems(): GameItem[] {
  return [...GAME_ITEMS];
}

export function getItemsByRarity(rarity: GameItemRarity): GameItem[] {
  return GAME_ITEMS.filter((item) => item.rarity === rarity);
}
