const { ethers } = require('hardhat');

async function main() {
    const provider = ethers.provider;
    const feeData = await provider.getFeeData();
    
    console.log("Current Base Network Gas Prices:");
    console.log("Gas Price:", ethers.utils.formatUnits(feeData.gasPrice, 'gwei'), "gwei");
    if (feeData.maxFeePerGas) {
        console.log("Max Fee Per Gas:", ethers.utils.formatUnits(feeData.maxFeePerGas, 'gwei'), "gwei");
    }
    if (feeData.maxPriorityFeePerGas) {
        console.log("Max Priority Fee:", ethers.utils.formatUnits(feeData.maxPriorityFeePerGas, 'gwei'), "gwei");
    }

    // Try to estimate gas for a simple deployment
    const SFiat = await ethers.getContractFactory('sFIAT');
    const deployTx = SFiat.getDeployTransaction('SOVR Fiat', 'sFIAT');
    try {
        const estimatedGas = await provider.estimateGas(deployTx);
        console.log("\nEstimated Gas for sFIAT deployment:", estimatedGas.toString());
        const cost = estimatedGas.mul(feeData.gasPrice);
        console.log("Estimated Cost (ETH):", ethers.utils.formatEther(cost));
    } catch (error) {
        console.error("\nGas Estimation Failed:", error.message);
    }
}

main().catch(console.error);
