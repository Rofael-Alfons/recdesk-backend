import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

export interface GoogleProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const clientID = configService.get<string>('googleAuth.clientId');
    const clientSecret = configService.get<string>('googleAuth.clientSecret');
    const callbackURL = configService.get<string>('googleAuth.redirectUri');

    if (!clientID || !clientSecret) {
      console.warn(
        'Google OAuth credentials not configured. Google authentication will not work.',
      );
    }

    super({
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL:
        callbackURL || 'http://localhost:3000/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const googleProfile: GoogleProfile = {
        id: profile.id,
        email: profile.emails?.[0]?.value || '',
        firstName: profile.name?.givenName || profile.displayName || '',
        lastName: profile.name?.familyName || '',
        avatarUrl: profile.photos?.[0]?.value,
      };

      if (!googleProfile.email) {
        return done(new Error('No email found in Google profile'), undefined);
      }

      // Validate and get/create user
      const user = await this.authService.validateOAuthUser(
        googleProfile,
        'google',
      );

      done(null, user);
    } catch (error) {
      done(error as Error, undefined);
    }
  }
}
