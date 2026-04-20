-- Leagues table
CREATE TABLE leagues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    country TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Clubs table
CREATE TABLE clubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    objective INT,
    squad_value NUMERIC,
    fixed_income NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_club_per_league UNIQUE(league_id, name)
);

-- Players table
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position TEXT,
    detailed_position TEXT,
    age INT,
    nationality TEXT,
    attack INT,
    defense INT,
    overall INT,
    value_amount NUMERIC,
    value_str TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_player_per_club UNIQUE(club_id, name)
);

-- Index for performance
CREATE INDEX idx_players_club_id ON players(club_id);
CREATE INDEX idx_clubs_league_id ON clubs(league_id);

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

[
  {
    "tablename": "leagues",
    "rowsecurity": true
  },
  {
    "tablename": "clubs",
    "rowsecurity": true
  },
  {
    "tablename": "players",
    "rowsecurity": true
  }
]
