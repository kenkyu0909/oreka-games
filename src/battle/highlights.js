// Visual-only classification. Never changes state, damage, RNG, PP, or event order.
export function isFinalKnockout(state, entries, index) {
  const entry = entries[index];
  return (
    state?.phase === "finished" &&
    state.reason === "knockout" &&
    entry?.kind === "knockout" &&
    (entry.side === 0 || entry.side === 1) &&
    state.winner !== entry.side &&
    state.teams[entry.side].every((f) => f.hp === 0) &&
    !entries.slice(index + 1).some((e) => e.kind === "knockout")
  );
}
