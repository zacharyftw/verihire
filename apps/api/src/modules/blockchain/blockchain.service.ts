import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import contractAbi from './contract.abi.json';

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;

  constructor(private configService: ConfigService) {
    const rpcUrl = this.configService.getOrThrow<string>('POLYGON_RPC_URL');
    const privateKey = this.configService.getOrThrow<string>('BLOCKCHAIN_PRIVATE_KEY');
    const contractAddress = this.configService.getOrThrow<string>('CONTRACT_ADDRESS');

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(contractAddress, contractAbi, this.wallet);
  }

  async anchorCertificate(
    certificateNumber: string,
    hash: string
  ): Promise<{ txHash: string; blockNumber: number; network: string }> {
    try {
      this.logger.log(`Anchoring certificate ${certificateNumber} to blockchain`);

      const hashBytes = `0x${hash}`;
      const tx = await this.contract.anchor(certificateNumber, hashBytes);
      const receipt = await tx.wait();

      this.logger.log(`Certificate anchored: ${receipt.hash}`);

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        network: 'polygon-amoy',
      };
    } catch (error) {
      this.logger.error(`Failed to anchor certificate: ${error.message}`);
      throw error;
    }
  }

  async verifyCertificate(
    certificateNumber: string
  ): Promise<{ exists: boolean; onChainHash: string; timestamp: number }> {
    try {
      const [hash, timestamp] = await this.contract.verify(certificateNumber);

      return {
        exists: hash !== ethers.ZeroHash,
        onChainHash: hash,
        timestamp: Number(timestamp),
      };
    } catch (error) {
      this.logger.error(`Failed to verify certificate: ${error.message}`);
      throw error;
    }
  }

  getExplorerUrl(txHash: string): string {
    return `https://amoy.polygonscan.com/tx/${txHash}`;
  }
}
