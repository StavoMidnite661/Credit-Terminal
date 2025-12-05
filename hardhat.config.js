require('@nomiclabs/hardhat-ethers');
require('dotenv').config();
module.exports = {
  solidity: {
    compilers: [
      { 
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      { 
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ]
  },
  networks: {
    localhost: { url: 'http://127.0.0.1:8545' },
    fork: {
      url: process.env.ALCHEMY || '',
      chainId: 1
    },
    base: {
      url: process.env.BASE_RPC || 'https://mainnet.base.org',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 8453
    }
  },
  mocha: { timeout: 200000 }
};
