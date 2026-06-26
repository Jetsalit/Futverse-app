-- 1. ตาราง Academies (ข้อมูลอคาเดมี)
CREATE TABLE academies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. ตาราง Profiles (ผู้ใช้งานในระบบ ผูกกับ Supabase Auth)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    academy_id UUID REFERENCES academies(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('SUPERADMIN', 'ADMIN', 'COACH', 'PLAYER', 'PARENT', 'DATA_ADMIN')),
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. ตาราง Squads (รุ่นอายุ/ทีม ภายในอคาเดมี)
CREATE TABLE squads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academy_id UUID REFERENCES academies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. ตาราง Players (ข้อมูลนักกีฬา)
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squad_id UUID REFERENCES squads(id) ON DELETE SET NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth DATE,
    position TEXT,
    jersey_number INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- เปิดการใช้งาน Row Level Security (RLS) สำหรับทุกตาราง
ALTER TABLE academies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- 5. ตัวอย่าง RLS Policy: อนุญาตให้ 'COACH' ดูข้อมูลนักกีฬาได้เฉพาะที่อยู่ภายใต้อคาเดมีเดียวกัน
CREATE POLICY "Coaches can view players in their own academy"
ON players
FOR SELECT
USING (
    EXISTS (
        SELECT 1 
        FROM profiles p
        JOIN squads s ON s.academy_id = p.academy_id
        WHERE p.id = auth.uid() 
          AND p.role = 'COACH'
          AND s.id = players.squad_id
    )
);
