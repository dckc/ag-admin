import { AssetKind } from '@agoric/ertp';
import { fit, M } from '@agoric/store';
import { E } from '@endo/eventual-send';

const AgDiscord = /** @type {const} */ ({
  guild: '585576150827532298',
  channels: {
    'validator-1-bld': '946137891023777802',
  },
  roles: {
    mod1bld: '946816769870430308',
  },
});

/** @typedef {ReturnType<typeof import('../../api/src/discordGuild.js').DiscordAPI>} DiscordAPI_T */

/**
 *
 * @param {ZCF<{
 *   installations: {
 *     reviewer: Installation<typeof import('./reviewer.js').start>,
 *     reviewer: Installation<typeof import('./advocate.js').start>,
 *   },
 *   discordApi: ERef<DiscordAPI_T>,
 * }} zcf
 */
export const start = async (zcf) => {
  const { installations, discordApi } = zcf.getTerms();

  const [guild, channel] = await Promise.all([
    E(discordApi).guilds(AgDiscord.guild),
    E(discordApi).channels(AgDiscord.channels['validator-1-bld']),
  ]);

  /** @type {ZCFMint} */
  const mint = await zcf.makeZCFMint('Grant', AssetKind.SET);
  const { issuer, brand } = mint.getIssuerRecord();

  const zoe = zcf.getZoeService();

  const reviewer = await E(zoe).startInstance(
    installations.reviewer,
    {},
    { channel, guild, role: AgDiscord.roles.mod1bld },
  );
  const {
    issuers: { Review: reviewIssuer },
    brands: { Review: reviewBrand },
  } = await E(zoe).getTerms(reviewer.instance);

  /** @type {OfferHandler} */
  const grantHandler = (seat) => {
    const proposal = seat.getProposal();
    fit(proposal, {
      give: {
        Review: { brand: reviewBrand, value: [{ address: M.string() }] },
      },
      want: { Grant: { brand, value: [{ address: M.string() }] } },
      exit: M.any(),
    });
    const { give, want } = proposal;
    assert.equal(give.Review.value[0].address, want.Grant.value[0].address);

    const { zcfSeat: mintSeat } = zcf.makeEmptySeatKit();
    mint.mintGains(want, mintSeat);
    const { zcfSeat: burnSeat } = zcf.makeEmptySeatKit();
    burnSeat.incrementBy(seat.decrementBy(give));
    seat.incrementBy(mintSeat.decrementBy(want));
    zcf.reallocate(seat, mintSeat, burnSeat);
    mint.burnLosses(give, burnSeat);
  };
  const getGrantInvitation = () =>
    zcf.makeInvitation(grantHandler, 'grant reviewed request');

  const publicFacet = { getGrantInvitation };

  const advocate = await E(zoe).startInstance(
    installations.advocate,
    {
      Grant: issuer,
      Review: reviewIssuer,
    },
    { channel, reviewer: reviewer.publicFacet, supplier: publicFacet },
  );
  const {
    issuers: { Message: messageIssuer },
  } = await E(zoe).getTerms(advocate.instance);
  await E(reviewer.creatorFacet).setRequestIssuer(messageIssuer);

  return { publicFacet };
};
