// First, obtain a Hardened JS environment via Endo.
import '@endo/init/pre-remoting.js'; // needed only for the next line
import '@agoric/casting/node-fetch-shim.js'; // needed for Node.js
import '@endo/init';

import {
  iterateLatest,
  makeFollower,
  makeLeader,
  makeCastingSpec,
} from '@agoric/casting';

// agd query vstorage keys published.amm.metrics --node='https://xnet.rpc.agoric.net:443'

/**
 * @param {bigint} n
 * @param {number} exp
 * @returns {number}
 */
const decimal = (n, exp) => Number(n) / 10 ** exp;

const bp = n => `${Number(n) / 100.0}%`;

const fmtBrand = b => `${b}`; // TODO

const monitorAMM = async leader => {
  const parts = {
    metrics: {
      sheet: 'swaps',
      decode: ({ XYK: brands }) => {
        return brands.map(b => ({ brand: fmtBrand(b) }));
      },
    },
    governance: {
      sheet: 'ammGov',
      decode: value => {
        // console.debug(`amm gov update`, Object.keys(value.current));
        const {
          // Electorate: { value: electorate },
          MinInitialPoolLiquidity: { value: minInitialPoolLiquidity },
          PoolFee: { value: poolFeeBP },
          ProtocolFee: { value: protocolFeeBP },
        } = value.current;
        return [
          {
            poolFee: bp(poolFeeBP),
            protocolFeeBP: bp(protocolFeeBP),
            minInitialPoolLiquidity: decimal(minInitialPoolLiquidity.value, 6),
          },
        ];
      },
    },
  };

  return Promise.all(
    Object.entries(parts).map(async ([key, part]) => {
      const follower = makeFollower(
        makeCastingSpec(`:published.amm.${key}`),
        leader,
      );

      for await (const { value } of iterateLatest(follower)) {
        // console.debug('item', item);
        for (const row of part.decode(value)) {
          console.log(part.sheet, 'add row:', row);
        }
      }
    }),
  );
};

const monitorIST = async ({ leader, clock }) => {
  await Promise.all([monitorAMM(leader, clock)]);
};

// default leader is localhost
// const leader = makeLeader('https://xnet.agoric.net/network-config');
monitorIST({ leader: makeLeader(), clock: () => new Date() });
