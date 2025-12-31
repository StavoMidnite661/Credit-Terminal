// VAL System Entry Point
// Initializes and exports the Value Attestation Layer

import { ethers } from 'ethers';
import { AttestationEngine } from './core/attestation';
import { SpendEngine } from './core/spend_engine';
import { EventLogger } from './events/logger';
import { SquareAdapter } from './adapters/square_adapter';
import { TangoAdapter } from './adapters/tango_adapter';
import { InstacartAdapter } from './adapters/instacart_adapter';

export class VALSystem {
  private attestationEngine: AttestationEngine;
  private spendEngine: SpendEngine;
  private eventLogger: EventLogger;
  
  constructor(
    attestorPrivateKey: string,
    provider: ethers.providers.Provider,
    config: {
      square?: { apiKey: string; locationId: string };
      tango?: { platformName: string; platformKey: string; sandbox?: boolean };
    }
  ) {
    // Initialize core components
    this.attestationEngine = new AttestationEngine(attestorPrivateKey, provider);
    this.eventLogger = new EventLogger();
    this.spendEngine = new SpendEngine(this.attestationEngine, this.eventLogger);
    
    // Register merchant adapters
    if (config.square) {
      const squareAdapter = new SquareAdapter(
        config.square.apiKey,
        config.square.locationId
      );
      this.spendEngine.registerAdapter(squareAdapter);
    }
    
    if (config.tango) {
      const tangoAdapter = new TangoAdapter(
        config.tango.platformName,
        config.tango.platformKey,
        config.tango.sandbox
      );
      this.spendEngine.registerAdapter(tangoAdapter);
    }

    // Register Instacart Adapter (Zero-Float)
    const instacartAdapter = new InstacartAdapter();
    this.spendEngine.registerAdapter(instacartAdapter);
  }
  
  /**
   * Get spend engine instance
   */
  getSpendEngine(): SpendEngine {
    return this.spendEngine;
  }
  
  /**
   * Get attestation engine instance
   */
  getAttestationEngine(): AttestationEngine {
    return this.attestationEngine;
  }
  
  /**
   * Get event logger instance
   */
  getEventLogger(): EventLogger {
    return this.eventLogger;
  }
}

// Export all types and classes
export * from './events/types';
export * from './core/attestation';
export * from './core/spend_engine';
export * from './core/oracle-ledger-bridge-service';
export * from './core/tigerbeetle_service';
export * from './merchant_triggers/adapter_interface';
export * from './adapters/square_adapter';
export * from './adapters/tango_adapter';
export * from './adapters/instacart_adapter';
