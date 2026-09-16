import { BookingStatus, type Gardener } from '@prisma/client';

export const closedJobs: BookingStatus[] = [
  'COMPLETED',
  'CUSTOMER_CONFIRMED',
  'OUTCOME_RECORDED',
  'CANCELLED',
  'REJECTED',
  'NO_SHOW',
];
export const jobTransitions: Record<string, { from: BookingStatus[]; to: BookingStatus }> = {
  accept: { from: ['REQUESTED', 'GARDENER_ASSIGNED'], to: 'ACCEPTED' },
  reject: { from: ['REQUESTED', 'GARDENER_ASSIGNED'], to: 'REJECTED' },
  travel: { from: ['ACCEPTED'], to: 'ON_THE_WAY' },
  arrive: { from: ['ON_THE_WAY', 'ACCEPTED'], to: 'ARRIVED' },
  start: { from: ['ARRIVED'], to: 'INSPECTION' },
  begin: { from: ['INSPECTION'], to: 'IN_PROGRESS' },
  complete: { from: ['IN_PROGRESS'], to: 'COMPLETED' },
  confirm: { from: ['COMPLETED'], to: 'CUSTOMER_CONFIRMED' },
  outcome: { from: ['CUSTOMER_CONFIRMED', 'OUTCOME_RECORDED'], to: 'OUTCOME_RECORDED' },
  cancel: {
    from: ['REQUESTED', 'GARDENER_ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED'],
    to: 'CANCELLED',
  },
};

// Existing booking times use Asia/Kolkata. Postal areas are exact eligibility,
// not a claim that geographic distance has been measured.
export function canWork(
  gardener: Pick<
    Gardener,
    | 'available'
    | 'profileComplete'
    | 'workingDays'
    | 'startTime'
    | 'endTime'
    | 'serviceIds'
    | 'postalCodes'
  >,
  at: Date,
  minutes: number,
  serviceId?: string,
  postalCode?: string,
): boolean {
  const local = new Date(at.getTime() + 330 * 60_000);
  const start = local.getUTCHours() * 60 + local.getUTCMinutes();
  const toMinutes = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return (
    gardener.available &&
    gardener.profileComplete &&
    gardener.workingDays.includes(local.getUTCDay()) &&
    start >= toMinutes(gardener.startTime) &&
    start + minutes <= toMinutes(gardener.endTime) &&
    (!serviceId || gardener.serviceIds.includes(serviceId)) &&
    (!postalCode || gardener.postalCodes.includes(postalCode))
  );
}
