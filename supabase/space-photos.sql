-- Run once in the Supabase SQL editor for the GreenNest project.
-- Space photos stay private and each user can access only their own folder.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'space-photos',
  'space-photos',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload their own space photos" on storage.objects;
create policy "Users upload their own space photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'space-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users read their own space photos" on storage.objects;
create policy "Users read their own space photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'space-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users update their own space photos" on storage.objects;
create policy "Users update their own space photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'space-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'space-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users delete their own space photos" on storage.objects;
create policy "Users delete their own space photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'space-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
