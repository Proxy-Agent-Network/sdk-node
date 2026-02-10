import axios, { AxiosInstance, AxiosError } from 'axios';
import { ProxyAgent } from 'proxy-agent';
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
    // Restore prototype chain for instanceof checks
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

export class ValidationFailedError extends ProxyError {
  constructor(code: string, message: string, status?: number) {
    super(code, message, status);
    this.name = 'ValidationFailedError';
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

// Environment Endpoints
const ENDPOINTS = {
  mainnet: 'https://api.proxyprotocol.com/v1',
  testnet: 'https://sandbox.proxyprotocol.com/v1',
  local: 'http://localhost:3000/v1'
};

export interface ProxyClientConfig {
  apiKey: string;
  environment?: 'mainnet' | 'testnet' | 'local';
  proxyUrl?: string; // Optional: Force a specific proxy (SOCKS/HTTP)
  timeout?: number;
}

export class ProxyClient {
  private api: AxiosInstance;
  private env: string;
  
  // Liveness Simulator State
  private isTestMode: boolean = false;
  private mockTaskStore: Map<string, number> = new Map(); // Stores ID -> Timestamp

  constructor(config: ProxyClientConfig) {
    this.env = config.environment || 'mainnet';
    const baseURL = ENDPOINTS[this.env];

    // Unified Proxy Support (HTTP/HTTPS/SOCKS)
    const httpsAgent = new ProxyAgent({
        getProxyForUrl: () => config.proxyUrl || process.env.HTTPS_PROXY || '',
    });

    this.api = axios.create({
      baseURL,
      timeout: config.timeout || 10000,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ProxyProtocol-Node/1.2.0'
      },
      httpAgent: httpsAgent,
      httpsAgent: httpsAgent,
      proxy: false
    });

    // Install Error Interceptor
    this.api.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          const status = error.response.status;
          const data: any = error.response.data;
          
          // Fallback message if API doesn't return structured error
          const message = data?.error?.message || error.message;
          // Use PX_ code if available, else generic HTTP_ code
          const code = data?.error?.code || `HTTP_${status}`;

          switch (status) {
            case 400: throw new ValidationFailedError(code, message, status);
            case 401:
            case 403: throw new AuthenticationError(code, message, status);
            case 402: throw new InsufficientEscrowError(code, message, status);
            case 429: throw new NodeRateLimitedError(code, message, status);
            case 500:
            case 502:
            case 503: throw new ServerError(code, message, status);
            default: throw new ProxyError(code, message, status);
          }
        }
        // Network errors (no response) fall through here
        throw error;
      }
    );
  }

  /**
   * Enable Local Liveness Simulator (Test Mode)
   * * Intercepts all outgoing API calls.
   * * Simulates a Human Node accepting and completing tasks locally.
   * * Useful for Unit Tests and CI/CD pipelines where no network is available.
   */
  public enableTestMode() {
    this.isTestMode = true;
    console.warn("⚠️ [ProxySDK] TEST MODE ENABLED. Network calls are mocked.");
  }

  /**
   * Market Data
   * Get real-time cost for human tasks.
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

  /**
   * Task Creation
   * Hire a human node for a specific job.
   */
  public async createTask(
    taskType: TaskType | string, 
    requirements: TaskRequirements, 
    maxBudgetSats: number
  ): Promise<TaskObject> {
    // 1. Simulation Interceptor
    if (this.isTestMode) {
      const mockId = `task_sim_${Date.now()}`;
      this.mockTaskStore.set(mockId, Date.now());
      console.log(`[ProxySDK] Simulating Task Creation: ${mockId}`);
      
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
   * Poll for completion (or use Webhooks).
   */
  public async getTask(taskId: string): Promise<TaskObject> {
    // 1. Simulation Interceptor
    if (this.isTestMode) {
      if (!this.mockTaskStore.has(taskId)) {
        throw new Error(`[ProxySDK] Task ${taskId} not found in local simulator state.`);
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
          verdict: "success",
          human_note: "Task completed via TestMode simulator."
        };
      } else if (elapsed > 2000) {
        status = 'in_progress';
      }

      return {
        id: taskId,
        status: status,
        created_at: new Date(createdAt).toISOString(),
        assigned_node_id: 'node_simulated_human_alpha',
        result: result
      };
    }

    // 2. Real Network Call
    const res = await this.api.get(`/tasks/${taskId}`);
    return res.data;
  }
}

export * from './types';
