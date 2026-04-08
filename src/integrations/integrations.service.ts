import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { EmailProvider } from '@prisma/client';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  private oauth2Client;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
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

  // ==========================================
  // GMAIL
  // ==========================================

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

      let connectionId: string;

      const encryptedAccessToken = this.encryptionService.encrypt(tokens.access_token);
      const encryptedRefreshToken = tokens.refresh_token
        ? this.encryptionService.encrypt(tokens.refresh_token)
        : null;

      if (existingConnection) {
        // Update existing connection
        await this.prisma.emailConnection.update({
          where: { id: existingConnection.id },
          data: {
            accessToken: encryptedAccessToken,
            refreshToken:
              encryptedRefreshToken || existingConnection.refreshToken,
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            isActive: true,
          },
        });
        connectionId = existingConnection.id;
      } else {
        // Create new connection
        const newConnection = await this.prisma.emailConnection.create({
          data: {
            provider: EmailProvider.GMAIL,
            email: userInfo.email,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            isActive: true,
            companyId,
          },
        });
        connectionId = newConnection.id;
      }

      return {
        success: true,
        email: userInfo.email,
        connectionId,
        message: 'Gmail connected successfully',
      };
    } catch (error) {
      console.error('Gmail OAuth error:', error);
      throw new InternalServerErrorException('Failed to connect Gmail account');
    }
  }

  // ==========================================
  // OUTLOOK
  // ==========================================

  async getOutlookAuthUrl(companyId: string, userId: string) {
    const clientId = this.configService.get<string>('microsoftEmail.clientId');
    if (!clientId) {
      throw new BadRequestException('Outlook email integration is not configured');
    }

    const redirectUri = this.configService.get<string>('microsoftEmail.redirectUri') || '';

    const state = Buffer.from(JSON.stringify({ companyId, userId })).toString(
      'base64',
    );

    const scopes = ['Mail.Read', 'User.Read', 'offline_access'];

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: scopes.join(' '),
      state,
      prompt: 'consent',
    });

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;

    return { authUrl };
  }

  async handleOutlookCallback(code: string, state: string) {
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

    const clientId = this.configService.get<string>('microsoftEmail.clientId') || '';
    const clientSecret = this.configService.get<string>('microsoftEmail.clientSecret') || '';
    const redirectUri = this.configService.get<string>('microsoftEmail.redirectUri') || '';

    try {
      // Exchange code for tokens
      const tokenResponse = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: 'Mail.Read User.Read offline_access',
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      const {
        access_token,
        refresh_token,
        expires_in,
      } = tokenResponse.data;

      if (!access_token) {
        throw new BadRequestException('Failed to obtain access token from Microsoft');
      }

      // Get user email from Graph API
      const meResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const userEmail =
        meResponse.data.mail || meResponse.data.userPrincipalName;

      if (!userEmail) {
        throw new BadRequestException('Failed to get email from Microsoft');
      }

      // Calculate expiry
      const expiresAt = expires_in
        ? new Date(Date.now() + expires_in * 1000)
        : null;

      // Check if connection already exists
      const existingConnection = await this.prisma.emailConnection.findFirst({
        where: { companyId, email: userEmail },
      });

      let connectionId: string;

      const encryptedAccessToken = this.encryptionService.encrypt(access_token);
      const encryptedRefreshToken = refresh_token
        ? this.encryptionService.encrypt(refresh_token)
        : null;

      if (existingConnection) {
        await this.prisma.emailConnection.update({
          where: { id: existingConnection.id },
          data: {
            provider: EmailProvider.OUTLOOK,
            accessToken: encryptedAccessToken,
            refreshToken:
              encryptedRefreshToken || existingConnection.refreshToken,
            expiresAt,
            isActive: true,
          },
        });
        connectionId = existingConnection.id;
      } else {
        const newConnection = await this.prisma.emailConnection.create({
          data: {
            provider: EmailProvider.OUTLOOK,
            email: userEmail,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt,
            isActive: true,
            companyId,
          },
        });
        connectionId = newConnection.id;
      }

      return {
        success: true,
        email: userEmail,
        connectionId,
        message: 'Outlook connected successfully',
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        'Outlook OAuth error:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        'Failed to connect Outlook account',
      );
    }
  }

  async refreshOutlookToken(connectionId: string) {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection || !connection.refreshToken) {
      throw new BadRequestException(
        'Cannot refresh token - no refresh token available',
      );
    }

    const clientId = this.configService.get<string>('microsoftEmail.clientId') || '';
    const clientSecret = this.configService.get<string>('microsoftEmail.clientSecret') || '';

    try {
      const plainRefreshToken = this.encryptionService.decrypt(
        connection.refreshToken,
      );

      const tokenResponse = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: plainRefreshToken,
          grant_type: 'refresh_token',
          scope: 'Mail.Read User.Read offline_access',
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      const expiresAt = expires_in
        ? new Date(Date.now() + expires_in * 1000)
        : null;

      const updateData: any = {
        accessToken: this.encryptionService.encrypt(access_token),
        expiresAt,
      };

      // Microsoft may rotate refresh tokens
      if (refresh_token) {
        updateData.refreshToken = this.encryptionService.encrypt(refresh_token);
      }

      await this.prisma.emailConnection.update({
        where: { id: connectionId },
        data: updateData,
      });

      return access_token;
    } catch (error: any) {
      this.logger.error(
        'Outlook token refresh error:',
        error.response?.data || error.message,
      );

      await this.prisma.emailConnection.update({
        where: { id: connectionId },
        data: { isActive: false },
      });

      throw new BadRequestException(
        'Failed to refresh Outlook token - please reconnect',
      );
    }
  }

  // ==========================================
  // SHARED
  // ==========================================

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

    // Revoke tokens based on provider
    if (connection.accessToken) {
      try {
        if (connection.provider === EmailProvider.GMAIL) {
          const plainToken = this.encryptionService.decrypt(connection.accessToken);
          await this.oauth2Client.revokeToken(plainToken);
        }
        // Outlook doesn't have a revoke endpoint; tokens expire naturally
      } catch (error) {
        this.logger.warn('Failed to revoke token:', error);
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

    // Dispatch to provider-specific refresh
    if (connection.provider === EmailProvider.OUTLOOK) {
      return this.refreshOutlookToken(connectionId);
    }

    // Gmail refresh
    try {
      const plainRefreshToken = this.encryptionService.decrypt(connection.refreshToken);
      this.oauth2Client.setCredentials({
        refresh_token: plainRefreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      await this.prisma.emailConnection.update({
        where: { id: connectionId },
        data: {
          accessToken: this.encryptionService.encrypt(credentials.access_token!),
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

    return this.encryptionService.decrypt(connection.accessToken);
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
