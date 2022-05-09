import { AmountMath, AssetKind, makeIssuerKit } from '@agoric/ertp';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

const { details: X } = assert;

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
  const { channel, reviewer, supplier, issuers, brands } = zcf.getTerms();
  assert('Review' in issuers, `missing Review issuer`);
  assert('Grant' in issuers, `missing Grant issuer`);
  assert(channel, X`missing channel`);
  assert(reviewer, X`missing reviewer`);
  assert(supplier, X`missing supplier`);

  const grantPurse = E(issuers.Grant).makeEmptyPurse();

  const zoe = zcf.getZoeService();

  const someReview = AmountMath.make(brands.Review, []);

  const { mint, issuer, brand } = makeIssuerKit('Message', AssetKind.SET);
  await zcf.saveIssuer(issuer, 'Message');

  const lookForRequests = async () => {
    // TODO: keep track of last message seen;
    // query for after that one
    const messages = await E(channel).getMessages();

    const hasAddr = messages.filter((msg) =>
      msg.content.match(AgoricChain.addressPattern),
    );
    if (!hasAddr) return;

    await Promise.allSettled(
      hasAddr.map((requestMsg) => {
        const doReview = async () => {
          const invitation = await E(reviewer).getReviewInvitation(requestMsg);
          const proposal = harden({
            give: { Request: AmountMath.make(brand, [requestMsg]) },
            want: { Review: someReview },
          });
          const pmt = mint.mintPayment(proposal.give.Request);
          const seat = E(zoe).offer(
            invitation,
            proposal,
            harden({ Request: pmt }),
          );
          await E(seat).getOfferResult();
          return E(seat).getPayout('Review');
        };

        /** @param {Payment} review */
        const doGrant = async (review) => {
          const invitation = await E(supplier).getGrantInvitation();
          const reviewAmt = await E(issuers.Review).getAmountOf(review);
          const [{ address }] = reviewAmt;
          assert.typeof(address, 'string');
          const proposal = harden({
            give: { Review: reviewAmt },
            want: { Grant: AmountMath.make(brands.Grant, [{ address }]) },
          });
          const seat = E(zoe).offer(
            invitation,
            proposal,
            harden({ Review: review }),
          );
          await E(seat).getOfferResult();
          const grant = E(seat).getPayout('Grant');
          const grantAmt = await E(grantPurse).deposit(grant);
          if (AmountMath.isEmpty(grantAmt)) {
            throw Error('empty grant!');
          }
        };

        const review = await doReview();
        await doGrant(review);
        // TODO: createReaction in DiscordAPI
        return E(channel).createReaction(requestMsg.id, '🏁');
      }),
    );
  };

  const creatorFacet = Far('ValidatorAdvocateCreator', {
    withdrawGrants: () =>
      E.when(E(grantPurse).getCurrentAmount(), (amt) =>
        E(grantPurse).withdraw(amt),
      ),
  });

  return {
    pubicFacet: Far('ValidatorAdvocate', {
      lookForRequests,
    }),
    creatorFacet,
  };
};
