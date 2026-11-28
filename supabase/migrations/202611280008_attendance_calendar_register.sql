-- StudentMonitor Phase 3: dated attendance registers, instructor corrections,
-- auditable finalization, and safe cancellation.
-- ADDITIVE migration. Requires the reviewed 001–006 schema, including the
-- official private roster. Does not change existing attendance_records rows.
-- No historical register is backfilled automatically: the current roster may
-- not represent an earlier semester's membership.
BEGIN;

CREATE TABLE IF NOT EXISTS public.attendance_session_reviews (
  window_id bigint PRIMARY KEY REFERENCES public.attendance_windows(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft','Finalized','Cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  finalized_by uuid REFERENCES auth.users(id),
  finalization_note text,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id),
  cancellation_reason text
);
CREATE INDEX IF NOT EXISTS attendance_session_reviews_status_idx
  ON public.attendance_session_reviews(status,window_id);

-- Historical snapshot of the section roster at FIRST opening of a window.
-- This table is NOT a second or independently managed enrollment database.
-- One row per official student per real attendance window, including students
-- who have not registered a GitHub account.
CREATE TABLE IF NOT EXISTS public.attendance_register_entries (
  window_id bigint NOT NULL REFERENCES public.attendance_windows(id) ON DELETE RESTRICT,
  student_number text NOT NULL REFERENCES public.student_roster(student_number),
  student_name_snapshot text NOT NULL CHECK (length(trim(student_name_snapshot))>0),
  section_id_snapshot bigint NOT NULL REFERENCES public.sections(id),
  linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_status text CHECK (recorded_status IN ('Present','Late','Absent','Excused','Not Yet Recorded')),
  remarks text CHECK (remarks IS NULL OR length(remarks)<=500),
  corrected_by uuid REFERENCES auth.users(id),
  corrected_at timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (window_id,student_number)
);
CREATE INDEX IF NOT EXISTS attendance_register_student_idx
  ON public.attendance_register_entries(student_number,window_id);

ALTER TABLE public.attendance_session_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_register_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_session_reviews,public.attendance_register_entries
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.attendance_session_reviews,public.attendance_register_entries
  TO authenticated;
DROP POLICY IF EXISTS attendance_reviews_admin_read ON public.attendance_session_reviews;
CREATE POLICY attendance_reviews_admin_read ON public.attendance_session_reviews
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS attendance_register_admin_read ON public.attendance_register_entries;
CREATE POLICY attendance_register_admin_read ON public.attendance_register_entries
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- A new attendance window creates a private snapshot automatically, even when
-- the instructor's browser is closed afterwards. Existing historical sessions
-- are not retroactively seeded. Reopening an old window can seed it exactly
-- once and does not overwrite historical snapshot rows.
CREATE OR REPLACE FUNCTION public.seed_attendance_register()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_section_id bigint;
BEGIN
  SELECT s.section_id INTO v_section_id
    FROM public.class_schedules s WHERE s.id=NEW.schedule_id;
  IF v_section_id IS NULL THEN RAISE EXCEPTION 'Attendance class schedule not found'; END IF;
  INSERT INTO public.attendance_session_reviews(window_id)
    VALUES(NEW.id) ON CONFLICT(window_id) DO NOTHING;
  INSERT INTO public.attendance_register_entries(
    window_id,student_number,student_name_snapshot,section_id_snapshot,linked_user_id
  )
  SELECT NEW.id,r.student_number,r.full_name,r.section_id,r.linked_user_id
  FROM public.student_roster r
  WHERE r.section_id=v_section_id AND r.active
  ON CONFLICT(window_id,student_number) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS attendance_register_seed_new_window ON public.attendance_windows;
CREATE TRIGGER attendance_register_seed_new_window
AFTER INSERT OR UPDATE OF opened_at ON public.attendance_windows
FOR EACH ROW EXECUTE FUNCTION public.seed_attendance_register();

-- Finalized/cancelled attendance may never be silently reopened by old
-- scheduled or force-open RPCs. These checks occur in PostgreSQL, not the UI.
CREATE OR REPLACE FUNCTION public.prevent_attendance_reopening()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Existing open_class_attendance RPC uses UPSERT and may change opened_at
  -- while is_open was already true but expired. Reject that as reopening too.
  IF NEW.is_open AND
    (NOT OLD.is_open OR NEW.opened_at IS DISTINCT FROM OLD.opened_at)
    AND EXISTS(
      SELECT 1 FROM public.attendance_session_reviews v
        WHERE v.window_id=OLD.id AND v.status IN ('Finalized','Cancelled')
    ) THEN
    RAISE EXCEPTION 'This attendance session has been finalized or cancelled and cannot be reopened';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS attendance_prevent_reviewed_reopen ON public.attendance_windows;
CREATE TRIGGER attendance_prevent_reviewed_reopen
BEFORE UPDATE OF is_open ON public.attendance_windows
FOR EACH ROW EXECUTE FUNCTION public.prevent_attendance_reopening();

