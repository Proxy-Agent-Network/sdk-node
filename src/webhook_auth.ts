import { createHmac, timingSafeEqual } from 'crypto';

/**
 * PROXY PROTOCOL - WEBHOOK HMAC UTILITY (Node.js)
 * "Verify the origin of every instruction."
 * ----------------------------------------------------
 */

/**
 * Verifies the HMAC-SHA256 signature of an incoming Proxy Protocol webhook.
 * * @param rawBody - The raw, unparsed request body (string or Buffer).
 * @param signature - The value from the 'X-Proxy-Signature' header.
 * @param timestamp - The value from the 'X-Proxy-Request-Timestamp' header.
 * @param secret - Your 'whsec_...' secret from the Proxy Dashboard.
 * @param toleranceSeconds - Time window in seconds to prevent replay attacks (default 5m).
 * * @returns boolean - True if the signature is valid and within the time window.
 */
export function verifySignature(
  rawBody: string | Buffer,
  signature: string,
  timestamp: string,
  secret: string,
  toleranceSeconds: number = 300
): boolean {
  // 1. Replay Attack Protection
  const now = Math.floor(Date.now() / 1000);
  const eventTime = parseInt(timestamp, 10);

  if (isNaN(eventTime)) {
    return false;
  }

  if (Math.abs(now - eventTime) > toleranceSeconds) {
    // Request is too old or from the future. Possible replay attack.
    return false;
  }

  // 2. Prepare the Signed Payload
  // The standard format is: {timestamp}.{raw_body}
  const bodyBuffer = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf-8') : rawBody;
  const prefix = Buffer.from(`${timestamp}.`, 'utf-8');
  const payload = Buffer.concat([prefix, bodyBuffer]);

  // 3. Compute the Expected Signature
  const hmac = createHmac('sha256', secret);
  const computedSignature = hmac.update(payload).digest('hex');

  // 4. Constant-Time Comparison
  // We use timingSafeEqual to prevent timing attacks.
  // Note: timingSafeEqual requires Buffers of the same length.
  const signatureBuffer = Buffer.from(signature, 'hex');
  const computedBuffer = Buffer.from(computedSignature, 'hex');

  if (signatureBuffer.length !== computedBuffer.length) {
    return false;
  }

  return timingSafeEqual(computedBuffer, signatureBuffer);
}

/**
 * --- Usage Example (Express) ---
 * * import express from 'express';
 * import { verifySignature } from './webhook_auth';
 * * const app = express();
 * * // CRITICAL: You need the raw body for signature verification.
 * // Use express.raw() or access the raw body before JSON parsing.
 * app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
 * const sig = req.headers['x-proxy-signature'] as string;
 * const ts = req.headers['x-proxy-request-timestamp'] as string;
 * const secret = process.env.WEBHOOK_SECRET!;
 * * const isValid = verifySignature(req.body, sig, ts, secret);
 * * if (!isValid) {
 * return res.status(401).send('Invalid Signature');
 * }
 * * // Now it's safe to parse and process
 * const data = JSON.parse(req.body.toString());
 * res.status(200).json({ received: true });
 * });
 */
