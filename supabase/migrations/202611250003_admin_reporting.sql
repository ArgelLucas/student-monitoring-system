-- v3: administrator corrections, detailed audit trail, and reporting indexes.
-- Run AFTER migrations 001 and 002. No existing attendance is deleted.
-- Safe on a fresh database that has already received both earlier migrations.
BEGIN;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS audit_logs_recent_idx
  ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_windows_date_idx
  ON public.attendance_windows (meeting_date DESC, schedule_id);
CREATE INDEX IF NOT EXISTS profiles_section_approval_idx
  ON public.student_profiles (section_id, is_approved);

-- Administrators may correct a student's section and primary subject.
-- This is never exposed as a direct table update to browser clients.
CREATE OR REPLACE FUNCTION public.admin_update_student_assignment(
  p_student_id uuid,
  p_section_id bigint,
  p_subject_id bigint
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_previous public.student_profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_student_id IS NULL OR p_section_id IS NULL OR p_subject_id IS NULL THEN
    RAISE EXCEPTION 'Select a valid student, section and subject';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.class_schedules s
    JOIN public.sections sec ON sec.id = s.section_id AND sec.is_active
    JOIN public.subjects sub ON sub.id = s.subject_id AND sub.is_active
    WHERE s.section_id = p_section_id AND s.subject_id = p_subject_id
  ) THEN
    RAISE EXCEPTION 'This subject is not scheduled for the selected section';
  END IF;

  SELECT * INTO v_previous FROM public.student_profiles
  WHERE user_id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student profile not found'; END IF;

  UPDATE public.student_profiles
     SET section_id = p_section_id,
         subject_id = p_subject_id,
         updated_at = now()
   WHERE user_id = p_student_id;

  INSERT INTO public.audit_logs(actor_id, action, subject_user_id, details)
  VALUES (
    auth.uid(), 'student.assignment.updated', p_student_id,
    jsonb_build_object('old_section_id', v_previous.section_id,
                       'old_subject_id', v_previous.subject_id,
                       'new_section_id', p_section_id,
                       'new_subject_id', p_subject_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_student_assignment(uuid,bigint,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_student_assignment(uuid,bigint,bigint)
  TO authenticated;

-- Keep new objects locked down and reassert RLS for preexisting data.
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

COMMIT;
