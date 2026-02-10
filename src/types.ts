/**
 * Proxy Protocol Type Definitions
 * * Strict typing for Task Payloads to ensure Type Safety in Agent deployments.
 */

// 1. Task Taxonomy
export enum TaskType {
  VERIFY_SMS_OTP = 'verify_sms_otp',
  VERIFY_KYC_VIDEO = 'verify_kyc_video',
  LEGAL_NOTARY_SIGN = 'legal_notary_sign',
  PHYSICAL_MAIL_RECEIVE = 'physical_mail_receive',
  CUSTOM_ADHOC = 'custom_adhoc'
}

// 2. Requirement Schemas (The "Context")

export interface BaseRequirements {
  instructions?: string;
  timeout_seconds?: number; // Default: 14400 (4 hours)
}

export interface SmsRequirements extends BaseRequirements {
  service: string; // e.g. "OpenAI", "Twitter"
  country: string; // ISO 3166-1 alpha-2 code (e.g. "US", "BR")
  sender_id_filter?: string; // Optional: Only accept SMS from this sender
}

export interface KycRequirements extends BaseRequirements {
  platform_url: string;
  id_document_types: ('passport' | 'drivers_license' | 'national_id')[];
  liveness_check: boolean;
}

export interface LegalRequirements extends BaseRequirements {
  jurisdiction: 'US_DE' | 'UK' | 'SG';
  document_url: string; // Must be a pre-signed URL accessible to the Human Node
  signature_capacity: 'witness' | 'attorney_in_fact' | 'notary';
  notary_seal_required: boolean;
}

export interface MailRequirements extends BaseRequirements {
  recipient_name: string;
  scanning_instructions: 'scan_envelope' | 'scan_contents' | 'forward_physical';
  shred_after_scan: boolean;
}

// 3. Union Type for Flexible but Strict Input
export type TaskRequirements = 
  | SmsRequirements 
  | KycRequirements 
  | LegalRequirements 
  | MailRequirements;

// 4. API Response Shapes
export interface TickerRate {
  sats: number;
  fiat_estimated_usd: number;
}

export interface MarketTicker {
  status: string;
  base_currency: string;
  rates: Record<TaskType | string, number>;
  congestion_multiplier: number;
}

export interface TaskObject {
  id: string;
  status: 'matching' | 'in_progress' | 'completed' | 'failed';
  created_at: string;
  assigned_node_id?: string;
  result?: any;
}
