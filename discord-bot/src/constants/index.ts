export const Colors = {
  SUCCESS: 0x800000,
  ERROR: 0x800000,
  WARNING: 0x800000,
  INFO: 0x800000,
  NEUTRAL: 0x800000,
} as const;

export const Emojis = {
  SUCCESS: '<:11_check_green:1548395771852754944>',
  ERROR: '<:10_warning_triangle:1548395769562665174>',
  WARNING: '<:10_warning_triangle:1548395769562665174>',
  INFO: '<:info:1551698028404936746>',
  LOADING: '⏳',
} as const;

export const CategoryEmojis = {
  ALL: '<:06_globe_cursor:1548396159016374312>',
  UTILITY: '<:25_gear_wrench:1548396205585993748>',
  MODERATION: '<:73_wingedstar:1551660154875936867>',
  MUSIC: '<:25_applemusic:1551671651672784926>',
  GANGS: '<:11_folder_cursor:1548658839346352148>',
} as const;

export const CATEGORY_ORDER = ['utility', 'moderation', 'music', 'gangs'] as const;

export const CommandCategoryLabels: Record<string, string> = {
  utility: `${CategoryEmojis.UTILITY} Utils`,
  moderation: `${CategoryEmojis.MODERATION} Moderation`,
  music: `${CategoryEmojis.MUSIC} Music`,
  gangs: `${CategoryEmojis.GANGS} Gangs`,
  economy: `${CategoryEmojis.GANGS} Gangs`,
};
