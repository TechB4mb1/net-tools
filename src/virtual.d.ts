declare module 'virtual:oui' {
  /** De-duplicated vendor names. */
  export const names: string[];
  /** Upper-case 6-hex-digit OUI -> index into `names`. */
  export const index: Record<string, number>;
}
