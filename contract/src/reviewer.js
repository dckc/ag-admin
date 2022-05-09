import { AmountMath, AssetKind } from '@agoric/ertp';
import { fit, M } from '@agoric/store';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

const { details: X, quote: q } = assert;

// TODO: factor out AgoricChain
const AgoricChain = /** @type {const} */ ({
  addressPattern: /(agoric1\S+)/, // TODO: correct length, chars
});

/** @typedef {import('../../api/src/discordGuild.js').MessageObject} MessageObject */
/** @typedef {import('../../api/src/discordGuild.js').GuildMember} GuildMember */
/** @typedef {import('../../api/src/discordGuild.js').Snowflake} Snowflake */
/** @typedef {ReturnType<typeof import('../../api/src/discordGuild.js').DiscordAPI} DiscordAPI_T */

/**
 * @param {ZCF<{
 *   channel: ERef<ReturnType<DiscordAPI_T['channels']>>,
 *   guild: ERef<ReturnType<DiscordAPI_T['guilds']>>,
 *   role: Snowflake,
 *   quorum?: number,
 * }} zcf
 */
export const start = async (zcf) => {
  const { channel, guild, role, quorum = 2 } = zcf.getTerms();
  assert(channel, X`missing channel`);
  assert(guild, X`missing guild`);
  assert.typeof(role, 'string', X`role must be string: ${q(role)}`);
  assert.typeof(quorum, 'number', X`quorum must be number: ${q(role)}`);

  /** @type {ZCFMint} */
  const mint = await zcf.makeZCFMint('Review', AssetKind.SET);
  const { brand } = mint.getIssuerRecord();

  /** @type {Map<Snowflake, GuildMember>} */
  const reviewerDetail = new Map();
  /** @param {Snowflake} id */
  const getReviewerDetail = async (id) => {
    if (reviewerDetail.has(id)) {
      return [reviewerDetail.get(id) || assert.fail(`has() but not get()!`)];
    }
    const detail = await E(guild).members(id);
    const ok = detail && detail.roles && detail.roles.includes(role);
    // console.log(detail);
    ok && reviewerDetail.set(id, detail);

    return ok ? [detail] : [];
  };

  /** @param {MessageObject} msg */
  const findAddress = (msg) => {
    const [_, address] = msg.content.match(AgoricChain.addressPattern);
    assert.typeof(address, 'string', X`no address in ${q(msg.content)}`);
    return address;
  };

  /** @param {MessageObject} msg */
  const findEnoughEndorsers = async (msg) => {
    const endorsements = await E(E(channel).messages(msg.id)).reactions('✅');
    const withRole = await Promise.all(
      endorsements.map((endorsement) => getReviewerDetail(endorsement.id)),
    );
    const endorsers = withRole.flat();
    assert(endorsers.length >= quorum, X`no quorum: ${endorsers.length}`);
    return endorsers;
  };

  /** @type {OfferHandler} */
  const reviewHook = async (seat) => {
    const { brands } = zcf.getTerms();
    assert('Request' in brands, `Request brand not (yet?) set`);

    const request = seat.getProposal();
    fit(request, {
      give: { Request: { brand: brands.Request, value: [M.any()] } },
      want: { Review: { brand: brands.Review, value: [] } },
      exit: M.any(),
    });
    const {
      give: {
        Request: { value: requestValue },
      },
    } = request;

    /** @type {MessageObject[]} */
    const [message] = requestValue;
    const address = findAddress(message);
    const endorsers = await findEnoughEndorsers(message);
    const reviewAmt = AmountMath.make(brand, [
      {
        message,
        address,
        endorsers,
      },
    ]);

    const { zcfSeat: mintSeat } = zcf.makeEmptySeatKit();
    mint.mintGains({ Review: reviewAmt }, mintSeat);
    const { zcfSeat: burnSeat } = zcf.makeEmptySeatKit();
    burnSeat.incrementBy(seat.decrementBy(request.give));
    seat.incrementBy(mintSeat.decrementBy(request.want));
    zcf.reallocate(seat, mintSeat, burnSeat);
    mint.burnLosses(request.give, burnSeat);
  };

  /** @param {MessageObject} msg */
  const getReviewInvitation = async (msg) => {
    findAddress(msg);
    await findEnoughEndorsers(msg);
    return zcf.makeInvitation(reviewHook, 'review grant request');
  };

  return {
    publicFacet: Far('Reviewer', {
      getReviewInvitation,
    }),
    creatorFacet: Far('ReviewerAdmin', {
      setRequestIssuer: (issuer) => zcf.saveIssuer(issuer, 'Request'),
    }),
  };
};
