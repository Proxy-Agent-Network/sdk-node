import https from 'https';
import fs from 'fs';

/**
 * LND Configuration Interface
 */
export interface LNDConfig {
  socket: string;      // e.g. '127.0.0.1:8080' or 'lnd.my-agent.com:443'
  macaroon: string;    // Hex string OR file path to .macaroon
  cert?: string;       // File path to tls.cert (required for self-signed nodes)
}

/**
 * Proxy Protocol LND Wrapper
 * Enables Agents to communicate directly with their Lightning Node
 * to fund tasks and verify escrow settlements.
 */
export class LNDNode {
  private macaroonHex: string;
  private certAgent?: https.Agent;
  private baseUrl: string;

  constructor(config: LNDConfig) {
    // Ensure protocol is present
    const host = config.socket.startsWith('http') ? config.socket : `https://${config.socket}`;
    this.baseUrl = `${host}/v1`;

    // 1. Load Macaroon (Support Path or Hex)
    // Basic heuristic: if it contains non-hex chars or is short, try file. 
    // Otherwise assume hex string if long.
    try {
      if (fs.existsSync(config.macaroon)) {
        this.macaroonHex = fs.readFileSync(config.macaroon).toString('hex');
      } else {
        this.macaroonHex = config.macaroon;
      }
    } catch (e) {
      // Fallback: treat input as raw hex string
      this.macaroonHex = config.macaroon;
    }

    // 2. Load TLS Cert (Critical for LND)
    if (config.cert && fs.existsSync(config.cert)) {
      this.certAgent = new https.Agent({
        ca: fs.readFileSync(config.cert),
        rejectUnauthorized: true 
      });
    } else {
      // WARNING: Only use rejectUnauthorized: false in dev/testnet
      this.certAgent = new https.Agent({ rejectUnauthorized: false });
    }
  }

  /**
   * Internal Request Helper
   */
  private async request<T>(method: string, endpoint: string, body?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        method: method,
        headers: {
          'Grpc-Metadata-macaroon': this.macaroonHex,
          'Content-Type': 'application/json'
        },
        agent: this.certAgent
      };

      const req = https.request(`${this.baseUrl}${endpoint}`, options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              reject({ status: res.statusCode, error: json });
            } else {
              resolve(json);
            }
          } catch (e) {
            reject(new Error(`Failed to parse LND response: ${data}`));
          }
        });
      });

      req.on('error', (e) => reject(e));
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * Check Wallet Balance
   * Useful before creating a task to ensure funds exist.
   */
  public async getBalance(): Promise<{ total_balance: string; confirmed_balance: string }> {
    // LND Endpoint: GET /v1/balance/blockchain
    // Also useful: GET /v1/balance/channels
    return this.request('GET', '/balance/blockchain');
  }

  /**
   * Pay a Proxy Protocol Escrow Invoice
   * @param payment_request - The BOLT11 string returned by Proxy API
   */
  public async payInvoice(payment_request: string): Promise<{ payment_preimage: string; payment_hash: string }> {
    // LND Endpoint: POST /v1/channels/transactions
    return this.request('POST', '/channels/transactions', {
      payment_request: payment_request
    });
  }

  /**
   * Verify Invoice Status
   * Check if a specific payment hash is settled.
   */
  public async lookupInvoice(r_hash_hex: string): Promise<any> {
    return this.request('GET', `/invoice/${r_hash_hex}`);
  }
  
  /**
   * Generate a New Address (for Top-Up)
   */
  public async newAddress(type: 'p2wkh' | 'np2wkh' = 'p2wkh'): Promise<{ address: string }> {
    return this.request('POST', '/newaddress', { type });
  }
}
