import type { BotEvent } from '../loaders/eventLoader';
import { childLogger } from '../../utils/logger';

const log = childLogger('event:error');

const event: BotEvent<'error'> = {
  name: 'error',
  execute: (_client, err) => {
    log.error({ err }, 'Discord client emitted an error.');
  },
};

export default event;
