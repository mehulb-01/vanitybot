import type { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import type { BotEvent } from '../loaders/eventLoader';
import { processOmertaPetitionReaction } from './gangInteractionHandler';

const event: BotEvent<'messageReactionAdd'> = {
  name: 'messageReactionAdd',
  execute: async (client, reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
    await processOmertaPetitionReaction(reaction, user, client);
  },
};

export default event;
