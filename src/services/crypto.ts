// Cryptographic utilities for key generation, validation, and address derivation

export function generateSecurePrivateKey(): string {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  return `0x${hex}`;
}

export function deriveAddressFromKey(privateKey: string): string {
  // Simple deterministic wallet address generation
  const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  let hash = 0;
  for (let i = 0; i < cleanKey.length; i++) {
    hash = ((hash << 5) - hash) + cleanKey.charCodeAt(i);
    hash |= 0;
  }
  
  // Format as standard EVM-like 42-char address
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const part2 = cleanKey.slice(0, 32).padEnd(32, 'a');
  return `0x${hex}${part2.slice(0, 32)}`;
}

export function formatAddress(address: string, lead: number = 6, tail: number = 4): string {
  if (!address) return '';
  if (address.length <= lead + tail) return address;
  return `${address.substring(0, lead)}...${address.substring(address.length - tail)}`;
}

export function isValidPrivateKey(key: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  return hex.length >= 32 && /^[0-9a-fA-F]+$/.test(hex);
}
