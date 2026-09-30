import { runtimeDatabaseUrl } from './connection-options';

describe('Runtime database pool', () => {
  it('caps connections and bounds waits without changing the database identity', () => {
    const source = 'postgresql://user:p%40ss@db.example:5432/app?sslmode=require';
    const url = new URL(runtimeDatabaseUrl(source)!);
    expect(url.searchParams.get('connection_limit')).toBe('4');
    expect(url.searchParams.get('pool_timeout')).toBe('5');
    expect(url.searchParams.get('connect_timeout')).toBe('5');
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.password).toBe('p%40ss');
    expect(url.host).toBe('db.example:5432');
  });
  it('respects explicit URL configuration', () => {
    const url = new URL(
      runtimeDatabaseUrl('postgres://u:p@db/app?connection_limit=2&pool_timeout=8', 4)!,
    );
    expect(url.searchParams.get('connection_limit')).toBe('2');
    expect(url.searchParams.get('pool_timeout')).toBe('8');
  });
});
