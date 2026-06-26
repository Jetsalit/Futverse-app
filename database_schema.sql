-- ==============================================================================
-- Comprehensive Football Academy & National Scouting SaaS Platform
-- Database Schema Design (PostgreSQL / Supabase)
-- ==============================================================================

-- 1. Academies (Multi-Tenant Core)
CREATE TABLE academies (
    academy_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    region VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Users (Core User Profile extending Auth)
CREATE TABLE users (
    user_id UUID PRIMARY KEY, -- Links to auth.users in Supabase
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Roles (Lookup Table)
CREATE TABLE roles (
    role_id INT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL
    -- 1: Owner, 2: Coach, 3: Assistant Coach, 4: Fitness/Physio
    -- 5: Scout, 6: Pro Player, 7: Youth Player, 8: Parent, 99: Super Admin
);

-- 4. User_Roles (RBAC & Multi-Tenancy Mapping)
CREATE TABLE user_roles (
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    academy_id UUID REFERENCES academies(academy_id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(role_id),
    PRIMARY KEY (user_id, academy_id, role_id)
);

-- 5. Parent_Student_Mapping (Read-Only Access Control)
CREATE TABLE parent_student_mapping (
    parent_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    youth_player_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    PRIMARY KEY (parent_user_id, youth_player_user_id)
);

-- 6. Audit_Logs (Super Admin Impersonation & Security)
CREATE TABLE audit_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID REFERENCES users(user_id),
    impersonated_user_id UUID REFERENCES users(user_id),
    academy_id UUID REFERENCES academies(academy_id),
    action_type VARCHAR(100) NOT NULL, -- e.g., 'IMPERSONATE_LOGIN', 'EDIT_DRILL'
    action_details JSONB,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Fitness_Tests (Football-Specific Assessment)
CREATE TABLE fitness_tests (
    test_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    academy_id UUID REFERENCES academies(academy_id),
    tested_by UUID REFERENCES users(user_id), -- Coach/Fitness staff ID
    test_date DATE NOT NULL,
    -- Aerobic/Anaerobic
    yoyo_level VARCHAR(10),
    vo2_max DECIMAL(5,2),
    -- Speed
    sprint_10m_sec DECIMAL(5,2),
    sprint_30m_sec DECIMAL(5,2),
    -- Agility
    agility_illinois_sec DECIMAL(5,2),
    -- Power
    vertical_jump_cm DECIMAL(5,2),
    -- Context
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Drill_Library (Tacticboard Storage)
CREATE TABLE drills (
    drill_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academy_id UUID REFERENCES academies(academy_id),
    author_id UUID REFERENCES users(user_id),
    title VARCHAR(255) NOT NULL,
    objectives TEXT[], -- e.g., ['Passing', 'Attacking']
    duration_minutes INT,
    canvas_data JSONB, -- Coordinates for red/blue players, cones, balls
    image_url TEXT, -- Fallback for uploaded photo
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Daily_Logs (Hierarchical Periodization Logbook)
CREATE TABLE daily_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academy_id UUID REFERENCES academies(academy_id),
    coach_id UUID REFERENCES users(user_id),
    session_date DATE NOT NULL,
    microcycle_id UUID, -- Link to Weekly plan
    theme VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Player_Attendances
CREATE TABLE player_attendances (
    attendance_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    log_id UUID REFERENCES daily_logs(log_id) ON DELETE CASCADE,
    player_id UUID REFERENCES users(user_id),
    status VARCHAR(20), -- 'Present', 'Absent', 'Injured'
    intensity_score INT CHECK (intensity_score BETWEEN 1 AND 10), -- RPE
    coach_rating INT CHECK (coach_rating BETWEEN 1 AND 10),
    UNIQUE (log_id, player_id)
);

-- 11. Offline_Sync_Queue (Offline-First Capability)
CREATE TABLE offline_sync_queue (
    queue_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id),
    academy_id UUID REFERENCES academies(academy_id),
    entity_type VARCHAR(50) NOT NULL, -- e.g., 'fitness_tests', 'daily_logs'
    action_type VARCHAR(20) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'PROCESSED', 'FAILED'
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- 12. Teams
CREATE TABLE teams (
    team_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academy_id UUID REFERENCES academies(academy_id) ON DELETE CASCADE,
    team_name VARCHAR(100) NOT NULL, -- e.g., 'U-17 National Prospects', 'U-15 Development'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. Coach_Team_Assignments (Many-to-Many Coach to Teams)
CREATE TABLE coach_team_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(team_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(coach_id, team_id)
);
