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

QUIZZES.push(
  {
    question: 'What cabin pressure is equivalent to which altitude?',
    options: ['Sea level', '1,500m', '2,400m', '4,000m'],
    correctIdx: 2,
    explanation: 'Airplane cabins are pressurized to roughly 2,400m (8,000 ft) equivalent — low enough for comfort but not sea level, to reduce airframe stress.',
    triggerCategory: 'city'
  },
  {
    question: 'What is a jet stream?',
    options: ['Plane exhaust trail', 'Fast high-altitude wind band', 'Ocean current', 'Air traffic corridor'],
    correctIdx: 1,
    explanation: 'Jet streams are fast-flowing, narrow air currents at 9-12 km altitude. Flights riding them can cut hours off transatlantic crossings.',
    triggerCategory: 'city'
  },
  {
    question: "What is the world's longest river?",
    options: ['Amazon', 'Congo', 'Yangtze', 'Nile'],
    correctIdx: 3,
    explanation: 'The Nile stretches 6,650 km through northeastern Africa, though the Amazon is wider and carries more water.',
    triggerCategory: 'lake'
  },
  {
    question: "What is the world's deepest lake?",
    options: ['Lake Superior', 'Lake Titicaca', 'Caspian Sea', 'Lake Baikal'],
    correctIdx: 3,
    explanation: 'Lake Baikal in Siberia reaches 1,642m deep — deeper than the Caspian Sea is wide — and holds 20% of Earth\'s unfrozen freshwater.',
    triggerCategory: 'lake'
  },
  {
    question: "What is the world's largest hot desert?",
    options: ['Arabian Desert', 'Gobi Desert', 'Sahara', 'Kalahari'],
    correctIdx: 2,
    explanation: 'The Sahara covers 9.2 million km² across northern Africa — roughly the size of the United States.',
    triggerCategory: 'city'
  },
  {
    question: "What is the world's smallest country by area?",
    options: ['Monaco', 'San Marino', 'Vatican City', 'Liechtenstein'],
    correctIdx: 2,
    explanation: 'Vatican City covers just 0.44 km² inside Rome, making it the smallest internationally recognized independent state.',
    triggerCategory: 'city'
  },
  {
    question: 'Which language has the most native speakers worldwide?',
    options: ['English', 'Spanish', 'Mandarin Chinese', 'Hindi'],
    correctIdx: 2,
    explanation: 'Mandarin Chinese has about 920 million native speakers — far ahead of Spanish (~475M) and English (~370M).',
    triggerCategory: 'city'
  },
  {
    question: 'Which country invented the tradition of New Year fireworks?',
    options: ['USA', 'China', 'France', 'Italy'],
    correctIdx: 1,
    explanation: 'China invented gunpowder and fireworks around 800 AD. The tradition spread globally via trade routes.',
    triggerCategory: 'city'
  },
  {
    question: 'Why do planes leave white trails (contrails)?',
    options: ['Fuel exhaust soot', 'Ice crystals from engine water vapor', 'Chemical sprays', 'Condensed oxygen'],
    correctIdx: 1,
    explanation: 'Hot, humid exhaust hits cold air at altitude and instantly freezes into ice crystals — those white trails are artificial clouds.',
    triggerCategory: 'city'
  },
  {
    question: 'How high is the highest mountain in Africa?',
    options: ['4,567m', '5,895m', '6,200m', '7,100m'],
    correctIdx: 1,
    explanation: 'Mount Kilimanjaro in Tanzania stands at 5,895m — the highest free-standing mountain on Earth.',
    triggerCategory: 'mountain'
  },
  {
    question: 'Which ocean is the largest?',
    options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'],
    correctIdx: 3,
    explanation: 'The Pacific Ocean covers 165 million km² — more than all continents combined.',
    triggerCategory: 'sea'
  },
  {
    question: 'What percentage of Earth is covered by water?',
    options: ['51%', '63%', '71%', '84%'],
    correctIdx: 2,
    explanation: 'About 71% of Earth\'s surface is covered by oceans, seas, and freshwater — but only 3% is freshwater, and most is frozen.',
    triggerCategory: 'sea'
  },
  {
    question: 'What speed must a plane reach to take off? (typical commercial jet)',
    options: ['150 km/h', '230 km/h', '310 km/h', '420 km/h'],
    correctIdx: 1,
    explanation: 'Most commercial jets rotate (lift off) at around 230-290 km/h, depending on aircraft weight and runway conditions.',
    triggerCategory: 'city'
  },
  {
    question: 'Which country has the most time zones?',
    options: ['Russia', 'USA', 'China', 'France'],
    correctIdx: 3,
    explanation: 'France has 12 time zones when including overseas territories — more than Russia (11) or the USA (11).',
    triggerCategory: 'city'
  },
  {
    question: 'What does IATA stand for?',
    options: ['International Airline Travel Association', 'International Air Transport Association', 'International Aviation Traffic Agency', 'Intercontinental Air Traffic Authority'],
    correctIdx: 1,
    explanation: 'IATA (International Air Transport Association) is the trade association of the world\'s airlines, setting standards for ticketing, safety, and airport codes.',
    triggerCategory: 'city'
  }
);

export function getRandomQuiz(category?: string): Quiz {
  const filtered = category
    ? QUIZZES.filter(q => !q.triggerCategory || q.triggerCategory === category)
    : QUIZZES;
  return filtered[Math.floor(Math.random() * filtered.length)];
}
