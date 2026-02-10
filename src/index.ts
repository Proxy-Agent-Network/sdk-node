import axios, { AxiosInstance } from 'axios';
import { ProxyAgent } from 'proxy-agent';

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

  constructor(config: ProxyClientConfig) {
    this.env = config.environment || 'mainnet';
    const baseURL = ENDPOINTS[this.env];

    // 1. Unified Proxy Support
    // If a proxyUrl is provided, or if system env vars (HTTP_PROXY) exist,
    // ProxyAgent will handle the routing automatically.
    const httpsAgent = new ProxyAgent({
        getProxyForUrl: () => config.proxyUrl || process.env.HTTPS_PROXY || '',
    });

    this.api = axios.create({
      baseURL,
      timeout: config.timeout || 10000,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ProxyProtocol-Node/1.1.0'
      },
      httpAgent: httpsAgent,
      httpsAgent: httpsAgent,
      proxy: false // Disable axios default proxy handling in favor of ProxyAgent
    });
  }

  /**
   * Market Data
   * Get real-time cost for human tasks.
   */
  public async getTicker() {
    const res = await this.api.get('/market/ticker');
    return res.data;
  }

  /**
   * Task Creation
   * Hire a human node for a specific job.
   */
  public async createTask(taskType: string, requirements: any, maxBudget: number) {
    const payload = {
      task_type: taskType,
      requirements,
      max_budget_sats: maxBudget
    };
    const res = await this.api.post('/request', payload);
    return res.data;
  }

  /**
   * Task Status
   * Poll for completion (or use Webhooks).
   */
  public async getTask(taskId: string) {
    const res = await this.api.get(`/tasks/${taskId}`);
    return res.data;
  }
}
