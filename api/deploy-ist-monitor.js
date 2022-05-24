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
 *
 * @param {string} table
 * @param {string | number} key
 * @param {Record<string, string | number>} record
 */
const mockUpsert = async (table, key, record) => {
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
      mockUpsert('issuers', JSON.stringify([updateCount, name]), {
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
      mockUpsert('pool', JSON.stringify([updateCount, name]), {
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
        mockUpsert('pools', JSON.stringify([updateCount, name]), {
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

// command[15] Object.fromEntries(h[13].value).AUSD
// history[15] {"assetKind":"nat","brand":[Object Alleged: AUSD brand]{},"displayInfo":{"assetKind":"nat","decimalPlaces":6},"issuer":[Object Alleged: AUSD issuer]{},"issuerBoardId":"board04016","meta":{"creationStamp":1653337291420,"id":10,"updatedStamp":1653337291420}}
// command[16] AUSD=h[15]
// history[16] {"assetKind":"nat","brand":[Object Alleged: AUSD brand]{},"displayInfo":{"assetKind":"nat","decimalPlaces":6},"issuer":[Object Alleged: AUSD issuer]{},"issuerBoardId":"board04016","meta":{"creationStamp":1653337291420,"id":10,"updatedStamp":1653337291420}}
// command[17] mk=(tok, qty) => ({brand: tok.brand, value: qty + 10** BigInt(tok.displayInfo.decimalPlaces)})
// history[17] [Function mk]
// command[18] mk(AUSD, 10n)
// history[18] exception: [TypeError: mk: Cannot coerce left operand to bigint]
// command[19] mk=(tok, qty) => ({brand: tok.brand, value: qty * 10** BigInt(tok.displayInfo.decimalPlaces)})
// history[19] [Function mk]
// command[20] mk(AUSD, 10n)
// history[20] exception: [TypeError: mk: Cannot coerce left operand to bigint]
// command[21] AUSD.displayInfo.decimalPlaces
// history[21] 6
// command[22] mk=(tok, qty) => ({brand: tok.brand, value: qty * 10n ** BigInt(tok.displayInfo.decimalPlaces)})
// history[22] [Function mk]
// command[23] (tok=Object.fromEntries(h[13].value)),null
// history[23] null
// command[24] mk(tok.AUSD, 10n)
// history[24] {"brand":[Object Alleged: AUSD brand]{},"value":10000000n}
// command[25] E(amm.pub).addPool(tok.AUSD.brand, 'AUSD')
// history[25] Promise.reject("TypeError: target has no method \"getAssetKind\", has [\"getAllegedName\",\"getDisplayInfo\",\"isMyIssuer\"]")
// command[26] E(amm.pub).addPool(tok.AUSD.issuer, 'AUSD')
// history[26] [Object Alleged: AUSDLiquidity issuer]{}
// command[27] E(amm.iter).next()
// history[27] {"done":false,"value":{"XYK":[[Object Alleged: IbcATOM brand]{}]}}

// command[32] proposal = {give: {Central: mk(tok.RUN, 50n), Secondary: mk(tok.AUSD, 50n)}, want: { Liquidity: mk(ALiq, 0n) }}
// history[32] exception: [TypeError: mk: cannot coerce undefined to object]
// command[33] E(h[26]).getBrand().then(b => ALiq=({brand:b}))
// history[33] {"brand":[Object Alleged: AUSDLiquidity brand]{}}
// command[34] ALiq.issuer = h[26]
// history[34] [Object Alleged: AUSDLiquidity issuer]{}
// command[35] ALiq.displayInfo = {decimalPlaces: 6}
// history[35] {"decimalPlaces":6}
// command[36] proposal = {give: {Central: mk(tok.RUN, 50n), Secondary: mk(tok.AUSD, 50n)}, want: { Liquidity: mk(ALiq, 0n) }}
// history[36] {"give":{"Central":{"brand":[Object Alleged: RUN brand]{},"value":50000000n},"Secondary":{"brand":[Object Alleged: AUSD brand]{},"value":50000000n}},"want":{"Liquidity":{"brand":[Object Alleged: AUSDLiquidity brand]{},"value":0n}}}
// command[37] E(home.wallet).getPurses().then(Object.fromEntries)
// history[37] {"ATOM":[Object Alleged: Virtual Purse]{},"AUSD":[Object Alleged: Virtual Purse]{},"Agoric RUN currency":[Object Alleged: Virtual Purse]{},"Agoric staking token":[Object Alleged: Virtual Purse]{},"Default Zoe invite purse":[Object Alleged: Zoe Invitation purse]{}}
// command[38] purses=h[37]
// history[38] {"ATOM":[Object Alleged: Virtual Purse]{},"AUSD":[Object Alleged: Virtual Purse]{},"Agoric RUN currency":[Object Alleged: Virtual Purse]{},"Agoric staking token":[Object Alleged: Virtual Purse]{},"Default Zoe invite purse":[Object Alleged: Zoe Invitation purse]{}}
// command[39] E(purses['Agoric RUN currency').withdraw(proposal.give.Central).then(pmt => pmts={Central:pmt})
// history[39] exception: [SyntaxError: missing ]]
// command[40] E(purses['Agoric RUN currency']).withdraw(proposal.give.Central).then(pmt => pmts={Central:pmt})
// history[40] {"Central":[Object Alleged: RUN payment]{}}
// command[41] E(purses['AUSD']).withdraw(proposal.give.Secondary).then(p => (pmts.Secondary=p))
// history[41] [Object Alleged: AUSD payment]{}
// command[42] E(zoe).offer(E(amm.pub).makeAddLiquidityInvitation(), proposal, pmts).then(s =>  (seat=s))
// history[42] Promise.reject("TypeError: Cannot deliver \"offer\" to target; typeof target is \"undefined\"")
// command[43] E(home.zoe).offer(E(amm.pub).makeAddLiquidityInvitation(), proposal, pmts).then(s =>  (seat=s))
// history[43] [Object Alleged: userSeat]{}
// command[44] E(seat).getOfferResult()
// history[44] "Added liquidity."

export default monitorIST;
