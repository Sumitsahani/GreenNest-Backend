import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  MemoryStatus,
  Prisma,
  type AdminStaff,
  type RewardTransaction,
  type ServiceBooking,
  type GardeningService,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { adminRoles } from './admin.policy';
import { canWork, closedJobs } from '../gardener/job-policy';

type Values = Record<string, unknown>;
export function requiredText(value: unknown, name: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new BadRequestException(`${name} is required (up to ${max} characters).`);
  return value.trim();
}
export function recordId(value: unknown): string {
  const id = requiredText(value, 'ID', 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new BadRequestException('Choose a valid record.');
  return id;
}
export function onlyFields(values: Values, fields: string[]): void {
  if (!Object.keys(values).length || Object.keys(values).some((key) => !fields.includes(key)))
    throw new BadRequestException('Choose an action and supply only the fields for that action.');
}
export type CustomerProfile = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  suspended: boolean;
  createdAt: Date;
};
export async function customerProfile(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<CustomerProfile> {
  const rows = await tx.$queryRaw<CustomerProfile[]>`
    SELECT id, email, phone, raw_user_meta_data->>'name' AS name,
      raw_user_meta_data->>'location' AS location,
      COALESCE(raw_app_meta_data->>'suspended', 'false') = 'true' AS suspended,
      created_at AS "createdAt"
    FROM auth.users WHERE id = ${id}::uuid
      AND COALESCE(raw_app_meta_data->>'role','') <> 'ADMIN'`;
  if (!rows[0]) throw new NotFoundException('Customer account not found.');
  return rows[0];
}
export async function changeCustomer(
  tx: Prisma.TransactionClient,
  id: string,
  v: Values,
): Promise<{ before: CustomerProfile; after: CustomerProfile }> {
  onlyFields(v, ['name', 'location', 'suspended']);
  await tx.$queryRaw`SELECT id FROM auth.users WHERE id = ${id}::uuid FOR UPDATE`;
  const before = await customerProfile(tx, id);
  const metadata: Values = {};
  if (v.name !== undefined) metadata.name = requiredText(v.name, 'Name', 150);
  if (v.location !== undefined) {
    if (typeof v.location !== 'string' || v.location.length > 200)
      throw new BadRequestException('Location must be text (up to 200 characters).');
    metadata.location = v.location.trim();
  }
  if (v.suspended !== undefined && typeof v.suspended !== 'boolean')
    throw new BadRequestException('Suspended must be true or false.');
  const authority = v.suspended === undefined ? {} : { suspended: v.suspended };
  // Only these app-owned metadata keys are changed; credentials and verified contacts are untouched.
  await tx.$executeRaw`UPDATE auth.users SET
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb,
    raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || ${JSON.stringify(authority)}::jsonb,
    updated_at = now() WHERE id = ${id}::uuid`;
  return { before, after: await customerProfile(tx, id) };
}
export async function addStaff(tx: Prisma.TransactionClient, v: Values): Promise<AdminStaff> {
  onlyFields(v, ['email', 'role']);
  const email = requiredText(v.email, 'Existing account email', 254).toLowerCase();
  const role = requiredText(v.role, 'Role');
  if (!(adminRoles as readonly string[]).includes(role))
    throw new BadRequestException('Invalid staff role.');
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('admin-staff',0))::text`;
  const users = await tx.$queryRaw<
    { id: string; email: string; confirmed: boolean; suspended: boolean }[]
  >`
    SELECT id, email, email_confirmed_at IS NOT NULL AS confirmed,
      COALESCE(raw_app_meta_data->>'suspended','false') = 'true' AS suspended
    FROM auth.users WHERE lower(email) = ${email} FOR UPDATE`;
  const user = users[0];
  if (!user)
    throw new NotFoundException('Ask this person to register and verify their email first.');
  if (!user.confirmed || user.suspended)
    throw new ConflictException('Use a verified, active account.');
  if (await tx.adminStaff.findUnique({ where: { userId: user.id } }))
    throw new ConflictException('This account is already staff. Edit its existing staff record.');
  const row = await tx.adminStaff.create({ data: { userId: user.id, email: user.email, role } });
  await tx.$executeRaw`UPDATE auth.users SET
    raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"ADMIN"}'::jsonb,
    updated_at = now() WHERE id = ${user.id}::uuid`;
  return row;
}
export async function adjustRewards(
  tx: Prisma.TransactionClient,
  v: Values,
): Promise<{ row: RewardTransaction; replay: boolean }> {
  onlyFields(v, ['userId', 'points', 'title', 'requestId']);
  const userId = recordId(v.userId);
  const requestId = recordId(v.requestId);
  const title = requiredText(v.title, 'Adjustment description', 200);
  const points = v.points;
  if (
    typeof points !== 'number' ||
    !Number.isInteger(points) ||
    points === 0 ||
    Math.abs(points) > 100000
  )
    throw new BadRequestException(
      'Use a nonzero whole-number adjustment between -100000 and 100000.',
    );
  await customerProfile(tx, userId);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`rewards:${userId}`},0))::text`;
  const existing = await tx.rewardTransaction.findUnique({
    where: { type_referenceId: { type: 'ADMIN_ADJUSTMENT', referenceId: requestId } },
  });
  if (existing) {
    if (existing.userId !== userId || existing.points !== points || existing.title !== title)
      throw new ConflictException('Request ID belongs to another adjustment.');
    return { row: existing, replay: true };
  }
  const balance = await tx.rewardTransaction.aggregate({
    where: { userId },
    _sum: { points: true },
  });
  if ((balance._sum.points ?? 0) + points < 0)
    throw new ConflictException('The reward balance cannot become negative.');
  const row = await tx.rewardTransaction.create({
    data: { userId, points, title, type: 'ADMIN_ADJUSTMENT', referenceId: requestId },
  });
  return { row, replay: false };
}
export async function manageBooking(
  tx: Prisma.TransactionClient,
  id: string,
  v: Values,
  actorId: string,
  reason: string,
): Promise<{ before: ServiceBooking & { service: GardeningService }; after: ServiceBooking }> {
  onlyFields(v, ['action', 'gardenerId', 'scheduledAt']);
  if (!['ASSIGN', 'RESCHEDULE'].includes(String(v.action)))
    throw new BadRequestException('Choose assign or reschedule.');
  if (v.action === 'RESCHEDULE' && v.gardenerId !== undefined)
    throw new BadRequestException('Use assignment to change the gardener.');
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('gardener-allocation',0))::text`;
  const before = await tx.serviceBooking.findUniqueOrThrow({
    where: { id },
    include: { service: true },
  });
  if (
    !['REQUESTED', 'GARDENER_ASSIGNED', 'ACCEPTED', 'CONFIRMED', 'REJECTED'].includes(before.status)
  )
    throw new ConflictException('Only unstarted visits can be assigned or rescheduled.');
  if (v.action === 'RESCHEDULE' && before.status === 'REJECTED')
    throw new ConflictException('Assign a gardener to reopen a rejected visit.');
  const at =
    v.scheduledAt === undefined && v.action === 'ASSIGN'
      ? before.scheduledAt
      : new Date(requiredText(v.scheduledAt, 'Visit time'));
  if (!Number.isFinite(at.getTime()) || at <= new Date())
    throw new BadRequestException('Choose a future visit time.');
  const gardenerId = v.action === 'ASSIGN' ? recordId(v.gardenerId) : before.gardenerId;
  if (!gardenerId) throw new BadRequestException('Assign a gardener before rescheduling.');
  const gardener = await tx.gardener.findUnique({ where: { id: gardenerId } });
  const address = await tx.address.findFirst({
    where: { id: before.addressId, userId: before.userId },
  });
  if (
    !gardener?.profileComplete ||
    !gardener.active ||
    !gardener.verified ||
    !address ||
    !canWork(gardener, at, before.service.durationMinutes, before.serviceId, address.postalCode)
  )
    throw new ConflictException('Gardener is unavailable for this service, area or time.');
  const others = await tx.serviceBooking.findMany({
    where: {
      id: { not: id },
      gardenerId,
      status: { notIn: closedJobs },
      scheduledAt: { lt: new Date(at.getTime() + before.service.durationMinutes * 60000) },
    },
    include: { service: true },
  });
  if (
    others.some(
      (other) => other.scheduledAt.getTime() + other.service.durationMinutes * 60000 > at.getTime(),
    )
  )
    throw new ConflictException('This visit overlaps another assigned job.');
  const status = v.action === 'ASSIGN' ? 'GARDENER_ASSIGNED' : before.status;
  const updated = await tx.serviceBooking.updateMany({
    where: {
      id,
      status: before.status,
      gardenerId: before.gardenerId,
      scheduledAt: before.scheduledAt,
    },
    data: { gardenerId, scheduledAt: at, status },
  });
  if (!updated.count) throw new ConflictException('Booking changed. Refresh and retry.');
  await tx.bookingActivity.create({
    data: {
      bookingId: id,
      actorId,
      requestId: randomUUID(),
      kind: v.action === 'ASSIGN' ? 'assign' : 'reschedule',
      data: {
        source: 'ADMIN',
        input: { note: reason },
        gardenerId,
        scheduledAt: at.toISOString(),
        from: before.status,
        to: status,
      },
    },
  });
  return { before, after: await tx.serviceBooking.findUniqueOrThrow({ where: { id } }) };
}
export function memoryData(v: Values): Prisma.AiUserMemoryUpdateInput {
  onlyFields(v, ['memoryValue', 'status']);
  const data: Prisma.AiUserMemoryUpdateInput = {};
  if (v.memoryValue !== undefined) data.memoryValue = requiredText(v.memoryValue, 'Memory', 2000);
  if (v.status !== undefined) {
    if (!Object.values(MemoryStatus).includes(v.status as MemoryStatus))
      throw new BadRequestException('Invalid memory status.');
    data.status = v.status as MemoryStatus;
    data.supersededAt = v.status === 'ACTIVE' ? null : new Date();
  }
  return data;
}
