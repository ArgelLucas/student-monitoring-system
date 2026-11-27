-- StudentMonitor v6.3: administrator-authorized extra attendance windows.
-- Apply AFTER migrations 001–005 using Supabase SQL Editor.
-- The regular class timetable remains unchanged. No private student records here.
BEGIN;

ALTER TABLE public.attendance_windows
  ADD COLUMN IF NOT EXISTS is_override boolean NOT NULL DEFAULT false;
ALTER TABLE public.attendance_windows
  ADD COLUMN IF NOT EXISTS override_reason text;
ALTER TABLE public.attendance_windows
  ADD COLUMN IF NOT EXISTS override_by uuid REFERENCES auth.users(id);

-- A forced window lasts at most 60 minutes and always belongs to TODAY
-- (Asia/Manila). There is still only ONE window per schedule/calendar day.
CREATE OR REPLACE FUNCTION public.force_open_class_attendance(
  p_schedule_id bigint,
  p_minutes integer,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_schedule public.class_schedules%ROWTYPE;
  v_existing public.attendance_windows%ROWTYPE;
  v_window public.attendance_windows%ROWTYPE;
  v_now timestamptz := now();
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_end timestamptz;
  v_reason text := btrim(coalesce(p_reason,''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.portal_session_active() OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator session required to override attendance'
      USING ERRCODE = '42501';
  END IF;
  IF p_minutes NOT IN (15,30,60) OR p_minutes IS NULL THEN
    RAISE EXCEPTION 'Choose a duration of 15, 30 or 60 minutes';
  END IF;
  IF length(v_reason) < 10 OR length(v_reason) > 240 THEN
    RAISE EXCEPTION 'Enter an override reason between 10 and 240 characters';
  END IF;
  SELECT s.* INTO v_schedule
    FROM public.class_schedules s
    JOIN public.sections sec ON sec.id=s.section_id AND sec.is_active
    JOIN public.subjects sub ON sub.id=s.subject_id AND sub.is_active
    WHERE s.id=p_schedule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active class schedule not found'; END IF;

  -- Serialize competing admin opens for this class and Philippine date.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('attendance-window:' || p_schedule_id::text || ':' || v_today::text,0)
  );
  SELECT * INTO v_existing FROM public.attendance_windows
    WHERE schedule_id=p_schedule_id AND meeting_date=v_today FOR UPDATE;
  IF FOUND AND v_existing.is_open AND v_existing.expires_at > v_now THEN
    RAISE EXCEPTION 'Attendance is already open for this class; close it before starting another window';
  END IF;

  -- A forced session must never extend beyond its Philippine meeting date.
  v_end := LEAST(v_now + make_interval(mins=>p_minutes),
    (v_today + 1)::timestamp AT TIME ZONE 'Asia/Manila');
  IF v_end <= v_now + interval '1 minute' THEN
    RAISE EXCEPTION 'Too close to Philippine midnight for a new attendance window';
  END IF;

  INSERT INTO public.attendance_windows (
    schedule_id,meeting_date,opened_at,expires_at,created_by,is_open,
    closed_at,is_override,override_reason,override_by
  )
  VALUES (
    p_schedule_id,v_today,v_now,v_end,
    auth.uid(),true,NULL,true,v_reason,auth.uid()
  )
  ON CONFLICT (schedule_id,meeting_date) DO UPDATE SET
    opened_at=EXCLUDED.opened_at,
    expires_at=EXCLUDED.expires_at,
    created_by=EXCLUDED.created_by,
    is_open=true,closed_at=NULL,is_override=true,
    override_reason=EXCLUDED.override_reason,override_by=EXCLUDED.override_by
  RETURNING * INTO v_window;

  INSERT INTO public.audit_logs(actor_id,action,details)
  VALUES (auth.uid(),'attendance.window.force_opened',
    pg_catalog.jsonb_build_object(
      'schedule_id',p_schedule_id,
      'window_id',v_window.id,
      'duration_minutes',p_minutes,
      'reason',v_reason,
      'expires_at',v_window.expires_at
    )
  );
  RETURN pg_catalog.jsonb_build_object(
    'window_id',v_window.id,'meeting_date',v_today,
    'expires_at',v_window.expires_at,'is_override',true
  );
END;
$$;

-- Override must not be bypassable: only the separate admin-only function
-- creates out-of-schedule windows. Regular opens keep the timetable check.
CREATE OR REPLACE FUNCTION public.open_class_attendance(p_schedule_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_schedule public.class_schedules%ROWTYPE;
  v_manila timestamp := now() AT TIME ZONE 'Asia/Manila';
  v_now timestamptz := now();
  v_end timestamptz;
  v_existing public.attendance_windows%ROWTYPE;
  v_window public.attendance_windows%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
  END IF;
  SELECT s.* INTO v_schedule FROM public.class_schedules s
  JOIN public.sections sec ON sec.id=s.section_id AND sec.is_active
  JOIN public.subjects sub ON sub.id=s.subject_id AND sub.is_active
  WHERE s.id=p_schedule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class schedule not found'; END IF;
  IF extract(isodow FROM v_manila)::smallint <> v_schedule.weekday
    OR v_manila::time < v_schedule.start_time
    OR v_manila::time >= v_schedule.end_time THEN
    RAISE EXCEPTION 'You may open attendance only during this class time (Asia/Manila)';
  END IF;
  v_end := (v_manila::date + v_schedule.end_time) AT TIME ZONE 'Asia/Manila';

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('attendance-window:' || p_schedule_id::text || ':' || v_manila::date::text,0)
  );
  SELECT * INTO v_existing FROM public.attendance_windows
    WHERE schedule_id=p_schedule_id AND meeting_date=v_manila::date FOR UPDATE;
  IF FOUND AND v_existing.is_open AND v_existing.expires_at > v_now THEN
    RAISE EXCEPTION 'Attendance is already open for this class';
  END IF;

  INSERT INTO public.attendance_windows (
    schedule_id,meeting_date,opened_at,expires_at,created_by,is_open,closed_at,
    is_override,override_reason,override_by
  ) VALUES (
    p_schedule_id,v_manila::date,v_now,v_end,auth.uid(),true,NULL,
    false,NULL,NULL
  ) ON CONFLICT (schedule_id,meeting_date) DO UPDATE SET
    is_open=true,closed_at=NULL,opened_at=EXCLUDED.opened_at,
    expires_at=EXCLUDED.expires_at,created_by=EXCLUDED.created_by,
    is_override=false,override_reason=NULL,override_by=NULL
  RETURNING * INTO v_window;

  INSERT INTO public.audit_logs(actor_id,action)
  VALUES (auth.uid(),'attendance.window.opened');
  RETURN pg_catalog.jsonb_build_object(
    'window_id',v_window.id,'meeting_date',v_window.meeting_date,'expires_at',v_window.expires_at
  );
END;
$$;

-- Students still need an approved, valid GitHub session, their own section,
-- and an admin-created live window. Only the CURRENT window's override flag
-- can bypass the usual day/time check. The student cannot set that flag.
CREATE OR REPLACE FUNCTION public.mark_my_attendance(p_schedule_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile public.student_profiles%ROWTYPE;
  v_schedule public.class_schedules%ROWTYPE;
  v_window public.attendance_windows%ROWTYPE;
  v_record public.attendance_records%ROWTYPE;
  v_now timestamptz := now();
  v_manila timestamp := now() AT TIME ZONE 'Asia/Manila';
BEGIN
  IF NOT public.is_approved_student() THEN
    RAISE EXCEPTION 'Approved student account and valid session required'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_profile FROM public.student_profiles
    WHERE user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Student profile not found'; END IF;
  SELECT s.* INTO v_schedule FROM public.class_schedules s
  JOIN public.sections sec ON sec.id=s.section_id AND sec.is_active
  JOIN public.subjects sub ON sub.id=s.subject_id AND sub.is_active
  WHERE s.id=p_schedule_id AND s.section_id=v_profile.section_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This class is not assigned to your approved section'
      USING ERRCODE='42501';
  END IF;

  -- Locks serialize check-in with an instructor closing an open window.
  SELECT * INTO v_window FROM public.attendance_windows w
    WHERE w.schedule_id=v_schedule.id
    AND w.meeting_date=v_manila::date
    AND w.is_open
    AND w.opened_at<=v_now AND w.expires_at>v_now
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your instructor has not opened attendance for this class';
  END IF;
  IF NOT v_window.is_override AND (
    extract(isodow FROM v_manila)::smallint <> v_schedule.weekday
    OR v_manila::time < v_schedule.start_time
    OR v_manila::time >= v_schedule.end_time
  ) THEN
    RAISE EXCEPTION 'Attendance is only available during your scheduled class in Philippine time';
  END IF;

  INSERT INTO public.attendance_records(
    student_id,subject_id,attendance_date,attendance_window_id
  ) VALUES (
    auth.uid(),v_schedule.subject_id,v_manila::date,v_window.id
  ) ON CONFLICT DO NOTHING
  RETURNING * INTO v_record;

  IF v_record.id IS NULL THEN
    SELECT * INTO v_record FROM public.attendance_records
      WHERE student_id=auth.uid() AND attendance_window_id=v_window.id;
    IF v_record.id IS NULL THEN
      RAISE EXCEPTION 'Attendance already recorded for this meeting';
    END IF;
  ELSE
    INSERT INTO public.audit_logs(actor_id,action,subject_user_id)
    VALUES (auth.uid(),'attendance.marked',auth.uid());
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'id',v_record.id,'schedule_id',v_schedule.id,
    'attendance_date',v_record.attendance_date,'marked_at',v_record.marked_at,
    'status',v_record.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.force_open_class_attendance(bigint,integer,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.force_open_class_attendance(bigint,integer,text)
  TO authenticated;

-- Existing grants from migration 002 remain; ensure they are not exposed to anon.
REVOKE ALL ON FUNCTION public.open_class_attendance(bigint),
  public.mark_my_attendance(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_class_attendance(bigint),
  public.mark_my_attendance(bigint) TO authenticated;
COMMIT;
