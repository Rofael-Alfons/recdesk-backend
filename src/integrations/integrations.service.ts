import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { EmailProvider } from '@prisma/client';

@Injectable()
export class IntegrationsService {
  private oauth2Client;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const clientId = this.configService.get<string>('google.clientId');
    const clientSecret = this.configService.get<string>('google.clientSecret');
    const redirectUri = this.configService.get<string>('google.redirectUri');

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );
  }

  async getGmailAuthUrl(companyId: string, userId: string) {
    const state = Buffer.from(JSON.stringify({ companyId, userId })).toString(
      'base64',
    );

    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state,
      prompt: 'consent', // Force consent to get refresh token
    });

    return { authUrl };
  }

  async handleGmailCallback(code: string, state: string) {
    let stateData: { companyId: string; userId: string };

    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      throw new BadRequestException('Invalid state parameter');
    }

    const { companyId, userId } = stateData;

    // Verify user belongs to company
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
    });

    if (!user) {
      throw new BadRequestException('Invalid user or company');
    }

    try {
      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new BadRequestException('Failed to obtain access token');
      }

      // Get user email from Google
      this.oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();

      if (!userInfo.email) {
        throw new BadRequestException('Failed to get email from Google');
      }

      // Check if connection already exists
      const existingConnection = await this.prisma.emailConnection.findFirst({
        where: {
          companyId,
          email: userInfo.email,
        },
      });

      if (existingConnection) {
        // Update existing connection
        await this.prisma.emailConnection.update({
          where: { id: existingConnection.id },
          data: {
            accessToken: tokens.access_token,
            refreshToken:
              tokens.refresh_token || existingConnection.refreshToken,
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            isActive: true,
          },
        });
      } else {
        // Create new connection
        await this.prisma.emailConnection.create({
          data: {
            provider: EmailProvider.GMAIL,
            email: userInfo.email,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            isActive: true,
            companyId,
          },
        });
      }

      return {
        success: true,
        email: userInfo.email,
        message: 'Gmail connected successfully',
      };
    } catch (error) {
      console.error('Gmail OAuth error:', error);
      throw new InternalServerErrorException('Failed to connect Gmail account');
    }
  }

  async getEmailConnections(companyId: string) {
    const connections = await this.prisma.emailConnection.findMany({
      where: { companyId },
      select: {
        id: true,
        provider: true,
        email: true,
        isActive: true,
        autoImport: true,
        lastSyncAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return connections;
  }

  async disconnectEmail(connectionId: string, companyId: string) {
    const connection = await this.prisma.emailConnection.findFirst({
      where: { id: connectionId, companyId },
    });

    if (!connection) {
      throw new NotFoundException('Email connection not found');
    }

    // Revoke tokens if possible
    if (connection.accessToken) {
      try {
        await this.oauth2Client.revokeToken(connection.accessToken);
      } catch (error) {
        // Token might already be revoked, continue with deletion
        console.warn('Failed to revoke token:', error);
      }
    }

    await this.prisma.emailConnection.delete({
      where: { id: connectionId },
    });

    return { message: 'Email disconnected successfully' };
  }

  async refreshAccessToken(connectionId: string) {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection || !connection.refreshToken) {
      throw new BadRequestException(
        'Cannot refresh token - no refresh token available',
      );
    }

    try {
      this.oauth2Client.setCredentials({
        refresh_token: connection.refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      await this.prisma.emailConnection.update({
        where: { id: connectionId },
        data: {
          accessToken: credentials.access_token!,
          expiresAt: credentials.expiry_date
            ? new Date(credentials.expiry_date)
            : null,
        },
      });

      return credentials.access_token;
    } catch (error) {
      console.error('Token refresh error:', error);

      // Mark connection as inactive
      await this.prisma.emailConnection.update({
        where: { id: connectionId },
        data: { isActive: false },
      });

      throw new BadRequestException(
        'Failed to refresh token - please reconnect',
      );
    }
  }

  async getValidAccessToken(connectionId: string): Promise<string> {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Email connection not found');
    }

    // Check if token is expired or about to expire (5 min buffer)
    const isExpired =
      connection.expiresAt &&
      new Date(connection.expiresAt).getTime() < Date.now() + 5 * 60 * 1000;

    if (isExpired && connection.refreshToken) {
      return this.refreshAccessToken(connectionId);
    }

    return connection.accessToken;
  }

  async updateConnection(
    connectionId: string,
    companyId: string,
    data: { autoImport?: boolean },
  ) {
    const connection = await this.prisma.emailConnection.findFirst({
      where: { id: connectionId, companyId },
    });

    if (!connection) {
      throw new NotFoundException('Email connection not found');
    }

    const updated = await this.prisma.emailConnection.update({
      where: { id: connectionId },
      data: {
        autoImport: data.autoImport,
      },
      select: {
        id: true,
        provider: true,
        email: true,
        isActive: true,
        autoImport: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });

    return updated;
  }
}
