
const path = require('path');
const frontendNodeModules = 'd:/SOVR_Development_Holdings_LLC/The Soverign Stack/sovr_hybrid_engineV2/frontend/node_modules';

require(path.join(frontendNodeModules, 'ts-node')).register({
  compilerOptions: {
    module: 'commonjs',
    target: 'es2020',
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    baseUrl: "d:/SOVR_Development_Holdings_LLC/The Soverign Stack/sovr_hybrid_engineV2" 
  }
});
require('./hostile_anchor_replay_test.ts');
