// @ts-check
import { E } from '@endo/far';
import { makeSubscription } from '@agoric/notifier';

import '@agoric/store';
import '@agoric/wallet-backend/exported.js'; // for WalletUser
import '@agoric/zoe/exported.js'; // for ZoeService

/** @template T @typedef {import('@endo/eventual-send').ERef<T>} ERef */

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
  // const bridge = E(wallet).getBridge();
  const ammInstanceP = E(lookup)('agoricNames', 'instance', 'amm');
  const ammPub = E(zoe).getPublicFacet(ammInstanceP);

  const ammSub = E(ammPub).getMetrics();
  console.log({ ammSub });
  const ammIter = E(ammSub)[Symbol.asyncIterator]();
  const iter = makeSubscription(E(ammSub).getSharableSubscriptionInternals());
  for await (const state of iter) {
    console.log(state);
  }
  // history[10] {"done":false,"value":{"XYK":[]}}
};
harden(monitorIST);

// command[11] E(home.wallet).getBridge().then(x => wb=x)
// history[11] [Object Alleged: preapprovedBridge]{}
// command[12] E(wb).getIssuers()
// history[12] Promise.reject("TypeError: target has no method \"getIssuers\", has [\"addOffer\",\"getAgoricNames\",\"getBoard\",\"getBrandPetnames\",\"getDepositFacetId\",\"getIssuersNotifier\",\"getNamesByAddress\",\"getOffersNotifier\",\"getPublicNotifiers\",\"getPursesNotifier\",\"getUINotifier\",\"getZoe\",\"suggestInstallation\",\"suggestInstance\",\"suggestIssuer\"]")
// command[13] E(E(wb).getIssuersNotifier()).getUpdateSince()
// history[13] {"updateCount":10,"value":[["AUSD",{"assetKind":"nat","brand":[Object Alleged: AUSD brand]{},"displayInfo":{"assetKind":"nat","decimalPlaces":6},"issuer":[Object Alleged: AUSD issuer]{},"issuerBoardId":"board04016","meta":{"creationStamp":1653337291420,"id":10,"updatedStamp":1653337291420}}],["BLD",{"assetKind":"nat","brand":[Object Alleged: BLD brand]{},"displayInfo":{"assetKind":"nat","decimalPlaces":6},"issuer":[Object Alleged: BLD issuer]{},"issuerBoardId":"board00613","meta":{"creationStamp":1653337291420,"id":7,"updatedStamp":1653337291420}}],["IbcATOM",{"assetKind":"nat","brand":[Object Alleged: IbcATOM brand]{},"displayInfo":{"assetKind":"nat","decimalPlaces":4},"issuer":[Object Alleged: IbcATOM issuer]{},"issuerBoardId":"board02314","meta":{"creationStamp":1653337291420,"id":9,"updatedStamp":1653337291420}}],["RUN",{"assetKind":"nat","brand":[Object Alleged: RUN brand]{},"displayInfo":{"assetKind":"nat","decimalPlaces":6},"issuer":[Object Alleged: RUN issuer]{},"issuerBoardId":"board0223","meta":{"creationStamp":1653337291420,"id":8,"updatedStamp":1653337291420}}],["zoe invite",{"assetKind":"set","brand":[Object Alleged: Zoe Invitation brand]{},"displayInfo":{"assetKind":"set"},"issuer":[Object Alleged: Zoe Invitation issuer]{},"issuerBoardId":"board04312","meta":{"creationStamp":1653337291420,"id":1,"updatedStamp":1653337291420}}]]}
// command[14] (h=history),null
// history[14] null
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
// command[28] E(amm.pub).getPoolMetrics(tok.AUSD.brand)
// history[28] [Object Alleged: Subscription]{}
// command[29] E(h[28])[Symbol.iterator]()
// history[29] Promise.reject("TypeError: target has no method \"[Symbol(Symbol.iterator)]\", has [\"[Symbol(Symbol.asyncIterator)]\",\"getSharableSubscriptionInternals\"]")
// command[30] E(h[28])[Symbol.asyncIterator]()
// history[30] [Object Alleged: SubscriptionIterator]{}
// command[31] E(h[30]).next()
// history[31] {"done":false,"value":{"Central":{"brand":[Object Alleged: RUN brand]{},"value":0n},"Liquidity":0n,"Secondary":{"brand":[Object Alleged: AUSD brand]{},"value":0n}}}
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
// command[45] E(h[30]).next()
// history[45] {"done":false,"value":{"Central":{"brand":[Object Alleged: RUN brand]{},"value":50000000n},"Liquidity":50000000n,"Secondary":{"brand":[Object Alleged: AUSD brand]{},"value":50000000n}}}

export default monitorIST;
