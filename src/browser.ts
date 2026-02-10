import { 
  TaskType, 
  TaskRequirements, 
  MarketTicker, 
  TaskObject 
} from './types';

// Environment Endpoints
const ENDPOINTS = {
  mainnet: 'https://api.proxyprotocol.com/v1',
  testnet: 'https://sandbox.proxyprotocol.com/v1',
  local: 'http://localhost:3000/v1'
};

export interface BrowserClientConfig {
  /**
   * IMPORTANT: In a browser environment, use PUBLISHABLE keys (pk_test_...) 
   * or proxy requests through your own backend to protect secret keys.
   */
  apiKey: string;
  environment?: 'mainnet' | 'testnet' | 'local';
}

/**
 * Proxy Protocol Browser Client (Lightweight)
 * Uses native fetch() API. No Node.js dependencies.
 */
export class ProxyBrowserClient {
  private baseURL: string;
  private apiKey: string;

  constructor(config: BrowserClientConfig) {
    this.baseURL = ENDPOINTS[config.environment || 'mainnet'];
    this.apiKey = config.apiKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-Client-Agent': 'proxy-browser-sdk/1.0',
        ...options.headers,
      },
      mode: 'cors', // Explicitly enable CORS for browser usage
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        // Attempt to parse JSON error from API
        let errorMessage = response.statusText;
        try {
          const errorBody = await response.json();
          if (errorBody.error) errorMessage = errorBody.error;
        } catch (e) {
          // Ignore JSON parse error on failure
        }
        throw new Error(`ProxyProtocol Error (${response.status}): ${errorMessage}`);
      }

      return await response.json();
    } catch (error) {
      // Handle network errors (offline, DNS, etc.)
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        throw new Error("Network Error: Could not connect to Proxy API. Check CORS or internet connection.");
      }
      throw error;
    }
  }

  /**
   * Market Data
   * Get real-time cost for human tasks.
   */
  public async getTicker(): Promise<MarketTicker> {
    return this.request<MarketTicker>('/market/ticker');
  }

  /**
   * Upload Large Asset (Streaming)
   * Uploads a large file (video/document) to the Proxy Storage (IPFS/S3) via streaming.
   * Prevents memory overflow on constrained environments (Lambda/Vercel).
   * * @param data - ReadableStream, Blob, or ArrayBuffer
   * @param contentType - MIME type (e.g. 'video/mp4', 'application/pdf')
   */
  public async uploadAsset(
    data: ReadableStream | Blob | ArrayBuffer,
    contentType: string
  ): Promise<{ url: string; hash: string }> {
    return this.request<{ url: string; hash: string }>('/uploads', {
      method: 'POST',
      headers: {
        'Content-Type': contentType
      },
      body: data as any,
      // @ts-ignore - 'duplex' is required for streaming request bodies in modern fetch
      duplex: 'half'
    });
  }

  /**
   * Task Creation
   * Broadcast a new task to the Human Proxy network.
   */
  public async createTask(
    taskType: TaskType | string, 
    requirements: TaskRequirements, 
    maxBudgetSats: number
  ): Promise<TaskObject> {
    const payload = {
      task_type: taskType,
      requirements,
      max_budget_sats: maxBudgetSats
    };
    
    return this.request<TaskObject>('/request', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  /**
   * Task Status
   * Poll for completion.
   */
  public async getTask(taskId: string): Promise<TaskObject> {
    return this.request<TaskObject>(`/tasks/${taskId}`);
  }
}
