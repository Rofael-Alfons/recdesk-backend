import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AllowlistModule } from '../allowlist/allowlist.module';
import { PlatformAuthService } from './auth/platform-auth.service';
import { PlatformAuthController } from './auth/platform-auth.controller';
import { PlatformJwtStrategy } from './strategies/platform-jwt.strategy';
import { AdminCompaniesController } from './companies/admin-companies.controller';
import { AdminCompaniesService } from './companies/admin-companies.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';
import { AdminSubscriptionsController } from './subscriptions/admin-subscriptions.controller';
import { AdminSubscriptionsService } from './subscriptions/admin-subscriptions.service';
import { AdminAllowlistController } from './allowlist/admin-allowlist.controller';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { PlatformDeviceService } from './devices/platform-device.service';
import { PlatformDeviceController } from './devices/platform-device.controller';
import { DeviceCheckMiddleware } from './devices/device-check.middleware';

// Every platform-admin controller. The device-binding middleware is applied to
// ALL of them (including auth) so an unenrolled device cannot even reach login.
const ADMIN_CONTROLLERS = [
  PlatformAuthController,
  PlatformDeviceController,
  AdminCompaniesController,
  AdminUsersController,
  AdminSubscriptionsController,
  AdminAllowlistController,
  AdminDashboardController,
];

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('platform.jwtSecret'),
        signOptions: {
          expiresIn: configService.get<number>(
            'platform.accessExpirationSeconds',
          ),
        },
      }),
      inject: [ConfigService],
    }),
    AllowlistModule,
  ],
  controllers: ADMIN_CONTROLLERS,
  providers: [
    PlatformAuthService,
    PlatformJwtStrategy,
    PlatformDeviceService,
    AdminCompaniesService,
    AdminUsersService,
    AdminSubscriptionsService,
    AdminDashboardService,
  ],
})
export class PlatformAdminModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(DeviceCheckMiddleware).forRoutes(...ADMIN_CONTROLLERS);
  }
}
