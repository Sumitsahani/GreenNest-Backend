import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';
describe('Database startup', () => {
  const service = new PrismaService(new ConfigService({ databaseConnectOnStartup: true, DATABASE_CONNECT_ATTEMPTS: 2 }));
  afterEach(() => jest.restoreAllMocks());
  it('retries a transient connection failure and only reports success after connect', async () => {
    const connect = jest.spyOn(service, '$connect').mockRejectedValueOnce({ errorCode: 'P1001' }).mockResolvedValueOnce(undefined);
    await service.onModuleInit();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(service.isConnected()).toBe(true);
  });
  it('fails startup after bounded retries instead of pretending the database works', async () => {
    const failure = { errorCode: 'P1001' };
    const connect = jest.spyOn(service, '$connect').mockRejectedValue(failure);
    await expect(service.onModuleInit()).rejects.toBe(failure);
    expect(connect).toHaveBeenCalledTimes(2);
  });
  it('does not retry invalid credentials', async () => {
    const failure = { errorCode: 'P1000' };
    const connect = jest.spyOn(service, '$connect').mockRejectedValue(failure);
    await expect(service.onModuleInit()).rejects.toBe(failure);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
