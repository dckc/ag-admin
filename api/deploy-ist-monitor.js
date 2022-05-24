// @ts-check
import { E } from '@endo/far';
import { makeNotifierFromAsyncIterable } from '@agoric/notifier';

import '@agoric/store';
import '@agoric/wallet-backend/exported.js'; // for WalletUser
import '@agoric/zoe/exported.js'; // for ZoeService

const { quote: q } = assert;

/** @template T @typedef {import('@endo/eventual-send').ERef<T>} ERef */
/** @typedef {typeof import('@agoric/run-protocol/src/vpool-xyk-amm/multipoolMarketMaker.js').start} XYKAMMContractStart */
/** @typedef {Awaited<ReturnType<XYKAMMContractStart>>['publicFacet']} XYKAMMPublicFacet */

/**
 * @param {ERef<Notifier<T>>} notifier
 * @param {(update: {updateCount: number|undefined, value: T}) => void} f
 * @template T
 */
const forEachNotice = async (notifier, f) => {
  for (let updateCount; ; ) {
    // eslint-disable-next-line no-await-in-loop
    const update = await E(notifier).getUpdateSince(updateCount);
    // eslint-disable-next-line no-await-in-loop
    await f(update);
    updateCount = update.updateCount;
    if (updateCount === undefined) {
      return;
    }
  }
};

/**
 * @param {Petname} n
 * TODO: assert " not in simple names
 */
const fmtPetname = (n) => (typeof n === 'string' ? n : JSON.stringify(n));

/**
 * @param {string} table
 * @param {string | string[]} key
 * @param {Record<string, string | number>} detail
 */
const mockUpsert = async (table, key, detail) => {
  const keyVal =
    typeof key === 'string'
      ? detail[key]
      : JSON.stringify(key.map((col) => detail[col]));
  const record = typeof key === 'string' ? detail : { Key: keyVal, ...detail };
  console.log(`${table}.upsert(`, key, record, ')');
};

/**
 * @param {bigint} frac
 * @param {number} exp
 */
const pad0 = (frac, exp) =>
  `${`${'0'.repeat(exp)}${frac}`.slice(-exp)}`.replace(/0+$/, '');

/** @param { bigint } whole */
const separators = (whole) => {
  const sep = ',';
  // ack: https://stackoverflow.com/a/45950572/7963, https://regex101.com/
  const revStr = (s) => s.split('').reverse().join('');
  const lohi = revStr(`${whole}`);
  const s = lohi.replace(/(?=\d{4})(\d{3})/g, (m, p1) => `${p1}${sep}`);
  return revStr(s);
};

/**
 * @param {bigint} n
 * @param {number} exp
 */
const decimal = (n, exp) => {
  const unit = 10n ** BigInt(exp);
  const [whole, frac] = [n / unit, n % unit];
  return frac !== 0n
    ? `${separators(whole)}.${pad0(frac, exp)}`
    : `${separators(whole)}`;
};

/**
 *
 * @param {ReturnType<WalletBridge['getIssuersNotifier']>} notifier
 */
const monitorIssuers = async (notifier) => {
  const first = await E(notifier).getUpdateSince();
  let issuers = first.value;
  forEachNotice(notifier, ({ updateCount, value }) => {
    issuers = value;
    for (const [name, detail] of issuers) {
      mockUpsert('issuers', ['updateCount', 'name'], {
        updateCount,
        name: fmtPetname(name),
        issuerBoardId: detail.issuerBoardId,
        detail: `${q(detail)}`,
      });
    }
  });
  /** @param {Brand} target */
  const findRecord = (target) =>
    issuers.find(([_petname, { brand }]) => brand === target);
  /** @param {Brand[]} brands */
  const brandNames = (brands) => brands.map((b) => findRecord(b)[0]);

  /**
   * @param {bigint} value
   * @param {number} decimalPlaces
   * @returns {string}
   */
  const fmtValue = (value, decimalPlaces) => {
    if (!value) return '';
    return decimal(value, decimalPlaces);
  };
  /**
   * @param {Amount<'nat'>} amt
   * @returns {string}
   */
  const fmtAmount = (amt) => {
    if (!amt) return '';
    const { brand, value } = amt;
    const [
      _name,
      {
        displayInfo: { decimalPlaces },
      },
    ] = findRecord(brand);
    return decimal(value, decimalPlaces);
  };

  return harden({
    current: () => issuers,
    brandNames,
    findRecord,
    fmtAmount,
    fmtValue,
  });
};

/**
 * @param {ERef<XYKAMMPublicFacet>} ammPub
 * @param {Brand} brand
 * @param {ReturnType<typeof monitorIssuers>} issuersP
 */
const monitorPool = async (ammPub, brand, issuersP) => {
  const issuers = await issuersP;
  const subscription = await E(ammPub).getPoolMetrics(brand);
  const notifier = makeNotifierFromAsyncIterable(subscription);

  return forEachNotice(
    notifier,
    async ({ updateCount, value: { Central, Secondary, Liquidity } }) => {
      console.log('monitorPool', {
        updateCount,
        value: { Central, Secondary, Liquidity },
      });
      const [name] = issuers.brandNames([brand]);
      const [
        _n,
        {
          displayInfo: { decimalPlaces },
        },
      ] = issuers.findRecord(Central.brand);
      mockUpsert('pool', ['updateCount', 'name'], {
        updateCount,
        pool: fmtPetname(name),
        Central: issuers.fmtAmount(Central),
        Secondary: issuers.fmtAmount(Secondary),
        Liquidity: issuers.fmtValue(Liquidity, decimalPlaces),
      });
    },
  );
};

/**
 *
 * @param {ERef<XYKAMMPublicFacet>} ammPub
 * @param {ReturnType<typeof monitorIssuers>} issuersP
 */
const monitorPools = async (ammPub, issuersP) => {
  const issuers = await issuersP;
  const subscription = await E(ammPub).getMetrics();
  const notifier = makeNotifierFromAsyncIterable(subscription);
  const seen = new Set();

  return forEachNotice(
    notifier,
    async ({ updateCount, value: { XYK: brands } }) => {
      console.log('monitorPools', { updateCount });
      for (const brand of brands) {
        const [name] = issuers.brandNames([brand]);
        mockUpsert('pools', ['updateCount', 'name'], {
          updateCount,
          brand: fmtPetname(name),
        });
        if (!seen.has(brand)) {
          monitorPool(ammPub, brand, issuersP);
          seen.add(brand);
        }
      }
    },
  );
};

/**
 *
 * @param {ERef<Home>} homeP
 * @param {{
 *   lookup: (...parts: string[]) => ERef<unknown>,
 * }} _endowments
 *
 * @typedef {{
 *   wallet: ERef<WalletUser>,
 *   zoe: ERef<ZoeService>,
 *   scratch: ERef<MapStore<string, unknown>>,
 * }} Home
 */
const monitorIST = async (homeP, { lookup }) => {
  const { wallet, zoe } = E.get(homeP);
  const bridge = E(wallet).getBridge();
  const issuers = monitorIssuers(E(bridge).getIssuersNotifier());

  /** @type {ERef<Instance>} */
  const ammInstanceP = /** @type {any} */ (
    E(lookup)('agoricNames', 'instance', 'amm')
  );

  const ammPub = /** @type {ERef<XYKAMMPublicFacet>} */ (
    E(zoe).getPublicFacet(ammInstanceP)
  );

  await monitorPools(ammPub, issuers);

  // history[10] {"done":false,"value":{"XYK":[]}}
};
harden(monitorIST);

export default monitorIST;
