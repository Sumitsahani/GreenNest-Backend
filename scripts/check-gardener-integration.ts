import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { GardenerService } from '../src/modules/gardener/gardener.service';
import { ServicesService } from '../src/modules/services/services.service';
import { PlantStateService } from '../src/modules/intelligence/plant-state.service';
import { AiResponseService } from '../src/modules/ai/ai-response.service';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication, type ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { GardenerController } from '../src/modules/gardener/gardener.controller';
import { SupabaseAuthGuard } from '../src/common/auth/supabase-auth.guard';
import type { AuthenticatedRequest } from '../src/common/auth/authenticated-user';

// Only a newly generated schema is touched. Existing application tables are never
// seeded, migrated or cleaned by this check.
async function main(): Promise<void> {
  const schema = `vanya_gardener_test_${randomUUID().replaceAll('-', '')}`;
  const baseUrl = process.env.GARDENER_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!baseUrl) throw new Error('A PostgreSQL connection is required.');
  const testUrl = new URL(baseUrl); testUrl.searchParams.set('schema', schema);
  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  const folder = mkdtempSync(join(tmpdir(), 'vanya-gardener-'));
  let db: PrismaService | undefined; let created = false; let app: INestApplication | undefined;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    const baseline = execFileSync('git', ['show', 'HEAD:prisma/schema.prisma'], { encoding: 'utf8' });
    const baselinePath = join(folder, 'schema.prisma'); writeFileSync(baselinePath, baseline);
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'db', 'push', '--schema', baselinePath, '--skip-generate'], {
      env: { ...process.env, DATABASE_URL: testUrl.toString(), DIRECT_URL: testUrl.toString() }, stdio: 'pipe', timeout: 120000,
    });
    process.env.DATABASE_URL = testUrl.toString(); process.env.DIRECT_URL = testUrl.toString();
    db = new PrismaService(new ConfigService({ nodeEnv: 'test' }));
    const migration = readFileSync('prisma/migrations/20260914100000_gardener_mode/migration.sql', 'utf8');
    for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
    const ownerId = randomUUID(), gardenerId = randomUUID(), strangerId = randomUUID();
    const at = new Date(); at.setUTCDate(at.getUTCDate() + 2); at.setUTCHours(4, 30, 0, 0);
    const plant = await db.gardenPlant.create({ data: { userId: ownerId, name: 'Integration plant', location: 'Balcony', nextWateringAt: at } });
    const address = await db.address.create({ data: { userId: ownerId, label: 'Test', fullAddress: 'Synthetic test address', postalCode: '110001' } });
    const service = await db.gardeningService.create({ data: { slug: randomUUID(), title: 'Integration rescue', category: 'Rescue', description: 'Synthetic integration fixture', durationMinutes: 60, price: 1000, commissionBps: 1500, icon: 'leaf', inclusions: [] } });
    const module = new GardenerService(db, new PlantStateService(db), new AiResponseService());
    const httpModule = await Test.createTestingModule({ controllers: [GardenerController], providers: [{ provide: GardenerService, useValue: module }] })
      .overrideGuard(SupabaseAuthGuard).useValue({ canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const identities: Record<string, string> = { 'Bearer synthetic-gardener': gardenerId, 'Bearer synthetic-customer': ownerId, 'Bearer synthetic-stranger': strangerId };
        const userId = identities[req.headers.authorization ?? ''];
        if (!userId) return false;
        req.authUser = { id: userId, email: null, phone: null }; return true;
      } }).compile();
    app = httpModule.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await request(app.getHttpServer()).get('/gardener/access').expect(403);
    await request(app.getHttpServer()).post('/gardener/register').set('Authorization', 'Bearer synthetic-gardener').send({ verified: true }).expect(400);
    const g = await module.saveProfile({ id: gardenerId, email: 'gardener@example.invalid', phone: null }, { name: 'Integration gardener', city: 'Test city', serviceAreas: ['Test area'], postalCodes: ['110001'], experienceYears: 2, skills: ['Rescue'], plantTypes: ['Indoor'], serviceIds: [service.id], languages: ['English'], about: 'Synthetic fixture' });
    assert.equal(g.verified, false);
    assert.deepEqual(await module.jobs(gardenerId), []);
    await assert.rejects(() => module.verify({ id: gardenerId, email: null, phone: null }, g.id, true));
    const adminUser = { id: randomUUID(), email: null, phone: null, role: 'ADMIN' as const };
    await module.availability(gardenerId, { available: true, workingDays: [0, 1, 2, 3, 4, 5, 6], startTime: '08:00', endTime: '18:00', serviceRadiusKm: 10 });
    const bookings = new ServicesService(db);
    const bookingRequest = { serviceId: service.id, addressId: address.id, scheduledAt: at.toISOString(), plantIds: [plant.id], customerName: 'Test customer' };
    const simultaneous = await Promise.allSettled([bookings.createBooking(ownerId, bookingRequest), bookings.createBooking(ownerId, bookingRequest)]);
    assert.equal(simultaneous.filter((result) => result.status === 'fulfilled').length, 1, 'Only one conflicting booking is allocated');
    const success = simultaneous.find((result) => result.status === 'fulfilled');
    assert(success?.status === 'fulfilled'); const job = success.value;
    await request(app.getHttpServer()).get(`/gardener/jobs/${job.id}`).set('Authorization', 'Bearer synthetic-stranger').expect(403);
    await request(app.getHttpServer()).get(`/gardener/jobs/${job.id}`).set('Authorization', 'Bearer synthetic-gardener').expect(200);
    await assert.rejects(() => module.detail(strangerId, job.id));
    await assert.rejects(() => module.detail(strangerId, job.id, true));
    const requested = await module.detail(gardenerId, job.id);
    assert.equal(requested.plants.length, 0); assert.equal(requested.address?.fullAddress, undefined);
    await assert.rejects(() => module.act(gardenerId, job.id, 'complete', { requestId: randomUUID(), note: 'Too soon' }));
    const accept = { requestId: randomUUID() };
    await module.act(gardenerId, job.id, 'accept', accept);
    assert.equal((await module.act(gardenerId, job.id, 'accept', accept)).replay, true);
    await assert.rejects(() => module.act(gardenerId, job.id, 'accept', { ...accept, note: 'Different payload' }));
    await module.act(gardenerId, job.id, 'travel', { requestId: randomUUID() });
    const { TrackingService } = await import('../src/modules/gardener/tracking.service');
    const tracking = new TrackingService(db);
    await tracking.write(ownerId, job.id, { latitude: 28.6, longitude: 77.3 }, true);
    await tracking.write(gardenerId, job.id, { latitude: 28.61, longitude: 77.31 });
    assert.equal((await tracking.read(ownerId, job.id)).live, true);
    await assert.rejects(() => tracking.read(randomUUID(), job.id));
    assert.equal((await module.detail(ownerId, job.id, true)).activities.some((a) => a.kind.startsWith('TRACKING_')), false);
    for (const action of ['arrive', 'start', 'begin']) await module.act(gardenerId, job.id, action, { requestId: randomUUID() });
    assert.equal((await tracking.read(ownerId, job.id)).location, null);
    await module.act(gardenerId, job.id, 'observation', { requestId: randomUUID(), plantId: plant.id, note: 'Soil is dry', observations: { soil: 'DRY' } });
    await assert.rejects(() => module.act(gardenerId, job.id, 'work', { requestId: randomUUID(), plantId: randomUUID(), work: 'WATER', note: 'Wrong plant' }));
    const work = { requestId: randomUUID(), plantId: plant.id, work: 'WATER', note: 'Watered after checking soil' };
    await Promise.all([module.act(gardenerId, job.id, 'work', work), module.act(gardenerId, job.id, 'work', work)]);
    assert.equal(await db.careEvent.count({ where: { plantId: plant.id } }), 1);
    await assert.rejects(() => module.act(gardenerId, job.id, 'complete', { requestId: randomUUID(), note: 'Missing proof' }));
    for (const phase of ['BEFORE', 'AFTER'] as const) {
      const photoUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/user-photos/${gardenerId}/service-requests/${phase}.jpg`;
      await module.act(gardenerId, job.id, 'photo', { requestId: randomUUID(), plantId: plant.id, phase, photoUrl });
      await assert.rejects(() => module.act(gardenerId, job.id, 'photo', { requestId: randomUUID(), plantId: plant.id, phase, photoUrl }));
    }
    await module.act(gardenerId, job.id, 'complete', { requestId: randomUUID(), note: 'Synthetic visit complete' });
    assert.equal(await db.gardenerPayout.count({ where: { bookingId: job.id } }), 1);
    const payout = await db.gardenerPayout.findUniqueOrThrow({ where: { bookingId: job.id } });
    assert.equal(Number(payout.net), 850);
    await assert.rejects(() => module.payout(adminUser, payout.id, 'not-yet'));
    await module.act(ownerId, job.id, 'confirm', { requestId: randomUUID(), rating: 4 }, true);
    await module.act(ownerId, job.id, 'outcome', { requestId: randomUUID(), plantId: plant.id, outcome: 'IMPROVED', note: 'Observed new growth' }, true);
    assert.equal(await db.plantOutcomeRecord.count({ where: { plantId: plant.id } }), 1);
    assert.equal((await new PlantStateService(db).getPlantState(plant.id, ownerId)).healthHistory[0]?.source, 'GARDENER_OBSERVATION');
    await module.payout(adminUser, payout.id, 'synthetic-reference');
    await module.payout(adminUser, payout.id, 'synthetic-reference');
    assert.equal((await db.gardener.findUniqueOrThrow({ where: { id: g.id } })).jobsCompleted, 1);
    console.log('PASS: migration, registration, verification, allocation race, authorization, lifecycle, idempotency, evidence, customer confirmation, outcomes and payout records.');
    console.log('Provider AI and actual photo uploads are not exercised by this database test.');
  } finally {
    if (app) await app.close();
    if (db) await db.$disconnect();
    if (created && /^vanya_gardener_test_[a-f0-9]{32}$/.test(schema)) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
    rmSync(folder, { recursive: true, force: true });
  }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Integration check failed'); process.exitCode = 1; });
