// @ts-check
import { E } from '@endo/far';
import process from 'process'; // WARNING: ambient

const plugins = {
  sheets: {
    module: './src/plugin-sheets.js',
    key: 'workbook1',
  },
  tendermint: {
    module: './src/plugin-tendermint.js',
    key: 'tendermint1',
  },
  discord: {
    module: './src/plugin-discord.js',
    key: 'discord1',
  },
};

/** @template T @typedef {import('@endo/eventual-send').ERef<T>} ERef */
/** @typedef {typeof import('google-spreadsheet').GoogleSpreadsheet} GoogleSpreadsheetT */

/**
 * @param {ERef<{ scratch: ERef<Map> }>} homeP
 * @param {{
 *   pathResolve: (...paths: string[]) => string,
 *   installUnsafePlugin: (specifier: string, opts?: {}) => Promise<any>,
 * }} endowments
 *
 */
export const installPlugins = async (
  homeP,
  { pathResolve, installUnsafePlugin },
) => {
  const { scratch } = E.get(homeP);

  const {
    GOOGLE_SERVICES_EMAIL,
    GCS_PRIVATE_KEY,
    SHEET1_ID,
    TENDERMINT_HOST,
    DISCORD_API_TOKEN,
  } = process.env;

  if (SHEET1_ID && GOOGLE_SERVICES_EMAIL && GCS_PRIVATE_KEY) {
    const { module, key } = plugins.sheets;
    /** @type { GoogleSpreadsheetT } */
    const doc = await installUnsafePlugin(pathResolve(module), {
      credentials: {
        client_email: GOOGLE_SERVICES_EMAIL,
        private_key: GCS_PRIVATE_KEY,
      },
      sheetId: SHEET1_ID,
    });
    console.log({ sheetsPluginRoot: doc });
    await E(scratch).set(key, doc);
    const sheet = E(doc).sheetByTitle('players');
    const row = await E(sheet).lookup('Pete Rose');
    console.log({ row });
  }

  if (TENDERMINT_HOST) {
    const { module, key } = plugins.tendermint;
    const endpoint = await installUnsafePlugin(pathResolve(module), {
      host: TENDERMINT_HOST,
    });
    console.log({ endpoint });
    await E(scratch).set(key, endpoint);
  }

  if (DISCORD_API_TOKEN) {
    const { module, key } = plugins.discord;
    const discordAPI = await installUnsafePlugin(pathResolve(module), {
      apiToken: DISCORD_API_TOKEN,
    });
    await E(scratch).set(key, discordAPI);
    console.log({ key, discordAPI });
  }
};
harden(installPlugins);

export default installPlugins;
