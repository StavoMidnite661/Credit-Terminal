/**
 * Oracle Ledger Bridge Service (DEPRECATED - USE NARRATIVE MIRROR)
 * 
 * Compatibility layer for transitioning to Narrative Mirror.
 * Redirects all calls to NarrativeMirrorService.
 */

import {
  NarrativeMirrorService,
  getNarrativeMirror
} from './narrative-mirror-service';

export { NarrativeMirrorService as OracleLedgerBridgeService };
export { getNarrativeMirror as getOracleLedgerBridge };
export default NarrativeMirrorService;
