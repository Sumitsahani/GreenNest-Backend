INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-photos',
  'user-photos',
  true,
  6291456,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Users can upload their own photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'user-photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

CREATE POLICY "Users can update their own photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'user-photos' AND owner_id = (SELECT auth.uid()::text))
WITH CHECK (bucket_id = 'user-photos' AND owner_id = (SELECT auth.uid()::text));

CREATE POLICY "Users can delete their own photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'user-photos' AND owner_id = (SELECT auth.uid()::text));
