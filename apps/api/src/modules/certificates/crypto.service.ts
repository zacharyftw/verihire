import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { CertificateData } from './dto';

/**
 * Cryptographic Service for Certificate Generation
 *
 * Provides SHA-256 hashing and ECDSA (secp256k1) digital signatures
 * for tamper-proof certificate verification.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly algorithm = 'sha256';
  private readonly curve = 'secp256k1'; // Same as Ethereum for compatibility

  // Cached keypair (in production, use HSM or secure key management)
  private privateKey: crypto.KeyObject | null = null;
  private publicKey: crypto.KeyObject | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initializeKeys();
  }

  /**
   * Initialize or load signing keys
   * In production, keys should be loaded from secure storage (HSM, AWS KMS, etc.)
   */
  private initializeKeys(): void {
    const privateKeyPem = this.configService.get<string>('CERTIFICATE_SIGNING_PRIVATE_KEY');
    const publicKeyPem = this.configService.get<string>('CERTIFICATE_SIGNING_PUBLIC_KEY');

    if (privateKeyPem && publicKeyPem) {
      // Load existing keys from environment
      try {
        this.privateKey = crypto.createPrivateKey(privateKeyPem);
        this.publicKey = crypto.createPublicKey(publicKeyPem);
        this.logger.log('Loaded existing signing keys from configuration');
      } catch (error) {
        this.logger.error('Failed to load signing keys from configuration', error);
        this.generateNewKeyPair();
      }
    } else {
      // Generate new keys (for development only)
      this.logger.warn(
        'No signing keys configured - generating temporary keys. ' +
          'Set CERTIFICATE_SIGNING_PRIVATE_KEY and CERTIFICATE_SIGNING_PUBLIC_KEY in production!'
      );
      this.generateNewKeyPair();
    }
  }

  /**
   * Generate new ECDSA keypair
   */
  private generateNewKeyPair(): void {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: this.curve,
    });
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.logger.log('Generated new ECDSA keypair');
  }

  /**
   * Generate SHA-256 hash of certificate data
   *
   * Uses canonical JSON (sorted keys, no whitespace) for deterministic hashing
   */
  hashCertificateData(data: CertificateData): string {
    // Create canonical JSON representation
    const canonicalJson = this.canonicalize(data);

    // Generate SHA-256 hash
    const hash = crypto.createHash(this.algorithm).update(canonicalJson).digest('hex');

    return hash;
  }

  /**
   * Hash arbitrary string data
   */
  hash(data: string): string {
    return crypto.createHash(this.algorithm).update(data).digest('hex');
  }

  /**
   * Hash email for privacy (one-way hash)
   */
  hashEmail(email: string): string {
    const salt = this.configService.get<string>('EMAIL_HASH_SALT', 'verihire-default-salt');
    return crypto
      .createHash(this.algorithm)
      .update(email.toLowerCase() + salt)
      .digest('hex');
  }

  /**
   * Sign data using ECDSA with secp256k1 curve
   *
   * @param data - The hash or data string to sign
   * @returns Hex-encoded signature
   */
  sign(data: string): string {
    if (!this.privateKey) {
      throw new Error('Signing key not available');
    }

    const signature = crypto.sign(this.algorithm, Buffer.from(data), this.privateKey);
    return signature.toString('hex');
  }

  /**
   * Verify ECDSA signature
   *
   * @param data - Original data that was signed
   * @param signature - Hex-encoded signature
   * @param publicKeyHex - Optional public key (uses issuer key if not provided)
   * @returns True if signature is valid
   */
  verifySignature(data: string, signature: string, publicKeyHex?: string): boolean {
    try {
      let verifyKey: crypto.KeyObject;

      if (publicKeyHex) {
        // Convert hex public key to KeyObject
        verifyKey = this.publicKeyFromHex(publicKeyHex);
      } else if (this.publicKey) {
        verifyKey = this.publicKey;
      } else {
        throw new Error('No public key available for verification');
      }

      return crypto.verify(
        this.algorithm,
        Buffer.from(data),
        verifyKey,
        Buffer.from(signature, 'hex')
      );
    } catch (error) {
      this.logger.error('Signature verification failed', error);
      return false;
    }
  }

  /**
   * Get the issuer's public key in hex format
   */
  getPublicKeyHex(): string {
    if (!this.publicKey) {
      throw new Error('Public key not available');
    }

    // Export as DER format and convert to hex
    const publicKeyDer = this.publicKey.export({
      type: 'spki',
      format: 'der',
    });
    return publicKeyDer.toString('hex');
  }

  /**
   * Get the issuer's public key in PEM format
   */
  getPublicKeyPem(): string {
    if (!this.publicKey) {
      throw new Error('Public key not available');
    }

    return this.publicKey
      .export({
        type: 'spki',
        format: 'pem',
      })
      .toString();
  }

  /**
   * Generate a new keypair and return both keys
   * Useful for key rotation or backup generation
   */
  generateKeyPair(): { privateKey: string; publicKey: string } {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: this.curve,
    });

    return {
      privateKey: privateKey
        .export({
          type: 'pkcs8',
          format: 'pem',
        })
        .toString(),
      publicKey: publicKey
        .export({
          type: 'spki',
          format: 'pem',
        })
        .toString(),
    };
  }

  /**
   * Create a KeyObject from hex-encoded public key
   */
  private publicKeyFromHex(hex: string): crypto.KeyObject {
    const publicKeyDer = Buffer.from(hex, 'hex');
    return crypto.createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki',
    });
  }

  /**
   * Convert object to canonical JSON (sorted keys, no whitespace)
   * Ensures deterministic hashing regardless of property order
   */
  private canonicalize(obj: unknown): string {
    return JSON.stringify(this.sortObject(obj), null, 0);
  }

  /**
   * Recursively sort object keys for canonical representation
   */
  private sortObject(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }

    if (obj instanceof Date) {
      return obj.toISOString();
    }

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();

    for (const key of keys) {
      sorted[key] = this.sortObject((obj as Record<string, unknown>)[key]);
    }

    return sorted;
  }

  /**
   * Generate a random ID for certificates
   */
  generateRandomId(): string {
    return crypto.randomUUID();
  }

  /**
   * Generate a secure random string
   */
  generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
}
