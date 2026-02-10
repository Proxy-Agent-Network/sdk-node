import axios, { AxiosInstance, AxiosError } from 'axios';
import { ProxyAgent } from 'proxy-agent';
import { createHmac, timingSafeEqual } from 'crypto';
import { 
  TaskType, 
  TaskRequirements, 
  MarketTicker, 
  TaskObject 
} from './types';

// --- 1. Custom Error Classes ---

export class ProxyError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
    this.name = 'ProxyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends ProxyError { name = 'AuthenticationError'; }
export class InsufficientEscrowError extends ProxyError { name = 'InsufficientEscrowError'; }
export class NodeRateLimitedError extends ProxyError { name = 'NodeRateLimitedError'; }
export class ServerError extends ProxyError { name = 'ServerError'; }

// --- 2. Configuration & Types ---

export type SimulationScenario = 'HAPPY_PATH' | 'BROWNOUT_ACTIVE' | 'INSUFFICIENT_FUNDS';

const ENDPOINTS = {
  mainnet: 'https://api.proxyprotocol.com/v1',
  testnet: 'https://sandbox.proxyprotocol.com/v1',
  local: 'http://localhost:3000/v1'
};

export interface ProxyClientConfig {
  apiKey: string;
  environment?: 'mainnet' | 'testnet' | 'local';
  proxyUrl?: string; // Support corporate firewalls via 'proxy-agent'
  timeout?: number;
}

// --- 3. The Proxy Client (Base Class) ---

export class ProxyClient {
  private api: AxiosInstance;
  
  // Internal Simulation State
  public isTestMode: boolean = false;
  public activeScenario: SimulationScenario = 'HAPPY_PATH';
  public mockTaskStore: Map<string, number> = new Map();

  constructor(config: ProxyClientConfig) {
    const baseURL = ENDPOINTS[config.environment || 'mainnet'];

    // Unified Proxy Support (HTTP/HTTPS/SOCKS)
    // Automatically detects HTTP_PROXY env vars or uses provided config
    const httpsAgent = new ProxyAgent({
        getProxyForUrl: () => config.proxyUrl || process.env.HTTPS_PROXY || '',
    });

    this.api = axios.create({
      baseURL,
      timeout: config.timeout || 10000,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ProxyProtocol-Node/1.6.0'
      },
      httpAgent: httpsAgent,
      httpsAgent: httpsAgent,
      proxy: false
    });

    // Error Interceptor for Human-Readable Exceptions
    this.api.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          const { status, data } = error.response;
          const message = (data as any)?.error?.message || error.message;
          const code = (data as any)?.error?.code || `HTTP_${status}`;

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
   * Request a Task (The Primary Action)
   * Broadcasts a new task intent to the Human Proxy network.
   * * @param taskType - Enum or string defining the job (e.g. 'verify_sms_otp')
   * @param requirements - Task-specific parameters and context
   * @param maxBudgetSats - Escrow amount to lock
   */
  public async requestTask(
    taskType: TaskType | string, 
    requirements: TaskRequirements, 
    maxBudgetSats: number
  ): Promise<TaskObject> {
    if (this.isTestMode) {
      return this._simulateTaskCreation(maxBudgetSats);
    }

    const payload = {
      task_type: taskType,
      requirements,
      max_budget_sats: maxBudgetSats
    };
    
    const res = await this.api.post('/request', payload);
    return res.data;
  }

  /**
   * Get Task Status
   * Poll for completion or check current state.
   */
  public async getTask(taskId: string): Promise<TaskObject> {
    if (this.isTestMode) {
      return this._simulateTaskPolling(taskId);
    }

    const res = await this.api.get(`/tasks/${taskId}`);
    return res.data;
  }

  /**
   * Get Market Ticker
   * Check real-time pricing and congestion.
   */
  public async getTicker(): Promise<MarketTicker> {
    if (this.isTestMode) {
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

  // --- Simulation Helpers ---

  public enableTestMode(scenario: SimulationScenario = 'HAPPY_PATH') {
    this.isTestMode = true;
    this.activeScenario = scenario;
    console.warn(`⚠️ [ProxySDK] SIMULATION ACTIVE. Scenario: ${scenario}`);
  }

  private _simulateTaskCreation(budget: number): TaskObject {
    if (this.activeScenario === 'INSUFFICIENT_FUNDS') {
      throw new InsufficientEscrowError("PX_200", "Insufficient Escrow Balance.", 402);
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

  private _simulateTaskPolling(taskId: string): TaskObject {
    if (!this.mockTaskStore.has(taskId)) {
      throw new Error(`Task ${taskId} not found in simulator.`);
    }
    const createdAt = this.mockTaskStore.get(taskId) || 0;
    const elapsed = Date.now() - createdAt;
    
    let status: any = 'matching';
    if (elapsed > 5000) status = 'completed';
    else if (elapsed > 2000) status = 'in_progress';

    return {
      id: taskId,
      status: status,
      created_at: new Date(createdAt).toISOString()
    };
  }
}

// --- 4. Utilities ---

export function verifyProxySignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  const now = Math.floor(Date.now() / 1000);
  const eventTime = parseInt(timestamp, 10);
  if (isNaN(eventTime) || Math.abs(now - eventTime) > 300) return false;

  const payload = `${timestamp}.${rawBody}`;
  const hmac = createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  const signatureBuffer = Buffer.from(signature);
  const digestBuffer = Buffer.from(digest);

  if (signatureBuffer.length !== digestBuffer.length) return false;
  return timingSafeEqual(signatureBuffer, digestBuffer);
}

export * from './types';
