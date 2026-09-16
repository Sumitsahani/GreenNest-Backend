import { canWork, jobTransitions } from './job-policy';

describe('gardener eligibility and job lifecycle', () => {
  const gardener = { available: true, profileComplete: true, workingDays: [1], startTime: '08:00', endTime: '18:00', serviceIds: ['rescue'], postalCodes: ['110001'] };
  const monday = new Date('2026-09-14T04:30:00Z');
  it('matches service, area, local day and full appointment duration', () => {
    expect(canWork(gardener, monday, 60, 'rescue', '110001')).toBe(true);
    expect(canWork(gardener, monday, 60, 'lawn', '110001')).toBe(false);
    expect(canWork(gardener, monday, 60, 'rescue', '999999')).toBe(false);
    expect(canWork({ ...gardener, available: false }, monday, 60)).toBe(false);
    expect(canWork(gardener, new Date('2026-09-14T12:00:00Z'), 60)).toBe(false);
    expect(canWork(gardener, new Date('2026-09-15T04:30:00Z'), 60)).toBe(false);
  });
  it('requires inspection, actual work and customer confirmation in order', () => {
    expect(jobTransitions.complete?.from).toEqual(['IN_PROGRESS']);
    expect(jobTransitions.confirm?.from).toEqual(['COMPLETED']);
    expect(jobTransitions.outcome?.from).not.toContain('COMPLETED');
    expect(jobTransitions.cancel?.from).not.toContain('COMPLETED');
  });
});
