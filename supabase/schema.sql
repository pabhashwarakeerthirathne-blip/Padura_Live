-- ==============================================================================
-- PADURA LIVE - DATABASE SCHEMA
-- Technology: PostgreSQL (Supabase)
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. PROFILES TABLE (Core user metadata linked to auth.users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('student', 'parent', 'admin')),
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 2. STUDENTS TABLE (Academic details & student number format validation)
-- Format rule: Two uppercase letters, slash, 4-digit academic year, slash, reg number
-- Example: PS/2023/174, SC/2024/021, ST/2025/105
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_number TEXT UNIQUE NOT NULL CHECK (student_number ~ '^[A-Z]{2}/[0-9]{4}/[0-9]+$'),
    academic_year INTEGER NOT NULL CHECK (academic_year >= 2000 AND academic_year <= 2100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 3. PARENTS TABLE (Parent specific profile info)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.parents (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    phone TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 4. PARENT_STUDENTS TABLE (Many-to-Many relationship between parents and students)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.parent_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_parent_student UNIQUE(parent_id, student_id)
);

-- ==============================================================================
-- 5. BROADCASTS TABLE (Live stream metadata, YouTube Unlisted details)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    youtube_url TEXT NOT NULL,
    youtube_video_id TEXT NOT NULL,
    event_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'upcoming', 'live', 'ended')),
    is_published BOOLEAN NOT NULL DEFAULT false,
    access_type TEXT NOT NULL DEFAULT 'all' CHECK (access_type IN ('all', 'academic_year', 'specific_students')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 6. BROADCAST_ACCESS TABLE (Granular access control by academic year or student)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.broadcast_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
    academic_year INTEGER CHECK (academic_year >= 2000 AND academic_year <= 2100),
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 7. VIEWING_LOGS TABLE (Real-time viewing heartbeat and audit trail)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.viewing_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    broadcast_id UUID NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
    ip_address TEXT,
    user_agent TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_ping_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 8. LOGIN_LOGS TABLE (Authentication attempt security tracking)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.login_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'blocked_inactive')),
    ip_address TEXT,
    user_agent TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 9. ADMIN_LOGS TABLE (Administrator action audit trails)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.admin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 10. USER_SESSIONS TABLE (Concurrent session tracking and expiration)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- INDEXES FOR OPTIMAL QUERY PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_students_number ON public.students(student_number);
