export function verifyOpSig(
  tokenId: string,
  sig: string,
  scope: string,
  op: string
): boolean {
  let tokenIdBytes;
  let sigBytes;
  try {
    tokenIdBytes = Codec.hexdecode(tokenId);
    sigBytes = Codec.b64decode(sig, "urlsafe-nopad");
  } catch (e) {
    return false;
  }

  if (tokenIdBytes.length !== 32) return false;
  const pubkey = new NativeCrypto.Ed25519.PublicKey(tokenIdBytes);
  const payload = scope + ":" + op;
  if (!pubkey.verify(sigBytes, new TextEncoder().encode(payload))) return false;

  return true;
}
