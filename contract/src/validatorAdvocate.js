import { AmountMath, AssetKind, makeIssuerKit } from '@agoric/ertp';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

const AgoricChain = /** @type {const} */ ({
  addressPattern: /agoric1/, // TODO: correct length, chars
});

/** @typedef {import('../../api/src/discordGuild.js').Channel_T} DiscordChannel */

/**
 * @param {ZCF<{
 *   channel: ERef<DiscordChannel>,
 *   notifier: ERef<Notifier<undefined>>,
 * }>} zcf
 *
 */
export const start = async (zcf) => {
  const { channel, supplier, issuers, brands } = zcf.getTerms();
  assert('Grant' in issuers, `missing Grant issuer`);
  assert('Grant' in brands, `missing Grant brand`);

  const grantPurse = E(issuers.Grant).makeEmptyPurse();

  const zoe = zcf.getZoeService();

  const someGrant = AmountMath.make(brands.Grant, []);

  const { mint, issuer } = makeIssuerKit('Message', AssetKind.SET);
  await zcf.saveIssuer(issuer, 'Message');

  const lookForRequests = async () => {
    // TODO: keep track of last message seen;
    // query for after that one
    const messages = await E(channel).getMessages();

    const hasAddr = messages.filter((msg) =>
      msg.content.match(AgoricChain.addressPattern),
    );
    if (!hasAddr) return;

    await Promise.all(
      hasAddr.map((requestMsg) => {
        const proposal = harden({
          give: { Request: [requestMsg] },
          want: { Grant: someGrant },
        });
        const pmt = mint.mintPayment(proposal.give.Request);
        const invitation = await E(supplier).getInvitation();
        const seat = E(zoe).offer(
          invitation,
          proposal,
          harden({ Request: pmt }),
        );
        await E(seat).getOfferResult();
        const grant = E(seat).getPayout('Grant');
        const grantAmt = await E(issuers.Grant).getAmountOf(grant);
        if (AmountMath.isEmpty(grantAmt)) {
          throw Error('empty grant!');
        }
        await E(grantPurse).deposit(grant);
        // TODO: createReaction in DiscordAPI
        return E(channel).createReaction(requestMsg.id, '🏁');
      }),
    );
  };

  const pubicFacet = Far('ValidatorAdvocate', {
    lookForRequests,
  });

  const creatorFacet = Far('ValidatorAdvocateCreator', {
    withdrawGrants: () =>
      E.when(E(grantPurse).getCurrentAmount(), (amt) =>
        E(grantPurse).withdraw(amt),
      ),
  });

  return { pubicFacet, creatorFacet };
};
