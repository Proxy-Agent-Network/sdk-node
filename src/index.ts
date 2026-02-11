import axios, { AxiosInstance, AxiosError } from 'axios';
import { ProxyAgent } from 'proxy-agent';
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
export class InvalidRequestError extends ProxyError { name = 'InvalidRequestError'; }
export class ServerError extends ProxyError { name = 'ServerError'; }

// --- 2. Internal Validation Schemas (Codified from Canvas specs/v1/requirement_schemas.json) ---
const REQUIREMENT_SCHEMAS: Record<string, any> = {
  [TaskType.VERIFY_SMS_OTP]: {
    required: ['service', 'country'],
    patterns: { country: /^[A-Z]{2}$/ }
  },
  [TaskType.VERIFY_KYC_VIDEO]: {
    required: ['platform_url', 'id_document_types', 'liveness_check']
  },
  [TaskType.LEGAL_NOTARY_SIGN]: {
    required: ['jurisdiction', 'document_url', 'signature_capacity', 'notary_seal_required'],
    enums: {
      jurisdiction: ['US_DE', 'UK', 'SG'],
      signature_capacity: ['witness', 'attorney_in_fact', 'notary']
    }
  },
  [TaskType.PHYSICAL_MAIL_RECEIVE]: {
    required: ['recipient_name', 'scanning_instructions', 'shred_after_scan'],
    enums: {
      scanning_instructions: ['scan_envelope', 'scan_contents', 'forward_physical']
    }
  }
};

export type SimulationScenario = 'HAPPY_PATH' | 'BROWNOUT_ACTIVE' | 'INSUFFICIENT_FUNDS';

const ENDPOINTS = {
  mainnet: 'https://api.proxyprotocol.com/v1',
  testnet: 'https://sandbox.proxyprotocol.com/v1',
  local: 'http://localhost:3000/v1'
};

// Internal Jurisdiction Mapping
const JURISDICTION_TEMPLATES: Record<string, string> = {
  'US': 'templates/legal/us_delaware_poa.md',
  'GB': 'templates/legal/uk_poa.md',
  'SG': 'templates/legal/singapore_poa.md'
};

const DEFAULT_LEGAL_TEMPLATE = 'templates/legal/ai_power_of_attorney.md';

export interface ProxyClientConfig {
  apiKey: string;
  environment?: 'mainnet' | 'testnet' | 'local';
  proxyUrl?: string; 
  timeout?: number;
}

// --- 3. The Proxy Client (Base Class) ---

export class ProxyClient {
  private api: AxiosInstance;
  
  public isTestMode: boolean = false;
  public activeScenario: SimulationScenario = 'HAPPY_PATH';
  public mockTaskStore: Map<string, number> = new Map();

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
        'User-Agent': 'ProxyProtocol-Node/1.7.2'
      },
      httpAgent: httpsAgent,
      httpsAgent: httpsAgent,
      proxy: false
    });

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
            case 400: throw new InvalidRequestError(code, message, status);
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
   * Pre-flight Validator (v1.7.2)
   * Enforces the schemas defined in the Canvas to catch errors locally.
   */
  private _validateRequirements(taskType: string, requirements: TaskRequirements) {
    const schema = REQUIREMENT_SCHEMAS[taskType];
    if (!schema) return;

    // 1. Required Fields
    for (const field of schema.required) {
      if (!(field in requirements)) {
        throw new InvalidRequestError("PX_302", `Pre-flight Error: Missing required field '${field}' for ${taskType}.`, 400);
      }
    }

    // 2. Enum Validation
    if (schema.enums) {
      for (const [field, allowedValues] of Object.entries(schema.enums)) {
        const value = (requirements as any)[field];
        if (value && !(allowedValues as string[]).includes(value)) {
          throw new InvalidRequestError("PX_302", `Pre-flight Error: Invalid value for '${field}'. Allowed: ${(allowedValues as string[]).join(', ')}`, 400);
        }
      }
    }

    // 3. Pattern Matching (Regex)
    if (schema.patterns) {
      for (const [field, pattern] of Object.entries(schema.patterns)) {
        const value = (requirements as any)[field];
        if (value && !(pattern as RegExp).test(value)) {
          throw new InvalidRequestError("PX_302", `Pre-flight Error: Invalid format for '${field}'.`, 400);
        }
      }
    }
  }

  public resolveLegalTemplate(countryCode: string): string {
    return JURISDICTION_TEMPLATES[countryCode.toUpperCase()] || DEFAULT_LEGAL_TEMPLATE;
  }

  /**
   * Request a Task (The Primary Action)
   * Now includes automated pre-flight validation.
   */
  public async requestTask(
    taskType: TaskType | string, 
    requirements: TaskRequirements, 
    maxBudgetSats: number,
    options?: { autoLegal?: boolean; countryCode?: string }
  ): Promise<TaskObject> {
    
    // 1. Enforce local validation before network broadcast
    this._validateRequirements(taskType as string, requirements);

    // 2. Auto-suggest legal template if enabled
    if (options?.autoLegal && options.countryCode) {
      const templatePath = this.resolveLegalTemplate(options.countryCode);
      (requirements as any).legal_template = templatePath;
    }

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

  public async getTask(taskId: string): Promise<TaskObject> {
    if (this.isTestMode) return this._simulateTaskPolling(taskId);
    const res = await this.api.get(`/tasks/${taskId}`);
    return res.data;
  }

  public async getTicker(): Promise<MarketTicker> {
    if (this.isTestMode) {
      return {
        status: "stable",
        base_currency: "SATS",
        rates: { [TaskType.VERIFY_SMS_OTP]: 1000, [TaskType.LEGAL_NOTARY_SIGN]: 45000 },
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
      created_at: new Date().toISOString()
    };
  }

  private _simulateTaskPolling(taskId: string): TaskObject {
    const createdAt = this.mockTaskStore.get(taskId) || Date.now();
    return {
      id: taskId,
      status: 'in_progress',
      created_at: new Date(createdAt).toISOString()
    };
  }
}

export * from './types';
