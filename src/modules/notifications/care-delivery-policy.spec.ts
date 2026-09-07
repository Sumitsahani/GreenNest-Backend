import { canDeliverCare } from './care-delivery-policy';

describe('care delivery policy', () => {
  const input = {
    now: new Date('2026-09-07T04:00:00Z'),
    dueAt: new Date('2026-09-06T04:00:00Z'),
    lastNotifiedAt: null,
    count: 0,
    timezone: 'Asia/Kolkata',
    preferredHour: 9,
  };
  it('allows a due reminder during daytime', () => expect(canDeliverCare(input)).toBe(true));
  it('defers during local quiet hours', () =>
    expect(canDeliverCare({ ...input, now: new Date('2026-09-07T17:00:00Z') })).toBe(false));
  it('respects a future snooze', () =>
    expect(canDeliverCare({ ...input, dueAt: new Date('2026-09-08') })).toBe(false));
  it('caps a cycle at three notifications', () =>
    expect(canDeliverCare({ ...input, count: 3 })).toBe(false));
  it('does not repeat within 24 hours', () =>
    expect(
      canDeliverCare({ ...input, count: 1, lastNotifiedAt: new Date('2026-09-06T05:00:00Z') }),
    ).toBe(false));
  it('waits for the preferred follow-up hour', () =>
    expect(
      canDeliverCare({
        ...input,
        count: 1,
        preferredHour: 18,
        lastNotifiedAt: new Date('2026-09-06T04:00:00Z'),
      }),
    ).toBe(false));
  it('allows an eligible follow-up', () =>
    expect(
      canDeliverCare({ ...input, count: 1, lastNotifiedAt: new Date('2026-09-06T04:00:00Z') }),
    ).toBe(true));
});
