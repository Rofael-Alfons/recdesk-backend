import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

/**
 * Shared handleRequest logic for OAuth callback guards.
 *
 * Passport's default behaviour throws a raw 401 when authentication is denied
 * (e.g. an email that is not on the access allowlist), which never reaches the
 * controller's try/catch. Instead we stash the error message on the request so
 * the controller can redirect back to the login page with a clear message.
 */
function handleOAuthDeny<TUser>(
  err: Error | null,
  user: TUser | false,
  info: { message?: string } | undefined,
  context: ExecutionContext,
): TUser {
  if (err || !user) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { oauthErrorMessage?: string }>();
    request.oauthErrorMessage =
      err?.message || info?.message || 'Authentication failed';
    // Returning a falsy value (instead of throwing) lets the controller
    // handler run and perform the friendly redirect.
    return null as unknown as TUser;
  }
  return user;
}

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
    info: { message?: string } | undefined,
    context: ExecutionContext,
  ): TUser {
    return handleOAuthDeny(err, user, info, context);
  }
}

@Injectable()
export class MicrosoftAuthGuard extends AuthGuard('microsoft') {
  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
    info: { message?: string } | undefined,
    context: ExecutionContext,
  ): TUser {
    return handleOAuthDeny(err, user, info, context);
  }
}
