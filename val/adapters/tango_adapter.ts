// Tango Card Adapter
// Integrates with Tango Card API for universal gift card issuance

import { IMerchantValueAdapter, ValueRequest, ValueResponse, TransactionStatus, WebhookResponse, MerchantAdapterError } from '../merchant_triggers/adapter_interface';

export class TangoAdapter implements IMerchantValueAdapter {
  name = 'Tango Card';
  type = 'tango' as const;
  enabled = true;
  
  private platformName: string;
  private platformKey: string;
  private baseUrl: string;
  
  constructor(platformName: string, platformKey: string, sandbox: boolean = false) {
    this.platformName = platformName;
    this.platformKey = platformKey;
    this.baseUrl = sandbox 
      ? 'https://integration-api.tangocard.com/raas/v2'
      : 'https://api.tangocard.com/raas/v2';
  }
  
  /**
   * Issue gift card via Tango Card API
   */
  async issueValue(request: ValueRequest): Promise<ValueResponse> {
    try {
      console.log(`[TangoAdapter] Issuing $${request.amount} gift card`);
      
      // Verify attestation
      if (!request.attestation) {
        throw new MerchantAdapterError(
          'Attestation required',
          'MISSING_ATTESTATION',
          'tango'
        );
      }
      
      // TODO: Call actual Tango Card API
      // POST /orders with:
      // - accountIdentifier
      // - amount
      // - utid (catalog item)
      // - recipient email
      
      // For now, return mock response
      const mockCode = `TANGO-${Math.random().toString(36).substr(2, 16).toUpperCase()}`;
      
      return {
        success: true,
        transactionId: `tango_txn_${Date.now()}`,
        value: {
          type: 'gift_card',
          code: mockCode,
          balance: request.amount,
          url: `https://www.tangocard.com/redeem/${mockCode}`,
          redemptionInstructions: 'Click the link to redeem your gift card'
        },
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        transactionId: '',
        value: { type: 'gift_card' },
        error: {
          code: 'TANGO_API_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error
        },
        timestamp: new Date()
      };
    }
  }
  
  /**
   * Check order status
   */
  async checkStatus(transactionId: string): Promise<TransactionStatus> {
    // TODO: GET /orders/{referenceOrderID}
    return {
      transactionId,
      status: 'completed',
      updatedAt: new Date()
    };
  }
  
  /**
   * Handle Tango webhook
   */
  async handleWebhook(payload: any): Promise<WebhookResponse> {
    console.log('[TangoAdapter] Webhook received:', payload);
    
    return {
      acknowledged: true,
      eventType: payload.eventType || 'unknown',
      processedAt: new Date()
    };
  }
  
  /**
   * Validate Tango configuration
   */
  async validateConfig(): Promise<boolean> {
    return !!(this.platformName && this.platformKey);
  }
}
