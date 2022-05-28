// @ts-check
import { E } from '@endo/far';
import { makeNotifierFromAsyncIterable } from '@agoric/notifier';

import '@agoric/store';
import '@agoric/wallet-backend/exported.js'; // for WalletUser
import '@agoric/zoe/exported.js'; // for ZoeService

const { quote: q } = assert;

/** @template T @typedef {import('@endo/eventual-send').ERef<T>} ERef */
/** @typedef {import('@agoric/run-protocol/src/vaultFactory/vaultFactory.js').start} VaultFactoryStart */
/** @typedef {Awaited<ReturnType<VaultFactoryStart>>['publicFacet']} VaultFactoryPublicFacet */

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
 * @param {ERef<Worksheet>} sheetP
 * @param {string | string[]} key
 * @param {Record<string, string | number>} detail
 */
const upsertKey = async (sheetP, key, detail) => {
  const keyVal =
    typeof key === 'string'
      ? detail[key]
      : JSON.stringify(key.map((col) => detail[col]));
  const record = typeof key === 'string' ? detail : { Key: keyVal, ...detail };
  const sheet = await sheetP;
  console.log(`${sheet}.upsert(`, keyVal, record, ')');
  return E(sheet).upsert(keyVal, record);
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
 * @param {ReturnType<WalletBridge['getIssuersNotifier']>} notifier
 * @param {ERef<Worksheet>} sheet
 */
const monitorIssuers = async (notifier, sheet) => {
  const first = await E(notifier).getUpdateSince();
  let issuers = first.value;

  // runs in "background"
  forEachNotice(notifier, ({ updateCount, value }) => {
    issuers = value;
    for (const [name, detail] of issuers) {
      upsertKey(sheet, ['updateCount', 'name'], {
        updateCount,
        name: fmtPetname(name),
        issuerBoardId: detail.issuerBoardId,
        detail: `${q(detail)}`,
      }).catch(console.error);
    }
  }).catch(console.error);
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
 * @param {ERef<Worksheet>} sheet
 */
const monitorPool = async (ammPub, brand, issuersP, sheet) => {
  const issuers = await issuersP;
  const subscription = await E(ammPub).getPoolMetrics(brand);
  const notifier = makeNotifierFromAsyncIterable(subscription);

  return forEachNotice(notifier, async ({ updateCount, value }) => {
    console.log('monitorPool', {
      updateCount,
      value,
    });
    const { centralAmount, secondaryAmount, liquidityTokens } = value;
    const [name] = issuers.brandNames([brand]);
    const [
      _n,
      {
        displayInfo: { decimalPlaces },
      },
    ] = issuers.findRecord(centralAmount.brand);
    upsertKey(sheet, ['updateCount', 'pool'], {
      updateCount,
      pool: fmtPetname(name),
      Central: issuers.fmtAmount(centralAmount),
      Secondary: issuers.fmtAmount(secondaryAmount),
      Liquidity: issuers.fmtValue(liquidityTokens, decimalPlaces),
    });
  });
};

/**
 *
 * @param {ERef<XYKAMMPublicFacet>} ammPub
 * @param {ReturnType<typeof monitorIssuers>} issuersP
 * @param {ReturnType<getSheets>} sheets
 */
const monitorPools = async (ammPub, issuersP, sheets) => {
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
        upsertKey(sheets.pools, ['updateCount', 'brand'], {
          updateCount,
          brand: fmtPetname(name),
        });
        if (!seen.has(brand)) {
          monitorPool(ammPub, brand, issuersP, sheets.swaps);
          seen.add(brand);
        }
      }
    },
  );
};

// const exVal = {
//   numLiquidationsCompleted: 0,
//   numVaults: 0,
//   totalCollateral: { brand: b0, value: 0n },
//   totalCollateralSold: { brand: b0, value: 0n },
//   totalDebt: { brand: b0, value: 0n },
//   totalOverageReceived: { brand: b0, value: 0n },
//   totalProceedsReceived: { brand: b0, value: 0n },
//   totalShortfallReceived: { brand: b, value: 0n },
// };

const { entries, fromEntries } = Object;

const mapvalues = (obj, f) =>
  fromEntries(entries(obj).map(([k, v]) => [k, f(v)]));

/**
 * @param {ERef<VaultFactoryPublicFacet>} vaultPub
 * @param {Brand} brand
 * @param {ReturnType<typeof monitorIssuers>} issuersP
 * @param {ERef<Worksheet>} sheet
 */
