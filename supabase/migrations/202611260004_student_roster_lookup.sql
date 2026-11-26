-- StudentMonitor v6.1: private official roster, verified registration flow and day-register support.
-- Run using Supabase SQL Editor (privileged role) AFTER migrations 001-003.
-- IMPORTANT: This PUBLIC schema file contains NO real student numbers or names.
-- Load the separate PRIVATE roster import only after checking data conflicts and term labels.
BEGIN;

CREATE TABLE IF NOT EXISTS public.student_roster (
  student_number text PRIMARY KEY CHECK (student_number ~ '^[0-9]{8,15}$'),
  section_id bigint NOT NULL REFERENCES public.sections(id),
  surname text NOT NULL CHECK (length(trim(surname)) BETWEEN 1 AND 80),
  first_name text NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 80),
  middle_initial text NOT NULL CHECK (middle_initial ~ '^(?:[A-Z]|N/A)$'),
  full_name text NOT NULL,
  source_term text NOT NULL DEFAULT 'Unspecified',
  name_needs_review boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  linked_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_roster_section_idx ON public.student_roster(section_id, surname, first_name);
ALTER TABLE public.student_roster ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_roster FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.student_roster TO authenticated;
DROP POLICY IF EXISTS student_roster_admin_read ON public.student_roster;
CREATE POLICY student_roster_admin_read ON public.student_roster
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- Link a profile to its roster identity. Existing approved profiles remain
-- valid until the instructor reviews and links them; no auto-match by name.
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS student_number text REFERENCES public.student_roster(student_number);
CREATE UNIQUE INDEX IF NOT EXISTS student_profile_student_number_unique
  ON public.student_profiles(student_number) WHERE student_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.roster_lookup_attempts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS roster_lookup_attempts_user_date_idx
  ON public.roster_lookup_attempts(user_id, attempted_at DESC);
ALTER TABLE public.roster_lookup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.roster_lookup_attempts FROM PUBLIC, anon, authenticated;

-- Authenticated students may look up an exact, full student number; only the
-- RPC can reveal a matching identity. 5 attempts in 15 minutes per Auth user.
-- Instructor approval remains mandatory; number knowledge is not proof of identity.
CREATE OR REPLACE FUNCTION public.lookup_roster_student(p_student_number text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_roster public.student_roster%ROWTYPE;
  v_attempts integer;
BEGIN
  IF v_uid IS NULL OR NOT public.portal_session_active()
     OR public.current_github_username() IS NULL THEN
    RAISE EXCEPTION 'Sign in with GitHub to look up your school record' USING ERRCODE = '28000';
  END IF;
  IF coalesce(trim(p_student_number),'') !~ '^[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'Enter a valid student number (8–15 digits)';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 0));
  SELECT count(*) INTO v_attempts
    FROM public.roster_lookup_attempts
    WHERE user_id = v_uid AND attempted_at > now() - interval '15 minutes';
  IF v_attempts >= 5 THEN
    RAISE EXCEPTION 'Too many lookups. Try again in 15 minutes or contact the instructor';
  END IF;
  INSERT INTO public.roster_lookup_attempts(user_id) VALUES (v_uid);
  SELECT * INTO v_roster FROM public.student_roster
    WHERE student_number = trim(p_student_number) AND active
      AND (linked_user_id IS NULL OR linked_user_id = v_uid);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student number unavailable. Check the number or ask your instructor';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'student_number',v_roster.student_number,
    'surname',v_roster.surname,'first_name',v_roster.first_name,
    'middle_initial',v_roster.middle_initial,
    'section_id',v_roster.section_id,
    'name_needs_review',v_roster.name_needs_review
  );
END;
$$;

