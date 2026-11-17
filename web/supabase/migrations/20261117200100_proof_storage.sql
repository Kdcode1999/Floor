-- Floor: where payment and broker proofs are kept
--
-- A private bucket. A proof lives at "<space id>/<user id>/<file name>".
-- * A member may upload into their own folder of a space they belong to.
-- * The member and the staff of that space may open it. Nobody else can.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proofs',
  'proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create policy "proofs: members upload into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'proofs'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.is_member(private.try_uuid((storage.foldername(name))[1]))
  );

create policy "proofs: the member and the space's staff read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'proofs'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or private.is_staff(private.try_uuid((storage.foldername(name))[1]))
    )
  );
