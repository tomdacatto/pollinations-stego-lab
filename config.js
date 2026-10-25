// What a visitor's key may spend and for how long. Pollen is per visitor.
// A lab with the default cheap models costs a few hundredths of a Pollen.
export const BUDGET = 0.5;
export const EXPIRY_DAYS = 1;

// How many pictures are drawn at the same time.
export const CONCURRENCY = 3;

// Models offered first, when the live list has them. Hiders can be any text model.
export const DEFAULT_HIDER = "google/gemini-3.5-flash-lite";
export const DEFAULT_SEEKER = "google/gemini-3.5-flash-lite";

// Secrets the lab starts with: short, so a seeker can recover them.
export const DEFAULT_SECRETS = ["moon", "paper boat", "seven rivers"];
