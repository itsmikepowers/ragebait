/**
 * Idea taxonomy shared by server code and client components.
 *
 * Lives apart from `lib/ideas.ts` because that module imports the MongoDB
 * driver, which can't be pulled into a "use client" bundle. Anything the UI
 * needs to render labels or tabs belongs here.
 */

/**
 * Product line the idea belongs to. Ideas are grouped by vertical first, then
 * by format, so unrelated businesses don't get mixed into one feed.
 */
export const IDEA_VERTICALS = [
  "funny-tshirts",
  "novelty-swimwear",
  "prank-mail",
  "funny-stickers",
] as const;
export type IdeaVertical = (typeof IDEA_VERTICALS)[number];

export const VERTICAL_LABELS: Record<IdeaVertical, string> = {
  "funny-tshirts": "Funny t-shirts",
  "novelty-swimwear": "Novelty swimwear",
  "prank-mail": "Prank mail",
  "funny-stickers": "Funny stickers",
};

/** Broad content lane, so ideas can be grouped by the joke format they use. */
export const IDEA_CATEGORIES = [
  "band-logo-parody",
  "name-acrostic",
  "relationship",
  "pick-one",
  "wholesome-illustrated",
  "corporate-parody",
  "absurd-oneliner",
  "reaction-prank",
  "product-reveal",
  "giveaway-bait",
  "behind-the-scenes",
  "other",
] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<IdeaCategory, string> = {
  "band-logo-parody": "Band logo parody",
  "name-acrostic": "Name acrostic",
  relationship: "Relationship",
  "pick-one": "Pick one",
  "wholesome-illustrated": "Wholesome / illustrated",
  "corporate-parody": "Corporate parody",
  "absurd-oneliner": "Absurd one-liner",
  "reaction-prank": "Reaction / prank",
  "product-reveal": "Product reveal",
  "giveaway-bait": "Giveaway / comment bait",
  "behind-the-scenes": "Behind the scenes",
  other: "Other",
};

/** Labels a category, tolerating legacy rows whose value predates the list. */
export function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value as IdeaCategory] ?? value;
}

/** How safe the reference is to imitate on a brand account. */
export const IDEA_RISK_LEVELS = ["safe", "edgy", "avoid"] as const;
export type IdeaRisk = (typeof IDEA_RISK_LEVELS)[number];
