import { z } from "zod";

// Backs app/api/r/[slug]/feedback/route.ts — deliberately just rating +
// message. No name/email/phone field, and none should ever be added here;
// see the comment above the patientFeedback table in lib/db/schema.pg.ts
// for why.
export const PatientFeedbackSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  message: z.string().trim().min(1, "Enter your feedback before submitting.").max(2000),
});

export type PatientFeedbackInput = z.infer<typeof PatientFeedbackSchema>;