-- A fresh student registers via their exact roster entry.  The official name
-- and section always come FROM THE DATABASE and are never trusted from React.
CREATE OR REPLACE FUNCTION public.submit_roster_student_profile(
  p_student_number text, p_sex text, p_age integer,
  p_subject_id bigint, p_github_username text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_github text := public.current_github_username();
  v_roster public.student_roster%ROWTYPE;
  v_existing public.student_profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.portal_session_active() THEN
    RAISE EXCEPTION 'Session expired; sign in again' USING ERRCODE = '28000';
  END IF;
  IF v_github IS NULL OR lower(trim(coalesce(p_github_username,''))) <> v_github THEN
    RAISE EXCEPTION 'GitHub account verification failed' USING ERRCODE = '28000';
  END IF;
  IF p_sex NOT IN ('Male','Female','Prefer not to say') OR p_sex IS NULL
     OR p_age IS NULL OR p_age NOT BETWEEN 12 AND 99 THEN
    RAISE EXCEPTION 'Select a valid sex and age';
  END IF;
  SELECT * INTO v_roster FROM public.student_roster
    WHERE student_number = trim(coalesce(p_student_number,'')) AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student number not found in the active roster'; END IF;
  IF v_roster.linked_user_id IS NOT NULL AND v_roster.linked_user_id <> v_uid THEN
    RAISE EXCEPTION 'This student number is already registered; contact the instructor';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.class_schedules s JOIN public.subjects sub ON sub.id = s.subject_id AND sub.is_active
    JOIN public.sections sec ON sec.id = s.section_id AND sec.is_active
    WHERE s.section_id = v_roster.section_id AND s.subject_id = p_subject_id
  ) THEN RAISE EXCEPTION 'Select a subject offered in your official section'; END IF;
  SELECT * INTO v_existing FROM public.student_profiles WHERE user_id = v_uid FOR UPDATE;
  IF FOUND THEN
    IF v_existing.is_approved AND v_existing.student_number IS NULL THEN
      RAISE EXCEPTION 'Previously approved accounts require instructor identity linking';
    END IF;
    IF v_existing.student_number IS NOT NULL AND v_existing.student_number <> v_roster.student_number THEN
      RAISE EXCEPTION 'Your GitHub account is already associated with a different student number';
    END IF;
    IF v_existing.is_approved AND (
      v_existing.section_id IS DISTINCT FROM v_roster.section_id OR
      v_existing.subject_id IS DISTINCT FROM p_subject_id
    ) THEN
      RAISE EXCEPTION 'Ask your instructor to change an approved class assignment';
    END IF;
  END IF;
  INSERT INTO public.student_profiles (
    user_id,student_number,surname,first_name,middle_initial,sex,age,
    section_id,subject_id,github_username
  ) VALUES (
    v_uid,v_roster.student_number,v_roster.surname,v_roster.first_name,
    v_roster.middle_initial,p_sex,p_age,v_roster.section_id,p_subject_id,v_github
  ) ON CONFLICT (user_id) DO UPDATE SET
    student_number=excluded.student_number,surname=excluded.surname,
    first_name=excluded.first_name,middle_initial=excluded.middle_initial,
    sex=excluded.sex,age=excluded.age,section_id=excluded.section_id,
    subject_id=excluded.subject_id,github_username=excluded.github_username,
    updated_at=now();
  UPDATE public.student_roster SET linked_user_id = v_uid,updated_at=now()
    WHERE student_number = v_roster.student_number;
  INSERT INTO public.audit_logs(actor_id,action,subject_user_id)
    VALUES (v_uid,'profile.roster.claimed',v_uid);
END;
$$;

-- Backward compatibility: approved legacy accounts can still edit demographic
-- fields. New accounts MUST use the roster RPC; the old public RPC cannot bypass it.
CREATE OR REPLACE FUNCTION public.save_student_profile(
  p_surname text,p_first_name text,p_middle_initial text,
  p_sex text,p_age integer,p_section_id bigint,
  p_subject_id bigint,p_github_username text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_github text := public.current_github_username();
  v_profile public.student_profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.portal_session_active() THEN
    RAISE EXCEPTION 'Session expired; sign in again' USING ERRCODE='28000';
  END IF;
  IF v_github IS NULL OR lower(trim(coalesce(p_github_username,''))) <> v_github THEN
    RAISE EXCEPTION 'GitHub identity mismatch';
  END IF;
  SELECT * INTO v_profile FROM public.student_profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enter and verify your student number before registering'; END IF;
  IF trim(coalesce(p_surname,'')) = '' OR length(trim(p_surname)) > 80
     OR trim(coalesce(p_first_name,'')) = '' OR length(trim(p_first_name)) > 80
     OR (coalesce(trim(p_middle_initial),'') !~ '^[A-Za-z]$'
         AND coalesce(trim(p_middle_initial),'') <> 'N/A')
     OR p_sex IS NULL OR p_sex NOT IN ('Male','Female','Prefer not to say')
     OR p_age IS NULL OR p_age NOT BETWEEN 12 AND 99 THEN
    RAISE EXCEPTION 'Invalid student profile';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.class_schedules
    WHERE section_id=p_section_id AND subject_id=p_subject_id) THEN
    RAISE EXCEPTION 'Selected subject is not assigned to this section';
  END IF;
  IF v_profile.is_approved AND (
     v_profile.section_id IS DISTINCT FROM p_section_id OR
     v_profile.subject_id IS DISTINCT FROM p_subject_id) THEN
    RAISE EXCEPTION 'Instructor approval required for assignment changes';
  END IF;
  IF v_profile.student_number IS NOT NULL AND (
    v_profile.surname IS DISTINCT FROM trim(p_surname) OR
    v_profile.first_name IS DISTINCT FROM trim(p_first_name) OR
    v_profile.middle_initial IS DISTINCT FROM trim(p_middle_initial) OR
    v_profile.section_id IS DISTINCT FROM p_section_id
  ) THEN RAISE EXCEPTION 'Official student name and section cannot be edited'; END IF;
  UPDATE public.student_profiles SET
    surname=trim(p_surname),first_name=trim(p_first_name),
    middle_initial=trim(p_middle_initial),sex=p_sex,age=p_age,
    section_id=p_section_id,subject_id=p_subject_id,
    github_username=v_github,updated_at=now()
  WHERE user_id=v_uid;
  INSERT INTO public.audit_logs(actor_id,action,subject_user_id)
    VALUES (v_uid,'profile.saved',v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_roster_student(text),
  public.submit_roster_student_profile(text,text,integer,bigint,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_roster_student(text),
  public.submit_roster_student_profile(text,text,integer,bigint,text)
  TO authenticated;
-- Legacy RPC execute privilege from migrations 001/002 remains, with its new guard.
COMMIT;
