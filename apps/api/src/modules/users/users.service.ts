import { Injectable } from '@nestjs/common';
import { prisma, User, UserType } from '@verihire/database';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  async findById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        status: true,
        userType: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return user;
  }

  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async create(data: {
    email: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    userType: UserType;
    oauthProvider?: 'GOOGLE' | 'GITHUB' | 'LINKEDIN';
    oauthProviderId?: string;
    emailVerified?: boolean;
  }) {
    const passwordHash = data.password
      ? await bcrypt.hash(data.password, 12)
      : null;

    return prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        userType: data.userType,
        oauthProvider: data.oauthProvider,
        oauthProviderId: data.oauthProviderId,
        emailVerified: data.emailVerified ?? false,
      },
    });
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    if (!user.passwordHash) return false;
    return bcrypt.compare(password, user.passwordHash);
  }

  async updateLastLogin(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  async setMfaSecret(userId: string, secret: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEncrypted: secret },
    });
  }

  async enableMfa(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });
  }

  async disableMfa(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecretEncrypted: null,
      },
    });
  }
}
