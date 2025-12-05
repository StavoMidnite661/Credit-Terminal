require('@nomiclabs/hardhat-ethers');
require('dotenv').config();
module.exports = {
  solidity: {
    compilers: [
      { version: "0.8.20" },
      { version: "0.7.6" }
    ]
  },
  networks: {
    localhost: { url: 'http://127.0.0.1:8545' },
    fork: {
      url: process.env.ALCHEMY || '',
      chainId: 1
    }
  },
  mocha: { timeout: 200000 }
};
