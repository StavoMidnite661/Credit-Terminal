const { ethers } = require("ethers");
require("dotenv").config();

function buildDomain(verifyingContract, chainId) {
  return {
    name: process.env.DOMAIN_NAME || "SOVR Attestor",
    version: process.env.DOMAIN_VERSION || "1",
    chainId: chainId,
    verifyingContract: verifyingContract
  };
}

module.exports = { buildDomain };
