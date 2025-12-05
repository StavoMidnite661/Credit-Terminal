require('dotenv').config();

async function main() {
    console.log("Checking environment variables for Base deployment...");
    
    const required = [
        'DEPLOYER_PRIVATE_KEY',
        'SOVR_TOKEN',
        'USDC',
        'POSITION_MANAGER',
        'UNISWAP_FACTORY'
    ];

    let missing = [];
    
    required.forEach(key => {
        if (!process.env[key]) {
            console.log(`❌ Missing: ${key}`);
            missing.push(key);
        } else {
            console.log(`✅ Found: ${key} = ${process.env[key].substring(0, 6)}...`);
        }
    });

    if (missing.length > 0) {
        console.error("\nCannot proceed. Please add missing variables to .env");
        process.exit(1);
    } else {
        console.log("\nEnvironment looks ready!");
    }
}

main().catch(console.error);
