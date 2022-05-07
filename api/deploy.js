// @ts-check
import { E } from '@endo/far';
import process from 'process'; // WARNING: ambient

const sheetsPluginModule = './src/plugin-sheets.js';
const theWorkbookKey = 'workbook1';

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
export const installSheetsPlugin = async (
  homeP,
  { pathResolve, installUnsafePlugin },
) => {
  const { GOOGLE_SERVICES_EMAIL, GCS_PRIVATE_KEY, SHEET1_ID } = process.env;
  if (!(GOOGLE_SERVICES_EMAIL && GCS_PRIVATE_KEY)) {
    throw Error('no credentials');
  }
  if (!SHEET1_ID) {
    throw Error('which sheet?');
  }

  const { scratch } = E.get(homeP);

  /** @type { GoogleSpreadsheetT } */
  const doc = await installUnsafePlugin(pathResolve(sheetsPluginModule), {
    credentials: {
      client_email: GOOGLE_SERVICES_EMAIL,
      private_key: GCS_PRIVATE_KEY,
    },
    sheetId: SHEET1_ID,
  });
  console.log({ sheetsPluginRoot: doc });
  await E(scratch).set(theWorkbookKey, doc);
  const sheet = E(doc).sheetByIndex(0);
  const row = await E(sheet).lookup('Pete Rose');
  console.log({ row });
};
harden(installSheetsPlugin);

export default installSheetsPlugin;
