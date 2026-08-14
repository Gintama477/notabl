import { z } from "zod";

// Single source of truth for the exact 8 beta feedback questions.
export const FEEDBACK_QUESTIONS = {
  clarityImmediate: "Was it immediately clear what the product does?",
  mostUsefulPart: "Which part was most useful?",
  confusingPart: "Which part was confusing?",
  wouldSaveTime: "Would this save your practice time?",
  wouldUseWeekly: "Would you use this weekly?",
  wouldPay49: "Would you pay $49/month?",
  reasonablePriceIfNot: "If not, what price would feel reasonable?",
  whatWouldChangeToPay: "What would need to change before you would pay?",
} as const;

export const FeedbackSchema = z
  .object({
    clarityImmediate: z.enum(["yes", "no"]).optional(),
    mostUsefulPart: z.string().max(2000).optional().or(z.literal("")),
    confusingPart: z.string().max(2000).optional().or(z.literal("")),
    wouldSaveTime: z.enum(["yes", "no", "not_sure"]).optional(),
    wouldUseWeekly: z.enum(["yes", "no", "not_sure"]).optional(),
    wouldPay49: z.enum(["yes", "no"]).optional(),
    reasonablePriceIfNot: z.string().max(200).optional().or(z.literal("")),
    whatWouldChangeToPay: z.string().max(2000).optional().or(z.literal("")),
  })
  .refine((v) => Object.values(v).some((val) => val !== undefined && val !== ""), {
    message: "Answer at least one question before submitting.",
  });

export type FeedbackInput = z.infer<typeof FeedbackSchema>;
