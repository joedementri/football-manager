// core/sortutil.js — F3-fixes: the "sort by name, not by hidden Overall"
// default shared by Search Results and My Shortlist (owner: "we want to keep
// [Overall] hidden, so by name is the best way. Last name, then first, then
// position, then age."). Squad List/Squad Report/Team Stats are untouched —
// those list the user's own, already-fully-known players, where Overall
// isn't information worth hiding (owner's explicit scope call).

/** "Firstname Lastname" — the one place that string gets built so Shortlist/
 * Player Bio's "full name, not commonName" fix reads the same everywhere. */
export function fullName(player) {
  return `${player.firstName} ${player.lastName}`;
}

/** Last name, then first name, then position, then age — ascending. */
export function lastNameSort(a, b) {
  return (
    a.lastName.localeCompare(b.lastName) ||
    a.firstName.localeCompare(b.firstName) ||
    a.position.localeCompare(b.position) ||
    a.age - b.age
  );
}
