-- StudentMonitor v6.3: explicit, temporary administrator override of class attendance.
-- Run after the existing 001–005 migrations. Does NOT alter the timetable
-- or create any student/grade records. No stored roster data in this file.
BEGIN;

ALTER TABLE public.attendance_windows
  ADD COLUMN IF NOT EXISTS is_override boolean NOT NULL DEFAULT false;

-- Students can read windows only for their approved section under existing RLS.
-- Overrides are flagged on the window; the explanation is retained only in
-- admin-visible audit_logs.details.
CREATE OR REPLACE FUNCTION public.force_open_class_attendance(
  p_schedule_id bigint, p_minutes integer, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_schedule public.class_schedules%ROWTYPE;
  v_previous public.attendance_windows%ROWTYPE;
  v_window public.attendance_windows%ROWTYPE;
  v_now timestamptz := now();
  v_manila timestamp := now() AT TIME ZONE 'Asia/Manila';
  v_end timestamptz;
  v_reason text := trim(coalesce(p_reason,''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.portal_session_active() OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an authenticated administrator may override the timetable'
      USING ERRCODE = '42501';
  END IF;
  IF p_schedule_id IS NULL THEN RAISE EXCEPTION 'Select a valid class'; END IF;
  IF p_minutes IS NULL OR p_minutes NOT IN (15,30,60) THEN
    RAISE EXCEPTION 'Choose a 15, 30 or 60 minute override';
  END IF;
  IF char_length(v_reason) < 10 OR char_length(v_reason) > 240 THEN
    RAISE EXCEPTION 'Provide a reason between 10 and 240 characters';
  END IF;
  SELECT s.* INTO v_schedule FROM public.class_schedules s
    JOIN public.sections sec ON sec.id=s.section_id AND sec.is_active
    JOIN public.subjects sub ON sub.id=s.subject_id AND sub.is_active
    WHERE s.id=p_schedule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active class schedule not found'; END IF;

  -- Prevent overlapping override requests for the same schedule.
  PERFORM pg_catalog.pg_advisory_xact_lock(p_schedule_id);
  SELECT * INTO v_previous FROM public.attendance_windows
    WHERE schedule_id=p_schedule_id AND meeting_date=v_manila::date
    FOR UPDATE;
  IF FOUND AND v_previous.is_open AND v_previous.opened_at<=v_now
     AND v_previous.expires_at>v_now THEN
    RAISE EXCEPTION 'This class already has an active attendance window';
  END IF;

  -- No attendance window may spill into the next Philippine calendar date.
  v_end := LEAST(v_now+p_minutes*INTERVAL '1 minute',
    (v_manila::date+1)::timestamp AT TIME ZONE 'Asia/Manila');
  IF v_end <= v_now+INTERVAL '1 minute' THEN
    RAISE EXCEPTION 'Too close to Philippine midnight. Try on the next date';
  END IF;

  INSERT INTO public.attendance_windows (
    schedule_id,meeting_date,is_open,opened_at,expires_at,
    closed_at,created_by,is_override
  ) VALUES (
    v_schedule.id,v_manila::date,true,v_now,v_end,
    NULL,auth.uid(),true
  ) ON CONFLICT (schedule_id,meeting_date) DO UPDATE SET
    is_open=true,opened_at=EXCLUDED.opened_at,
    expires_at=EXCLUDED.expires_at,closed_at=NULL,
    created_by=EXCLUDED.created_by,is_override=true
  RETURNING * INTO v_window;

  INSERT INTO public.audit_logs(actor_id,action,details)
  VALUES (auth.uid(),'attendance.window.force_opened',
    pg_catalog.jsonb_build_object(
      'schedule_id',v_schedule.id,
      'section_id',v_schedule.section_id,
      'subject_id',v_schedule.subject_id,
      'meeting_date',v_manila::date,
      'opened_at',v_now,
      'expires_at',v_end,
      'requested_minutes',p_minutes,
      'reason',v_reason
    ));

  RETURN pg_catalog.jsonb_build_object(
    'window_id',v_window.id,'schedule_id',v_schedule.id,
    'meeting_date',v_window.meeting_date,'expires_at',v_window.expires_at,
    'is_override',true);
END;
$$;

-- Normal scheduled opening must explicitly clear the override marker, even
-- if a prior extra session for this schedule already existed on the same date.
CREATE OR REPLACE FUNCTION public.open_class_attendance(p_schedule_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $
DECLARE
  v_schedule public.class_schedules%ROWTYPE;
  v_manila timestamp := now() AT TIME ZONE 'Asia/Manila';
  v_now timestamptz := now();
  v_end timestamptz;
  v_window public.attendance_windows%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.portal_session_active() OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
  END IF;
  SELECT s.* INTO v_schedule FROM public.class_schedules s
    JOIN public.sections sec ON sec.id=s.section_id AND sec.is_active
    JOIN public.subjects sub ON sub.id=s.subject_id AND sub.is_active
    WHERE s.id=p_schedule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class schedule not found'; END IF;
  IF extract(isodow FROM v_manila)::smallint<>v_schedule.weekday OR
     v_manila::time<v_schedule.start_time OR
     v_manila::time>=v_schedule.end_time THEN
    RAISE EXCEPTION 'You may open attendance only during this class time (Asia/Manila)';
  END IF;
  v_end := (v_manila::date+v_schedule.end_time) AT TIME ZONE 'Asia/Manila';
  INSERT INTO public.attendance_windows(
    schedule_id,meeting_date,opened_at,expires_at,created_by,
    is_open,closed_at,is_override
  ) VALUES(
    v_schedule.id,v_manila::date,v_now,v_end,auth.uid(),true,NULL,false
  ) ON CONFLICT(schedule_id,meeting_date) DO UPDATE SET
    is_open=true,closed_at=NULL,opened_at=EXCLUDED.opened_at,
    expires_at=EXCLUDED.expires_at,created_by=EXCLUDED.created_by,
    is_override=false
  RETURNING * INTO v_window;
  INSERT INTO public.audit_logs(actor_id,action)
    VALUES(auth.uid(),'attendance.window.opened');
  RETURN pg_catalog.jsonb_build_object('window_id',v_window.id,
    'meeting_date',v_window.meeting_date,'expires_at',v_window.expires_at);
END;
$;

-- Re-declare the same protected check-in routine with one narrow exception:
-- an active, administrator-created override window bypasses only the weekday
-- and clock-time check. Section, approval, current PH date, open window,
-- expiration, one-check-in-per-window and audit protections remain.
CREATE OR REPLACE FUNCTION public.mark_my_attendance(p_schedule_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_profile FROM public.student_profiles WHERE user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Student profile not found'; END IF;

  SELECT s.* INTO v_schedule FROM public.class_schedules s
    JOIN public.sections sec ON sec.id=s.section_id AND sec.is_active
    JOIN public.subjects sub ON sub.id=s.subject_id AND sub.is_active
    WHERE s.id=p_schedule_id AND s.section_id=v_profile.section_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This class is not assigned to your approved section'
      USING ERRCODE = '42501';
  END IF;

  -- FOR SHARE serializes student check-ins with instructor close/override.
  SELECT * INTO v_window FROM public.attendance_windows w
    WHERE w.schedule_id=v_schedule.id
      AND w.meeting_date=v_manila::date AND w.is_open
      AND w.opened_at<=v_now AND w.expires_at>v_now
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your instructor has not opened attendance for this class';
  END IF;

  IF NOT v_window.is_override AND
     (extract(isodow FROM v_manila)::smallint<>v_schedule.weekday
      OR v_manila::time<v_schedule.start_time
      OR v_manila::time>=v_schedule.end_time) THEN
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
  ELSE
    INSERT INTO public.audit_logs(actor_id,action,subject_user_id)
    VALUES (auth.uid(),'attendance.marked',auth.uid());
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id',v_record.id,'schedule_id',v_schedule.id,
    'attendance_date',v_record.attendance_date,
    'marked_at',v_record.marked_at,'status',v_record.status);
END;
$$;

REVOKE ALL ON FUNCTION
  public.force_open_class_attendance(bigint,integer,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.force_open_class_attendance(bigint,integer,text)
  TO authenticated;
-- Preserve authorized student RPC permissions from migration 002.
REVOKE ALL ON FUNCTION public.mark_my_attendance(bigint)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_my_attendance(bigint) TO authenticated;

COMMIT;
