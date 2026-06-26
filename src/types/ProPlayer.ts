export interface CareerHistory {
  year: string;
  club: string;
  apps: number;
  goals: number;
  assists: number;
}

export interface ProPlayer {
  id: string;
  name: string;
  nationality: string;
  dob: string;
  position: string;
  secondaryPosition?: string;
  height: number;
  weight: number;
  preferredFoot: 'Right' | 'Left' | 'Both';
  currentClub: string;
  league: 'T1' | 'T2' | 'T3' | 'Semi-pro' | 'Free Agent';
  contractExpiry: string;
  marketValue?: string;
  avatarUrl: string;
  actionShotUrl: string;
  highlightVideoUrl?: string;
  phoneNumber?: string;
  lineId?: string;
  facebook?: string;
  careerHistory: CareerHistory[];
  attributes: {
    technical: number;
    tactical: number;
    physical: number;
    mental: number;
    attacking: number;
    defending: number;
  };
}
