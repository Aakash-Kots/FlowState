/**
 * Friendly random branch names — the throwaway name a worktree is created on
 * before its first chat auto-titles it (e.g. `brave-lark`). Docker/drizzle style:
 * an adjective plus a noun, both already valid git branch segments. The name is
 * cosmetic and short-lived — `maybeGenerateTitle` renames the branch to a
 * conversation-derived slug once the first exchange lands.
 */

///////////////
// Constants //
///////////////

/** Positive, neutral adjectives — the first half of a generated branch name. */
const ADJECTIVES = [
  'amber',
  'bold',
  'brave',
  'bright',
  'calm',
  'clever',
  'cosmic',
  'crisp',
  'daring',
  'eager',
  'fancy',
  'gentle',
  'glad',
  'golden',
  'happy',
  'jolly',
  'keen',
  'lively',
  'lucky',
  'mellow',
  'merry',
  'mighty',
  'nimble',
  'noble',
  'plucky',
  'proud',
  'quiet',
  'rapid',
  'rustic',
  'sharp',
  'shiny',
  'silent',
  'silver',
  'sleek',
  'snappy',
  'solar',
  'spry',
  'stoic',
  'sunny',
  'swift',
  'tidy',
  'trusty',
  'vivid',
  'warm',
  'wise',
  'witty',
  'zany',
  'zesty',
];

/** Nouns (mostly animals + nature) — the second half of a generated branch name. */
const NOUNS = [
  'badger',
  'beacon',
  'birch',
  'brook',
  'cedar',
  'comet',
  'coral',
  'cove',
  'crane',
  'delta',
  'ember',
  'falcon',
  'fern',
  'finch',
  'fjord',
  'grove',
  'harbor',
  'heron',
  'ibex',
  'jasper',
  'koala',
  'lark',
  'lotus',
  'lynx',
  'maple',
  'marten',
  'meadow',
  'moss',
  'newt',
  'otter',
  'panda',
  'pebble',
  'quail',
  'raven',
  'reef',
  'ridge',
  'robin',
  'sable',
  'sparrow',
  'spruce',
  'summit',
  'tamarin',
  'terra',
  'thistle',
  'vale',
  'walrus',
  'willow',
  'wren',
  'zephyr',
];

/////////////
// Helpers //
/////////////

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

////////////
// Export //
////////////

/** A fresh `<adjective>-<noun>` branch name, e.g. `brave-lark`. */
export function randomBranchName(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}
