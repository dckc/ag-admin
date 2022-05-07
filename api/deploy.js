// @ts-check

import { E } from '@endo/far';

/**
 *
 * @param {ERef<Home>} homeP
 * @param {{
 *   pathResolve: (...paths: string[]) => string,
 *   installUnsafePlugin: (specifier: string, opts?: {}) => Promise<unknown>,
 * }} endowments
 */
export const installSheetsPlugin = async (
  homeP,
  { pathResolve, installUnsafePlugin },
) => {
  const { scratch } = E.get(homeP);
  const sheetsPlugin = await installUnsafePlugin(
    pathResolve('./src/plugin-sheets.js'),
    { prefix: 'GS: ' },
  );
  console.log({ sheetsPlugin });
  await E(scratch).set('sheetsPlugin', sheetsPlugin);
  const answer = await E(sheetsPlugin).ping('Watson, come quickly!');
  console.log({ answer });
};
harden(installSheetsPlugin);

export default installSheetsPlugin;
