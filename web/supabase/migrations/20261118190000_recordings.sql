-- Live recordings become lessons.
--
-- The live video server records a session into the private `recordings` file store. When the
-- recording is finished it says so, and Floor's server calls live_recording_saved, which queues
-- a job. The job hands the file to the video host, which fetches it, and then calls
-- live_recording_handed: that makes the draft lesson in "Live recordings", gives it the video,
-- and queues the file's removal a day later, once the video host certainly has its own copy.
--
-- Both functions are for Floor's server only.

-- A session's recording is finished and in the file store.
create function public.live_recording_saved(p_session uuid, p_egress text, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.live_sessions%rowtype;
begin
  select * into v_session from public.live_sessions l where l.id = p_session for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  -- A report about some other recording of the same room, or one already dealt with, changes nothing.
  if v_session.egress_id is not null and v_session.egress_id <> p_egress then
    return;
  end if;
  if v_session.recording_status = 'saved' or v_session.lesson_id is not null then
    return;
  end if;
  update public.live_sessions l
     set recording_status = 'saving', egress_id = p_egress, recording_path = p_path
   where l.id = p_session;
  perform private.enqueue('recording', v_session.space_id, jsonb_build_object('session_id', p_session));
end;
$$;

-- The video host has taken the recording. Answers with the draft lesson it became.
create function public.live_recording_handed(p_session uuid, p_provider text, p_video_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.live_sessions%rowtype;
  v_lesson uuid;
begin
  select * into v_session from public.live_sessions l where l.id = p_session;
  if not found then
    raise exception 'session_not_found';
  end if;
  v_lesson := public.live_recording_lesson(p_session);
  perform public.set_lesson_video(v_lesson, p_provider, p_video_id, 'processing');
  if v_session.recording_path is not null then
    perform private.enqueue(
      'files_delete', v_session.space_id,
      jsonb_build_object('bucket', 'recordings', 'paths', jsonb_build_array(v_session.recording_path)),
      now() + interval '1 day'
    );
  end if;
  perform public.live_recording(p_session, 'saved');
  return v_lesson;
end;
$$;

revoke all on function public.live_recording_saved(uuid, text, text) from public, anon, authenticated;
revoke all on function public.live_recording_handed(uuid, text, text) from public, anon, authenticated;
grant execute on function public.live_recording_saved(uuid, text, text) to service_role;
grant execute on function public.live_recording_handed(uuid, text, text) to service_role;
