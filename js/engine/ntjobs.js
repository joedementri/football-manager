// engine/ntjobs.js — M10 national-team job market (plan1.md: "Manager
// reputation >= threshold + vacancies => NT job offers ... unlocking NATL
// tiles/squad selection"). Mirrors engine/jobs.js's club vacancy market
// almost exactly — same "apply == instant accept" scope precedent that
// file's own header documents — the one structural difference: accepting an
// NT job never touches state.club/state.league. A manager runs both
// simultaneously (plan1.md: "manage club + country simultaneously like
// FIFA 15"), so state.nationalTeam lives entirely alongside state.club
// rather than replacing anything.

import { pickBestXI } from "../gen/squad.js";
import { RngStream, deriveSeed } from "../core/rng.js";

const MAX_NT_VACANCIES = 10;
// [judgment call, confirmed with the user] rep >= 10 of the existing 1-20
// scale (engine/objectives.js) unlocks Browse NT Jobs — not INI-derived,
// same footing as engine/jobs.js's own CPU_SACK_CHANCE.
export const NT_JOB_REP_THRESHOLD = 10;
const SQUAD_SIZE = 23;

/** Refreshes the NT vacancy pool at every rollover. Nations don't have a
 * "manager" concept the way clubs do (every nation's matches just sim via
 * engine/comps/intl.js regardless), so "vacancy" here simply means "not
 * currently the user's own NT" — every other nation is always notionally
 * available, gated behind the reputation threshold above. */
export function refreshNtJobMarket(state, { seed, seasonStartYear }) {
  if (state.manager.rep < NT_JOB_REP_THRESHOLD) {
    state.ntJobMarket.vacancies = [];
    return;
  }
  const rng = new RngStream(deriveSeed(seed, `ntjobs-${seasonStartYear}`));
  const eligible = state.staticData.nations
    .map((n) => n.id)
    .filter((id) => !state.nationalTeam || id !== state.nationalTeam.nationId);
  state.ntJobMarket.vacancies = rng.shuffle(eligible).slice(0, MAX_NT_VACANCIES);
}

function topSquad(state, nationId) {
  return state.players
    .filter((p) => p.nationId === nationId)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, SQUAD_SIZE);
}

/** Accepts an NT vacancy — seeds the squad + starting lineup with the
 * auto-picked top 23 (ui/natlsquad.js's Natl Squad Selection overlay lets
 * the user adjust it afterwards, core/store.js's toggleNatlSquadPlayer). */
export function acceptNtJob(state, nationId) {
  const squad = topSquad(state, nationId);
  state.nationalTeam = {
    nationId,
    squadPlayerIds: squad.map((p) => p.id),
    lineup: pickBestXI(squad),
  };
  state.ntJobMarket.vacancies = state.ntJobMarket.vacancies.filter((id) => id !== nationId);
}
