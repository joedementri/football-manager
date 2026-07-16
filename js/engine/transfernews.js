// engine/transfernews.js — transfer-news article builder, shared by
// engine/negotiation.js (user buys/sells/loans), engine/freeagents.js
// (pre-contract signings) and engine/transferai.js (CPU↔CPU) so all three
// produce the exact same article shape into `state.news.transfer` (fable-
// plans/plan1.md M7: "Generates transfer news"; the array itself is
// core/store.js's existing NEWS_DATA.transfer, M0-era stub content that this
// milestone starts actually appending real articles to, same "News/email
// generators ... template library with slot-filling" pattern plan1.md
// describes for engine/news.js/email.js).

import { money } from "../core/format.js";

const MAX_TRANSFER_NEWS = 60; // keep the Transfer News tab from growing unbounded over a long career

function crestFor(club) {
  return `crest-${club.id}`;
}

function article({ title, head, body, crest, today }) {
  return { title, head, body, crest, date: today.toLocaleDateString("en-GB"), accent: "blue" };
}

export function buildBuyNewsArticle({ player, fromClub, toClub, fee, today }) {
  const title = `${toClub.shortName} Sign ${player.commonName}`;
  return article({
    title,
    head: title,
    crest: crestFor(toClub),
    today,
    body: [
      `${toClub.name} have completed the signing of ${player.commonName} from ${fromClub.name} for a fee of ${money(fee)}.`,
      `The ${player.position} becomes the club's latest addition as they look to strengthen the squad.`,
    ],
  });
}

export function buildLoanNewsArticle({ player, fromClub, toClub, today }) {
  const title = `${player.commonName} Joins ${toClub.shortName} On Loan`;
  return article({
    title,
    head: title,
    crest: crestFor(toClub),
    today,
    body: [
      `${player.commonName} has joined ${toClub.name} on a season-long loan from ${fromClub.name}.`,
      "The move gives the player a fresh chance of regular first-team football.",
    ],
  });
}

export function buildFreeAgentNewsArticle({ player, toClub, today }) {
  const title = `${player.commonName} To Join ${toClub.shortName} On A Free`;
  return article({
    title,
    head: title,
    crest: crestFor(toClub),
    today,
    body: [
      `${toClub.name} have agreed a pre-contract with ${player.commonName}, who will join on a free transfer once his current deal expires.`,
    ],
  });
}

export function buildCpuTransferNewsArticle({ player, fromClub, toClub, fee, today }) {
  const title = `${player.commonName} Completes Move To ${toClub.shortName}`;
  return article({
    title,
    head: title,
    crest: crestFor(toClub),
    today,
    body: [
      `${toClub.name} have signed ${player.commonName} from ${fromClub.name} for ${money(fee)}.`,
      `The ${player.position} arrives to bolster the squad ahead of the run-in.`,
    ],
  });
}

/** Unshifts `article` into `state.news.transfer`, capping the list length. */
export function pushTransferNews(state, article) {
  state.news.transfer.unshift(article);
  if (state.news.transfer.length > MAX_TRANSFER_NEWS) state.news.transfer.length = MAX_TRANSFER_NEWS;
}
