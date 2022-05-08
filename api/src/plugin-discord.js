// @ts-check
/* global setTimeout */

import { Far } from '@endo/marshal';
import https from 'https'; // WARNING: ambient

import { DiscordAPI } from './discordGuild.js';

export const bootPlugin = () => {
  const { get } = https;

  return Far('TendermintRPCPlugin', {
    /**
     * @param {{
     *   apiToken: string,
     * }} opts
     */
    start: async ({ apiToken }) => {
      assert.typeof(apiToken, 'string');
      const discordAPI = DiscordAPI(apiToken, { get, setTimeout });

      return Far('DiscordAccess', {
        // copy with {...obj} to avoid:
        // Error: Remotable ... is already frozen
        guilds: (id) => Far('Guild', { ...discordAPI.guilds(id) }),
        channels: (id) => Far('Channel', { ...discordAPI.channels(id) }),
      });
    },
  });
};
