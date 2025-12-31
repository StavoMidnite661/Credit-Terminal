// Merchant Value Adapter Interface
// Universal interface for all merchant integrations

import { Attestation, SpendParams, MerchantType } from '../events/types';

export interface IMerchantValueAdapter {
  name: string;
  type: MerchantType;
  enabled: boolean;
  
  /**
   * Issue value to user via merchant system
   * This is the core function that converts attested credit into real-world value
   */
  issueValue(request: ValueRequest): Promise<ValueResponse>;
  
  /**
   * Check transaction status
   */
  checkStatus(transactionId: string): Promise<TransactionStatus>;
  
  /**
   * Handle webhook callbacks from merchant
   */
  handleWebhook(payload: any): Promise<WebhookResponse>;
  
  /**
   * Validate adapter configuration
   */
  validateConfig(): Promise<boolean>;
}

export interface ValueRequest {
  userId: string;
  amount: number;
  currency: string;
  attestation: Attestation;
  metadata: {
    email?: string;
    phone?: string;
    recipientId?: string;
    customData?: Record<string, any>;
  };
}

export interface ValueResponse {
  success: boolean;
  transactionId: string;
  value: {
    type: 'gift_card' | 'virtual_card' | 'direct_credit' | 'voucher';
    code?: string;
    url?: string;
    balance?: number;
    expiresAt?: Date;
    redemptionInstructions?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: Date;
}

export interface TransactionStatus {
  transactionId: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  value?: ValueResponse['value'];
  error?: ValueResponse['error'];
  updatedAt: Date;
}

export interface WebhookResponse {
  acknowledged: boolean;
  eventType: string;
  processedAt: Date;
}


export class MerchantAdapterError extends Error {
  constructor(
    message: string,
    public code: string,
    public merchantType: MerchantType,
    public details?: any
  ) {
    super(message);
    this.name = 'MerchantAdapterError';
  }
}
