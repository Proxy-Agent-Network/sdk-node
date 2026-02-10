import axios, { AxiosInstance, AxiosError } from 'axios';
import { ProxyAgent } from 'proxy-agent';
import { createHmac, timingSafeEqual } from 'crypto';
import { 
  TaskType, 
  TaskRequirements, 
  MarketTicker, 
  TaskObject 
} from './types';

// --- Custom Error Classes ---

export class ProxyError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
    this.name = 'ProxyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends ProxyError {
  constructor(code: string, message: string, status?: number) {
    super(code, message, status);
    this.name = 'AuthenticationError';
  }
}

export class InsufficientEscrowError extends ProxyError {
  constructor(code: string, message: string, status?: number) {
    super(code, message, status);
    this.name = 'InsufficientEscrowError';
  }
}

export class NodeRateLimitedError extends ProxyError {
  constructor(code: string, message: string, status?: number) {
    super(code, message, status);
    this.name = 'NodeRateLimitedError';
  }
}

export class ServerError extends ProxyError {
  constructor(code: string, message: string, status?: number) {
    super(code, message, status);
    this.name = 'ServerError';
  }
}

// --- Simulation Configuration ---

export type SimulationScenario = 'HAPPY_PATH' | 'BROWNOUT_ACTIVE' | 'INSUFFICIENT_FUNDS' | 'RANDOM_LATENCY';

// Environment Endpoints
const ENDPOINTS = {
  mainnet: 'https://api.proxyprotocol.com/v1',
  testnet: 'https://sandbox.proxyprotocol.com/v1',
  local: 'http://localhost:3000/v1'
};

export interface ProxyClientConfig {
  apiKey: string;
  environment?: 'mainnet' | 'testnet' | 'local';
  proxyUrl?: string;
  timeout?: number;
}

export class ProxyClient {
  private api: AxiosInstance;
  
  // Simulation State
  private isTestMode: boolean = false;
  private activeScenario: SimulationScenario = 'HAPPY_PATH';
  private mockTaskStore: Map<string, number> = new Map();

  constructor(config: ProxyClientConfig) {
    const baseURL = ENDPOINTS[config.environment || 'mainnet'];

    const httpsAgent = new ProxyAgent({
        getProxyForUrl: () => config.proxyUrl || process.env.HTTPS_PROXY || '',
    });

    this.api = axios.create({
      baseURL,
      timeout: config.timeout || 10000,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ProxyProtocol-Node/1.3.0'
      },
      httpAgent: httpsAgent,
      httpsAgent: httpsAgent,
      proxy: false
    });

    // Error Interceptor
    this.api.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          const status = error.response.status;
          const data: any = error.response.data;
          const message = data?.error?.message || error.message;
          const code = data?.error?.code || `HTTP_${status}`;

