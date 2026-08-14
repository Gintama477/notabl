import { z } from "zod";

export const SignupSchema = z.object({
  businessName: z.string().min(2, "Business name is required").max(120),
  website: z.string().max(200).optional().or(z.literal("")),
  city: z.string().max(80).optional().or(z.literal("")),
  state: z.string().max(40).optional().or(z.literal("")),
  reviewProfileLinks: z.string().max(500).optional().or(z.literal("")), // free text, one or more URLs
  email: z.string().email("Enter a valid email address"),
});

export type SignupInput = z.infer<typeof SignupSchema>;
