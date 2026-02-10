import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Proxy Protocol - Webhook Security Utilities
 */

/**
 * Verifies the HMAC-SHA256 signature of a Proxy Protocol webhook request.
 * * Prevents Man-in-the-Middle (MITM) replay attacks and authenticates that
 * the payload truly originated from the Proxy Network.
 *
 * @param rawBody - The raw string body of the POST request. DO NOT parse JSON first.
 * @param signature - The value of the 'X-Proxy-Signature' header.
 * @param timestamp - The value of the 'X-Proxy-Request-Timestamp' header.
 * @param secret - Your webhook signing secret (starts with 'whsec_').
 * * @returns boolean - True if the signature is valid and authentic.
 * @throws Error if the timestamp is too old (Replay Attack Protection).
 */
export function verifyProxySignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  // 1. Replay Attack Protection (5 Minute Tolerance)
  const now = Math.floor(Date.now() / 1000);
  const eventTime = parseInt(timestamp, 10);
  
  if (isNaN(eventTime)) {
    throw new Error("Invalid timestamp header.");
  }

  if (Math.abs(now - eventTime) > 300) {
    throw new Error("Request timestamp is outside the tolerance window (5m). Possible replay attack.");
  }

  // 2. Construct the Signed Payload
  // Format: timestamp + "." + raw_body
  const payload = `${timestamp}.${rawBody}`;

  // 3. Compute Expected Signature
  const hmac = createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');

  // 4. Constant-Time Comparison
  // Prevents timing attacks where an attacker guesses the signature character by character.
  const signatureBuffer = Buffer.from(signature);
  const digestBuffer = Buffer.from(digest);

  if (signatureBuffer.length !== digestBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, digestBuffer);
}
