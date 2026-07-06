import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PLATFORM_JWT_STRATEGY } from '../strategies/platform-jwt.strategy';

/**
 * Protects platform super-admin routes. Backed by the `platform-jwt` Passport
 * strategy (separate secret + separate PlatformAdmin table), so it is fully
 * isolated from the tenant `JwtAuthGuard`.
 *
 * Platform controllers are additionally marked `@Public()` so the GLOBAL tenant
 * `JwtAuthGuard` skips them and delegates auth entirely to this guard.
 */
@Injectable()
export class PlatformAuthGuard extends AuthGuard(PLATFORM_JWT_STRATEGY) {}
