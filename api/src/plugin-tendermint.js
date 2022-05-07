// @ts-check
import { Far } from '@endo/marshal';
import https from 'https'; // WARNING: ambient

import { searchBySender, transfers } from './tendermintRPC.js';
import { getContent } from './discordGuild.js';

export const bootPlugin = () => {
  const { get } = https;

  return Far('TendermintRPCPlugin', {
    /**
     * @param {{
     *   host: string,
     * }} opts
     */
    start: async ({ host }) => {
      assert.typeof(host, 'string');

      return Far('TendermintRPCEndpoint', {
        searchBySender: async (address) => {
          assert.typeof(address, 'string');
          const txt = await getContent(
            host,
            searchBySender(address),
            {},
            { get },
          );
          return JSON.parse(txt).result.txs;
        },
        transfers,
      });
    },
  });
};