          switch (status) {
            case 401:
            case 403: throw new AuthenticationError(code, message, status);
            case 402: throw new InsufficientEscrowError(code, message, status);
            case 429: throw new NodeRateLimitedError(code, message, status);
            case 500:
            case 503: throw new ServerError(code, message, status);
            default: throw new ProxyError(code, message, status);
          }
        }
        throw error;
      }
    );
  }

  /**
   * Enable SDK Simulation Mode
   * Intercepts network calls to simulate API responses without spending Sats.
   * * @param scenario - Force a specific network condition (Default: HAPPY_PATH)
   */
  public enableTestMode(scenario: SimulationScenario = 'HAPPY_PATH') {
    this.isTestMode = true;
    this.activeScenario = scenario;
    console.warn(`⚠️ [ProxySDK] SIMULATION ACTIVE. Scenario: ${scenario}`);
  }

  /**
   * Market Data
   */
  public async getTicker(): Promise<MarketTicker> {
    if (this.isTestMode) {
      if (this.activeScenario === 'BROWNOUT_ACTIVE') {
        // Simulate Price Surge
        return {
          status: "congested",
          base_currency: "SATS",
          rates: { [TaskType.VERIFY_SMS_OTP]: 5000, [TaskType.LEGAL_NOTARY_SIGN]: 90000 },
          congestion_multiplier: 5.0 // 5x Surge
        };
      }
      return {
        status: "stable",
        base_currency: "SATS",
        rates: { [TaskType.VERIFY_SMS_OTP]: 1000, [TaskType.LEGAL_NOTARY_SIGN]: 50000 },
        congestion_multiplier: 1.0
      };
    }
    const res = await this.api.get('/market/ticker');
    return res.data;
  }

  /**
   * Task Creation
   */
  public async createTask(
    taskType: TaskType | string, 
    requirements: TaskRequirements, 
    maxBudgetSats: number
  ): Promise<TaskObject> {
    // 1. Simulation Interceptor
    if (this.isTestMode) {
      // Simulate Delays
      if (this.activeScenario === 'RANDOM_LATENCY') {
        const ms = Math.floor(Math.random() * 2000) + 500;
        await new Promise(r => setTimeout(r, ms));
      }

      // Simulate Failures
      if (this.activeScenario === 'BROWNOUT_ACTIVE') {
        throw new ServerError(
          "PX_500", 
          "Network Busy. Brownout Level: ORANGE. Min Rep Required: 700", 
          503
        );
      }

      if (this.activeScenario === 'INSUFFICIENT_FUNDS') {
        throw new InsufficientEscrowError(
          "PX_200", 
          "Insufficient Escrow Balance. Top up Lightning Wallet.", 
          402
        );
      }

      const mockId = `task_sim_${Date.now()}`;
      this.mockTaskStore.set(mockId, Date.now());
      
      return {
        id: mockId,
        status: 'matching',
        created_at: new Date().toISOString(),
        assigned_node_id: 'node_simulated_human_alpha'
      };
    }

    // 2. Real Network Call
    const payload = {
      task_type: taskType,
      requirements,
      max_budget_sats: maxBudgetSats
    };
    const res = await this.api.post('/request', payload);
    return res.data;
  }

  /**
   * Task Status
   */
  public async getTask(taskId: string): Promise<TaskObject> {
    if (this.isTestMode) {
      if (!this.mockTaskStore.has(taskId)) {
        throw new Error(`[ProxySDK] Task ${taskId} not found in local simulator.`);
      }

      const createdAt = this.mockTaskStore.get(taskId) || 0;
      const elapsed = Date.now() - createdAt;

      // Logic: 0-2s Matching, 2-5s In Progress, >5s Completed
      let status: 'matching' | 'in_progress' | 'completed' = 'matching';
      let result = undefined;

      if (elapsed > 5000) {
        status = 'completed';
        result = { 
          proof: "simulated_proof_data_xyz", 
          verdict: "success" 
        };
      } else if (elapsed > 2000) {
        status = 'in_progress';
      }

      return {
        id: taskId,
        status: status,
        created_at: new Date(createdAt).toISOString(),
        result: result
      };
    }

    const res = await this.api.get(`/tasks/${taskId}`);
    return res.data;
  }
}

/**
 * Verifies the HMAC-SHA256 signature of a Proxy Protocol webhook request.
 * Prevents Man-in-the-Middle (MITM) replay attacks and authenticates origin.
 *
 * @param rawBody - The raw string body of the POST request. DO NOT parse JSON first.
 * @param signature - The value of the 'X-Proxy-Signature' header.
 * @param timestamp - The value of the 'X-Proxy-Request-Timestamp' header.
 * @param secret - Your webhook signing secret (starts with 'whsec_').
 * @returns boolean - True if the signature is valid and authentic.
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
  
  if (isNaN(eventTime)) return false;
  if (Math.abs(now - eventTime) > 300) return false;

  // 2. Construct Signed Payload
  const payload = `${timestamp}.${rawBody}`;

  // 3. Compute Expected Signature
  const hmac = createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');

  // 4. Constant-Time Comparison
  const signatureBuffer = Buffer.from(signature);
  const digestBuffer = Buffer.from(digest);

  if (signatureBuffer.length !== digestBuffer.length) return false;
  return timingSafeEqual(signatureBuffer, digestBuffer);
}

export * from './types';
