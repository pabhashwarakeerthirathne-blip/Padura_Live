-- PADURA LIVE: approved student roster for self-registration
-- Run this once in Supabase Dashboard > SQL Editor > New query.
-- Import your real student list into this table BEFORE enabling registration.

CREATE TABLE IF NOT EXISTS public.student_roster (
  student_number TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  academic_year INTEGER NOT NULL CHECK (academic_year BETWEEN 2000 AND 2100),
  is_registered BOOLEAN NOT NULL DEFAULT FALSE,
  registered_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT student_roster_number_format CHECK (student_number ~ '^[A-Z]{2}/[0-9]{4}/[0-9]+$')
);

CREATE INDEX IF NOT EXISTS idx_student_roster_registered
  ON public.student_roster(is_registered);

ALTER TABLE public.student_roster ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: browser users cannot read or modify the roster.
-- The Edge Function accesses it using the server-side Supabase secret/service-role key.

-- EXAMPLE ONLY: replace with actual official student records. Do not leave sample rows.
-- INSERT INTO public.student_roster(student_number, full_name, academic_year)
-- VALUES ('PS/2023/174', 'Student Full Name', 2023);

-- CHECK imported roster records (run as project admin in SQL Editor)
SELECT student_number, full_name, academic_year, is_registered
FROM public.student_roster
ORDER BY student_number;
