// @ts-check

import '@agoric/zoe/exported.js';
import { E } from '@endo/eventual-send';
import bundleSource from '@endo/bundle-source';

const { entries } = Object;
const contractRoots = {
  supplier: './src/supplier.js',
  reviewer: './src/reviewer.js',
  advocate: './src/validatorAdvocate.js',
};

/**
 * @typedef {Object} DeployPowers The special powers that agoric deploy gives us
 * @property {(path: string) => string} pathResolve
 *
 * @typedef {Object} Board
 * @property {(id: string) => any} getValue
 * @property {(value: any) => string} getId
 * @property {(value: any) => boolean} has
 * @property {() => [string]} ids
 */

/**
 * @param {Promise<{zoe: ERef<ZoeService>, board: ERef<Board>, agoricNames:
 * Object, wallet: ERef<Object>, faucet: ERef<Object>}>} homeP
 * @param {DeployPowers} powers
 */
const deployContract = async (homeP, { pathResolve }) => {
  const { zoe, board, scratch } = E.get(homeP);

  await Promise.all(
    entries(contractRoots).map(async ([name, root]) => {
      const fullPath = pathResolve(root);
      const bundle = await bundleSource(fullPath);
      const installation = await E(zoe).install(bundle);

      // const boardId = await E(board).getId(installation);
      // await E(scratch).set(`installation.id.${name}`, boardId);
      await E(scratch).set(`installation.${name}`, installation);
      console.log('installed', { name });
    }),
  );
};

export default deployContract;
