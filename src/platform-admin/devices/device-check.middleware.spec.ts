import type { Request, Response, NextFunction } from 'express';
import { DeviceCheckMiddleware } from './device-check.middleware';
import { PlatformDeviceService } from './platform-device.service';

describe('DeviceCheckMiddleware', () => {
  let middleware: DeviceCheckMiddleware;
  let deviceService: { verifyToken: jest.Mock };
  let res: { status: jest.Mock; json: jest.Mock };
  let next: NextFunction;

  const makeRes = () => {
    const r: any = {};
    r.status = jest.fn().mockReturnValue(r);
    r.json = jest.fn().mockReturnValue(r);
    return r;
  };

  beforeEach(() => {
    deviceService = { verifyToken: jest.fn() };
    middleware = new DeviceCheckMiddleware(
      deviceService as unknown as PlatformDeviceService,
    );
    res = makeRes();
    next = jest.fn();
  });

  it('responds with a silent 404 when no device token is present', async () => {
    deviceService.verifyToken.mockResolvedValue(null);
    const req = { headers: {} } as Request;

    await middleware.use(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Not Found',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 404 for an unrecognized/revoked device', async () => {
    deviceService.verifyToken.mockResolvedValue(null);
    const req = {
      headers: { 'x-admin-device-token': 'bad-token' },
    } as unknown as Request;

    await middleware.use(req, res as unknown as Response, next);

    expect(deviceService.verifyToken).toHaveBeenCalledWith('bad-token');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and attaches the device for a valid token', async () => {
    deviceService.verifyToken.mockResolvedValue({ id: 'd1', name: 'Mac' });
    const req = {
      headers: { 'x-admin-device-token': 'good-token' },
    } as unknown as Request & { platformDevice?: unknown };

    await middleware.use(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.platformDevice).toEqual({ id: 'd1', name: 'Mac' });
  });

  it('handles an array-valued header by taking the first entry', async () => {
    deviceService.verifyToken.mockResolvedValue({ id: 'd1', name: 'Mac' });
    const req = {
      headers: { 'x-admin-device-token': ['first', 'second'] },
    } as unknown as Request;

    await middleware.use(req, res as unknown as Response, next);

    expect(deviceService.verifyToken).toHaveBeenCalledWith('first');
    expect(next).toHaveBeenCalled();
  });
});
