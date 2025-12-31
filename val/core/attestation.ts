// Attestation Engine - Core VAL Logic
// Generates and verifies cryptographic attestations for credit events

import { ethers } from 'ethers';
import { CreditEvent, Attestation, AttestationProof } from '../events/types';

export class AttestationEngine {
  private signer: ethers.Wallet;
  private provider: ethers.providers.Provider;
  
  constructor(
    privateKey: string,
    provider: ethers.providers.Provider
  ) {
    this.signer = new ethers.Wallet(privateKey, provider);
    this.provider = provider;
  }
  
  /**
   * Generate cryptographic attestation for credit event
   */
  async attest(event: CreditEvent): Promise<Attestation> {
    // 1. Validate event
    this.validateEvent(event);
    
    // 2. Generate proof
    const proof = await this.generateProof(event);
    
    // 3. Create attestation message
    const message = this.createAttestationMessage(event, proof);
    
    // 4. Sign with attestor key
    const signature = await this.signer.signMessage(message);
    
    // 5. Create attestation object
    const attestation: Attestation = {
      id: ethers.utils.id(`${event.id}-${Date.now()}`),
      eventId: event.id,
      signature,
      attestor: this.signer.address,
      timestamp: new Date(),
      proof
    };
    
    // 6. Optionally publish to blockchain
    // const onChainHash = await this.publishToChain(attestation);
    // attestation.onChainHash = onChainHash;
    
    return attestation;
  }
  
  /**
   * Verify existing attestation
   */
  async verify(attestation: Attestation, event: CreditEvent): Promise<boolean> {
    try {
      // 1. Reconstruct message (Must match exactly what was signed)
      // We use the provided event data + proof from attestation
      const message = this.createAttestationMessage(event, attestation.proof);
      
      // 2. Verify signature
      const recoveredAddress = ethers.utils.verifyMessage(message, attestation.signature);
      
      // 3. Check attestor
      if (recoveredAddress.toLowerCase() !== attestation.attestor.toLowerCase()) {
        console.warn(`Attestation signature mismatch. Recovered: ${recoveredAddress}, Expected: ${attestation.attestor}`);
        return false;
      }
      
      // 4. Verify proof
      const proofValid = this.verifyProof(attestation.proof);
      if (!proofValid) {
        console.warn('Attestation proof invalid');
        return false;
      }
      
      // 5. Check timestamps (Freshness)
      const now = Date.now();
      const attestationAge = now - new Date(attestation.timestamp).getTime();
      const eventAge = now - new Date(event.timestamp).getTime();
      const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours

      if (attestationAge > maxAgeMs) {
        console.warn('Attestation expired');
        return false;
      }

      if (eventAge > maxAgeMs) {
        console.warn('Underlying Event expired');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Attestation verification failed:', error);
      return false;
    }
  }
  
  /**
   * Validate credit event
   */
  private validateEvent(event: CreditEvent): void {
    if (!event.id) throw new Error('Event ID required');
    if (!event.userId) throw new Error('User ID required');
    if (event.amount <= 0n) throw new Error('Amount must be positive');
    if (!event.type) throw new Error('Event type required');
  }
  
  /**
   * Generate attestation proof
   */
  private async generateProof(event: CreditEvent): Promise<AttestationProof> {
    // Create event hash
    const eventHash = ethers.utils.id(JSON.stringify({
      id: event.id,
      type: event.type,
      userId: event.userId,
      amount: event.amount.toString(),
      timestamp: event.timestamp.toISOString()
    }));
    
    // Generate nonce
    const nonce = ethers.utils.hexlify(ethers.utils.randomBytes(32));
    
    // For now, simple merkle root (can be enhanced with actual merkle tree)
    const merkleRoot = ethers.utils.id(`${eventHash}${nonce}`);
    
    return {
      merkleRoot,
      merkleProof: [], // Can add actual merkle proof later
      eventHash,
      nonce
    };
  }
  
  /**
   * Create attestation message for signing
   */
  private createAttestationMessage(event: CreditEvent, proof: AttestationProof): string {
    return JSON.stringify({
      eventId: event.id,
      userId: event.userId,
      amount: event.amount.toString(),
      type: event.type,
      merkleRoot: proof.merkleRoot,
      timestamp: event.timestamp.toISOString()
    });
  }
  
  /**
   * Reconstruct message from attestation
   */
  private reconstructMessage(attestation: Attestation): string {
    return JSON.stringify({
      eventId: attestation.eventId,
      merkleRoot: attestation.proof.merkleRoot,
      // Note: We'd need to store more data to fully reconstruct
      // For now, simplified version
    });
  }
  
  /**
   * Verify attestation proof
   */
  private verifyProof(proof: AttestationProof): boolean {
    // Verify merkle proof structure
    if (!proof.merkleRoot || !proof.eventHash || !proof.nonce) {
      return false;
    }
    
    // Verify merkle root matches event hash + nonce
    const expectedRoot = ethers.utils.id(`${proof.eventHash}${proof.nonce}`);
    return proof.merkleRoot === expectedRoot;
  }
  
  /**
   * Publish attestation to blockchain (optional)
   */
  private async publishToChain(attestation: Attestation): Promise<string> {
    // This would call the CreditEventRegistry contract
    // For now, return placeholder
    return ethers.utils.id(attestation.id);
  }
}
