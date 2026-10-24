// Pure wording table (no Node-only imports) so UI components can use it too.
export type IndustryWords = {
  business: string; // "dental practice"
  customer: string; // "patient"
  customers: string; // "patients"
  reportKind: string; // "patient-review report"
  noAdviceLine: string; // what the model must not advise on
  disclaimer: string; // UI footnote under Recommended Actions
};

export function industryWords(industry: string): IndustryWords {
  switch (industry) {
    case "dental":
      return {
        business: "dental practice",
        customer: "patient",
        customers: "patients",
        reportKind: "patient-review report",
        noAdviceLine: "This is client feedback, not medical advice — never suggest changes to clinical/medical treatment decisions, only operational/service observations (e.g. front-desk process, scheduling, communication).",
        disclaimer: "AI interpretation — operational suggestions only, not medical or clinical advice.",
      };
    case "auto-repair":
      return {
        business: "auto repair shop",
        customer: "customer",
        customers: "customers",
        reportKind: "customer-review report",
        noAdviceLine: "This is customer feedback — suggest only operational/service observations (e.g. estimates and pricing communication, scheduling, updates while the car is in the shop), never technical repair decisions.",
        disclaimer: "AI interpretation — operational suggestions only, not technical or repair advice.",
      };
    default:
      return {
        business: "local business",
        customer: "customer",
        customers: "customers",
        reportKind: "customer-review report",
        noAdviceLine: "This is customer feedback — suggest only operational/service observations (how the business communicates, schedules, prices and presents itself).",
        disclaimer: "AI interpretation — operational suggestions only.",
      };
  }
}