CREATE INDEX IF NOT EXISTS idx_students_year ON public.students(academic_year);
CREATE INDEX IF NOT EXISTS idx_parent_students_parent ON public.parent_students(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_student ON public.parent_students(student_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON public.broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_broadcasts_published ON public.broadcasts(is_published);
CREATE INDEX IF NOT EXISTS idx_broadcast_access_broadcast ON public.broadcast_access(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_access_year ON public.broadcast_access(academic_year);
CREATE INDEX IF NOT EXISTS idx_broadcast_access_student ON public.broadcast_access(student_id);
CREATE INDEX IF NOT EXISTS idx_viewing_logs_user ON public.viewing_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_viewing_logs_broadcast ON public.viewing_logs(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_timestamp ON public.login_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_timestamp ON public.admin_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions(user_id);

-- ==============================================================================
-- AUTOMATIC TIMESTAMPS TRIGGER FUNCTION
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS tr_profiles_updated_at ON public.profiles;
CREATE TRIGGER tr_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_students_updated_at ON public.students;
CREATE TRIGGER tr_students_updated_at
    BEFORE UPDATE ON public.students
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_parents_updated_at ON public.parents;
CREATE TRIGGER tr_parents_updated_at
    BEFORE UPDATE ON public.parents
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_broadcasts_updated_at ON public.broadcasts;
CREATE TRIGGER tr_broadcasts_updated_at
    BEFORE UPDATE ON public.broadcasts
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ==============================================================================
-- SECURITY DEFINER HELPER FUNCTIONS
-- ==============================================================================

-- Check if authenticated user is active administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    v_role TEXT;
    v_status TEXT;
BEGIN
    SELECT role, status INTO v_role, v_status
    FROM public.profiles
    WHERE id = auth.uid();

    RETURN (v_role = 'admin' AND v_status = 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if a user can access a specific broadcast
CREATE OR REPLACE FUNCTION public.can_user_access_broadcast(p_broadcast_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_role TEXT;
    v_status TEXT;
    v_access_type TEXT;
    v_is_published BOOLEAN;
    v_student_year INTEGER;
    v_has_access BOOLEAN := false;
BEGIN
    -- Check user role and status
    SELECT role, status INTO v_role, v_status
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_status <> 'active' THEN
        RETURN false;
    END IF;

    -- Admins can view any broadcast
    IF v_role = 'admin' THEN
        RETURN true;
    END IF;

    -- Broadcast must exist and be published for student/parent viewing
    SELECT access_type, is_published INTO v_access_type, v_is_published
    FROM public.broadcasts
    WHERE id = p_broadcast_id;

    IF NOT FOUND OR NOT v_is_published THEN
        RETURN false;
    END IF;

    -- If broadcast is open to all students
    IF v_access_type = 'all' THEN
        RETURN true;
    END IF;

    -- If user is a student:
    IF v_role = 'student' THEN
        SELECT academic_year INTO v_student_year
        FROM public.students
        WHERE id = p_user_id;

        IF v_access_type = 'academic_year' THEN
            SELECT EXISTS(
                SELECT 1 FROM public.broadcast_access
                WHERE broadcast_id = p_broadcast_id AND academic_year = v_student_year
            ) INTO v_has_access;
            RETURN v_has_access;
        ELSIF v_access_type = 'specific_students' THEN
            SELECT EXISTS(
                SELECT 1 FROM public.broadcast_access
                WHERE broadcast_id = p_broadcast_id AND student_id = p_user_id
            ) INTO v_has_access;
            RETURN v_has_access;
        END IF;
    END IF;

    -- If user is a parent:
    IF v_role = 'parent' THEN
        -- Check if any of parent's linked students have access
        IF v_access_type = 'academic_year' THEN
            SELECT EXISTS(
                SELECT 1 FROM public.parent_students ps
                JOIN public.students s ON s.id = ps.student_id
                JOIN public.broadcast_access ba ON ba.broadcast_id = p_broadcast_id AND ba.academic_year = s.academic_year
                WHERE ps.parent_id = p_user_id
            ) INTO v_has_access;
            RETURN v_has_access;
        ELSIF v_access_type = 'specific_students' THEN
            SELECT EXISTS(
                SELECT 1 FROM public.parent_students ps
                JOIN public.broadcast_access ba ON ba.broadcast_id = p_broadcast_id AND ba.student_id = ps.student_id
                WHERE ps.parent_id = p_user_id
            ) INTO v_has_access;
            RETURN v_has_access;
        END IF;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log viewing heartbeat function (called from client player every 30s)
CREATE OR REPLACE FUNCTION public.log_viewing_heartbeat(
    p_broadcast_id UUID,
    p_duration_increment INTEGER DEFAULT 30,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_log_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if log entry for this session exists within last 5 minutes
    SELECT id INTO v_log_id
    FROM public.viewing_logs
    WHERE user_id = v_user_id 
      AND broadcast_id = p_broadcast_id 
      AND last_ping_at >= timezone('utc'::text, now()) - INTERVAL '5 minutes'
    ORDER BY last_ping_at DESC
    LIMIT 1;

    IF v_log_id IS NOT NULL THEN
        UPDATE public.viewing_logs
        SET duration_seconds = duration_seconds + p_duration_increment,
            last_ping_at = timezone('utc'::text, now())
        WHERE id = v_log_id;
    ELSE
        INSERT INTO public.viewing_logs (user_id, broadcast_id, ip_address, user_agent, duration_seconds)
        VALUES (v_user_id, p_broadcast_id, p_ip_address, p_user_agent, p_duration_increment);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
