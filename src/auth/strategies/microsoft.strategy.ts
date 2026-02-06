import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-microsoft';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

export interface MicrosoftProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

interface MicrosoftRawProfile {
  id: string;
  displayName?: string;
  name?: {
    givenName?: string;
    familyName?: string;
  };
  emails?: Array<{ value: string; type?: string }>;
  _json?: {
    mail?: string;
    userPrincipalName?: string;
  };
}

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const clientID = configService.get<string>('microsoft.clientId');
    const clientSecret = configService.get<string>('microsoft.clientSecret');
    const callbackURL = configService.get<string>('microsoft.redirectUri');

    if (!clientID || !clientSecret) {
      console.warn(
        'Microsoft OAuth credentials not configured. Microsoft authentication will not work.',
      );
    }

    super({
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL:
        callbackURL || 'http://localhost:3000/api/auth/microsoft/callback',
      scope: ['user.read', 'openid', 'email', 'profile'],
      tenant: 'common', // Allow personal and work/school accounts
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: MicrosoftRawProfile,
    done: (error: Error | null, user?: MicrosoftProfile | false) => void,
  ): Promise<void> {
    try {
      // Microsoft may return email in different places
      const email =
        profile.emails?.[0]?.value ||
        profile._json?.mail ||
        profile._json?.userPrincipalName ||
        '';

      const microsoftProfile: MicrosoftProfile = {
        id: profile.id,
        email: email,
        firstName: profile.name?.givenName || profile.displayName || '',
        lastName: profile.name?.familyName || '',
      };

      if (!microsoftProfile.email) {
        return done(
          new Error('No email found in Microsoft profile'),
          undefined,
        );
      }

      // Validate and get/create user
      const user = await this.authService.validateOAuthUser(
        microsoftProfile,
        'microsoft',
      );

      done(null, user);
    } catch (error) {
      done(error as Error, undefined);
    }
  }
}
