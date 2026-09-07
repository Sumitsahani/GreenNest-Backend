export function canDeliverCare(input: {
  now: Date;
  dueAt: Date;
  lastNotifiedAt: Date | null;
  count: number;
  timezone: string;
  preferredHour: number;
}): boolean {
  if (input.dueAt > input.now || input.count >= 3) return false;
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: input.timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(input.now),
  );
  if (hour < 8 || hour >= 21) return false;
  if (!input.lastNotifiedAt) return true;
  return (
    input.now.getTime() - input.lastNotifiedAt.getTime() >= 86_400_000 &&
    hour >= input.preferredHour
  );
}
