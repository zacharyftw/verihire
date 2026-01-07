import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { prisma, User } from '@verihire/database';
import { generateUUID } from '@verihire/utils';
import { createHash, randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;

    const isValid = await this.usersService.validatePassword(user, password);
    if (!isValid) return null;

    return user;
  }

  async register(dto: RegisterDto) {
    // Check if user exists
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // Create user
    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      userType: dto.userType,
    });

    // Create candidate or recruiter profile
    if (dto.userType === 'CANDIDATE') {
      await prisma.candidateProfile.create({
        data: { userId: user.id },
      });
    } else if (dto.userType === 'RECRUITER') {
      await prisma.recruiterProfile.create({
        data: { userId: user.id },
      });
    }

    // Generate tokens
    return this.generateAuthResponse(user);
  }

  async login(user: User) {
    await this.usersService.updateLastLogin(user.id);
    return this.generateAuthResponse(user);
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('jwt.refreshSecret'),
      });

      // Check if session is still valid
      const session = await prisma.session.findUnique({
        where: { id: payload.sessionId },
      });

      if (!session || session.revokedAt) {
        throw new UnauthorizedException('Session expired');
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new tokens
      return this.generateAuthResponse(user, payload.sessionId);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(sessionId: string) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  private async generateAuthResponse(user: User, existingSessionId?: string) {
    // Create or reuse session
    const sessionId = existingSessionId || generateUUID();

    if (!existingSessionId) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      await prisma.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash: generateUUID(), // Simplified - in production, hash the refresh token
          expiresAt,
        },
      });
    }

    // Get user roles
    const roles = await prisma.userRole.findMany({
      where: { userId: user.id },
      select: { role: true },
    });

    const accessPayload = {
      sub: user.id,
      email: user.email,
      userType: user.userType,
      roles: roles.map((r: { role: string }) => r.role),
      sessionId,
    };

    const refreshPayload = {
      sub: user.id,
      sessionId,
      tokenVersion: 1,
    };

    const accessToken = this.jwtService.sign(accessPayload);
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get('jwt.refreshSecret'),
      expiresIn: this.configService.get('jwt.refreshExpiresIn'),
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        userType: user.userType,
        mfaEnabled: user.mfaEnabled,
        roles: roles.map((r: { role: string }) => r.role),
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 900, // 15 minutes in seconds
        tokenType: 'Bearer',
      },
    };
  }

  // =========================================================================
  // PASSWORD RESET
  // =========================================================================

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateSecureToken(): string {
    return randomBytes(32).toString('hex');
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

    // Always return success message to prevent email enumeration
    if (!user) {
      return { message: 'If an account exists, a password reset email has been sent' };
    }

    // Invalidate any existing reset tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(), // Mark as used to invalidate
      },
    });

    // Generate new token
    const token = this.generateSecureToken();
    const tokenHash = this.hashToken(token);

    // Token expires in 1 hour
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // Send email (don't wait for it to complete)
    this.emailService.sendPasswordResetEmail(user.email, token, user.firstName ?? undefined);

    return { message: 'If an account exists, a password reset email has been sent' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const tokenHash = this.hashToken(token);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException('This reset token has already been used');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('This reset token has expired');
    }

    // Update password
    await this.usersService.updatePassword(resetToken.userId, newPassword);

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    // Revoke all active sessions for security
    await prisma.session.updateMany({
      where: {
        userId: resetToken.userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return { message: 'Password has been reset successfully' };
  }

  // =========================================================================
  // EMAIL VERIFICATION
  // =========================================================================

  async sendVerificationEmail(userId: string): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Invalidate any existing verification tokens for this user
    await prisma.emailVerificationToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    // Generate new token
    const token = this.generateSecureToken();
    const tokenHash = this.hashToken(token);

    // Token expires in 24 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // Send email
    await this.emailService.sendVerificationEmail(user.email, token, user.firstName ?? undefined);

    return { message: 'Verification email sent' };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const tokenHash = this.hashToken(token);

    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!verificationToken) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (verificationToken.usedAt) {
      throw new BadRequestException('This verification token has already been used');
    }

    if (verificationToken.expiresAt < new Date()) {
      throw new BadRequestException('This verification token has expired');
    }

    if (verificationToken.user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Mark email as verified
    await this.usersService.markEmailVerified(verificationToken.userId);

    // Mark token as used
    await prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { usedAt: new Date() },
    });

    return { message: 'Email verified successfully' };
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

    // Always return success message to prevent email enumeration
    if (!user) {
      return {
        message: 'If an account exists and is unverified, a verification email has been sent',
      };
    }

    if (user.emailVerified) {
      return {
        message: 'If an account exists and is unverified, a verification email has been sent',
      };
    }

    // Check rate limiting - only allow resend after 1 minute
    const recentToken = await prisma.emailVerificationToken.findFirst({
      where: {
        userId: user.id,
        createdAt: {
          gte: new Date(Date.now() - 60 * 1000), // Within last minute
        },
      },
    });

    if (recentToken) {
      throw new BadRequestException('Please wait before requesting another verification email');
    }

    return this.sendVerificationEmail(user.id);
  }
}
