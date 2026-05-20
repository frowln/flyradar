export interface Quiz {
  question: string;
  options: string[];
  correctIdx: number;
  explanation: string;
  triggerCategory?: string;
}

export const QUIZZES: Quiz[] = [
  {
    question: 'How tall is Mount Everest?',
    options: ['7,500m', '8,849m', '9,200m', '10,000m'],
    correctIdx: 1,
    explanation: 'Mount Everest stands at 8,849 meters (29,032 feet) above sea level. It grows ~4mm per year due to tectonic plates.',
    triggerCategory: 'mountain'
  },
  {
    question: 'Which sea is the deepest in the world?',
    options: ['Mediterranean', 'Pacific Ocean', 'Caribbean Sea', 'Bering Sea'],
    correctIdx: 1,
    explanation: 'The Pacific contains the Mariana Trench — the deepest point of any ocean at 11,034m.',
    triggerCategory: 'sea'
  },
  {
    question: "Lake Baikal contains what percentage of Earth's freshwater?",
    options: ['5%', '12%', '20%', '35%'],
    correctIdx: 2,
    explanation: 'Lake Baikal holds about 20% of all unfrozen freshwater on Earth — more than all the Great Lakes combined.',
    triggerCategory: 'lake'
  },
  {
    question: 'How fast is a typical commercial jet at cruise?',
    options: ['600 km/h', '900 km/h', '1,200 km/h', '1,500 km/h'],
    correctIdx: 1,
    explanation: 'Commercial jets cruise at around 900 km/h (560 mph) — about 80% of the speed of sound.',
    triggerCategory: 'city'
  },
  {
    question: 'What is the average cruising altitude?',
    options: ['5,000m', '8,000m', '11,000m', '15,000m'],
    correctIdx: 2,
    explanation: 'Commercial flights typically cruise at 10,000-12,000m (33,000-39,000 ft) — above weather, smoother air, fuel-efficient.',
    triggerCategory: 'city'
  },
  {
    question: 'The Mediterranean Sea borders how many countries?',
    options: ['12', '17', '22', '30'],
    correctIdx: 2,
    explanation: 'The Mediterranean Sea borders 22 countries across Europe, Africa, and Asia.',
    triggerCategory: 'sea'
  },
  {
    question: 'Why are airplane windows oval, not square?',
    options: ['Aesthetic', 'Stress distribution', 'Pilot visibility', 'Manufacturing cost'],
    correctIdx: 1,
    explanation: 'Square corners create stress concentration points. After deadly crashes in the 1950s, oval windows became standard — they distribute pressure evenly.',
    triggerCategory: 'city'
  },
  {
    question: 'What temperature is it outside the plane at cruise?',
    options: ['-20°C', '-40°C', '-57°C', '-80°C'],
    correctIdx: 2,
    explanation: 'At 35,000 feet, outside temperature is around -57°C. Plane skin is heated by friction to slightly warmer.',
    triggerCategory: 'city'
  }
];

export function getRandomQuiz(category?: string): Quiz {
  const filtered = category
    ? QUIZZES.filter(q => !q.triggerCategory || q.triggerCategory === category)
    : QUIZZES;
  return filtered[Math.floor(Math.random() * filtered.length)];
}
