// Run with ADMIN_EMAIL and ADMIN_PASSWORD in the process environment.
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!email || !password || password.length < 8 || !key) throw new Error('ADMIN_EMAIL, ADMIN_PASSWORD (8+ characters), and server credentials are required.');
  const request = async (path, options = {}) => {
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin${path}`, { ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Auth provisioning failed (${response.status}).`);
    return response.json();
  };
  const existing = await db.$queryRaw`SELECT id, raw_app_meta_data FROM auth.users WHERE lower(email) = ${email}`;
  const metadata = { ...(existing[0]?.raw_app_meta_data ?? {}), role: 'ADMIN' };
  const user = await request(existing[0] ? `/users/${existing[0].id}` : '/users', { method: existing[0] ? 'PUT' : 'POST', body: JSON.stringify({ email, password, email_confirm: true, app_metadata: metadata, ...(!existing[0] ? { user_metadata: { name: 'GreenNest Admin' } } : {}) }) });
  const id = user.id ?? user.user?.id;
  if (!id) throw new Error('No user returned by auth provider.');
  await db.$transaction(async (tx) => {
    const before = await tx.adminStaff.findUnique({ where: { userId: id } });
    const staff = await tx.adminStaff.upsert({ where: { userId: id }, create: { userId: id, email, role: 'SUPER_ADMIN' }, update: { email, role: 'SUPER_ADMIN', active: true } });
    await tx.adminAuditLog.create({ data: { actorId: id, action: 'admin.bootstrap', entity: 'admin-users', entityId: id, reason: 'Explicit operator provisioning', before: before ? { role: before.role, active: before.active } : undefined, after: { role: staff.role, active: staff.active } } });
  });
  console.log(`Provisioned ${email} as SUPER_ADMIN. Password is not stored in application code.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
