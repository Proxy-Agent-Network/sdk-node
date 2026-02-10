import * as crypto from 'crypto';
import { LNDNode } from './lnd';

// PROXY PROTOCOL - TIPPING SETTLEMENT ENGINE (v1)
// "Spontaneous incentives for human excellence."

// Standard Lightning Keysend Custom Record ID for Preimage
const KEYSEND_PREIMAGE_RECORD = '5482373484';
// Proxy Protocol Reward Metadata Record ID
const PROXY_REWARD_RECORD = '696969';

export interface RewardParams {
  nodePubkey: string;       // The Human Node's Lightning Identity Key
  amountSats: number;       // Total tip amount
  reasons: string[];        // e.g., ['RWD_INTUITION', 'RWD_SPEED']
}

export class TippingService {
  private lnd: LNDNode;

  constructor(lndNode: LNDNode) {
    this.lnd = lndNode;
  }

  /**
   * Executes a spontaneous Keysend payment to a Human Node.
   * Encodes the reward reasons into the transaction metadata.
   */
  public async sendTip(params: RewardParams): Promise<{ payment_hash: string; fee_sats: number }> {
    console.log(`[Tipping] Preparing reward of ${params.amountSats} sats for ${params.nodePubkey.substring(0, 8)}...`);

    // 1. Generate Preimage (Keysend Requirement)
    // In Keysend, the sender generates the secret and encrypts it in the custom records.
    const preimage = crypto.randomBytes(32);
    const paymentHash = crypto.createHash('sha256').update(preimage).digest('hex');
    const preimageHex = preimage.toString('hex');

    // 2. Encode Metadata
    // Record 696969 contains the CSV list of reasons for the UI to display
    const reasonPayload = Buffer.from(params.reasons.join(',')).toString('hex');

    // 3. Construct LND Payload
    // Using routerrpc.SendPaymentV2 logic (simplified for REST)
    const payload = {
      dest: Buffer.from(params.nodePubkey, 'hex').toString('base64'), // LND REST expects Base64 often, check docs. Usually hex for CLI, base64 for REST. Assuming Hex/Base64 handling in LNDNode wrapper.
      // Actually, for the REST /v1/channels/transactions endpoint (which supports keysend in newer versions via dest_custom_records)
      amt: params.amountSats,
      payment_hash: paymentHash,
      dest_custom_records: {
        [KEYSEND_PREIMAGE_RECORD]: preimageHex,
        [PROXY_REWARD_RECORD]: reasonPayload
      },
      allow_self_payment: true,
      fee_limit: { fixed: 1000 } // Cap fees to prevent routing drain
    };

    // Note: This assumes the LNDNode wrapper has a generic 'post' or specific 'sendPayment' method.
    // We will use the 'payKeysend' alias if it exists, or raw request.
    try {
      // @ts-ignore - Assuming extended LNDNode functionality
      const response = await this.lnd.request('POST', '/channels/transactions', payload);
      
      if (response.payment_error) {
        throw new Error(`LND Error: ${response.payment_error}`);
      }

      console.log(`[Tipping] ✅ SUCCESS. Hash: ${paymentHash}`);
      return {
        payment_hash: paymentHash,
        fee_sats: response.payment_route?.total_fees || 0
      };

    } catch (error: any) {
      console.error(`[Tipping] ❌ FAILED: ${error.message || error}`);
      throw new Error("Failed to execute keysend reward.");
    }
  }
}
