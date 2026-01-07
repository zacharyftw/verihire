require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config({ path: '../../.env' });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: '0.8.20',
  networks: {
    amoy: {
      url: process.env.POLYGON_RPC_URL,
      accounts: [process.env.BLOCKCHAIN_PRIVATE_KEY],
      chainId: 80002,
    },
  },
};
