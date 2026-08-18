import { AppealForm } from "./AppealForm";

/**
 * Shown on the dashboard when findDuplicateBusiness (lib/db/queries.ts)
 * finds another account with a business of the same name in the same
 * city/state — never blocks anything, just surfaces it. See that
 * function's doc comment for why this is advisory-only.
 */
export function DuplicateBusinessNotice() {
  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p>
        A business with this name in this area may already have a Notabl account. If you believe this is a
        mistake, contact support.
      </p>
      <div className="mt-3">
        <AppealForm appealType="duplicate_business_signup" />
      </div>
    </div>
  );
}
