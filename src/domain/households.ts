import { DomainError } from "./calories";

export interface HouseholdContext {
  account_id: string;
  household_id: string;
  membership_id: string;
  legacy_binding?: boolean;
}
export interface HouseholdAccess {
  active: HouseholdContext | null;
  invitations: { id: string; household_name: string }[];
}
export function offlineKey(context: HouseholdContext): string {
  return (
    "v2:" +
    JSON.stringify([
      context.account_id,
      context.household_id,
      context.membership_id,
    ])
  );
}
export function offlineContext(key: string): HouseholdContext | null {
  if (!key.startsWith("v2:")) return null;
  try {
    const values: unknown = JSON.parse(key.slice(3));
    if (
      !Array.isArray(values) ||
      values.length !== 3 ||
      !values.every((v) => typeof v === "string" && v.length > 0)
    )
      return null;
    return {
      account_id: values[0],
      household_id: values[1],
      membership_id: values[2],
    };
  } catch {
    return null;
  }
}
export function assertOperationContext(
  context: HouseholdContext | null,
  operation: { household_id?: string; membership_id?: string },
) {
  if (
    !context ||
    operation.household_id !== context.household_id ||
    operation.membership_id !== context.membership_id
  )
    throw new DomainError("membership_changed");
}
