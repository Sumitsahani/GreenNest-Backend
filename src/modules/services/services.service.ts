import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { CreateBookingDto } from './dto/booking.dto';

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
  slots(date: string): SlotResponse[] {
    const base = new Date(`${date}T00:00:00+05:30`);
    if (Number.isNaN(base.getTime()))
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Invalid date',
        HttpStatus.BAD_REQUEST,
      );
    return ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00'].map((time) => ({
      time,
      available: true,
    }));
  }
  async createBooking(userId: string, dto: CreateBookingDto): Promise<BookingResponse> {
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date())
      throw new BusinessException(
        ErrorCode.SLOT_NOT_AVAILABLE,
        'Please select a future time slot',
        HttpStatus.CONFLICT,
      );
    const [service, address] = await Promise.all([
      this.prisma.gardeningService.findFirst({ where: { id: dto.serviceId, active: true } }),
      this.prisma.address.findFirst({ where: { id: dto.addressId, userId } }),
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
    const busy = await this.prisma.serviceBooking.findMany({
      where: { scheduledAt, status: { notIn: [BookingStatus.CANCELLED, BookingStatus.COMPLETED] } },
      select: { gardenerId: true },
    });
    const gardener = await this.prisma.gardener.findFirst({
      where: {
        active: true,
        verified: true,
        id: { notIn: busy.flatMap((item) => (item.gardenerId ? [item.gardenerId] : [])) },
      },
      orderBy: { rating: 'desc' },
    });
    if (!gardener)
      throw new BusinessException(
        ErrorCode.SLOT_NOT_AVAILABLE,
        'No gardener is available for this slot',
        HttpStatus.CONFLICT,
      );
    const booking = await this.prisma.serviceBooking.create({
      data: {
        bookingNumber: `GB-${Date.now().toString().slice(-7)}`,
        userId,
        serviceId: service.id,
        gardenerId: gardener.id,
        addressId: address.id,
        scheduledAt,
        status: BookingStatus.GARDENER_ASSIGNED,
        notes: dto.notes,
        photoUrls: dto.photoUrls ?? [],
        price: service.price,
      },
      include: { service: true, gardener: true },
    });
    return this.mapBooking(booking);
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
