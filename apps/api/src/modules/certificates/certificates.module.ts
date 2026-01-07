import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { CryptoService } from './crypto.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { QrCodeService } from './qrcode.service';
import { VerificationService } from './verification.service';
import { RevocationService } from './revocation.service';
import { QueueModule } from '../queue/queue.module';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [ConfigModule, QueueModule, BlockchainModule],
  controllers: [CertificatesController],
  providers: [
    CertificatesService,
    CryptoService,
    PdfGeneratorService,
    QrCodeService,
    VerificationService,
    RevocationService,
  ],
  exports: [CertificatesService, CryptoService, VerificationService, RevocationService],
})
export class CertificatesModule {}
