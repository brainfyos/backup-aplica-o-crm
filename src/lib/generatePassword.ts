// Gera uma senha provisória forte (14 chars), com maiúsculas, minúsculas, número e símbolo.
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

function pick(pool: string) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return pool[arr[0] % pool.length];
}

export function generateProvisionalPassword(length = 14): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(ALL));
  const chars = [...required, ...rest];
  // Shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
