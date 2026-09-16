import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BookingStatus } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { CreateBookingDto } from './dto/booking.dto';
import { canWork, closedJobs } from '../gardener/job-policy';

export interface ServiceResponse {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  durationMinutes: number;
  price: number;
  icon: string;
  inclusions: string[];
}
export interface SlotResponse {
  time: string;
  available: boolean;
}
export interface BookingResponse {
  id: string;
  bookingNumber: string;
  status: string;
  scheduledAt: string;
  price: number;
  notes: string | null;
  photoUrls: string[];
  service: { id: string; title: string; durationMinutes: number };
  gardener: {
    id: string;
    name: string;
    identityNumber: string;
    phoneMasked: string;
    rating: number;
    jobsCompleted: number;
    verified: boolean;
  } | null;
}

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}
  async list(): Promise<ServiceResponse[]> {
    const rows = await this.prisma.gardeningService.findMany({
      where: { active: true },
      orderBy: { price: 'asc' },
    });
    return rows.map(this.mapService);
  }
  async detail(id: string): Promise<ServiceResponse> {
    const row = await this.prisma.gardeningService.findFirst({
      where: { active: true, OR: [{ id: this.uuid(id) }, { slug: id }] },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.SERVICE_NOT_FOUND,
        'Service not found',
        HttpStatus.NOT_FOUND,
      );
    return this.mapService(row);
  }
  async slots(date: string): Promise<SlotResponse[]> {
    const base = new Date(`${date}T00:00:00+05:30`);
    if (Number.isNaN(base.getTime()))
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Invalid date',
        HttpStatus.BAD_REQUEST,
      );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Invalid date',
        HttpStatus.BAD_REQUEST,
      );
    const [gardeners, bookings, durations] = await Promise.all([
      this.prisma.gardener.findMany({
        where: {
          active: true,
          available: true,
          profileComplete: true,
          userId: { not: null },
        },
      }),
      this.prisma.serviceBooking.findMany({
        where: {
          scheduledAt: {
            gte: new Date(base.getTime() - 86_400_000),
            lt: new Date(base.getTime() + 86_400_000),
          },
          status: { notIn: closedJobs },
        },
        include: { service: true },
      }),
      this.prisma.gardeningService.aggregate({
        where: { active: true },
        _max: { durationMinutes: true },
      }),
    ]);
    return ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00'].map((time) => {
      const start = new Date(`${date}T${time}:00+05:30`);
      const end = start.getTime() + (durations._max.durationMinutes ?? 90) * 60_000;
      const busy = new Set(
        bookings
          .filter(
            (item) =>
              item.scheduledAt.getTime() < end &&
              item.scheduledAt.getTime() + item.service.durationMinutes * 60_000 > start.getTime(),
          )
          .map((item) => item.gardenerId),
      );
      return {
        time,
        available:
          start > new Date() &&
          gardeners.some(
            (gardener) =>
              !busy.has(gardener.id) &&
              canWork(gardener, start, durations._max.durationMinutes ?? 90),
          ),
      };
    });
  }
  async createBooking(userId: string, dto: CreateBookingDto): Promise<BookingResponse> {
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date())
      throw new BusinessException(
        ErrorCode.SLOT_NOT_AVAILABLE,
        'Please select a future time slot',
        HttpStatus.CONFLICT,
      );
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('gardener-allocation', 0))::text`;
        const [service, address] = await Promise.all([
          tx.gardeningService.findFirst({ where: { id: dto.serviceId, active: true } }),
          tx.address.findFirst({ where: { id: dto.addressId, userId } }),
        ]);
        if (!service)
          throw new BusinessException(
            ErrorCode.SERVICE_NOT_FOUND,
            'Service not found',
            HttpStatus.NOT_FOUND,
          );
        if (!address)
          throw new BusinessException(
            ErrorCode.NOT_FOUND,
            'Service address not found',
            HttpStatus.NOT_FOUND,
          );
        const busy = await tx.serviceBooking.findMany({
          where: {
            scheduledAt: { lt: new Date(scheduledAt.getTime() + service.durationMinutes * 60_000) },
            status: { notIn: closedJobs },
          },
          select: {
            gardenerId: true,
            scheduledAt: true,
            service: { select: { durationMinutes: true } },
          },
        });
        const candidates = await tx.gardener.findMany({
          where: {
            active: true,
            available: true,
            profileComplete: true,
            userId: { not: null },
            serviceIds: { has: service.id },
            postalCodes: { has: address.postalCode },
            id: {
              notIn: busy
                .filter(
                  (item) =>
                    item.scheduledAt.getTime() + item.service.durationMinutes * 60_000 >
                    scheduledAt.getTime(),
                )
                .flatMap((item) => (item.gardenerId ? [item.gardenerId] : [])),
            },
          },
          orderBy: { rating: 'desc' },
        });
        const gardener = candidates.find((g) =>
          canWork(g, scheduledAt, service.durationMinutes, service.id, address.postalCode),
        );
        const plantIds = [...new Set(dto.plantIds ?? [])];
        if (!plantIds.length) throw new BusinessException(ErrorCode.VALIDATION_ERROR, 'Select at least one plant for the visit.', HttpStatus.BAD_REQUEST);
        const plantCount = await tx.gardenPlant.count({ where: { id: { in: plantIds }, userId } });
        if (plantCount !== plantIds.length)
          throw new BusinessException(
            ErrorCode.FORBIDDEN,
            'Only your own plants can be linked to a booking.',
            HttpStatus.FORBIDDEN,
          );
        if (!gardener)
          throw new BusinessException(
            ErrorCode.SLOT_NOT_AVAILABLE,
            'No gardener is available for this slot',
            HttpStatus.CONFLICT,
          );
        const booking = await tx.serviceBooking.create({
          data: {
            bookingNumber: `GB-${randomUUID()}`,
            userId,
            serviceId: service.id,
            gardenerId: gardener.id,
            addressId: address.id,
            scheduledAt,
            status: BookingStatus.REQUESTED,
            plantIds,
            customerName: dto.customerName,
            notes: dto.notes,
            photoUrls: dto.photoUrls ?? [],
            price: service.price,
          },
          include: { service: true, gardener: true },
        });
        if (gardener.userId)
          await tx.notification.create({
            data: {
              userId: gardener.userId,
              title: 'New job request',
              message: `${booking.bookingNumber}: ${service.title} on ${scheduledAt.toISOString()}`,
              type: 'GARDENER_NEW_JOB',
            },
          });
        return this.mapBooking(booking);
      },
      { timeout: 15_000 },
    );
  }
  async bookings(userId: string): Promise<BookingResponse[]> {
    const rows = await this.prisma.serviceBooking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { service: true, gardener: true },
    });
    return rows.map((row) => this.mapBooking(row));
  }
  async booking(userId: string, id: string): Promise<BookingResponse> {
    const row = await this.prisma.serviceBooking.findFirst({
      where: { userId, OR: [{ id: this.uuid(id) }, { bookingNumber: id }] },
      include: { service: true, gardener: true },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.BOOKING_NOT_FOUND,
        'Booking not found',
        HttpStatus.NOT_FOUND,
      );
    return this.mapBooking(row);
  }
  private uuid(value: string): string {
    return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)
      ? value
      : '00000000-0000-0000-0000-000000000000';
  }
  private mapService = (row: {
    id: string;
    slug: string;
    title: string;
    category: string;
    description: string;
    durationMinutes: number;
    price: unknown;
    icon: string;
    inclusions: string[];
  }): ServiceResponse => ({ ...row, price: Number(row.price) });
  private mapBooking(row: {
    id: string;
    bookingNumber: string;
    status: string;
    scheduledAt: Date;
    price: unknown;
    notes: string | null;
    photoUrls: string[];
    service: { id: string; title: string; durationMinutes: number };
    gardener: {
      id: string;
      name: string;
      identityNumber: string;
      phoneMasked: string;
      rating: unknown;
      jobsCompleted: number;
      verified: boolean;
    } | null;
  }): BookingResponse {
    return {
      ...row,
      scheduledAt: row.scheduledAt.toISOString(),
      price: Number(row.price),
      gardener: row.gardener ? { ...row.gardener, rating: Number(row.gardener.rating) } : null,
    };
  }
}
