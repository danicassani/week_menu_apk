import { DomainError } from "./calories";
import type { Names } from "./planning";
import type { Profile } from "./types";
export type PortionFailureReason =
  | "excluded_ingredient"
  | "incompatible_diet"
  | "missing_ingredient"
  | "archived_ingredient"
  | "missing_nutrition";
export class PortionError extends DomainError {
  constructor(
    code: string,
    public context: {
      reason: PortionFailureReason;
      member: string;
      recipe: Names;
      ingredient: { id: string; name: Names };
      diet: Profile["diet"];
      alternatives?: {
        ingredient: { id: string; name: Names };
        reason: "missing" | "archived" | "excluded" | "diet";
      }[];
    },
  ) {
    super(code);
  }
}
