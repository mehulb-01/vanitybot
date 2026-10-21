import pino from 'pino';
import { appConfig } from '../config/config';

/**
 * Central structured logger. Never log secrets (tokens, connection strings,
 * raw stack traces to Discord users). This is for operators, not players.
 */
export const logger = pino({
  level: appConfig.logging.level,
  transport: appConfig.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
  base: undefined,
});

export function childLogger(scope: string) {
  return logger.child({ scope });
}
