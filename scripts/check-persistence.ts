// Explicitly scoped database/service integration test. This does not simulate Android or authentication.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { CareSessionService } from '../src/modules/intelligence/care-session.service';
import { GardenService } from '../src/modules/garden/garden.service';
import { OrdersService } from '../src/modules/orders/orders.service';
import { CartService } from '../src/modules/cart/cart.service';
import { AddressesService } from '../src/modules/addresses/addresses.service';
import { AiService } from '../src/modules/ai/ai.service';
import { AiMemoryService } from '../src/modules/ai/ai-memory.service';
import { ServicesService } from '../src/modules/services/services.service';

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test'; // Never dispatch customer notifications from this harness.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const db = app.get(PrismaService);
  const userId = randomUUID(),
    otherUserId = randomUUID(),
    categoryId = randomUUID(),
    productId = randomUUID();
  const users = [userId, otherUserId];
  const tag = `stability-${randomUUID()}`;
  const serviceId = randomUUID(),
    gardenerId = randomUUID();
  try {
    await db.$queryRaw`SELECT 1`;
    const plantIds = Array.from({ length: 10 }, () => randomUUID());
    await db.gardenPlant.createMany({
      data: plantIds.map((id, i) => ({
        id,
        userId,
        name: `${tag}-${i}`,
        species: 'Epipremnum aureum',
        location: 'Test window',
        nextWateringAt: new Date(),
        wateringDays: 7,
      })),
    });
    await db.careReminder.createMany({
      data: plantIds.map((plantId) => ({ plantId, type: 'WATER', scheduledAt: new Date() })),
    });
    const care = app.get(CareSessionService);
    const session = await care.complete(userId, {
      actionType: 'WATER',
      plantIds,
      skippedPlantIds: plantIds.slice(8),
      skipReasons: { [plantIds[8]!]: 'SOIL_WET', [plantIds[9]!]: 'BUSY' },
    });
    assert.equal(
      await db.careEvent.count({ where: { plantId: { in: plantIds }, type: 'WATER' } }),
      8,
    );
    assert.equal(await db.plantEvent.count({ where: { userId, type: 'WATERING_SKIPPED' } }), 2);
    assert.equal(
      await db.careReminder.count({
        where: { plantId: { in: plantIds.slice(8) }, snoozedUntil: { not: null } },
      }),
      2,
    );
    console.log('PASS real DB: 10 plants -> exactly 8 water events, 2 reasoned skips');
    await assert.rejects(care.complete(otherUserId, { actionType: 'WATER', plantIds }));
    const garden = app.get(GardenService);
    await garden.update(userId, plantIds[0]!, {
      name: `${tag}-corrected`,
      notes: 'Explicit correction',
    });
    assert.equal(
      (await db.gardenPlant.findUniqueOrThrow({ where: { id: plantIds[0]! } })).notes,
      'Explicit correction',
    );
    await assert.rejects(garden.update(otherUserId, plantIds[0]!, { name: 'unauthorized' }));
    await care.undo(userId, session.id);
    assert.equal(
      await db.careEvent.count({ where: { plantId: { in: plantIds }, type: 'WATER' } }),
      0,
    );
    console.log('PASS real DB: batch undo, plant edit, cross-user rejection');
    await garden.care(userId, plantIds[1]!, {
      type: 'WATER' as import('../src/modules/garden/dto/garden.dto').CareAction,
    });
    assert.equal(await db.careEvent.count({ where: { plantId: plantIds[1], type: 'WATER' } }), 1);
    const memories = app.get(AiMemoryService);
    await memories.apply(userId, [
      {
        key: 'soil_drying_days',
        value: '5 days',
        plantId: plantIds[1],
        type: 'USER_CORRECTION',
        confidence: 0.98,
        operation: 'upsert',
        source: 'USER_CORRECTION',
        evidence: { statement: 'My soil takes 5 days to dry.' },
      },
    ]);
    await memories.apply(userId, [
      {
        key: 'soil_drying_days',
        value: '2 days',
        plantId: plantIds[1],
        type: 'USER_CORRECTION',
        confidence: 0.5,
        operation: 'upsert',
        source: 'AI_INFERENCE',
        evidence: { inferred: true },
      },
    ]);
    assert.equal(
      (await db.aiUserMemory.findFirstOrThrow({ where: { userId, memoryKey: 'soil_drying_days' } }))
        .memoryValue,
      '5 days',
    );
    console.log('PASS real DB: single care and correction precedence over inference');
    const added = await garden.create(userId, {
      name: 'Stability test pothos',
      species: 'Epipremnum aureum',
      location: 'Test window',
      environment: 'INDOOR',
      weatherLocation: 'Bengaluru',
      latitude: 12.9716,
      longitude: 77.5946,
      lastWateredAt: new Date().toISOString(),
      wateringDays: 7,
      notes: tag,
    });
    assert.equal((await garden.detail(userId, added.id)).notes, tag);
    console.log('PASS real service: plant create -> database -> detail reload');
    await garden.remove(userId, plantIds[0]!);
    assert.equal(
      (await db.gardenPlant.findUniqueOrThrow({ where: { id: plantIds[0]! } })).lifecycleStatus,
      'REMOVED',
    );
    assert.ok(await db.plantEvent.count({ where: { plantId: plantIds[0]! } }));
    console.log('PASS real DB: soft removal retains history');
    const address = await app
      .get(AddressesService)
      .create(userId, {
        label: 'Test',
        fullAddress: 'Stability test only, no delivery',
        postalCode: '560001',
        isDefault: true,
      });
    await db.category.create({ data: { id: categoryId, name: tag, slug: tag } });
    await db.product.create({
      data: {
        id: productId,
        name: tag,
        slug: tag,
        description: 'Temporary integration fixture',
        price: 100,
        stock: 2,
        images: [],
        categoryId,
      },
    });
    await app.get(CartService).add(userId, productId, 2);
    const orderDto = {
      addressId: address.id,
      paymentMethod: 'COD' as const,
      requestId: randomUUID(),
    };
    const orders = await Promise.all([
      app.get(OrdersService).create(userId, orderDto),
      app.get(OrdersService).create(userId, orderDto),
    ]);
    assert.equal(orders[0].id, orders[1].id);
    assert.equal(await db.order.count({ where: { userId } }), 1);
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock, 0);
    assert.equal(await db.cartItem.count({ where: { userId } }), 0);
    assert.equal(await db.rewardTransaction.count({ where: { userId, type: 'ORDER_EARN' } }), 1);
    await assert.rejects(app.get(OrdersService).detail(otherUserId, orders[0].id));
    console.log(
      'PASS real DB: concurrent COD retry -> one order, one reward, correct stock, empty cart, ownership',
    );
    await db.gardeningService.create({
      data: {
        id: serviceId,
        slug: tag,
        title: tag,
        category: 'test',
        description: 'Temporary test',
        durationMinutes: 90,
        price: 100,
        icon: 'leaf',
        inclusions: [],
      },
    });
    await db.gardener.create({
      data: {
        id: gardenerId,
        name: tag,
        identityNumber: tag,
        phoneMasked: 'test-only',
        rating: 9.9,
        active: true,
        verified: true,
      },
    });
    const bookings = await Promise.all(
      [0, 30].map((minutes) =>
        app
          .get(ServicesService)
          .createBooking(userId, {
            serviceId,
            addressId: address.id,
            scheduledAt: new Date(Date.UTC(2099, 0, 1, 5, minutes)).toISOString(),
          }),
      ),
    );
    assert.notEqual(bookings[0]!.gardener?.id, bookings[1]!.gardener?.id);
    await assert.rejects(app.get(ServicesService).booking(otherUserId, bookings[0]!.id));
    console.log(
      'PASS real DB: overlapping concurrent bookings use different gardeners, ownership enforced',
    );
    const ai = app.get(AiService);
    const conversation = await ai.createConversation(userId, { title: tag });
    const requestId = randomUUID();
    const reply = await ai.send(userId, conversation.id, {
      message: 'hi\nhello\nhey',
      messages: ['hi', 'hello', 'hey'],
      requestId,
      language: 'ENGLISH',
    });
    const replay = await ai.send(userId, conversation.id, {
      message: 'hi\nhello\nhey',
      messages: ['hi', 'hello', 'hey'],
      requestId,
      language: 'ENGLISH',
    });
    assert.equal(reply.assistantMessage?.id, replay.assistantMessage?.id);
    const messages = await ai.messages(userId, conversation.id);
    assert.deepEqual(
      messages.filter((m) => m.role === 'USER').map((m) => m.content),
      ['hi', 'hello', 'hey'],
    );
    assert.equal(messages.filter((m) => m.role === 'ASSISTANT').length, 1);
    await assert.rejects(ai.messages(otherUserId, conversation.id));
    console.log(
      'PASS real DB: separate ordered chat messages, retry deduplication, conversation ownership',
    );
  } finally {
    // Delete only this run's generated fixture identities. Never touch existing users or catalog.
    await db.aiConversation.deleteMany({ where: { userId: { in: users } } });
    await db.serviceBooking.deleteMany({ where: { userId: { in: users } } });
    await db.gardeningService.deleteMany({ where: { id: serviceId, slug: tag } });
    await db.gardener.deleteMany({ where: { id: gardenerId, identityNumber: tag } });
    await db.aiUserMemory.deleteMany({ where: { userId: { in: users } } });
    await db.careSession.deleteMany({ where: { userId: { in: users } } });
    await db.gardenPlant.deleteMany({ where: { userId: { in: users } } });
    await db.engagementEvent.deleteMany({ where: { userId: { in: users } } });
    await db.rewardTransaction.deleteMany({ where: { userId: { in: users } } });
    await db.order.deleteMany({ where: { userId: { in: users } } });
    await db.cartItem.deleteMany({ where: { userId: { in: users } } });
    await db.address.deleteMany({ where: { userId: { in: users } } });
    await db.notification.deleteMany({ where: { userId: { in: users } } });
    await db.userSettings.deleteMany({ where: { userId: { in: users } } });
    await db.product.deleteMany({ where: { id: productId, slug: tag } });
    await db.category.deleteMany({ where: { id: categoryId, slug: tag } });
    await app.close();
    console.log('Temporary fixtures cleaned');
  }
}
void main().catch((error: unknown) => {
  console.error('Persistence test failed:', error instanceof Error ? error.name : 'Unknown error',
    error && typeof error === 'object' && 'errorCode' in error ? String(error.errorCode) : '',
    error && typeof error === 'object' && 'code' in error ? String(error.code) : '',
    error instanceof Error && /TLS|SSL|certificate/i.test(error.message) ? 'TLS' : '',
    error instanceof Error && /reach database/i.test(error.message) ? 'database unreachable' : '');
  process.exitCode = 1;
});
