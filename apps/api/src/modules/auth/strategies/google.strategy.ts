import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

export interface OAuthProfile {
  provider: 'GOOGLE' | 'GITHUB' | 'LINKEDIN';
  providerId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    const clientID = configService.get<string>('oauth.google.clientId') || 'not-configured';
    const clientSecret = configService.get<string>('oauth.google.clientSecret') || 'not-configured';
    const callbackBaseUrl = configService.get<string>('oauth.callbackBaseUrl');

    super({
      clientID,
      clientSecret,
      callbackURL: `${callbackBaseUrl}/api/v1/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback
  ): Promise<void> {
    const oauthProfile: OAuthProfile = {
      provider: 'GOOGLE',
      providerId: profile.id,
      email: profile.emails?.[0]?.value,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
      avatarUrl: profile.photos?.[0]?.value,
    };
    done(null, oauthProfile);
  }
}
