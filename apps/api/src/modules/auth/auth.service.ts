import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { prisma, User } from '@verihire/database';
import { generateId } from '@verihire/utils';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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
    const sessionId = existingSessionId || generateId();

    if (!existingSessionId) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      await prisma.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash: generateId(), // Simplified - in production, hash the refresh token
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
      roles: roles.map((r) => r.role),
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
        roles: roles.map((r) => r.role),
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 900, // 15 minutes in seconds
        tokenType: 'Bearer',
      },
    };
  }
}
