import fs from "fs";
import path from "path";

export type DemoReview = {
  id: string;
  authorName: string;
  rating: number;
  reviewText: string;
  reviewDate: string;
  isDemoData: true;
};

export type DemoDataset = {
  business: { name: string; industry: string; city: string; state: string; website: string };
  note: string;
  reviewCount: number;
  reviews: DemoReview[];
};

let cached: DemoDataset | null = null;

export function loadDemoReviews(): DemoDataset {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), "data", "demo-reviews", "dental-demo-reviews.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  cached = JSON.parse(raw);
  return cached as DemoDataset;
}
