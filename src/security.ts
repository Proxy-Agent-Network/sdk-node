import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Proxy Protocol - Webhook Security Utilities (v1.6.0)
 * ----------------------------------------------------
 */

/**
 * Verifies the HMAC-SHA256 signature of a Proxy Protocol webhook request.
 * * This ensures:
 * 1. The payload originated from the Proxy Network (Authentication).
 * 2. The payload was not modified in transit (Integrity).
 * 3. The request is not a re-broadcast of an old event (Replay Protection).
 *
 * @param rawBody - The unparsed string body of the POST request.
 * @param signature - The 'x-proxy-signature' header value.
 * @param timestamp - The 'x-proxy-request-timestamp' header value.
 * @param secret - Your webhook signing secret (whsec_...).
 * @returns boolean - True if the signature is valid.
 * @throws Error if the timestamp is invalid or outside the 5-minute tolerance.
 */
export function verifyProxySignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  // 1. Validate Timestamp Existence
  const eventTime = parseInt(timestamp, 10);
  if (isNaN(eventTime)) {
    throw new Error("PX_SECURITY_ERR: Invalid or missing timestamp header.");
  }

  // 2. Replay Attack Protection
  // Reject requests older than 5 minutes or more than 5 minutes in the future.
  const now = Math.floor(Date.now() / 1000);
  const tolerance = 300; // 5 minutes

  if (Math.abs(now - eventTime) > tolerance) {
    throw new Error("PX_SECURITY_ERR: Request timestamp outside 5m window. Potential replay attack.");
  }

  // 3. Construct the Signed Payload
  // Protocol Standard: timestamp + "." + raw_body
  const payload = `${timestamp}.${rawBody}`;

  // 4. Compute Expected Signature
  const hmac = createHmac('sha256', secret);
  const expectedSignature = hmac.update(payload).digest('hex');

  // 5. Constant-Time Comparison
  // Prevents attackers from measuring CPU cycles to guess the signature byte-by-byte.
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  // timingSafeEqual requires buffers of identical length
  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, expectedBuffer);
}
