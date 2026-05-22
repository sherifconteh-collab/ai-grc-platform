// @tier: community
'use strict';

// CNSA 2.0 post-quantum digital signatures — ML-DSA-65 (FIPS-204) via the
// pure-JS @noble/post-quantum library (no native deps, Node 20.19+/22 require(ESM)).
// Used for hybrid (classical RSA-3072 + ML-DSA-65) license signing.
const { ml_dsa65 } = require('@noble/post-quantum/ml-dsa.js');

const PQC_ALG = 'ML-DSA-65';

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  return Buffer.from(String(input), 'utf8');
}

/**
 * Generate an ML-DSA-65 keypair. Returns base64-encoded keys for storage/env.
 */
function mldsaKeygen() {
  const { publicKey, secretKey } = ml_dsa65.keygen();
  return {
    alg: PQC_ALG,
    publicKey: Buffer.from(publicKey).toString('base64'),
    secretKey: Buffer.from(secretKey).toString('base64'),
  };
}

/**
 * Sign a message (string|Uint8Array) with a base64-encoded secret key.
 * Returns the base64-encoded signature.
 */
function mldsaSign(message, secretKeyB64) {
  const sk = Buffer.from(secretKeyB64, 'base64');
  const sig = ml_dsa65.sign(toBytes(message), sk);
  return Buffer.from(sig).toString('base64');
}

/**
 * Verify a base64 signature over a message against a base64 public key.
 * Returns false on any malformed input rather than throwing.
 */
function mldsaVerify(message, sigB64, publicKeyB64) {
  try {
    const sig = Buffer.from(sigB64, 'base64');
    const pk = Buffer.from(publicKeyB64, 'base64');
    return ml_dsa65.verify(sig, toBytes(message), pk);
  } catch {
    return false;
  }
}

module.exports = { PQC_ALG, mldsaKeygen, mldsaSign, mldsaVerify };
