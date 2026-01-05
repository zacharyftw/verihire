import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@verihire/database';

export interface JwtPayload {
  sub: string;
  email: string;
  userType: string;
  roles: string[];
  sessionId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.sessionId) {
      throw new UnauthorizedException('Invalid token');
    }

    // Fetch candidate or recruiter profile ID if applicable
    let candidateProfileId: string | null = null;
    let recruiterProfileId: string | null = null;

    if (payload.userType === 'CANDIDATE') {
      const profile = await prisma.candidateProfile.findUnique({
        where: { userId: payload.sub },
        select: { id: true },
      });
      candidateProfileId = profile?.id || null;
    } else if (payload.userType === 'RECRUITER') {
      const profile = await prisma.recruiterProfile.findUnique({
        where: { userId: payload.sub },
        select: { id: true },
      });
      recruiterProfileId = profile?.id || null;
    }

    return {
      ...payload,
      candidateProfileId,
      recruiterProfileId,
    };
  }
}
