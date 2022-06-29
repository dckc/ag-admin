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

import * as sheetAccess from '../api/src/sheetAccess.cjs';

// agd query vstorage keys published.amm.metrics --node='https://xnet.rpc.agoric.net:443'

const { entries, fromEntries } = Object;

const mapValues = (obj, f) =>
  fromEntries(entries(obj).map(([k, v]) => [k, f(v)]));

/** @typedef {ReturnType<typeof makeBrandInfo>} BrandInfo */
const makeBrandInfo = () => {
  const seen = new Map();
  const byName = new Map();
  const self = harden({
    /**
     * @param {Brand} b
     * @param {string} [name]
     * @param {{ decimalPlaces?: number}} [param2]
     */
    add: (b, name = undefined, { decimalPlaces = 6 } = {}) => {
      if (seen.has(b)) {
        assert(!name);
        return;
      }
      if (!name) {
        const parts = `${b}`.match(/: ([^:]+) brand]$/);
        assert(parts, `brand??? ${b}`);
        name = parts[1];
        console.warn('inferred brand name:', { iface: `${b}`, name });
      }
      if (byName.has(name)) {
        // ISSUE: unmarshaling doesn't work like I thought.
        console.warn(`duplicate brand for ${name}: ${b}`);
      } else {
        byName.set(name, b);
      }
      seen.set(b, { name, decimalPlaces });
    },
    getName: brand => {
      self.add(brand);
      return seen.get(brand).name;
    },
    fmtAmount: ({ brand, value }) => {
      self.add(brand);
      const { decimalPlaces } = seen.get(brand);
      return Number(value) / 10 ** decimalPlaces;
    },
  });
  return self;
};

const Fmt = {
  /** @param {bigint} n */
  bp: n => Number(n) / 10000.0,

  /** @param {bigint} n */
  duration: n => Number(n) / 60 / 60 / 24,

  /** @param {Ratio} x */
  ratio: ({ numerator, denominator }) => {
    assert.equal(numerator.brand, denominator.brand);
    return Number(numerator.value) / Number(denominator.value);
  },

  item: ({ type, value }, brandInfo) => {
    switch (type) {
      case 'amount':
        return brandInfo.fmtAmount(value);
      case 'ratio':
        return Fmt.ratio(value);
      case 'nat':
        return Fmt.duration(value);
      default:
        throw Error(`not impl: ${type}`);
    }
  },
};

const { serialize } = makeMarshal();
export const unEval = (x, pretty = false) =>
  decodeToJustin(JSON.parse(serialize(harden(x)).body), pretty);

/**
 * @param {number} ix
 * @param {Brand} brand
 * @param {Leader} leader
 * @param {BrandInfo} brandInfo
 * @param {Upsert} upsert
 */
const monitorCollateral = async (ix, brand, leader, brandInfo, upsert) => {
  let seq = 0; // ISSUE: stable sequence numbers between runs
  const name = brandInfo.getName(brand);
  const parts = {
    metrics: {
      sheet: `asset`,
      decode: ({ numVaults, numLiquidationsCompleted, ...amounts }) => [
        {
          key: (seq += 1),
          row: {
            brand: name,
            collateral: brandInfo.getName(brand),
            numVaults,
            numLiquidationsCompleted,
            ...mapValues(amounts, brandInfo.fmtAmount),
          },
        },
      ],
    },
    governance: {
      sheet: `asset`,
      decode: ({ current }) => [
        {
          key: (seq += 1),
          row: {
            brand: name,
            ...mapValues(current, v => Fmt.item(v, brandInfo)),
          },
        },
      ],
    },
  };

  return Promise.all(
    entries(parts).map(async ([child, part]) => {
      const follower = makeFollower(
        makeCastingSpec(`:published.vaultFactory.manager${ix}.${child}`),
        leader,
      );

      for await (const { value } of iterateLatest(follower)) {
        // console.debug('item', item);
        for (const { key, row } of part.decode(value)) {
          upsert(part.sheet, key, row);
        }
      }
    }),
  );
};

/**
 * @param {Leader} leader
 * @param {BrandInfo} brandInfo
 * @param {Upsert} upsert
 */
