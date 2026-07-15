///////////////
// Constants //
///////////////

/** Max images a single draft can carry (guards the message JSON payload). */
export const MAX_COMPOSER_IMAGES = 10;

/** Max size of one attached image, in bytes — oversized files are skipped. */
export const MAX_COMPOSER_IMAGE_BYTES = 10 * 1024 * 1024;
