import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { OAuthProfile } from './google.strategy';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(private configService: ConfigService) {
    const clientID = configService.get<string>('oauth.github.clientId') || 'not-configured';
    const clientSecret = configService.get<string>('oauth.github.clientSecret') || 'not-configured';
    const callbackBaseUrl = configService.get<string>('oauth.callbackBaseUrl');

    super({
      clientID,
      clientSecret,
      callbackURL: `${callbackBaseUrl}/api/v1/auth/github/callback`,
      scope: ['user:email'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: (err: any, user: any) => void
  ): Promise<void> {
    const email = profile.emails?.find((e: any) => e.primary)?.value || profile.emails?.[0]?.value;

    const nameParts = (profile.displayName || '').split(' ');

    const oauthProfile: OAuthProfile = {
      provider: 'GITHUB',
      providerId: profile.id,
      email,
      firstName: nameParts[0] || profile.username,
      lastName: nameParts.slice(1).join(' ') || undefined,
      avatarUrl: profile.photos?.[0]?.value,
    };
    done(null, oauthProfile);
  }
}
