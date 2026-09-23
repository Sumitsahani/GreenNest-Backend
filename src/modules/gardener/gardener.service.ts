import { Optional } from '@nestjs/common';
import { AdminAccessService } from '../admin/admin-access.service';
import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus, CareType, PlantEventType, PlantOutcomeType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code';
import { PrismaService } from '../../database/prisma.service';
import { PlantStateService } from '../intelligence/plant-state.service';
import { AiResponseService } from '../ai/ai-response.service';
import type {
  AvailabilityDto,
  GardenerProfileDto,
  JobActionDto,
  GardenerChatDto,
} from './gardener.dto';
import { canWork, closedJobs, jobTransitions } from './job-policy';
import { TrackingEvents } from './tracking-events.service';
import type {
  Gardener,
  ServiceBooking,
  GardeningService,
  BookingActivity,
  GardenerPayout,
} from '@prisma/client';
import type { PlantState } from '../intelligence/plant-state.service';

type JobCase = Pick<
  PlantState,
  'location' | 'health' | 'lastWateredAt' | 'healthHistory' | 'treatments' | 'outcomes'
> & { id: string; name: string; species: string | null };
type JobDetail = Pick<
  ServiceBooking,
  | 'id'
  | 'bookingNumber'
  | 'status'
  | 'scheduledAt'
  | 'price'
  | 'customerName'
  | 'notes'
  | 'photoUrls'
  | 'completionNotes'
  | 'rating'
  | 'issue'
> & {
  viewerId: string;
  service: GardeningService;
  address: { postalCode: string; fullAddress?: string; label?: string } | null;
  activities: BookingActivity[];
  plants: JobCase[];
};
type JobSummary = Pick<
  ServiceBooking,
  | 'id'
  | 'bookingNumber'
  | 'scheduledAt'
  | 'status'
  | 'customerName'
  | 'notes'
  | 'price'
  | 'plantIds'
> & { service: Pick<GardeningService, 'title' | 'durationMinutes'> };

