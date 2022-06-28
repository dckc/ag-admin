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

// Iterate over a mailbox follower on the devnet.
const monitorPools = async leader => {
  const key = ':published.amm.governance';
  const castingSpec = makeCastingSpec(key);
  const follower = makeFollower(castingSpec, leader);
  for await (const { value } of iterateLatest(follower)) {
    console.log(`${key} value`, Object.keys(value.current));
    const {
      // Electorate: { value: electorate },
      MinInitialPoolLiquidity: {
        value: { value: minInitialPoolLiquidity },
      },
      PoolFee: { value: poolFeeBP },
      ProtocolFee: { value: protocolFeeBP },
    } = value.current;
    console.log('addr row:', {
      poolFee: bp(poolFeeBP),
      protocolFeeBP: bp(protocolFeeBP),
      minInitialPoolLiquidity: decimal(minInitialPoolLiquidity, 6),
    });
  }
};

const monitorIST = async ({ leader, clock }) => {
  await Promise.all([monitorPools(leader, clock)]);
};

// default leader is localhost
// const leader = makeLeader('https://xnet.agoric.net/network-config');
monitorIST({ leader: makeLeader(), clock: () => new Date() });