const monitorVaults = async (leader, brandInfo, upsert) => {
  const seen = new Set();
  let seq = 0;

  const parts = {
    metrics: {
      sheet: 'collaterals',
      decode: value => {
        // console.debug(unEval(value));
        const { collaterals, rewardPoolAllocation: _ } = value;
        for (const brand of collaterals) {
          if (!seen.has(brand)) {
            monitorCollateral(
              seen.size,
              brand,
              leader,
              brandInfo,
              upsert,
            ).catch(err => console.error('vault??', err));
            seen.add(brand);
          }
        }
        return collaterals.map(brand => ({
          key: JSON.stringify([(seq += 1), brandInfo.getName(brand)]),
          row: { brand: brandInfo.getName(brand) },
        }));
      },
    },
    governance: {
      sheet: 'vaultGov',
      decode: ({ current }) => {
        // console.debug('vaultGov', unEval(current, true));
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
            key: (seq += 1),
            row: {
              AMMMaxSlippage: Fmt.ratio(AMMMaxSlippage),
              MaxImpact: Fmt.bp(MaxImpactBP),
              OracleTolerance: Fmt.ratio(OracleTolerance),
              MinInitialDebt: brandInfo.fmtAmount(MinInitialDebt.value),
            },
          },
        ];
      },
    },
    // dup of collateral governance?
    // collateralParams: {
    //   sheet: 'collateralParams',
    //   decode: value => {
    //     // console.debug('collateralParams', unEval(value, true));
    //     const {
    //       current: {
    //         DebtLimit,
    //         InterestRate,
    //         LiquidationMargin,
    //         LiquidationPenalty,
    //         LoanFee,
    //       },
    //     } = value;
    //     return [
    //       {
    //         key: (seq += 1),
    //         row: {
    //           ...mapValues(
    //             {
    //               DebtLimit,
    //               InterestRate,
    //               LiquidationMargin,
    //               LiquidationPenalty,
    //               LoanFee,
    //             },
    //             v => Fmt.item(v, brandInfo),
    //           ),
    //         },
    //       },
    //     ];
    //   },
    // },
    timingParams: {
      sheet: 'timingParams',
      decode: ({ current: { ChargingPeriod, RecordingPeriod } }) => [
        {
          key: (seq += 1),
          row: {
            ...mapValues({ ChargingPeriod, RecordingPeriod }, v =>
              Fmt.item(v, brandInfo),
            ),
          },
        },
      ],
    },
  };

  return Promise.all(
    entries(parts).map(async ([child, part]) => {
      const follower = makeFollower(
        makeCastingSpec(`:published.vaultFactory.${child}`),
        leader,
      );

      for await (const { value } of iterateLatest(follower)) {
        // console.debug('item', item);
        for (const { key, row } of part.decode(value)) {
          upsert(part.sheet, key, row);
        }
      }
    }),
  );
};

/**
 * @param {Leader} leader
 * @param {BrandInfo} brandInfo
 * @param {Upsert} upsert
 */
const monitorAMM = async (leader, brandInfo, upsert) => {
  let seq = 0;

  const parts = {
    metrics: {
      sheet: 'pools',
      decode: ({ XYK: brands }) => {
        return brands.map(b => {
          const name = brandInfo.getName(b);
          return { key: name, row: { brand: name } };
        });
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
            key: (seq += 1),
            row: {
              PoolFee: Fmt.bp(poolFeeBP),
              ProtocolFee: Fmt.bp(protocolFeeBP),
              MinInitialPoolLiquidity: brandInfo.fmtAmount(
                minInitialPoolLiquidity,
              ),
            },
          },
        ];
      },
    },
  };

  return Promise.all(
    entries(parts).map(async ([child, part]) => {
      const follower = makeFollower(
        makeCastingSpec(`:published.amm.${child}`),
        leader,
      );

      for await (const { value } of iterateLatest(follower)) {
        // console.debug('item', item);
        for (const { key, row } of part.decode(value)) {
          upsert(part.sheet, key, row);
        }
      }
    }),
  );
};

/**
 * @param {Record<string, string|undefined>} env
 * @param {Object} io
 * @param {Leader} io.leader
 * @param {Clock} io.clock
 * @param {typeof import('google-spreadsheet').GoogleSpreadsheet} io.GoogleSpreadsheet
 * @typedef {ReturnType<typeof makeLeader>} Leader
 * @typedef {() => Date} Clock
 * @typedef {(sheet: string, key: string|number, row: Row) => void} Upsert
 * @typedef {Record<string, string|number>} Row
 */
const monitorIST = async (env, { leader, clock, GoogleSpreadsheet }) => {
  const brandInfo = makeBrandInfo();

  // Initialize the sheet - doc ID is the long id in the sheets URL
  const doc = new GoogleSpreadsheet(env.SHEET2_ID);
  const creds = {
    client_email: env.GOOGLE_SERVICES_EMAIL,
    private_key: env.GCS_PRIVATE_KEY,
  };
  // Initialize Auth - see https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);

  /** @type {Upsert} */
  const upsert = (sheetName, key, row) => {
    const rowT = {
      key,
      ...row,
      insertedAt: clock().toISOString().replace(/Z$/, ''),
    };
    console.log(sheetName, ': upsert @', key, rowT);
    const sheet = doc.sheetsByTitle[sheetName];
    assert(sheet, sheetName);
    sheetAccess.upsert(sheet, key, rowT);
  };

  await Promise.all([
    monitorAMM(leader, brandInfo, upsert),
    monitorVaults(leader, brandInfo, upsert),
  ]);
};

// default leader is localhost
// const leader = makeLeader('https://xnet.agoric.net/network-config');
/* global process */
import('google-spreadsheet')
  .then(({ GoogleSpreadsheet }) => {
    monitorIST(
      { ...process.env },
      { GoogleSpreadsheet, leader: makeLeader(), clock: () => new Date() },
    );
  })
  .catch(err => console.error(err));
