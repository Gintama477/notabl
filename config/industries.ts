// Industry enum. Only "dental" is active for the MVP (per the development
// rule: dental practices only, structured so others can be added later).
// Adding an industry later means: add it here, add any industry-specific
// theme labels if needed, and add a demo dataset under data/demo-reviews/.

export const INDUSTRIES = [
  { id: "dental", label: "Dental Practice", active: true },
  { id: "med_spa", label: "Med Spa", active: false },
  { id: "gym", label: "Gym / Fitness Studio", active: false },
  { id: "restaurant", label: "Restaurant", active: false },
  { id: "salon", label: "Salon", active: false },
  { id: "auto_repair", label: "Auto Repair Shop", active: false },
  { id: "veterinary", label: "Veterinary Clinic", active: false },
] as const;

export type IndustryId = (typeof INDUSTRIES)[number]["id"];

export const ACTIVE_INDUSTRIES = INDUSTRIES.filter((i) => i.active);
export const DEFAULT_INDUSTRY: IndustryId = "dental";
