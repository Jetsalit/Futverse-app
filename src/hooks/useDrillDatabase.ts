import { useState, useEffect } from 'react';

export interface Drill {
  id: string;
  title: string;
  category: string;
  canvas_data: {
    elements: any[];
    lines: any[];
    fieldType: string;
  };
  created_by: string;
  is_shared: boolean;
  duration?: string;
  description?: string;
  previewImage?: string;
  ageGroup?: string;
  phase?: string;
  trainingMethod?: string;
  coachingPoints?: string;
  date?: string;
}

const MOCK_CURRENT_USER = 'coach_1';

const INITIAL_DRILLS: Drill[] = [
  {
    id: 'mock-1',
    title: 'Rondo 4v2',
    category: 'Passing',
    canvas_data: { elements: [], lines: [], fieldType: 'half' },
    created_by: 'coach_1',
    is_shared: false,
  },
  {
    id: 'mock-2',
    title: 'Defensive Shape',
    category: 'Tactics',
    canvas_data: { elements: [], lines: [], fieldType: 'full' },
    created_by: 'coach_2',
    is_shared: true,
  }
];

export function useDrillDatabase() {
  const [drills, setDrills] = useState<Drill[]>([]);
  const currentUser = MOCK_CURRENT_USER;

  useEffect(() => {
    const saved = localStorage.getItem('practice_drills');
    if (saved) {
      setDrills(JSON.parse(saved));
    } else {
      setDrills(INITIAL_DRILLS);
      localStorage.setItem('practice_drills', JSON.stringify(INITIAL_DRILLS));
    }
  }, []);

  const saveDrill = (newDrill: Omit<Drill, 'id' | 'created_by'>) => {
    const drill: Drill = {
      ...newDrill,
      id: Date.now().toString(),
      created_by: currentUser,
    };
    const updated = [drill, ...drills];
    setDrills(updated);
    localStorage.setItem('practice_drills', JSON.stringify(updated));
  };

  const updateDrill = (id: string, updates: Partial<Drill>) => {
    const updated = drills.map(d => d.id === id ? { ...d, ...updates } : d);
    setDrills(updated);
    localStorage.setItem('practice_drills', JSON.stringify(updated));
  };

  const deleteDrill = (id: string) => {
    const updated = drills.filter(d => d.id !== id);
    setDrills(updated);
    localStorage.setItem('practice_drills', JSON.stringify(updated));
  };

  const myDrills = drills.filter(d => d.created_by === currentUser);
  const academyDrills = drills.filter(d => d.is_shared === true);

  return { drills, myDrills, academyDrills, saveDrill, updateDrill, deleteDrill, currentUser };
}
