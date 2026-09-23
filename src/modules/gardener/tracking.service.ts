import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { IsNumber, Max, Min, IsOptional } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { TrackingEvents } from './tracking-events.service';

export class TrackingPointDto {
  @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) accuracy?: number;
}
export const privateTrackingKinds = ['TRACKING_LOCATION', 'TRACKING_DESTINATION'];
const hiddenAddressStatuses: BookingStatus[] = [
  'REQUESTED',
  'GARDENER_ASSIGNED',
  'REJECTED',
  'CANCELLED',
];
type TrackingJob = Prisma.ServiceBookingGetPayload<{ include: { gardener: true; service: true } }>;
export interface TrackingResponse {
  id: string;
  viewer: string;
  status: BookingStatus;
  service: string;
  scheduledAt: Date;
  gardenerName: string | null;
  address: { fullAddress: string; postalCode: string } | null;
  location: Prisma.JsonValue | null;
  locationUpdatedAt: Date | null;
  live: boolean;
  destination: Prisma.JsonValue | null;
}

@Injectable()
export class TrackingService {
  constructor(
    private readonly db: PrismaService,
    private readonly events: TrackingEvents,
  ) {}

  private async job(
    db: Prisma.TransactionClient,
    userId: string,
    id: string,
  ): Promise<{ job: TrackingJob; customer: boolean }> {
    const job = await db.serviceBooking.findUnique({
      where: { id },
      include: { gardener: true, service: true },
    });
    const customer = job?.userId === userId;
    if (!job || (!customer && (job.gardener?.userId !== userId || !job.gardener.active)))
      throw new ForbiddenException('This visit is not assigned to your account.');
    return { job, customer };
  }

  async read(userId: string, id: string, asGardener = false): Promise<TrackingResponse> {
    const access = await this.job(this.db, userId, id);
    const { job } = access;
    if (asGardener && (job.gardener?.userId !== userId || !job.gardener.active))
      throw new ForbiddenException();
    const customer = access.customer && !asGardener;
    const permitted = customer || !hiddenAddressStatuses.includes(job.status);
    const address = permitted
      ? await this.db.address.findFirst({
          where: { id: job.addressId, userId: job.userId },
          select: { fullAddress: true, postalCode: true },
        })
      : null;
    const records = permitted
      ? await this.db.bookingActivity.findMany({
          where: { bookingId: id, kind: { in: privateTrackingKinds } },
        })
      : [];
    const location = records
      .filter((row) => row.kind === 'TRACKING_LOCATION' && row.actorId === job.gardener?.userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const live =
      job.status === 'ON_THE_WAY' &&
      !!location &&
      Date.now() - location.createdAt.getTime() < 45000;
    const destination = records.find((row) => row.kind === 'TRACKING_DESTINATION');
    return {
      id,
      viewer: customer ? 'CUSTOMER' : 'GARDENER',
      status: job.status,
      service: job.service.title,
      scheduledAt: job.scheduledAt,
      gardenerName: job.gardener?.name ?? null,
      address,
      location: live && location ? location.data : null,
      locationUpdatedAt: job.status === 'ON_THE_WAY' ? (location?.createdAt ?? null) : null,
      live,
      destination: destination?.data ?? null,
    };
  }

  async write(
    userId: string,
    id: string,
    point: TrackingPointDto,
    destination = false,
  ): Promise<{ saved: boolean }> {
    const result = await this.db.$transaction(async (tx) => {
      // Serialize this visit only; GPS traffic must not lock all gardener bookings.
      await tx.$queryRaw`SELECT id FROM "ServiceBooking" WHERE id = ${id}::uuid FOR UPDATE`;
      const { job, customer } = await this.job(tx, userId, id);
      if (destination ? !customer : job.gardener?.userId !== userId)
        throw new ForbiddenException('You cannot update this location.');
      if (
        destination
          ? [
              'COMPLETED',
              'CUSTOMER_CONFIRMED',
              'OUTCOME_RECORDED',
              'CANCELLED',
              'REJECTED',
              'NO_SHOW',
            ].includes(job.status)
          : job.status !== 'ON_THE_WAY'
      )
        throw new BadRequestException('Location sharing is not available for this visit status.');
      const kind = destination ? 'TRACKING_DESTINATION' : 'TRACKING_LOCATION';
      const requestId = kind;
      const data = {
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy ?? null,
      };
      await tx.bookingActivity.upsert({
        where: { bookingId_actorId_requestId: { bookingId: id, actorId: userId, requestId } },
        create: { bookingId: id, actorId: userId, requestId, kind, data },
        update: { data, createdAt: new Date() },
      });
      return { saved: true };
    });
    this.events.publish(id);
    return result;
  }

  async stop(userId: string, id: string): Promise<{ stopped: boolean }> {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ServiceBooking" WHERE id = ${id}::uuid FOR UPDATE`;
      const { job } = await this.job(tx, userId, id);
      if (job.gardener?.userId !== userId) throw new ForbiddenException();
      await tx.bookingActivity.deleteMany({
        where: { bookingId: id, actorId: userId, kind: 'TRACKING_LOCATION' },
      });
    });
    this.events.publish(id);
    return { stopped: true };
  }
}
