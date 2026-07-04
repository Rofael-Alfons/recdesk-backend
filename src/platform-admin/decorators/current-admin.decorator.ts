import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentAdminData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export const CurrentAdmin = createParamDecorator(
  (data: keyof CurrentAdminData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const admin = request.user as CurrentAdminData;

    if (data) {
      return admin?.[data];
    }

    return admin;
  },
);