function fail(message: string, status: HttpStatus = HttpStatus.CONFLICT): never {
  throw new BusinessException(
    status === HttpStatus.FORBIDDEN ? ErrorCode.FORBIDDEN : ErrorCode.VALIDATION_ERROR,
    message,
    status,
  );
}
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class GardenerService {
  constructor(
    private readonly db: PrismaService,
    private readonly states: PlantStateService,
    private readonly ai: AiResponseService,
    private readonly trackingEvents: TrackingEvents,
    @Optional() private readonly adminAccess?: AdminAccessService,
  ) {}

  async access(
    user: AuthenticatedUser,
  ): Promise<{
    userId: string;
    role: 'ADMIN' | 'GARDENER' | 'CUSTOMER';
    profile: Gardener | null;
  }> {
    const profile = await this.db.gardener.findUnique({ where: { userId: user.id } });
    return {
      userId: user.id,
      role: user.role === 'ADMIN' ? 'ADMIN' : profile ? 'GARDENER' : 'CUSTOMER',
      profile,
    };
  }
  async profile(userId: string, requireComplete = false): Promise<Gardener> {
    const row = await this.db.gardener.findUnique({ where: { userId } });
    if (!row || !row.active || (requireComplete && !row.profileComplete))
      fail('An active, complete gardener profile is required.', HttpStatus.FORBIDDEN);
    return row;
  }
  async saveProfile(user: AuthenticatedUser, dto: GardenerProfileDto): Promise<Gardener> {
    if (!dto.name.trim() || !dto.city.trim())
      fail('Name and city are required.', HttpStatus.BAD_REQUEST);
    const count = await this.db.gardeningService.count({
      where: { id: { in: [...new Set(dto.serviceIds)] }, active: true },
    });
    if (count !== new Set(dto.serviceIds).size)
      fail('Select active services.', HttpStatus.BAD_REQUEST);
    if (dto.avatarUrl) this.photoUrl(dto.avatarUrl, user.id);
    return this.db.gardener.upsert({
      where: { userId: user.id },
      create: {
        ...dto,
        userId: user.id,
        identityNumber: `VG-${randomUUID()}`,
        phoneMasked: user.phone ? `******${user.phone.slice(-4)}` : 'Contact through job messages',
        verified: false,
        rating: 0,
        profileComplete: true,
      },
      update: { ...dto, profileComplete: true },
    });
  }
  async availability(userId: string, dto: AvailabilityDto): Promise<Gardener> {
    const profile = await this.profile(userId);
    if (dto.startTime >= dto.endTime)
      fail('End time must be after start time.', HttpStatus.BAD_REQUEST);
    if (dto.available && !profile.profileComplete)
      fail('Complete your gardener profile before accepting new work.', HttpStatus.FORBIDDEN);
    return this.db.gardener.update({ where: { id: profile.id }, data: dto });
  }
  async jobs(userId: string, page = 1, history = false): Promise<JobSummary[]> {
    const gardener = await this.profile(userId, true);
    return this.db.serviceBooking.findMany({
      where: {
        gardenerId: gardener.id,
        status: history ? { in: closedJobs } : { notIn: closedJobs },
      },
      select: {
        id: true,
        bookingNumber: true,
        scheduledAt: true,
        status: true,
        customerName: true,
        notes: true,
        price: true,
        plantIds: true,
        service: { select: { title: true, durationMinutes: true } },
      },
      orderBy: { scheduledAt: history ? 'desc' : 'asc' },
      skip: (page - 1) * 25,
      take: 25,
    });
  }
  async dashboard(
    userId: string,
  ): Promise<{
    today: number;
    pending: number;
    accepted: number;
    completed: number;
    earnings: Prisma.Decimal | null;
    name: string;
  }> {
    const g = await this.profile(userId, true);
    const local = new Date(Date.now() + 330 * 60_000);
    const dayStart = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 330 * 60_000,
    );
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const [today, pending, accepted, completed, earnings] = await Promise.all([
      this.db.serviceBooking.count({
        where: {
          gardenerId: g.id,
          scheduledAt: { gte: dayStart, lt: dayEnd },
          status: { notIn: ['CANCELLED', 'REJECTED', 'NO_SHOW'] },
        },
      }),
      this.db.serviceBooking.count({
        where: { gardenerId: g.id, status: { in: ['REQUESTED', 'GARDENER_ASSIGNED'] } },
      }),
      this.db.serviceBooking.count({ where: { gardenerId: g.id, status: 'ACCEPTED' } }),
      this.db.serviceBooking.count({
        where: { gardenerId: g.id, completedAt: { gte: dayStart, lt: dayEnd } },
      }),
      this.db.gardenerPayout.aggregate({
        where: { gardenerId: g.id, createdAt: { gte: dayStart, lt: dayEnd } },
        _sum: { net: true },
      }),
    ]);
    return { today, pending, accepted, completed, earnings: earnings._sum.net, name: g.name };
  }
  private async authorizedJob(
    userId: string,
    id: string,
    customer = false,
  ): Promise<ServiceBooking & { service: GardeningService }> {
    const g = customer ? null : await this.profile(userId, true);
    const job = await this.db.serviceBooking.findFirst({
      where: { id, ...(customer ? { userId } : { gardenerId: g!.id }) },
      include: { service: true },
    });
    if (!job) fail('Job not found or not authorized.', HttpStatus.FORBIDDEN);
    return job;
  }
  async detail(userId: string, id: string, customer = false): Promise<JobDetail> {
    const job = await this.authorizedJob(userId, id, customer);
    const permitted =
      customer || !['REQUESTED', 'GARDENER_ASSIGNED', 'REJECTED', 'CANCELLED'].includes(job.status);
    const [address, activities, plants] = await Promise.all([
      this.db.address.findFirst({
        where: { id: job.addressId, userId: job.userId },
        select: permitted
          ? { fullAddress: true, postalCode: true, label: true }
          : { postalCode: true },
      }),
      permitted
        ? this.db.bookingActivity.findMany({
            where: {
              bookingId: id,
              kind: { notIn: ['TRACKING_LOCATION', 'TRACKING_DESTINATION'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        : Promise.resolve([]),
      permitted
        ? Promise.all(
            job.plantIds
              .slice(0, 20)
              .map((plantId) => this.states.getPlantState(plantId, job.userId)),
          )
        : Promise.resolve([]),
    ]);
    return {
      id: job.id,
      viewerId: userId,
      bookingNumber: job.bookingNumber,
      status: job.status,
      scheduledAt: job.scheduledAt,
      service: job.service,
      price: job.price,
      customerName: job.customerName,
      notes: job.notes,
      photoUrls: permitted ? job.photoUrls : [],
      address,
      activities,
      plants: plants.map(
        ({ identity, location, health, lastWateredAt, healthHistory, treatments, outcomes }) => ({
          id: identity.id,
          name: identity.name,
          species: identity.species,
          location,
          health,
          lastWateredAt,
          healthHistory,
          treatments,
          outcomes,
        }),
      ),
      completionNotes: job.completionNotes,
      rating: job.rating,
      issue: job.issue,
    };
  }
  async activityPage(
    userId: string,
    id: string,
    page: number,
    customer: boolean,
  ): Promise<BookingActivity[]> {
    const job = await this.authorizedJob(userId, id, customer);
    if (
      !customer &&
      ['REQUESTED', 'GARDENER_ASSIGNED', 'REJECTED', 'CANCELLED'].includes(job.status)
    )
      fail('Accept the job before accessing visit records.', HttpStatus.FORBIDDEN);
    return this.db.bookingActivity.findMany({
      where: { bookingId: id, kind: { notIn: ['TRACKING_LOCATION', 'TRACKING_DESTINATION'] } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * 50,
      take: 50,
    });
  }
  async act(
    userId: string,
    id: string,
    action: string,
    dto: JobActionDto,
    customer = false,
  ): Promise<{ status: BookingStatus; saved: boolean; replay: boolean }> {
    const original = await this.authorizedJob(userId, id, customer);
    const customerActions = ['confirm', 'issue', 'outcome', 'message', 'cancel', 'reschedule'];
    const gardenerActions = [
      'accept',
      'reject',
      'travel',
      'arrive',
      'start',
      'begin',
      'complete',
      'cancel',
      'reschedule',
      'photo',
      'observation',
      'work',
      'message',
    ];
    if (!(customer ? customerActions : gardenerActions).includes(action))
      fail('Action is not permitted.', HttpStatus.FORBIDDEN);
    if (dto.plantId && !original.plantIds.includes(dto.plantId))
      fail('Plant is not linked to this job.', HttpStatus.FORBIDDEN);
    if (action === 'photo') {
      if (!dto.photoUrl || !dto.phase || !dto.plantId)
        fail('Photo, phase and plant are required.', HttpStatus.BAD_REQUEST);
      this.photoUrl(dto.photoUrl, userId);
    }
    const result = await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('gardener-allocation', 0))::text`;
        const job = await tx.serviceBooking.findUniqueOrThrow({
          where: { id },
          include: { service: true, gardener: true },
        });
        if (job.userId !== original.userId || job.gardenerId !== original.gardenerId)
          fail('Job assignment changed. Refresh and retry.');
        const replay = await tx.bookingActivity.findUnique({
          where: {
            bookingId_actorId_requestId: {
              bookingId: id,
              actorId: userId,
              requestId: dto.requestId,
            },
          },
        });
        if (replay) {
          const recorded = replay.data as { input?: unknown };
          if (replay.kind !== action || !isDeepStrictEqual(recorded.input, json(dto)))
            fail('Request ID belongs to a different action.');
          return { status: job.status, saved: true, replay: true };
        }
        const transition = jobTransitions[action];
        if (transition && !transition.from.includes(job.status))
          fail(`Cannot ${action} a ${job.status.toLowerCase()} job.`);
        if (
          ['photo', 'observation', 'work'].includes(action) &&
          !['INSPECTION', 'IN_PROGRESS'].includes(job.status)
        )
          fail('Start the visit before recording work or evidence.');
        if (
          ['message', 'issue'].includes(action) &&
          ['REQUESTED', 'GARDENER_ASSIGNED', 'REJECTED'].includes(job.status)
        )
          fail('The job has not been accepted.');
        if (
          action === 'issue' &&
          !['COMPLETED', 'CUSTOMER_CONFIRMED', 'OUTCOME_RECORDED'].includes(job.status)
        )
          fail('Report a completion issue after work is completed.');
        if (
          ['message', 'issue', 'cancel', 'reject', 'reschedule', 'complete'].includes(action) &&
          !dto.note?.trim()
        )
          fail('Please add a note or reason.', HttpStatus.BAD_REQUEST);
        if (action === 'accept' || action === 'reschedule') {
          const at = action === 'reschedule' ? new Date(dto.scheduledAt ?? '') : job.scheduledAt;
          if (!Number.isFinite(at.getTime()) || at <= new Date())
            fail('Select a future visit time.');
          if (
            action === 'reschedule' &&
            !['REQUESTED', 'GARDENER_ASSIGNED', 'ACCEPTED'].includes(job.status)
          )
            fail('This visit cannot be rescheduled.');
          const address = await tx.address.findFirst({
            where: { id: job.addressId, userId: job.userId },
          });
          if (
            !job.gardener?.profileComplete ||
            !job.gardener.active ||
            !address ||
            !canWork(
              job.gardener,
              at,
              job.service.durationMinutes,
              job.serviceId,
              address.postalCode,
            )
          )
            fail('Gardener is unavailable for that service, area or time.');
          const candidates = await tx.serviceBooking.findMany({
            where: {
              id: { not: id },
              gardenerId: job.gardenerId,
              status: { notIn: closedJobs },
              scheduledAt: { lt: new Date(at.getTime() + job.service.durationMinutes * 60_000) },
            },
            include: { service: true },
          });
          if (
            candidates.some(
              (other) =>
                other.scheduledAt.getTime() + other.service.durationMinutes * 60_000 > at.getTime(),
            )
          )
            fail('This visit conflicts with another job.');
        }
        const now = new Date();
        const update: Prisma.ServiceBookingUpdateInput = transition
          ? { status: transition.to }
          : {};
        if (action === 'reschedule') update.scheduledAt = new Date(dto.scheduledAt!);
        if (action === 'start') update.visitStartedAt = now;
        if (action === 'complete') {
          const proof = await tx.bookingActivity.findMany({
            where: { bookingId: id, kind: { in: ['photo', 'work'] } },
          });
          for (const plantId of job.plantIds) {
            const photos = proof
              .filter((entry) => entry.kind === 'photo' && entry.plantId === plantId)
              .map((entry) => (entry.data as { input?: { phase?: string } }).input?.phase);
            if (
              !photos.includes('BEFORE') ||
              !photos.includes('AFTER') ||
              !proof.some((entry) => entry.kind === 'work' && entry.plantId === plantId)
            )
              fail(
                'Each linked plant needs before/after photos and confirmed work (or no action).',
              );
          }
          if (!job.plantIds.length)
            fail('Link at least one customer plant before completing this plant-care visit.');
          update.completedAt = now;
          update.completionNotes = dto.note;
          await tx.gardener.update({
            where: { id: job.gardenerId! },
            data: { jobsCompleted: { increment: 1 } },
          });
          const rate = job.service.commissionBps;
          const fee =
            rate !== null && rate >= 0 && rate <= 10000
              ? job.price.mul(rate).div(10000).toDecimalPlaces(2)
              : null;
          await tx.gardenerPayout.create({
            data: {
              bookingId: id,
              gardenerId: job.gardenerId!,
              gross: job.price,
              platformFee: fee,
              net: fee === null ? null : job.price.sub(fee),
            },
          });
        }
        if (action === 'confirm') {
          update.confirmedAt = now;
          if (dto.rating) update.rating = dto.rating;
        }
        if (action === 'issue') update.issue = dto.note;
        if (action === 'observation') {
          if (
            !dto.plantId ||
            !dto.observations ||
            Object.keys(dto.observations).length > 12 ||
            Object.values(dto.observations).some((v) => typeof v !== 'string' || v.length > 500)
          )
            fail('Select a plant and add up to 12 short observations.', HttpStatus.BAD_REQUEST);
          await tx.plantEvent.create({
            data: {
              plantId: dto.plantId,
              userId: job.userId,
              type: 'SYMPTOM_REPORTED',
              note: dto.note,
              value: json({
                observations: dto.observations,
                gardenerId: job.gardenerId,
                bookingId: id,
              }),
              source: 'GARDENER_OBSERVATION',
              confidence: 1,
            },
          });
        }
        if (action === 'photo') {
          const duplicate = await tx.bookingActivity.findFirst({
            where: {
              bookingId: id,
              kind: 'photo',
              data: { path: ['input', 'photoUrl'], equals: dto.photoUrl! },
            },
          });
          if (duplicate)
            fail('This photo is already recorded. Capture a new photo for fresh evidence.');
          await tx.plantPhoto.create({
            data: {
              plantId: dto.plantId!,
              userId: job.userId,
              url: dto.photoUrl!,
              source: 'GARDENER_OBSERVATION',
            },
          });
        }
        if (action === 'work') {
          if (!dto.plantId || !dto.work || !dto.note?.trim())
            fail('Select the plant, performed work and a short work note.', HttpStatus.BAD_REQUEST);
          const careTypes: Record<string, CareType> = {
            WATER: 'WATER',
            FERTILIZE: 'FERTILIZE',
            PRUNE: 'PRUNE',
            REPOT: 'REPOT',
          };
          if (careTypes[dto.work])
            await tx.careEvent.create({
              data: {
                plantId: dto.plantId,
                type: careTypes[dto.work]!,
                note: dto.note,
                caredAt: now,
              },
            });
          if (dto.work === 'WATER')
            await tx.gardenPlant.update({
              where: { id: dto.plantId },
              data: { lastWateredAt: now },
            });
          const types: Record<string, PlantEventType> = {
            WATER: 'WATERED',
            FERTILIZE: 'FERTILIZED',
            REPOT: 'REPOTTED',
            MOVE: 'MOVED',
            INSPECT: 'USER_NOTE',
            NO_ACTION: 'USER_NOTE',
          };
          const event = await tx.plantEvent.create({
            data: {
              plantId: dto.plantId,
              userId: job.userId,
              type: types[dto.work] ?? 'TREATMENT_APPLIED',
              source: 'GARDENER_OBSERVATION',
              note: dto.note,
              value: json({ action: dto.work, bookingId: id, gardenerId: job.gardenerId }),
              confidence: 1,
            },
          });
          if (['PEST_TREATMENT', 'FUNGUS_TREATMENT', 'REPOT', 'SOIL_CHANGE'].includes(dto.work)) {
            await tx.recoveryCheckpoint.createMany({
              data: [3, 7, 14].map((dayOffset) => ({
                plantId: dto.plantId!,
                userId: job.userId,
                treatmentEventId: event.id,
                dayOffset,
                dueAt: new Date(now.getTime() + dayOffset * 86_400_000),
              })),
            });
          }
        }
        if (action === 'outcome') {
          if (!dto.plantId || !dto.outcome || !dto.note?.trim())
            fail(
              'Select a plant and record the observed outcome with evidence.',
              HttpStatus.BAD_REQUEST,
            );
          const outcome = dto.outcome === 'STABLE' ? 'UNKNOWN' : (dto.outcome as PlantOutcomeType);
          await tx.plantOutcomeRecord.create({
            data: {
              plantId: dto.plantId,
              userId: job.userId,
              outcome,
              reason: `${dto.outcome}: ${dto.note}`,
              source: 'USER_REPORTED',
              confidence: 1,
            },
          });
          await tx.plantEvent.create({
            data: {
              plantId: dto.plantId,
              userId: job.userId,
              type: 'OUTCOME_RECORDED',
              note: dto.note,
              source: 'USER_REPORTED',
              value: json({ outcome: dto.outcome, bookingId: id }),
            },
          });
        }
        await tx.serviceBooking.update({ where: { id }, data: update });
        if (['arrive', 'complete', 'cancel', 'reject', 'reschedule'].includes(action))
          await tx.bookingActivity.deleteMany({
            where: { bookingId: id, kind: 'TRACKING_LOCATION' },
          });
        if (action === 'confirm' && dto.rating) {
          const average = await tx.serviceBooking.aggregate({
            where: { gardenerId: job.gardenerId, rating: { not: null } },
            _avg: { rating: true },
          });
          await tx.gardener.update({
            where: { id: job.gardenerId! },
            data: { rating: average._avg.rating ?? 0 },
          });
        }
        await tx.bookingActivity.create({
          data: {
            bookingId: id,
            actorId: userId,
            requestId: dto.requestId,
            kind: action,
            plantId: dto.plantId,
            data: json({
              input: dto,
              from: job.status,
              to: transition?.to ?? job.status,
              source: customer ? 'CUSTOMER_STATEMENT' : 'GARDENER_OBSERVATION',
            }),
          },
        });
        const recipient = customer ? job.gardener?.userId : job.userId;
        if (recipient && !['observation', 'photo', 'work'].includes(action))
          await tx.notification.create({
            data: {
              userId: recipient,
              type: `GARDENER_${action.toUpperCase()}`,
              title: `Visit ${action === 'complete' ? 'completed' : action}`,
              message: `${job.bookingNumber}: ${dto.note ?? transition?.to ?? action}`,
            },
          });
        return { status: transition?.to ?? job.status, saved: true, replay: false };
      },
      { timeout: 20_000 },
    );
    this.trackingEvents.publish(id);
    return result;
  }
  photoUrl(value: string, userId: string): void {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.origin !== new URL(process.env.SUPABASE_URL!).origin ||
      !url.pathname.startsWith(`/storage/v1/object/public/user-photos/${userId}/`)
    )
      fail('Use a photo uploaded by your account.', HttpStatus.FORBIDDEN);
  }
  async earnings(
    userId: string,
    page: number,
  ): Promise<{
    rows: GardenerPayout[];
    totals: {
      _sum: {
        gross: Prisma.Decimal | null;
        net: Prisma.Decimal | null;
        platformFee: Prisma.Decimal | null;
      };
      _count: number;
    };
    paid: Prisma.Decimal | null;
    pending: Prisma.Decimal | null;
    unconfiguredCount: number;
  }> {
    const g = await this.profile(userId, true);
    const [rows, totals, paid, pending, unresolved] = await Promise.all([
      this.db.gardenerPayout.findMany({
        where: { gardenerId: g.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 25,
        take: 25,
      }),
      this.db.gardenerPayout.aggregate({
        where: { gardenerId: g.id },
        _sum: { gross: true, net: true, platformFee: true },
        _count: true,
      }),
      this.db.gardenerPayout.aggregate({
        where: { gardenerId: g.id, status: 'PAID' },
        _sum: { net: true },
      }),
      this.db.gardenerPayout.aggregate({
        where: { gardenerId: g.id, status: 'PENDING' },
        _sum: { net: true },
      }),
      this.db.gardenerPayout.count({ where: { gardenerId: g.id, net: null } }),
    ]);
    return {
      rows,
      totals,
      paid: paid._sum.net,
      pending: pending._sum.net,
      unconfiguredCount: unresolved,
    };
  }
  async chat(userId: string, dto: GardenerChatDto): Promise<{ reply: string }> {
    const g = await this.profile(userId, true);
    let context: unknown;
    if (dto.jobId) {
      const detail = await this.detail(userId, dto.jobId);
      if (['REQUESTED', 'GARDENER_ASSIGNED', 'REJECTED', 'CANCELLED'].includes(detail.status))
        fail('Accept the job before requesting its AI case brief.', HttpStatus.FORBIDDEN);
      if (dto.plantId && !detail.plants.some((p) => p.id === dto.plantId))
        fail('Plant is not authorized.', HttpStatus.FORBIDDEN);
      // Exclude address and contact details from provider requests.
      context = {
        service: detail.service.title,
        problem: detail.notes,
        plants: dto.plantId ? detail.plants.filter((p) => p.id === dto.plantId) : detail.plants,
        activities: detail.activities,
        photoEvidence: 'Only metadata is supplied; do not claim to inspect images.',
      };
    } else context = await this.jobs(userId);
    return {
      reply: await this.ai.generate(
        dto.message,
        {
          garden: [],
          memories: [],
          intent: 'OTHER',
          plantId: dto.plantId ?? null,
          sourcesUsed: ['authorized_gardener_job'],
          promptContext: `You assist gardener ${g.name}. Prepare a concise inspection brief or answer using only the authorized job evidence. Keep AI inference, customer statements and gardener observations distinct. No work is performed by this chat.\n${JSON.stringify(context)}`,
        },
        undefined,
        [],
        dto.language,
      ),
    };
  }
  assertAdmin(user: AuthenticatedUser): void {
    if (user.role !== 'ADMIN') fail('Admin permission required.', HttpStatus.FORBIDDEN);
  }
  async verify(
    user: AuthenticatedUser,
    id: string,
    verified: boolean,
    reason = 'Gardener verification updated',
  ): Promise<Gardener> {
    this.assertAdmin(user);
    if (!this.adminAccess) fail('Admin permissions unavailable.', HttpStatus.FORBIDDEN);
    await this.adminAccess.require(user, 'gardeners.approve');
    return this.db.$transaction(async (tx) => {
      const before = await tx.gardener.findUniqueOrThrow({ where: { id } });
      const after = await tx.gardener.update({
        where: { id },
        data: { verified, ...(!verified ? { available: false } : {}) },
      });
      await tx.adminAuditLog.create({
        data: {
          actorId: user.id,
          action: 'gardeners.verify',
          entity: 'gardeners',
          entityId: id,
          reason,
          before: json({ verified: before.verified }),
          after: json({ verified }),
        },
      });
      return after;
    });
  }
  async payout(
    user: AuthenticatedUser,
    id: string,
    reference: string,
    reason = 'Payout recorded',
  ): Promise<GardenerPayout> {
    this.assertAdmin(user);
    if (!this.adminAccess) fail('Admin permissions unavailable.', HttpStatus.FORBIDDEN);
    await this.adminAccess.require(user, 'finance.update');
    if (!reference.trim()) fail('A payment reference is required.', HttpStatus.BAD_REQUEST);
    return this.db.$transaction(async (tx) => {
      const row = await tx.gardenerPayout.findUniqueOrThrow({
        where: { id },
        include: { booking: true, gardener: true },
      });
      if (row.status === 'PAID' && row.reference === reference) return row;
      if (
        row.net === null ||
        row.booking.issue ||
        !['CUSTOMER_CONFIRMED', 'OUTCOME_RECORDED'].includes(row.booking.status)
      )
        fail('Confirmed, undisputed work and configured commission are required.');
      const result = await tx.gardenerPayout.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'PAID', reference, paidAt: new Date() },
      });
      if (!result.count) fail('Payout has already been recorded.');
      if (row.gardener.userId)
        await tx.notification.create({
          data: {
            userId: row.gardener.userId,
            title: 'Payout recorded',
            message: `Payment reference: ${reference}`,
            type: 'GARDENER_PAYOUT',
          },
        });
      await tx.adminAuditLog.create({
        data: {
          actorId: user.id,
          action: 'payouts.paid',
          entity: 'payouts',
          entityId: id,
          reason,
          before: json({ status: row.status }),
          after: json({ status: 'PAID', reference }),
        },
      });
      return tx.gardenerPayout.findUniqueOrThrow({ where: { id } });
    });
  }
}
