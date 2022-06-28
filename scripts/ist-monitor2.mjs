// @ts-check

// First, obtain a Hardened JS environment via Endo.
import '@endo/init/pre-remoting.js'; // needed only for the next line
import '@agoric/casting/node-fetch-shim.js'; // needed for Node.js
import '@endo/init';
import { makeMarshal } from '@endo/marshal';
import { decodeToJustin } from '@endo/marshal/src/marshal-justin.js';

import {
  iterateLatest,
  makeFollower,
  makeLeader,
  makeCastingSpec,
} from '@agoric/casting';

// agd query vstorage keys published.amm.metrics --node='https://xnet.rpc.agoric.net:443'

const makeBrandInfo = () => {
  const seen = new Map();
  const byName = new Map();
  const self = harden({
    /**
     *
     * @param {*} b
     * @param {string} [name]
     * @param {{ decimalPlaces?: number}} [param2]
     */
    add: (b, name = undefined, { decimalPlaces = 6 } = {}) => {
      if (!name) {
        const parts = `${b}`.match(/: ([^:]+) brand]$/);
        assert(parts, `brand??? ${b}`);
        name = parts[1];
      }
      if (seen.has(b)) {
        // ensure we give consistent info about brands;
        assert.equal(seen.get(b).name, name);
        assert.equal(seen.get(b).decimalPlaces, decimalPlaces);
        return;
      }
      seen.set(b, { name, decimalPlaces });
    },
    getName: brand => {
      self.add(brand);
      return seen.get(brand).name;
    },
    fmtAmount: ({ brand, value }) => {
      seen.has(brand) || self.add(brand);
      const { decimalPlaces } = seen.get(brand);
      return Number(value) / 10 ** decimalPlaces;
    },
  });
  return self;
};

const Fmt = {
  /** @param {bigint} n */
  bp: n => `${Number(n) / 100.0}%`,

  /** @param {bigint} n */
  duration: n => Number(n) / 60 / 60 / 24,

  ratio: ({ numerator, denominator }) => {
    assert.equal(numerator.brand, denominator.brand);
    return `${(Number(numerator.value) / Number(denominator.value)) * 100}%`;
  },
};

const { serialize } = makeMarshal();
export const unEval = (x, pretty = false) =>
  decodeToJustin(JSON.parse(serialize(harden(x)).body), pretty);

/**
 * @param {ReturnType<typeof makeLeader>} leader
 * @param {ReturnType<typeof makeBrandInfo>} brandInfo
 */
const monitorVaults = async (leader, brandInfo) => {
  const parts = {
    metrics: {
      sheet: 'collaterals',
      decode: value => {
        // console.debug(unEval(value));
        const { collaterals, rewardPoolAllocation: _ } = value;
        return collaterals.map(brand => ({ brand: brandInfo.getName(brand) }));
      },
    },
    governance: {
      sheet: 'vaultGov',
      decode: ({ current }) => {
        // console.log('vaultGov', unEval(current, true));
        const {
          // Electorate,
          // LiquidationInstall,
          LiquidationTerms: {
            value: { AMMMaxSlippage, MaxImpactBP, OracleTolerance },
          },
          MinInitialDebt,
          // ShortfallInvitation,
        } = current;
        return [
          {
            AMMMaxSlippage: Fmt.ratio(AMMMaxSlippage),
            MaxImpact: Fmt.bp(MaxImpactBP),
            OracleTolerance: Fmt.ratio(OracleTolerance),
            MinInitialDebt: brandInfo.fmtAmount(MinInitialDebt.value),
          },
        ];
      },
    },
    collateralParams: {
      sheet: 'collateralParams',
      decode: value => {
        console.log('collateralParams', unEval(value, true));
        const {
          current: {
            DebtLimit,
            InterestRate,
            LiquidationMargin,
            LiquidationPenalty,
            LoanFee,
          },
        } = value;
        return [
          {
            DebtLimit: brandInfo.fmtAmount(DebtLimit.value),
            InterestRate: Fmt.ratio(InterestRate.value),
            LiquidationMargin: Fmt.ratio(LiquidationMargin.value),
            LiquidationPenalty: Fmt.ratio(LiquidationPenalty.value),
            LoanFee: Fmt.ratio(LoanFee.value),
          },
        ];
      },
    },
    timingParams: {
      sheet: 'timingParams',
      decode: ({
        current: {
          ChargingPeriod: { value: cp },
          RecordingPeriod: { value: rp },
        },
      }) => [
        { chargingPeriod: Fmt.duration(cp), recordingPeriod: Fmt.duration(rp) },
      ],
    },
    // // TODO: N of these
    // manager0: {
    //   sheet: 'asset',
    //   decode: value => [value],
    // },
  };

  return Promise.all(
    Object.entries(parts).map(async ([key, part]) => {
      const follower = makeFollower(
        makeCastingSpec(`:published.vaultFactory.${key}`),
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

/**
 * @param {ReturnType<typeof makeLeader>} leader
 * @param {ReturnType<typeof makeBrandInfo>} brandInfo
 */
const monitorAMM = async (leader, brandInfo) => {
  const parts = {
    metrics: {
      sheet: 'swaps',
      decode: ({ XYK: brands }) => {
        return brands.map(b => ({ brand: brandInfo.getName(b) }));
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
            poolFee: Fmt.bp(poolFeeBP),
            protocolFeeBP: Fmt.bp(protocolFeeBP),
            minInitialPoolLiquidity: brandInfo.fmtAmount(
              minInitialPoolLiquidity,
            ),
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

const monitorIST = async ({ leader, clock: _TODO }) => {
  const brandInfo = makeBrandInfo();
  await Promise.all([
    monitorAMM(leader, brandInfo),
    monitorVaults(leader, brandInfo),
  ]);
};

// default leader is localhost
// const leader = makeLeader('https://xnet.agoric.net/network-config');
monitorIST({ leader: makeLeader(), clock: () => new Date() });
