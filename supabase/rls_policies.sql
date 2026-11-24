-- ==============================================================================
-- PADURA LIVE - ROW LEVEL SECURITY (RLS) POLICIES
-- Strict Security Enforcement for Production Database
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viewing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 1. PROFILES POLICIES
-- ==============================================================================
-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (public.is_admin());

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- Parents can view profiles of their linked students
CREATE POLICY "Parents can view linked student profiles"
    ON public.profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.parent_students ps
            WHERE ps.parent_id = auth.uid() AND ps.student_id = public.profiles.id
        )
    );

-- Admins can insert profiles
CREATE POLICY "Admins can insert profiles"
    ON public.profiles FOR INSERT
    WITH CHECK (public.is_admin());

-- Admins can update any profile
CREATE POLICY "Admins can update any profile"
    ON public.profiles FOR UPDATE
    USING (public.is_admin());

-- Users can only update their own full name (cannot modify role or status)
CREATE POLICY "Users can update own display name"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id AND
        role = (SELECT role FROM public.profiles WHERE id = auth.uid()) AND
        status = (SELECT status FROM public.profiles WHERE id = auth.uid())
    );

-- Admins can delete profiles
CREATE POLICY "Admins can delete profiles"
    ON public.profiles FOR DELETE
    USING (public.is_admin());

-- ==============================================================================
-- 2. STUDENTS POLICIES
-- ==============================================================================
CREATE POLICY "Admins can view all students"
    ON public.students FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Students can view own student record"
    ON public.students FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Parents can view linked student records"
    ON public.students FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.parent_students ps
            WHERE ps.parent_id = auth.uid() AND ps.student_id = public.students.id
        )
    );

CREATE POLICY "Admins can manage students"
    ON public.students FOR ALL
    USING (public.is_admin());

-- ==============================================================================
-- 3. PARENTS POLICIES
-- ==============================================================================
CREATE POLICY "Admins can view all parents"
    ON public.parents FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Parents can view own record"
    ON public.parents FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Admins can manage parents"
    ON public.parents FOR ALL
    USING (public.is_admin());

-- ==============================================================================
-- 4. PARENT_STUDENTS POLICIES
-- ==============================================================================
CREATE POLICY "Admins can view all parent-student relations"
    ON public.parent_students FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Parents can view own linked students"
    ON public.parent_students FOR SELECT
    USING (parent_id = auth.uid());

CREATE POLICY "Students can view own linked parents"
    ON public.parent_students FOR SELECT
    USING (student_id = auth.uid());

CREATE POLICY "Admins can manage parent-student relations"
    ON public.parent_students FOR ALL
    USING (public.is_admin());

-- ==============================================================================
-- 5. BROADCASTS POLICIES
-- ==============================================================================
CREATE POLICY "Admins can manage all broadcasts"
    ON public.broadcasts FOR ALL
    USING (public.is_admin());

CREATE POLICY "Authorized users can view published broadcasts"
    ON public.broadcasts FOR SELECT
    USING (
        is_published = true AND
        public.can_user_access_broadcast(id, auth.uid())
    );

-- ==============================================================================
-- 6. BROADCAST_ACCESS POLICIES
-- ==============================================================================
CREATE POLICY "Admins can manage broadcast access"
    ON public.broadcast_access FOR ALL
    USING (public.is_admin());

CREATE POLICY "Users can view relevant broadcast access"
    ON public.broadcast_access FOR SELECT
    USING (
        public.is_admin() OR
        student_id = auth.uid() OR
        academic_year = (SELECT academic_year FROM public.students WHERE id = auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.parent_students ps
            JOIN public.students s ON s.id = ps.student_id
            WHERE ps.parent_id = auth.uid() AND (ps.student_id = public.broadcast_access.student_id OR s.academic_year = public.broadcast_access.academic_year)
        )
    );

-- ==============================================================================
-- 7. VIEWING_LOGS POLICIES
-- ==============================================================================
CREATE POLICY "Admins can view all viewing logs"
    ON public.viewing_logs FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Users can view own viewing logs"
    ON public.viewing_logs FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert own viewing logs"
    ON public.viewing_logs FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own viewing logs"
    ON public.viewing_logs FOR UPDATE
    USING (user_id = auth.uid());

-- ==============================================================================
-- 8. LOGIN_LOGS POLICIES
-- ==============================================================================
CREATE POLICY "Admins can view all login logs"
    ON public.login_logs FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Users can view own login logs"
    ON public.login_logs FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "System and users can insert login logs"
    ON public.login_logs FOR INSERT
    WITH CHECK (true);

-- ==============================================================================
-- 9. ADMIN_LOGS POLICIES
-- ==============================================================================
CREATE POLICY "Admins can view all admin logs"
    ON public.admin_logs FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Admins can insert admin logs"
    ON public.admin_logs FOR INSERT
    WITH CHECK (public.is_admin() AND admin_id = auth.uid());

-- ==============================================================================
-- 10. USER_SESSIONS POLICIES
-- ==============================================================================
CREATE POLICY "Admins can view all sessions"
    ON public.user_sessions FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Users can manage own sessions"
    ON public.user_sessions FOR ALL
    USING (user_id = auth.uid());