const monitorCollateral = async (vaultPub, brand, issuersP, sheet) => {
  const issuers = await issuersP;
  const subscription = await E(
    E(vaultPub).getCollateralManager(brand),
  ).getMetrics();
  const notifier = makeNotifierFromAsyncIterable(subscription);

  return forEachNotice(notifier, async ({ updateCount, value }) => {
    console.log('monitorCollateral', {
      updateCount,
      value,
    });
    const { numVaults, numLiquidationsCompleted, ...amounts } = value;
    const [name] = issuers.brandNames([brand]);
    upsertKey(sheet, ['updateCount', 'collateral'], {
      updateCount,
      collateral: fmtPetname(name),
      numVaults,
      numLiquidationsCompleted,
      ...mapvalues(amounts, issuers.fmtAmount),
    });
  });
};

/**
 * @param {ERef<VaultFactoryPublicFacet>} vaultPub
 * @param {ReturnType<typeof monitorIssuers>} issuersP
 * @param {ReturnType<getSheets>} sheets
 */
const monitorVaultFactory = async (vaultPub, issuersP, sheets) => {
  const issuers = await issuersP;
  const subscription = await E(vaultPub).getMetrics();
  const notifier = makeNotifierFromAsyncIterable(subscription);
  const seen = new Set();

  return forEachNotice(notifier, async ({ updateCount, value }) => {
    console.log('monitorVaultFactory', { updateCount, value });
    const { collaterals, rewardPoolAllocation } = value;
    for (const collateral of collaterals) {
      const [name] = issuers.brandNames([collateral]);
      upsertKey(sheets.collaterals, ['updateCount', 'collateral'], {
        updateCount,
        collateral: fmtPetname(name),
        rewardPoolAllocation: `${q(rewardPoolAllocation)}`,
      });
      if (!seen.has(collateral)) {
        monitorCollateral(vaultPub, collateral, issuersP, sheets.vaults);
        seen.add(collateral);
      }
    }
  });
};

/** @param {ERef<MapStore<string, unknown>>} scratch */
const getSheets = (scratch) => {
  /** @type {Workbook} */
  const workbook = /** @type {any} */ (E(scratch).get('workbook1'));
  const sheets = {
    issuers: E(workbook).sheetByIndex(1),
    pools: E(workbook).sheetByIndex(2),
    swaps: E(workbook).sheetByIndex(3),
    collaterals: E(workbook).sheetByIndex(4),
    vaults: E(workbook).sheetByIndex(5),
  };
  return sheets;
};

/**
 *
 * @param {ERef<Home>} homeP
 * @param {{
 *   lookup: (...parts: string[]) => ERef<any>,
 * }} _endowments
 *
 * @typedef {{
 *   wallet: ERef<WalletUser>,
 *   zoe: ERef<ZoeService>,
 *   scratch: ERef<MapStore<string, unknown>>,
 * }} Home
 *
 * @typedef {typeof import('./src/plugin-sheets').bootPlugin} SheetPlugin
 * @typedef {ReturnType<Awaited<ReturnType<SheetPlugin>>['start']>} Workbook
 * @typedef {ReturnType<Awaited<Workbook>['sheetByIndex']>} Worksheet
 */
const monitorIST = async (homeP, { lookup }) => {
  const { wallet, zoe, scratch } = E.get(homeP);
  const bridge = E(wallet).getBridge();
  const sheets = getSheets(scratch);
  const issuers = monitorIssuers(
    E(bridge).getIssuersNotifier(),
    sheets.issuers,
  );
  /** @type {(name: string) => Promise<Instance>} */
  const getInstance = (name) => E(lookup)('agoricNames', 'instance', name);
  const ammInstanceP = getInstance('amm');
  const vaultInstanceP = getInstance('VaultFactory');

  /** @type {ERef<XYKAMMPublicFacet>} */
  const ammPub = E(zoe).getPublicFacet(ammInstanceP);
  /** @type {ERef<VaultFactoryPublicFacet>} */
  const vaultPub = E(zoe).getPublicFacet(vaultInstanceP);

  await Promise.all([
    monitorPools(ammPub, issuers, sheets),
    monitorVaultFactory(vaultPub, issuers, sheets),
  ]);

  // history[10] {"done":false,"value":{"XYK":[]}}
};
harden(monitorIST);

export default monitorIST;