-- Deliberate preparation for a LEGACY window that predates this migration.
-- Instructor must confirm current roster may not equal historical membership.
-- Never modify existing attendance_records or overwrite captured entries.
CREATE OR REPLACE FUNCTION public.admin_prepare_attendance_register(p_window_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_window public.attendance_windows%ROWTYPE; v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.portal_session_active() OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator session required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_window FROM public.attendance_windows WHERE id=p_window_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance session not found'; END IF;
  IF v_window.meeting_date>(now() AT TIME ZONE 'Asia/Manila')::date THEN
    RAISE EXCEPTION 'Future attendance session cannot be prepared';
  END IF;
  IF EXISTS(SELECT 1 FROM public.attendance_session_reviews WHERE window_id=v_window.id) THEN
    RAISE EXCEPTION 'Register already exists. Existing roster snapshots cannot be replaced';
  END IF;
  INSERT INTO public.attendance_session_reviews(window_id) VALUES(v_window.id);
  INSERT INTO public.attendance_register_entries(
    window_id,student_number,student_name_snapshot,section_id_snapshot,linked_user_id
  )
  SELECT v_window.id,r.student_number,r.full_name,r.section_id,r.linked_user_id
    FROM public.student_roster r
    JOIN public.class_schedules s ON s.id=v_window.schedule_id
    WHERE r.active AND r.section_id=s.section_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  INSERT INTO public.audit_logs(actor_id,action,details)
  VALUES(auth.uid(),'attendance.historical_roster_prepared',
    pg_catalog.jsonb_build_object('window_id',v_window.id,
      'meeting_date',v_window.meeting_date,'member_count',v_count,
      'caution','Current official section roster used, not historical enrollment snapshot'));
  RETURN v_count;
END; $$;

-- Manual status and corrections are stored independently of the immutable
-- student check-in record. A present check-in remains in attendance_records;
-- corrected status takes precedence only for instructor reporting.
CREATE OR REPLACE FUNCTION public.admin_set_attendance_status(
  p_window_id bigint,p_student_number text,p_status text,p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_window public.attendance_windows%ROWTYPE;
  v_session public.attendance_session_reviews%ROWTYPE;
  v_entry public.attendance_register_entries%ROWTYPE;
  v_status text;
  v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.portal_session_active() OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator session required' USING ERRCODE='42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN
    ('Present','Late','Absent','Excused','Not Yet Recorded') THEN
    RAISE EXCEPTION 'Invalid attendance status';
  END IF;
  IF length(v_reason)<8 OR length(v_reason)>500 THEN
    RAISE EXCEPTION 'Provide a correction reason of 8–500 characters';
  END IF;
  SELECT * INTO v_window FROM public.attendance_windows WHERE id=p_window_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance session not found'; END IF;
  SELECT * INTO v_session FROM public.attendance_session_reviews
    WHERE window_id=p_window_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prepare the attendance register first'; END IF;
  IF v_session.status='Cancelled' THEN
    RAISE EXCEPTION 'Cancelled attendance cannot be corrected';
  END IF;
  IF p_status='Absent' AND v_window.is_open AND v_window.expires_at>now() THEN
    RAISE EXCEPTION 'Cannot mark absent while the check-in window is still active';
  END IF;
  SELECT * INTO v_entry FROM public.attendance_register_entries
    WHERE window_id=p_window_id AND student_number=btrim(coalesce(p_student_number,''))
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student is not in the captured attendance roster';
  END IF;
  -- Explicit Not Yet Recorded overrides even an erroneous check-in without deleting it.
  v_status:=p_status;
  IF v_entry.recorded_status IS NOT DISTINCT FROM v_status THEN
    RAISE EXCEPTION 'No change to the recorded attendance status';
  END IF;
  UPDATE public.attendance_register_entries
    SET recorded_status=v_status,remarks=v_reason,
      corrected_by=auth.uid(),corrected_at=now()
    WHERE window_id=p_window_id AND student_number=v_entry.student_number;
  INSERT INTO public.audit_logs(actor_id,action,subject_user_id,details)
  VALUES(auth.uid(),'attendance.status.corrected',v_entry.linked_user_id,
    pg_catalog.jsonb_build_object('window_id',p_window_id,
      'student_number',v_entry.student_number,
      'old_status',coalesce(v_entry.recorded_status,'Not Yet Recorded'),
      'new_status',p_status,'previous_session_status',v_session.status,
      'reason',v_reason));
END; $$;

-- Finalization is an explicit decision. By default, missing check-ins remain
-- Not Yet Recorded. Setting mark_absent=true converts only unrecorded
-- students in THIS captured session and only when the session has closed.
CREATE OR REPLACE FUNCTION public.admin_finalize_attendance_session(
  p_window_id bigint,p_mark_absent boolean,p_reason text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_window public.attendance_windows%ROWTYPE;
  v_session public.attendance_session_reviews%ROWTYPE;
  v_reason text:=btrim(coalesce(p_reason,''));
  v_count integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.portal_session_active() OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator session required' USING ERRCODE='42501';
  END IF;
  IF p_mark_absent IS NULL OR length(v_reason)<8 OR length(v_reason)>500 THEN
    RAISE EXCEPTION 'Choose an absence policy and enter a reason (8–500 characters)';
  END IF;
  SELECT * INTO v_window FROM public.attendance_windows WHERE id=p_window_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance session not found'; END IF;
  IF v_window.is_open AND v_window.expires_at>now() THEN
    RAISE EXCEPTION 'Close or wait for the attendance window to expire before finalizing';
  END IF;
  SELECT * INTO v_session FROM public.attendance_session_reviews
    WHERE window_id=p_window_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prepare the attendance register first'; END IF;
  IF v_session.status<>'Draft' THEN
    RAISE EXCEPTION 'Attendance session is already finalized or cancelled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.attendance_register_entries
    WHERE window_id=p_window_id) THEN
    RAISE EXCEPTION 'Cannot finalize an empty official attendance register';
  END IF;
  -- Original check-ins without captured roster identities must be reconciled.
  IF EXISTS (
    SELECT 1 FROM public.attendance_records a
    LEFT JOIN public.student_profiles p ON p.user_id=a.student_id
    WHERE a.attendance_window_id=p_window_id
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance_register_entries e
        WHERE e.window_id=p_window_id
          AND (e.linked_user_id=a.student_id OR
               (p.student_number IS NOT NULL AND e.student_number=p.student_number))
      )
  ) THEN
    RAISE EXCEPTION 'Unmatched historical check-in. Review class membership before finalization';
  END IF;
  IF p_mark_absent THEN
    UPDATE public.attendance_register_entries e SET
      recorded_status='Absent',remarks='Marked absent on instructor finalization: '||v_reason,
      corrected_by=auth.uid(),corrected_at=now()
    WHERE e.window_id=p_window_id
      AND (e.recorded_status IS NULL OR e.recorded_status='Not Yet Recorded')
      AND NOT EXISTS(
        SELECT 1 FROM public.attendance_records a
        LEFT JOIN public.student_profiles p ON p.user_id=a.student_id
        WHERE a.attendance_window_id=p_window_id
          AND (a.student_id=e.linked_user_id OR p.student_number=e.student_number)
      );
    GET DIAGNOSTICS v_count=ROW_COUNT;
  END IF;
  UPDATE public.attendance_session_reviews SET
    status='Finalized',finalized_at=now(),finalized_by=auth.uid(),finalization_note=v_reason
    WHERE window_id=p_window_id;
  INSERT INTO public.audit_logs(actor_id,action,details)
  VALUES(auth.uid(),'attendance.session.finalized',
    pg_catalog.jsonb_build_object('window_id',p_window_id,
      'marked_absent',v_count,'absence_policy_enabled',p_mark_absent,
      'reason',v_reason));
  RETURN v_count;
END; $$;

-- Cancellation retains all check-in records and captured rosters. It is not a
-- delete operation, and cancelled sessions are excluded from official reports.
CREATE OR REPLACE FUNCTION public.admin_cancel_attendance_session(
  p_window_id bigint,p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_window public.attendance_windows%ROWTYPE;
  v_session public.attendance_session_reviews%ROWTYPE;
  v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.portal_session_active() OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator session required' USING ERRCODE='42501';
  END IF;
  IF length(v_reason)<8 OR length(v_reason)>500 THEN
    RAISE EXCEPTION 'Cancellation reason must be 8–500 characters';
  END IF;
  SELECT * INTO v_window FROM public.attendance_windows WHERE id=p_window_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance session not found'; END IF;
  SELECT * INTO v_session FROM public.attendance_session_reviews
    WHERE window_id=p_window_id FOR UPDATE;
  IF NOT FOUND OR v_session.status<>'Draft' THEN
    RAISE EXCEPTION 'Only prepared draft attendance sessions can be cancelled';
  END IF;
  UPDATE public.attendance_windows SET is_open=false,closed_at=coalesce(closed_at,now())
    WHERE id=p_window_id;
  UPDATE public.attendance_session_reviews
    SET status='Cancelled',cancelled_at=now(),cancelled_by=auth.uid(),
      cancellation_reason=v_reason
    WHERE window_id=p_window_id;
  INSERT INTO public.audit_logs(actor_id,action,details)
  VALUES(auth.uid(),'attendance.session.cancelled',
    pg_catalog.jsonb_build_object('window_id',p_window_id,'reason',v_reason));
END; $$;

REVOKE ALL ON FUNCTION public.seed_attendance_register(),
  public.prevent_attendance_reopening(),
  public.admin_prepare_attendance_register(bigint),
  public.admin_set_attendance_status(bigint,text,text,text),
  public.admin_finalize_attendance_session(bigint,boolean,text),
  public.admin_cancel_attendance_session(bigint,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepare_attendance_register(bigint),
  public.admin_set_attendance_status(bigint,text,text,text),
  public.admin_finalize_attendance_session(bigint,boolean,text),
  public.admin_cancel_attendance_session(bigint,text)
  TO authenticated;
COMMIT;
