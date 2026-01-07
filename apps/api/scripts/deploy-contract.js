const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Deploying CertificateRegistry to Polygon Amoy...');

  const CertificateRegistry = await hre.ethers.getContractFactory('CertificateRegistry');
  const contract = await CertificateRegistry.deploy();

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('\n=== CONTRACT DEPLOYED ===\n');
  console.log('Contract Address:', address);
  console.log('Network: Polygon Amoy (testnet)');
  console.log('Explorer:', `https://amoy.polygonscan.com/address/${address}`);
  console.log('\nAdd this to .env:');
  console.log(`CONTRACT_ADDRESS=${address}`);

  // Save ABI
  const abiPath = path.join(__dirname, '../src/modules/blockchain/contract.abi.json');
  const artifact = await hre.artifacts.readArtifact('CertificateRegistry');

  fs.mkdirSync(path.dirname(abiPath), { recursive: true });
  fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));

  console.log('\nABI saved to:', abiPath);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
