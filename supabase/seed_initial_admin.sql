-- ==============================================================================
-- PADURA LIVE - INITIAL ADMINISTRATOR SETUP SCRIPT
-- Execute this script once in your Supabase SQL Editor to initialize the first admin.
-- DO NOT expose admin credentials in frontend code!
-- ==============================================================================

DO $$
DECLARE
    v_admin_email TEXT := 'admin@paduralive.local';
    v_admin_username TEXT := 'padura_admin';
    v_admin_password TEXT := 'PaduraAdmin@2026'; -- Change this to your strong password
    v_admin_name TEXT := 'Chief Platform Administrator';
    v_user_id UUID := gen_random_uuid();
    v_encrypted_pw TEXT;
BEGIN
    -- Check if admin profile already exists
    IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
        RAISE NOTICE 'An administrator account already exists. Skipping creation.';
        RETURN;
    END IF;

    -- Generate bcrypt hash for the password
    v_encrypted_pw := crypt(v_admin_password, gen_salt('bf', 10));

    -- Insert into auth.users (Supabase authentication engine)
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        created_at,
        updated_at
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        v_admin_email,
        v_encrypted_pw,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        json_build_object('username', v_admin_username, 'full_name', v_admin_name, 'role', 'admin')::jsonb,
        false,
        now(),
        now()
    );

    -- Insert into public.profiles
    INSERT INTO public.profiles (
        id,
        role,
        username,
        full_name,
        status,
        created_at,
        updated_at
    )
    VALUES (
        v_user_id,
        'admin',
        v_admin_username,
        v_admin_name,
        'active',
        now(),
        now()
    );

    -- Also record this in admin_logs
    INSERT INTO public.admin_logs (
        admin_id,
        action,
        details,
        timestamp
    )
    VALUES (
        v_user_id,
        'INITIAL_ADMIN_SEED',
        json_build_object('username', v_admin_username, 'email', v_admin_email)::jsonb,
        now()
    );

    RAISE NOTICE 'Admin user successfully created! Username: %, Email: %', v_admin_username, v_admin_email;
END $$;
