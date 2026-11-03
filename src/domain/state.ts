import type { HouseholdState, Target } from "./types";

export function targetOn(
  state: HouseholdState,
  memberId: string,
  day: string,
): Target | undefined {
  const frozen = state.days.find(
    (d) => d.member_id === memberId && d.day === day && d.closed,
  );
  if (frozen) return frozen.snapshot?.target ?? undefined;
  return state.targets
    .filter((t) => t.member_id === memberId && t.effective_date <= day)
    .sort(
      (a, b) =>
        b.effective_date.localeCompare(a.effective_date) ||
        b.created_at.localeCompare(a.created_at) ||
        b.id.localeCompare(a.id),
    )[0];
}
