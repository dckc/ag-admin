// @ts-check
import { Far } from '@endo/marshal';
import { GoogleSpreadsheet } from 'google-spreadsheet'; // WARNING: ambient
import { assert } from '../../../agoric-sdk/packages/assert/src/assert';

import { lookup, upsert } from './sheetAccess.js';

/** @typedef {typeof import('google-spreadsheet').GoogleSpreadsheet} GoogleSpreadsheetT */

const assertKey = (key) => {
  assert(typeof key === 'string' || typeof key === 'number');
};

const { fromEntries, entries } = Object;

// TODO: use M. patterns from @agoric/store
const toData = (row) =>
  fromEntries(
    entries(row).filter(([_n, v]) =>
      ['boolean', 'number', 'string'].includes(typeof v),
    ),
  );

export const bootPlugin = () => {
  return Far('GoogleSheetsPlugin', {
    /**
     * @param {{
     *   credentials: {
     *     client_email: string,
     *     private_key: string,
     *   },
     *   sheetId: string,
     * }} opts
     *
     * see also https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication
     */
    start: async ({ credentials, sheetId }) => {
      assert.typeof(sheetId, 'string');
      const doc = new GoogleSpreadsheet(sheetId);

      assert.typeof(credentials, 'object');
      await doc.useServiceAccountAuth(credentials);
      await doc.loadInfo(); // loads document properties and worksheets
      console.log({ title: doc.title, sheetId });

      return Far('GoogleSpreadsheet', {
        sheetByIndex: (ix) => {
          const sheet = doc.sheetsByIndex[ix];
          return Far('GoogleSpreadsheetWorksheet', {
            lookup: async (key) => {
              assertKey(key);
              const row = await lookup(sheet, key);
              return toData(row);
            },
            upsert: async (key, record) => {
              assertKey(key);
              const row = await upsert(sheet, key, record);
              return toData(row);
            },
          });
        },
      });
    },
  });
};
