// Lobby/session ID generation.
//
// Session links double as capability URLs: whoever holds the lobbyId can join
// as the interviewer, so it must resist guessing. The old generator
// (`Math.random().toString(36).substring(7)`) produced ~5 characters of
// non-cryptographic randomness (~36^5 ≈ 60M space) — brute-forceable with no
// rate limiting. New sessions use 122 bits of CSPRNG randomness instead.
//
// Existing short IDs keep working: validation keeps a loose lower bound and
// every lookup is by exact ID.

export function generateLobbyId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback (older Safari): 16 random bytes hex-encoded = same entropy.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}
