const { ethers } = require('ethers');

const wallet = ethers.Wallet.createRandom();

console.log('\n=== TESTNET WALLET GENERATED ===\n');
console.log('Address:', wallet.address);
console.log('Private Key:', wallet.privateKey);
console.log('\nAdd this to .env:');
console.log(`BLOCKCHAIN_PRIVATE_KEY=${wallet.privateKey}`);
console.log('\nGet test MATIC from: https://faucet.polygon.technology/');
console.log('\n');
