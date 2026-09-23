import type { POICategory } from '@skyatlas/shared';
import { getLocale } from '../../i18n';

/**
 * Quizzes shown after a place has been read.
 *
 * Asked afterwards on purpose: a question before the text is an exam, the same
 * question after it is a small win. The answer is always in the card the
 * passenger just finished.
 *
 * Content lives here rather than in the locale files because a quiz is one
 * indivisible unit — question, options and explanation have to be translated
 * together or the answer stops matching the options. `correctIdx` is shared
 * across all six languages, so the options must stay in the same order in each;
 * keeping the translations side by side is what makes that checkable by eye.
 */

export interface QuizText {
  question: string;
  options: string[];
  explanation: string;
}

/** Every language the app ships. */
export type QuizLocale = 'en' | 'ru' | 'de' | 'fr' | 'es' | 'ja';

/**
 * All six languages are required rather than optional: a missing translation
 * should be a compile error, not a quiz that silently answers in English in the
 * middle of a Japanese interface.
 */
export interface Quiz extends Record<QuizLocale, QuizText> {
  id: string;
  /** Index into `options`. The order is identical across languages. */
  correctIdx: number;
  /** Shown after a place of this category. Undefined means it fits anywhere. */
  triggerCategory?: POICategory;
}

export const QUIZZES: Quiz[] = [
  // --- mountain ------------------------------------------------------------
  {
    id: 'everest-height',
    correctIdx: 1,
    triggerCategory: 'mountain',
    en: {
      question: 'How tall is Everest?',
      options: ['7 500 m', '8 849 m', '9 200 m', '10 000 m'],
      explanation: 'Everest stands 8 849 m above sea level and gains about 4 mm a year as India keeps pushing north.'
    },
    ru: {
      question: 'Какова высота Эвереста?',
      options: ['7 500 м', '8 849 м', '9 200 м', '10 000 м'],
      explanation: 'Эверест — 8 849 м над уровнем моря, и растёт примерно на 4 мм в год: Индийская плита продолжает давить на север.'
    },
    de: {
      question: 'Wie hoch ist der Everest?',
      options: ['7.500 m', '8.849 m', '9.200 m', '10.000 m'],
      explanation: 'Der Everest ragt 8.849 m über den Meeresspiegel und wächst jährlich um etwa 4 mm, weil Indien weiter nach Norden drückt.'
    },
    fr: {
      question: 'Quelle est l’altitude de l’Everest ?',
      options: ['7 500 m', '8 849 m', '9 200 m', '10 000 m'],
      explanation: 'L’Everest culmine à 8 849 m et gagne environ 4 mm par an, l’Inde continuant de pousser vers le nord.'
    },
    es: {
      question: '¿Qué altura tiene el Everest?',
      options: ['7500 m', '8849 m', '9200 m', '10 000 m'],
      explanation: 'El Everest se eleva 8849 m sobre el nivel del mar y gana unos 4 mm al año: la India sigue empujando hacia el norte.'
    },
    ja: {
      question: 'エベレストの標高は？',
      options: ['7,500 m', '8,849 m', '9,200 m', '10,000 m'],
      explanation: 'エベレストは海抜8,849 m。インド亜大陸が北へ押し続けているため、年に約4 mmずつ高くなっています。'
    }
  },
  {
    id: 'mountain-air',
    correctIdx: 2,
    triggerCategory: 'mountain',
    en: {
      question: 'At the summit of an 8 000 m peak, how much oxygen is in a breath compared with sea level?',
      options: ['About 80%', 'About 60%', 'About 33%', 'About 10%'],
      explanation: 'Air pressure falls with altitude, so a lungful at 8 000 m holds roughly a third of the oxygen it does at sea level. Above that lies the death zone.'
    },
    ru: {
      question: 'Сколько кислорода во вдохе на вершине восьмитысячника по сравнению с уровнем моря?',
      options: ['Около 80%', 'Около 60%', 'Около 33%', 'Около 10%'],
      explanation: 'Давление падает с высотой: на 8 000 м во вдохе примерно треть того кислорода, что у моря. Выше начинается «зона смерти».'
    },
    de: {
      question: 'Wie viel Sauerstoff steckt auf dem Gipfel eines Achttausenders in einem Atemzug – verglichen mit Meereshöhe?',
      options: ['Etwa 80 %', 'Etwa 60 %', 'Etwa 33 %', 'Etwa 10 %'],
      explanation: 'Der Luftdruck fällt mit der Höhe: Auf 8.000 m enthält ein Atemzug rund ein Drittel des Sauerstoffs von Meereshöhe. Darüber beginnt die Todeszone.'
    },
    fr: {
      question: 'Au sommet d’un 8 000, quelle quantité d’oxygène contient une inspiration par rapport au niveau de la mer ?',
      options: ['Environ 80 %', 'Environ 60 %', 'Environ 33 %', 'Environ 10 %'],
      explanation: 'La pression chute avec l’altitude : à 8 000 m, une inspiration ne contient qu’un tiers de l’oxygène du niveau de la mer. Au-dessus commence la zone de la mort.'
    },
    es: {
      question: 'En la cima de un ochomil, ¿cuánto oxígeno hay en una inspiración frente al nivel del mar?',
      options: ['Alrededor del 80 %', 'Alrededor del 60 %', 'Alrededor del 33 %', 'Alrededor del 10 %'],
      explanation: 'La presión cae con la altitud: a 8000 m una bocanada tiene aproximadamente un tercio del oxígeno que al nivel del mar. Por encima empieza la zona de la muerte.'
    },
    ja: {
      question: '8,000 m級の山頂では、一呼吸に含まれる酸素は海面のどれくらい？',
      options: ['約80%', '約60%', '約33%', '約10%'],
      explanation: '高度が上がると気圧が下がります。8,000 mでの一呼吸に含まれる酸素は海面のおよそ3分の1。その上は「デスゾーン」です。'
    }
  },
  {
    id: 'alps-growth',
    correctIdx: 0,
    triggerCategory: 'mountain',
    en: {
      question: 'Why are the Alps still growing?',
      options: [
        'Africa is colliding with Europe',
        'Glaciers melting off the weight',
        'Volcanic activity underneath',
        'They are not — they shrink'
      ],
      explanation: 'The African plate is pushing into Eurasia at about a centimetre a year, and the Alps are the crumple zone.'
    },
    ru: {
      question: 'Почему Альпы до сих пор растут?',
      options: [
        'Африка наезжает на Европу',
        'Тают ледники, снимая вес',
        'Из-за вулканизма снизу',
        'Не растут — они разрушаются'
      ],
      explanation: 'Африканская плита въезжает в Евразийскую примерно на сантиметр в год, а Альпы — зона смятия на этом стыке.'
    },
    de: {
      question: 'Warum wachsen die Alpen immer noch?',
      options: [
        'Afrika kollidiert mit Europa',
        'Gletscher schmelzen und nehmen Gewicht weg',
        'Vulkanismus von unten',
        'Sie wachsen nicht – sie werden abgetragen'
      ],
      explanation: 'Die Afrikanische Platte schiebt sich mit etwa einem Zentimeter pro Jahr in Eurasien hinein, und die Alpen sind die Knautschzone.'
    },
    fr: {
      question: 'Pourquoi les Alpes continuent-elles de grandir ?',
      options: [
        'L’Afrique entre en collision avec l’Europe',
        'Les glaciers fondent et allègent la charge',
        'Le volcanisme sous-jacent',
        'Elles ne grandissent pas — elles s’érodent'
      ],
      explanation: 'La plaque africaine s’enfonce dans l’Eurasie d’environ un centimètre par an, et les Alpes sont la zone de froissement.'
    },
    es: {
      question: '¿Por qué siguen creciendo los Alpes?',
      options: [
        'África choca contra Europa',
        'Los glaciares se derriten y quitan peso',
        'Volcanismo por debajo',
        'No crecen: se erosionan'
      ],
      explanation: 'La placa africana se empotra en la euroasiática a razón de un centímetro al año, y los Alpes son la zona de arrugamiento.'
    },
    ja: {
      question: 'アルプスがいまも高くなり続けているのはなぜ？',
      options: [
        'アフリカがヨーロッパに衝突しているから',
        '氷河が融けて重みが減ったから',
        '地下の火山活動',
        '高くなってはいない——削られている'
      ],
      explanation: 'アフリカプレートが年に約1 cmずつユーラシアへめり込んでいます。アルプスはその衝突がしわを寄せた部分です。'
    }
  },

  // --- sea -----------------------------------------------------------------
  {
    id: 'deepest-ocean',
    correctIdx: 1,
    triggerCategory: 'sea',
    en: {
      question: 'Which ocean holds the deepest point on Earth?',
      options: ['Atlantic', 'Pacific', 'Indian', 'Arctic'],
      explanation: 'The Mariana Trench in the Pacific reaches 11 034 m. Everest would sit inside it with two kilometres of water to spare.'
    },
    ru: {
      question: 'В каком океане самая глубокая точка Земли?',
      options: ['Атлантический', 'Тихий', 'Индийский', 'Северный Ледовитый'],
      explanation: 'Марианская впадина в Тихом океане — 11 034 м. Эверест поместился бы в неё целиком, и сверху осталось бы два километра воды.'
    },
    de: {
      question: 'In welchem Ozean liegt der tiefste Punkt der Erde?',
      options: ['Atlantik', 'Pazifik', 'Indischer Ozean', 'Nordpolarmeer'],
      explanation: 'Der Marianengraben im Pazifik reicht 11.034 m hinab. Der Everest hätte darin Platz – und darüber blieben noch zwei Kilometer Wasser.'
    },
    fr: {
      question: 'Quel océan abrite le point le plus profond de la Terre ?',
      options: ['Atlantique', 'Pacifique', 'Indien', 'Arctique'],
      explanation: 'La fosse des Mariannes, dans le Pacifique, descend à 11 034 m. L’Everest y tiendrait entier, et il resterait deux kilomètres d’eau au-dessus.'
    },
    es: {
      question: '¿En qué océano está el punto más profundo de la Tierra?',
      options: ['Atlántico', 'Pacífico', 'Índico', 'Ártico'],
      explanation: 'La fosa de las Marianas, en el Pacífico, llega a 11 034 m. El Everest cabría entero y aún quedarían dos kilómetros de agua por encima.'
    },
    ja: {
      question: '地球でいちばん深い場所があるのはどの海？',
      options: ['大西洋', '太平洋', 'インド洋', '北極海'],
      explanation: '太平洋のマリアナ海溝は深さ11,034 m。エベレストをすっぽり沈めても、まだ2 kmの水が上に残ります。'
    }
  },
  {
    id: 'sea-colour',
    correctIdx: 2,
    triggerCategory: 'sea',
    en: {
      question: 'Why does the open ocean look dark blue from altitude?',
      options: [
        'It reflects the sky',
        'Because of dissolved salt',
        'Water absorbs red light first',
        'Plankton tint it'
      ],
      explanation: 'Water swallows the red end of the spectrum within a few metres, so what comes back to your eye at cruise is what is left: blue.'
    },
    ru: {
      question: 'Почему открытый океан с высоты выглядит тёмно-синим?',
      options: [
        'Отражает небо',
        'Из-за растворённой соли',
        'Вода первой поглощает красный свет',
        'Его подкрашивает планктон'
      ],
      explanation: 'Вода гасит красную часть спектра за первые метры, и до глаза с эшелона доходит то, что осталось, — синий.'
    },
    de: {
      question: 'Warum wirkt der offene Ozean aus der Höhe dunkelblau?',
      options: [
        'Er spiegelt den Himmel',
        'Wegen des gelösten Salzes',
        'Wasser schluckt zuerst das rote Licht',
        'Plankton färbt ihn'
      ],
      explanation: 'Wasser verschluckt das rote Ende des Spektrums schon in den ersten Metern. Was auf Reiseflughöhe zurück ins Auge kommt, ist der Rest: Blau.'
    },
    fr: {
      question: 'Pourquoi le grand large paraît-il bleu foncé vu d’en haut ?',
      options: [
        'Il reflète le ciel',
        'À cause du sel dissous',
        'L’eau absorbe d’abord le rouge',
        'Le plancton le colore'
      ],
      explanation: 'L’eau avale le rouge du spectre en quelques mètres. Ce qui remonte jusqu’à l’œil depuis le niveau de croisière, c’est ce qui reste : le bleu.'
    },
    es: {
      question: '¿Por qué el océano abierto se ve azul oscuro desde la altura?',
      options: [
        'Refleja el cielo',
        'Por la sal disuelta',
        'El agua absorbe primero la luz roja',
        'Lo tiñe el plancton'
      ],
      explanation: 'El agua se traga el extremo rojo del espectro en los primeros metros. Lo que llega al ojo desde altitud de crucero es lo que queda: el azul.'
    },
    ja: {
      question: '外洋が上空から濃い青に見えるのはなぜ？',
      options: [
        '空を映しているから',
        '溶けた塩のせい',
        '水が赤い光を先に吸収するから',
        'プランクトンが染めているから'
      ],
      explanation: '水は数メートルで赤い波長を吸い込んでしまいます。巡航高度の目に返ってくるのは、残った青だけです。'
    }
  },

  // --- lake ----------------------------------------------------------------
  {
    id: 'baikal-share',
    correctIdx: 2,
    triggerCategory: 'lake',
    en: {
      question: 'What share of the planet’s unfrozen fresh water is in Lake Baikal?',
      options: ['5%', '12%', '20%', '35%'],
      explanation: 'About a fifth — more than all five Great Lakes combined. Baikal is 1 642 m deep and still opening, a rift becoming an ocean.'
    },
    ru: {
      question: 'Какая доля незамёрзшей пресной воды планеты — в Байкале?',
      options: ['5%', '12%', '20%', '35%'],
      explanation: 'Около пятой части — больше, чем во всех пяти Великих озёрах вместе. Глубина 1 642 м, и рифт продолжает расходиться: Байкал становится океаном.'
    },
    de: {
      question: 'Welcher Anteil des ungefrorenen Süßwassers der Erde liegt im Baikalsee?',
      options: ['5 %', '12 %', '20 %', '35 %'],
      explanation: 'Etwa ein Fünftel – mehr als alle fünf Großen Seen zusammen. Der Baikal ist 1.642 m tief, und der Graben öffnet sich weiter: Er wird zum Ozean.'
    },
    fr: {
      question: 'Quelle part de l’eau douce non gelée de la planète se trouve dans le Baïkal ?',
      options: ['5 %', '12 %', '20 %', '35 %'],
      explanation: 'Environ un cinquième — plus que les cinq Grands Lacs réunis. Le Baïkal fait 1 642 m de fond, et le rift continue de s’écarter : il devient un océan.'
    },
    es: {
      question: '¿Qué proporción del agua dulce no congelada del planeta está en el Baikal?',
      options: ['5 %', '12 %', '20 %', '35 %'],
      explanation: 'Cerca de una quinta parte, más que los cinco Grandes Lagos juntos. Tiene 1642 m de profundidad y el rift sigue abriéndose: el Baikal se está convirtiendo en océano.'
    },
    ja: {
      question: '地球の凍っていない淡水のうち、バイカル湖が占める割合は？',
      options: ['5%', '12%', '20%', '35%'],
      explanation: 'およそ5分の1——五大湖すべてを合わせたより多い量です。水深1,642 m、地溝はいまも広がり続けており、バイカルは海になりつつあります。'
    }
  },
  {
    id: 'aral',
    correctIdx: 1,
    triggerCategory: 'lake',
    en: {
      question: 'The Aral Sea lost roughly 90% of its volume. What did it?',
      options: ['A drought', 'Irrigation canals', 'An earthquake', 'Rising temperatures'],
      explanation: 'Its two feeder rivers were diverted to cotton fields from the 1960s. The sea dried out within one generation, leaving ships in the sand.'
    },
    ru: {
      question: 'Аральское море потеряло около 90% объёма. Из-за чего?',
      options: ['Засуха', 'Оросительные каналы', 'Землетрясение', 'Потепление'],
      explanation: 'С 1960-х две питавшие его реки разобрали на хлопок. Море высохло за одно поколение, оставив корабли в песке.'
    },
    de: {
      question: 'Der Aralsee verlor rund 90 % seines Volumens. Wodurch?',
      options: ['Eine Dürre', 'Bewässerungskanäle', 'Ein Erdbeben', 'Steigende Temperaturen'],
      explanation: 'Ab den 1960er-Jahren wurden seine beiden Zuflüsse auf Baumwollfelder umgeleitet. Der See trocknete binnen einer Generation aus und ließ Schiffe im Sand zurück.'
    },
    fr: {
      question: 'La mer d’Aral a perdu près de 90 % de son volume. À cause de quoi ?',
      options: ['Une sécheresse', 'Des canaux d’irrigation', 'Un séisme', 'Le réchauffement'],
      explanation: 'À partir des années 1960, ses deux fleuves nourriciers ont été détournés vers les champs de coton. La mer s’est asséchée en une génération, laissant des navires dans le sable.'
    },
    es: {
      question: 'El mar de Aral perdió cerca del 90 % de su volumen. ¿Por qué?',
      options: ['Una sequía', 'Canales de riego', 'Un terremoto', 'El calentamiento'],
      explanation: 'Desde los años sesenta sus dos ríos se desviaron a campos de algodón. El mar se secó en una generación y dejó barcos varados en la arena.'
    },
    ja: {
      question: 'アラル海は体積の約90%を失いました。原因は？',
      options: ['干ばつ', '灌漑用水路', '地震', '気温上昇'],
      explanation: '1960年代以降、流入する2本の川が綿花畑へ引かれました。海は一世代のうちに干上がり、砂の上に船だけが残されました。'
    }
  },

  // --- river ---------------------------------------------------------------
  {
    id: 'river-meanders',
    correctIdx: 0,
    triggerCategory: 'river',
    en: {
      question: 'Why do lowland rivers wind instead of running straight?',
      options: [
        'Flow erodes the outer bank and deposits on the inner',
        'They follow cracks in the bedrock',
        'The Earth’s rotation bends them',
        'Vegetation blocks a straight path'
      ],
      explanation: 'Water runs fastest on the outside of a bend, cutting that bank away while dropping sediment on the slow inner side. Every curve deepens itself.'
    },
    ru: {
      question: 'Почему равнинные реки петляют, а не текут прямо?',
      options: [
        'Поток размывает внешний берег и намывает внутренний',
        'Они идут по трещинам в породе',
        'Их закручивает вращение Земли',
        'Мешает растительность'
      ],
      explanation: 'На внешней стороне излучины течение быстрее — оно подмывает берег, а на медленной внутренней откладывает наносы. Каждый изгиб углубляет сам себя.'
    },
    de: {
      question: 'Warum mäandern Tieflandflüsse, statt gerade zu fließen?',
      options: [
        'Die Strömung nagt am Außenufer und lagert am Innenufer ab',
        'Sie folgen Rissen im Grundgestein',
        'Die Erdrotation krümmt sie',
        'Bewuchs versperrt den geraden Weg'
      ],
      explanation: 'In der Außenkurve fließt das Wasser am schnellsten und trägt das Ufer ab, an der langsamen Innenseite setzt es Sediment ab. Jede Biegung vertieft sich selbst.'
    },
    fr: {
      question: 'Pourquoi les fleuves de plaine serpentent-ils au lieu d’aller droit ?',
      options: [
        'Le courant érode la rive extérieure et dépose sur l’intérieure',
        'Ils suivent les fractures de la roche',
        'La rotation de la Terre les incurve',
        'La végétation barre la ligne droite'
      ],
      explanation: 'L’eau va le plus vite à l’extérieur d’un méandre : elle y ronge la berge, tandis qu’elle dépose ses sédiments du côté lent. Chaque courbe se creuse elle-même.'
    },
    es: {
      question: '¿Por qué los ríos de llanura serpentean en vez de ir rectos?',
      options: [
        'La corriente erosiona la orilla exterior y deposita en la interior',
        'Siguen fracturas de la roca',
        'La rotación terrestre los curva',
        'La vegetación bloquea el camino recto'
      ],
      explanation: 'En la parte exterior de un meandro el agua corre más rápido y se lleva la orilla; en la interior, lenta, suelta sedimento. Cada curva se ahonda a sí misma.'
    },
    ja: {
      question: '平野の川がまっすぐ流れず蛇行するのはなぜ？',
      options: [
        '外側の岸を削り、内側に土砂を積むから',
        '岩盤の割れ目をたどるから',
        '地球の自転で曲がるから',
        '植生が直進をさえぎるから'
      ],
      explanation: 'カーブの外側ほど流れが速く岸を削り、遅い内側には土砂がたまります。曲がりはひとりでに深くなっていきます。'
    }
  },

  // --- city ----------------------------------------------------------------
  {
    id: 'city-lights',
    correctIdx: 1,
    triggerCategory: 'city',
    en: {
      question: 'From cruise altitude at night, what makes a city look orange?',
      options: ['Car headlights', 'Sodium street lamps', 'Heating exhaust', 'Airport beacons'],
      explanation: 'Sodium-vapour street lighting emits an intense narrow orange. Cities switching to white LEDs are visibly changing colour from above, decade by decade.'
    },
    ru: {
      question: 'Почему ночной город с эшелона кажется оранжевым?',
      options: ['Фары машин', 'Натриевые фонари', 'Выхлоп котельных', 'Огни аэропортов'],
      explanation: 'Натриевые лампы дают узкий и яркий оранжевый. Города, переходящие на белые светодиоды, десятилетие за десятилетием меняют цвет — это видно сверху.'
    },
    de: {
      question: 'Was lässt eine Stadt nachts aus Reiseflughöhe orange leuchten?',
      options: ['Autoscheinwerfer', 'Natriumdampflampen', 'Abgase der Heizungen', 'Flughafenbefeuerung'],
      explanation: 'Natriumdampflampen strahlen ein schmales, intensives Orange ab. Städte, die auf weiße LEDs umstellen, ändern von oben sichtbar ihre Farbe – Jahrzehnt für Jahrzehnt.'
    },
    fr: {
      question: 'Vue du niveau de croisière la nuit, pourquoi une ville paraît-elle orange ?',
      options: ['Les phares des voitures', 'Les lampes au sodium', 'Les fumées de chauffage', 'Les balises d’aéroport'],
      explanation: 'L’éclairage au sodium émet un orange étroit et intense. Les villes qui passent aux LED blanches changent visiblement de couleur vues d’en haut, décennie après décennie.'
    },
    es: {
      question: 'De noche, desde altitud de crucero, ¿qué hace que una ciudad se vea naranja?',
      options: ['Los faros de los coches', 'Las lámparas de sodio', 'El humo de las calderas', 'Las balizas del aeropuerto'],
      explanation: 'El alumbrado de vapor de sodio emite un naranja estrecho e intenso. Las ciudades que cambian a LED blanco están cambiando de color a ojos vistas desde arriba, década tras década.'
    },
    ja: {
      question: '夜の巡航高度から街がオレンジ色に見えるのはなぜ？',
      options: ['車のヘッドライト', 'ナトリウム灯', '暖房の排気', '空港の灯火'],
      explanation: 'ナトリウム灯は狭く強いオレンジを出します。白色LEDへ切り替えた街は上空から見て色が変わっていく——十年単位で進む変化です。'
    }
  },
  {
    id: 'city-grid',
    correctIdx: 2,
    triggerCategory: 'city',
    en: {
      question: 'Why are American cities laid out on grids while European ones are not?',
      options: [
        'Different soil',
        'Grids are cheaper to pave',
        'They were surveyed before they were settled',
        'Earthquake regulations'
      ],
      explanation: 'Much of the United States was measured into a rectangular survey grid before anyone lived there. European cities grew along roads and rivers that were already in use.'
    },
    ru: {
      question: 'Почему американские города разбиты сеткой, а европейские нет?',
      options: [
        'Разные грунты',
        'Сетку дешевле мостить',
        'Их разметили до того, как заселили',
        'Требования сейсмики'
      ],
      explanation: 'Бо́льшую часть США расчертили прямоугольной межевой сеткой ещё до заселения. Европейские города росли вдоль дорог и рек, которые уже существовали.'
    },
    de: {
      question: 'Warum sind amerikanische Städte im Raster angelegt und europäische nicht?',
      options: [
        'Anderer Untergrund',
        'Raster sind billiger zu pflastern',
        'Sie wurden vermessen, bevor jemand dort lebte',
        'Erdbebenvorschriften'
      ],
      explanation: 'Große Teile der USA wurden in ein rechtwinkliges Vermessungsraster eingeteilt, bevor dort jemand siedelte. Europäische Städte wuchsen entlang von Straßen und Flüssen, die es längst gab.'
    },
    fr: {
      question: 'Pourquoi les villes américaines sont-elles en damier et pas les européennes ?',
      options: [
        'Des sols différents',
        'Le damier coûte moins cher à paver',
        'Elles ont été arpentées avant d’être habitées',
        'Les normes parasismiques'
      ],
      explanation: 'Une grande partie des États-Unis a été découpée en une grille cadastrale rectangulaire avant que quiconque s’y installe. Les villes européennes, elles, ont grandi le long de routes et de rivières déjà là.'
    },
    es: {
      question: '¿Por qué las ciudades estadounidenses son cuadrículas y las europeas no?',
      options: [
        'Suelos distintos',
        'La cuadrícula es más barata de pavimentar',
        'Se midieron antes de poblarse',
        'Normativa sísmica'
      ],
      explanation: 'Buena parte de Estados Unidos se dividió en una retícula catastral rectangular antes de que viviera nadie allí. Las ciudades europeas crecieron a lo largo de caminos y ríos que ya existían.'
    },
    ja: {
      question: 'アメリカの都市が碁盤の目で、ヨーロッパの都市がそうでないのはなぜ？',
      options: [
        '地盤が違うから',
        '碁盤の目のほうが舗装が安いから',
        '人が住む前に測量されたから',
        '耐震規制のため'
      ],
      explanation: 'アメリカの多くの土地は、人が住み始める前に長方形の測量格子で区切られました。ヨーロッパの都市は、すでにあった道や川に沿って育ちました。'
    }
  },

  // --- island --------------------------------------------------------------
  {
    id: 'atoll',
    correctIdx: 0,
    triggerCategory: 'island',
    en: {
      question: 'How does a ring-shaped atoll form?',
      options: [
        'Coral keeps growing as a volcano sinks',
        'A meteor crater fills with sand',
        'Currents pile sand into a circle',
        'A collapsed ice sheet leaves a ring'
      ],
      explanation: 'Coral grows around a volcanic island. The volcano subsides over millions of years, the reef keeps building upward, and the ring outlives the mountain it grew on.'
    },
    ru: {
      question: 'Как образуется кольцевой атолл?',
      options: [
        'Коралл нарастает, пока вулкан опускается',
        'Метеоритный кратер заносит песком',
        'Течения намывают песок кольцом',
        'След обрушившегося ледника'
      ],
      explanation: 'Коралл нарастает вокруг вулканического острова. Вулкан миллионы лет проседает, риф продолжает тянуться вверх — и кольцо переживает гору, на которой выросло.'
    },
    de: {
      question: 'Wie entsteht ein ringförmiges Atoll?',
      options: [
        'Korallen wachsen weiter, während ein Vulkan absinkt',
        'Ein Meteoritenkrater füllt sich mit Sand',
        'Strömungen häufen Sand zu einem Kreis',
        'Ein kollabierter Eisschild hinterlässt einen Ring'
      ],
      explanation: 'Korallen wachsen rings um eine Vulkaninsel. Über Jahrmillionen sinkt der Vulkan ab, das Riff baut weiter nach oben – und der Ring überlebt den Berg, auf dem er wuchs.'
    },
    fr: {
      question: 'Comment se forme un atoll en anneau ?',
      options: [
        'Le corail continue de croître pendant que le volcan s’enfonce',
        'Un cratère de météorite se remplit de sable',
        'Les courants amassent le sable en cercle',
        'Une calotte effondrée laisse un anneau'
      ],
      explanation: 'Le corail pousse autour d’une île volcanique. Le volcan s’affaisse sur des millions d’années, le récif continue de monter, et l’anneau survit à la montagne qui l’a porté.'
    },
    es: {
      question: '¿Cómo se forma un atolón en anillo?',
      options: [
        'El coral sigue creciendo mientras el volcán se hunde',
        'Un cráter de meteorito se llena de arena',
        'Las corrientes amontonan arena en círculo',
        'Un casquete derrumbado deja un anillo'
      ],
      explanation: 'El coral crece alrededor de una isla volcánica. El volcán se hunde durante millones de años, el arrecife sigue subiendo y el anillo sobrevive a la montaña sobre la que creció.'
    },
    ja: {
      question: '環状のサンゴ礁（環礁）はどうやってできる？',
      options: [
        '火山が沈むあいだもサンゴが伸び続けるから',
        '隕石孔に砂がたまるから',
        '海流が砂を円形に積むから',
        '崩れた氷床が輪を残したから'
      ],
      explanation: 'サンゴは火山島のまわりに育ちます。火山は何百万年もかけて沈み、礁は上へ伸び続ける——輪は、それが生まれた山より長く残るのです。'
    }
  },

  // --- volcano -------------------------------------------------------------
  {
    id: 'volcano-ash',
    correctIdx: 1,
    triggerCategory: 'volcano',
    en: {
      question: 'Why do airliners route around volcanic ash?',
      options: [
        'It blocks the pilots’ view',
        'It melts and fuses inside the engines',
        'It is radioactive',
        'It corrodes the paint'
      ],
      explanation: 'Ash is pulverised rock. It melts in the combustion chamber and solidifies on the turbine blades, and engines can flame out — which is why the 2010 Icelandic eruption grounded Europe.'
    },
    ru: {
      question: 'Почему лайнеры обходят вулканический пепел?',
      options: [
        'Он закрывает обзор пилотам',
        'Он плавится и застывает в двигателях',
        'Он радиоактивен',
        'Он разъедает краску'
      ],
      explanation: 'Пепел — это молотая порода. В камере сгорания она плавится и застывает на лопатках турбины, двигатели глохнут. Из-за этого извержение в Исландии в 2010-м остановило всю Европу.'
    },
    de: {
      question: 'Warum umfliegen Verkehrsflugzeuge Vulkanasche?',
      options: [
        'Sie nimmt den Piloten die Sicht',
        'Sie schmilzt und verbackt in den Triebwerken',
        'Sie ist radioaktiv',
        'Sie greift den Lack an'
      ],
      explanation: 'Asche ist zermahlenes Gestein. In der Brennkammer schmilzt sie und erstarrt auf den Turbinenschaufeln, Triebwerke können ausgehen. Deshalb legte der isländische Ausbruch 2010 Europa lahm.'
    },
    fr: {
      question: 'Pourquoi les avions de ligne contournent-ils les cendres volcaniques ?',
      options: [
        'Elles bouchent la vue des pilotes',
        'Elles fondent et se figent dans les moteurs',
        'Elles sont radioactives',
        'Elles attaquent la peinture'
      ],
      explanation: 'La cendre, c’est de la roche pulvérisée. Elle fond dans la chambre de combustion et se resolidifie sur les aubes de turbine, jusqu’à l’extinction des moteurs. D’où l’Europe clouée au sol par l’éruption islandaise de 2010.'
    },
    es: {
      question: '¿Por qué los aviones de línea rodean la ceniza volcánica?',
      options: [
        'Tapa la visión de los pilotos',
        'Se funde y se solidifica dentro de los motores',
        'Es radiactiva',
        'Corroe la pintura'
      ],
      explanation: 'La ceniza es roca pulverizada. Se funde en la cámara de combustión y se solidifica sobre los álabes de la turbina, y los motores pueden apagarse. Por eso la erupción islandesa de 2010 dejó a Europa en tierra.'
    },
    ja: {
      question: '旅客機が火山灰を避けて飛ぶのはなぜ？',
      options: [
        '操縦士の視界をさえぎるから',
        'エンジン内部で溶けて固まるから',
        '放射能を帯びているから',
        '塗装を腐食させるから'
      ],
      explanation: '火山灰は砕けた岩です。燃焼室で溶け、タービン翼で固まり、エンジンが停止することもあります。2010年のアイスランドの噴火がヨーロッパの空を止めたのはこのためです。'
    }
  },

  // --- historic ------------------------------------------------------------
  {
    id: 'silk-road',
    correctIdx: 3,
    triggerCategory: 'historic',
    en: {
      question: 'What travelled the Silk Road that mattered more than silk?',
      options: ['Gold', 'Spices', 'Horses', 'Ideas and disease'],
      explanation: 'Paper, gunpowder, printing and Buddhism moved west along it — and so did the plague. The route reshaped more through what it carried by accident than by trade.'
    },
    ru: {
      question: 'Что шло по Шёлковому пути и значило больше, чем шёлк?',
      options: ['Золото', 'Пряности', 'Лошади', 'Идеи и болезни'],
      explanation: 'На запад по нему двигались бумага, порох, книгопечатание и буддизм — а вместе с ними чума. Путь изменил мир скорее тем, что вёз попутно, чем товаром.'
    },
    de: {
      question: 'Was reiste auf der Seidenstraße und wog schwerer als Seide?',
      options: ['Gold', 'Gewürze', 'Pferde', 'Ideen und Krankheiten'],
      explanation: 'Papier, Schießpulver, Buchdruck und der Buddhismus zogen nach Westen – und mit ihnen die Pest. Die Route veränderte die Welt mehr durch das, was sie nebenbei trug, als durch die Ware.'
    },
    fr: {
      question: 'Qu’est-ce qui circulait sur la route de la soie et comptait plus que la soie ?',
      options: ['L’or', 'Les épices', 'Les chevaux', 'Les idées et les maladies'],
      explanation: 'Le papier, la poudre, l’imprimerie et le bouddhisme sont partis vers l’ouest — la peste aussi. La route a changé le monde davantage par ce qu’elle transportait sans le vouloir que par sa marchandise.'
    },
    es: {
      question: '¿Qué viajaba por la Ruta de la Seda y pesó más que la seda?',
      options: ['El oro', 'Las especias', 'Los caballos', 'Las ideas y las enfermedades'],
      explanation: 'El papel, la pólvora, la imprenta y el budismo fueron hacia el oeste, y con ellos la peste. La ruta transformó el mundo más por lo que llevaba de paso que por su mercancía.'
    },
    ja: {
      question: 'シルクロードを渡ったもので、絹より大きな意味を持ったのは？',
      options: ['金', '香辛料', '馬', '思想と病'],
      explanation: '紙、火薬、印刷、仏教が西へ運ばれ、ペストも一緒に旅をしました。この道が世界を変えたのは、商品よりも「ついでに運ばれたもの」によってでした。'
    }
  },

  // --- landmark / park -----------------------------------------------------
  {
    id: 'desert-cold',
    correctIdx: 2,
    triggerCategory: 'landmark',
    en: {
      question: 'Why can a desert freeze at night after 40 °C at noon?',
      options: [
        'Cold winds from the poles',
        'The sand cools the air',
        'Dry air holds almost no heat',
        'It is an illusion — it does not'
      ],
      explanation: 'Water vapour is what traps warmth overnight. Without it the ground radiates its heat straight to space, and the Sahara regularly drops below freezing before dawn.'
    },
    ru: {
      question: 'Почему в пустыне после сорока градусов днём ночью бывает мороз?',
      options: [
        'Приходят холодные ветры с полюсов',
        'Песок остужает воздух',
        'Сухой воздух почти не держит тепло',
        'Это миф — не бывает'
      ],
      explanation: 'Тепло на ночь удерживает водяной пар. Без него земля отдаёт его прямо в космос — и Сахара к рассвету регулярно уходит ниже нуля.'
    },
    de: {
      question: 'Wie kann eine Wüste nachts frieren, wenn es mittags 40 °C waren?',
      options: [
        'Kalte Winde von den Polen',
        'Der Sand kühlt die Luft',
        'Trockene Luft hält kaum Wärme',
        'Das ist ein Mythos – tut sie nicht'
      ],
      explanation: 'Es ist der Wasserdampf, der die Wärme über Nacht hält. Ohne ihn strahlt der Boden sie direkt ins All ab, und die Sahara fällt vor Sonnenaufgang regelmäßig unter null.'
    },
    fr: {
      question: 'Comment un désert peut-il geler la nuit après 40 °C à midi ?',
      options: [
        'Des vents froids venus des pôles',
        'Le sable refroidit l’air',
        'L’air sec ne retient presque pas la chaleur',
        'C’est un mythe — cela n’arrive pas'
      ],
      explanation: 'C’est la vapeur d’eau qui retient la chaleur la nuit. Sans elle, le sol la renvoie droit vers l’espace, et le Sahara descend régulièrement sous zéro avant l’aube.'
    },
    es: {
      question: '¿Cómo puede helar de noche en un desierto tras 40 °C al mediodía?',
      options: [
        'Vientos fríos de los polos',
        'La arena enfría el aire',
        'El aire seco casi no retiene calor',
        'Es un mito: no ocurre'
      ],
      explanation: 'Lo que retiene el calor durante la noche es el vapor de agua. Sin él, el suelo lo radia directo al espacio, y el Sáhara baja de cero con regularidad antes del amanecer.'
    },
    ja: {
      question: '昼に40 °Cの砂漠が、夜には氷点下になるのはなぜ？',
      options: [
        '極から冷たい風が来るから',
        '砂が空気を冷やすから',
        '乾いた空気は熱をほとんど保てないから',
        '作り話——実際には起きない'
      ],
      explanation: '夜の熱をつなぎとめているのは水蒸気です。それがなければ地面は熱をそのまま宇宙へ逃がします。サハラは夜明け前にしばしば氷点下まで下がります。'
    }
  },
  {
    id: 'taiga-oxygen',
    correctIdx: 3,
    triggerCategory: 'park',
    en: {
      question: 'Which produces most of the oxygen you are breathing right now?',
      options: ['The Amazon', 'Boreal forest', 'Grasslands', 'Ocean plankton'],
      explanation: 'Marine phytoplankton makes over half of it. The Amazon consumes nearly as much as it produces — the lungs of the planet are mostly under water.'
    },
    ru: {
      question: 'Что производит бо́льшую часть кислорода, которым вы сейчас дышите?',
      options: ['Амазония', 'Тайга', 'Степи', 'Океанский планктон'],
      explanation: 'Морской фитопланктон даёт больше половины. Амазония потребляет почти столько же, сколько производит: «лёгкие планеты» в основном под водой.'
    },
    de: {
      question: 'Woher stammt der größte Teil des Sauerstoffs, den Sie gerade einatmen?',
      options: ['Aus dem Amazonas', 'Aus dem Borealwald', 'Aus Grasland', 'Aus dem Meeresplankton'],
      explanation: 'Mehr als die Hälfte macht marines Phytoplankton. Der Amazonas verbraucht fast so viel, wie er erzeugt – die Lungen des Planeten liegen größtenteils unter Wasser.'
    },
    fr: {
      question: 'D’où vient la majeure partie de l’oxygène que vous respirez en ce moment ?',
      options: ['De l’Amazonie', 'De la forêt boréale', 'Des prairies', 'Du plancton océanique'],
      explanation: 'Le phytoplancton marin en produit plus de la moitié. L’Amazonie consomme presque autant qu’elle produit : les poumons de la planète sont surtout sous l’eau.'
    },
    es: {
      question: '¿De dónde sale la mayor parte del oxígeno que respira ahora mismo?',
      options: ['De la Amazonia', 'Del bosque boreal', 'De las praderas', 'Del plancton oceánico'],
      explanation: 'El fitoplancton marino produce más de la mitad. La Amazonia consume casi tanto como genera: los pulmones del planeta están sobre todo bajo el agua.'
    },
    ja: {
      question: 'いま吸っている酸素の大半をつくっているのは？',
      options: ['アマゾンの森', '北方林（タイガ）', '草原', '海の植物プランクトン'],
      explanation: '半分以上は海の植物プランクトンがつくっています。アマゾンは生産量とほぼ同じだけ消費します——「地球の肺」は、その多くが水の下にあるのです。'
    }
  },

  // --- anywhere ------------------------------------------------------------
  {
    id: 'cruise-speed',
    correctIdx: 1,
    en: {
      question: 'How fast is this aircraft moving through the air?',
      options: ['600 km/h', '900 km/h', '1 200 km/h', '1 500 km/h'],
      explanation: 'Airliners cruise near 900 km/h — about 80% of the speed of sound. Going faster costs fuel out of all proportion to the time saved.'
    },
    ru: {
      question: 'С какой скоростью сейчас идёт этот самолёт?',
      options: ['600 км/ч', '900 км/ч', '1 200 км/ч', '1 500 км/ч'],
      explanation: 'Лайнеры идут около 900 км/ч — примерно 80% скорости звука. Быстрее — расход топлива растёт несопоставимо с выигрышем во времени.'
    },
    de: {
      question: 'Wie schnell bewegt sich dieses Flugzeug gerade durch die Luft?',
      options: ['600 km/h', '900 km/h', '1.200 km/h', '1.500 km/h'],
      explanation: 'Verkehrsflugzeuge fliegen um die 900 km/h – etwa 80 % der Schallgeschwindigkeit. Schneller kostet Treibstoff in keinem Verhältnis zur gesparten Zeit.'
    },
    fr: {
      question: 'À quelle vitesse cet avion traverse-t-il l’air en ce moment ?',
      options: ['600 km/h', '900 km/h', '1 200 km/h', '1 500 km/h'],
      explanation: 'Les avions de ligne croisent autour de 900 km/h, soit environ 80 % de la vitesse du son. Aller plus vite coûte en carburant sans commune mesure avec le temps gagné.'
    },
    es: {
      question: '¿A qué velocidad avanza este avión por el aire ahora mismo?',
      options: ['600 km/h', '900 km/h', '1200 km/h', '1500 km/h'],
      explanation: 'Los aviones de línea vuelan cerca de 900 km/h, en torno al 80 % de la velocidad del sonido. Ir más rápido cuesta un combustible desproporcionado frente al tiempo que ahorra.'
    },
    ja: {
      question: 'いまこの機体は空気の中をどれくらいの速さで進んでいる？',
      options: ['600 km/h', '900 km/h', '1,200 km/h', '1,500 km/h'],
      explanation: '旅客機の巡航はおよそ900 km/h、音速の約80%です。それ以上速く飛ぶと、短縮できる時間に見合わないほど燃料を食います。'
    }
  },
  {
    id: 'horizon',
    correctIdx: 2,
    en: {
      question: 'How far can you see from 11 000 m on a clear day?',
      options: ['About 100 km', 'About 200 km', 'About 375 km', 'About 800 km'],
      explanation: 'The horizon sits roughly 375 km away at cruise. Anything beyond that is hidden by the curve of the Earth, however clear the air.'
    },
    ru: {
      question: 'Как далеко видно с 11 000 м в ясный день?',
      options: ['Около 100 км', 'Около 200 км', 'Около 375 км', 'Около 800 км'],
      explanation: 'Горизонт на эшелоне — примерно 375 км. Всё, что дальше, скрыто кривизной Земли, какой бы прозрачной ни была атмосфера.'
    },
    de: {
      question: 'Wie weit sieht man an einem klaren Tag aus 11.000 m?',
      options: ['Etwa 100 km', 'Etwa 200 km', 'Etwa 375 km', 'Etwa 800 km'],
      explanation: 'Der Horizont liegt auf Reiseflughöhe rund 375 km entfernt. Alles dahinter verbirgt die Erdkrümmung – so klar die Luft auch sein mag.'
    },
    fr: {
      question: 'Jusqu’où voit-on depuis 11 000 m par temps clair ?',
      options: ['Environ 100 km', 'Environ 200 km', 'Environ 375 km', 'Environ 800 km'],
      explanation: 'À l’altitude de croisière, l’horizon se tient à quelque 375 km. Au-delà, la courbure de la Terre cache tout, si limpide que soit l’air.'
    },
    es: {
      question: '¿Hasta dónde se ve desde 11 000 m en un día despejado?',
      options: ['Unos 100 km', 'Unos 200 km', 'Unos 375 km', 'Unos 800 km'],
      explanation: 'A altitud de crucero el horizonte queda a unos 375 km. Todo lo que hay más allá lo esconde la curvatura de la Tierra, por limpio que esté el aire.'
    },
    ja: {
      question: '晴れた日、11,000 mからどこまで見える？',
      options: ['約100 km', '約200 km', '約375 km', '約800 km'],
      explanation: '巡航高度の地平線までは約375 km。どれだけ空気が澄んでいても、その先は地球の丸みに隠れています。'
    }
  },
  {
    id: 'window-shape',
    correctIdx: 0,
    en: {
      question: 'Why are aircraft windows rounded rather than square?',
      options: [
        'Corners concentrate stress and crack',
        'Round glass is cheaper',
        'For a better view',
        'To fit the fuselage curve'
      ],
      explanation: 'Two Comet airliners broke up in 1954 because stress concentrated at the corners of their square windows. Every window since has been rounded.'
    },
    ru: {
      question: 'Почему иллюминаторы круглые, а не квадратные?',
      options: [
        'В углах копится напряжение и идёт трещина',
        'Круглое стекло дешевле',
        'Так лучше обзор',
        'Чтобы вписаться в обвод фюзеляжа'
      ],
      explanation: 'В 1954 году две «Кометы» разрушились в воздухе: напряжение концентрировалось в углах квадратных окон. С тех пор иллюминаторы скругляют.'
    },
    de: {
      question: 'Warum sind Flugzeugfenster rund und nicht eckig?',
      options: [
        'In Ecken staut sich Spannung, und es reißt',
        'Rundes Glas ist billiger',
        'Wegen der besseren Aussicht',
        'Um der Rumpfrundung zu folgen'
      ],
      explanation: '1954 zerbrachen zwei Comet-Maschinen in der Luft, weil sich die Spannung in den Ecken ihrer eckigen Fenster konzentrierte. Seither ist jedes Fenster gerundet.'
    },
    fr: {
      question: 'Pourquoi les hublots sont-ils arrondis plutôt que carrés ?',
      options: [
        'Les angles concentrent les contraintes et fissurent',
        'Le verre rond coûte moins cher',
        'Pour la vue',
        'Pour épouser la courbe du fuselage'
      ],
      explanation: 'En 1954, deux Comet se sont disloqués en vol : les contraintes se concentraient aux angles de leurs hublots carrés. Depuis, tous les hublots sont arrondis.'
    },
    es: {
      question: '¿Por qué las ventanillas del avión son redondeadas y no cuadradas?',
      options: [
        'Las esquinas concentran tensión y se agrietan',
        'El cristal redondo es más barato',
        'Para ver mejor',
        'Para seguir la curva del fuselaje'
      ],
      explanation: 'En 1954 dos Comet se rompieron en vuelo porque la tensión se concentraba en las esquinas de sus ventanillas cuadradas. Desde entonces todas se redondean.'
    },
    ja: {
      question: '飛行機の窓が四角ではなく丸みを帯びているのはなぜ？',
      options: [
        '角に応力が集中して亀裂が入るから',
        '丸いガラスのほうが安いから',
        '眺めがよくなるから',
        '胴体の曲面に合わせるため'
      ],
      explanation: '1954年、コメット機2機が空中分解しました。四角い窓の角に応力が集中したためです。以来、旅客機の窓はすべて角を丸めています。'
    }
  },
  {
    id: 'contrail',
    correctIdx: 1,
    en: {
      question: 'What is a contrail made of?',
      options: ['Unburnt fuel', 'Ice crystals', 'Soot', 'Ozone'],
      explanation: 'Engines emit water vapour, which freezes instantly at −55 °C. A contrail is a man-made cirrus cloud, and it lingers only when the air is already humid.'
    },
    ru: {
      question: 'Из чего состоит инверсионный след?',
      options: ['Несгоревшее топливо', 'Кристаллы льда', 'Сажа', 'Озон'],
      explanation: 'Двигатели выбрасывают водяной пар, а при −55 °C он мгновенно замерзает. Инверсионный след — рукотворное перистое облако, и держится он только во влажном воздухе.'
    },
    de: {
      question: 'Woraus besteht ein Kondensstreifen?',
      options: ['Unverbrannter Treibstoff', 'Eiskristalle', 'Ruß', 'Ozon'],
      explanation: 'Triebwerke stoßen Wasserdampf aus, der bei −55 °C sofort gefriert. Ein Kondensstreifen ist eine menschengemachte Zirruswolke – und er bleibt nur, wenn die Luft ohnehin feucht ist.'
    },
    fr: {
      question: 'De quoi est faite une traînée de condensation ?',
      options: ['De carburant imbrûlé', 'De cristaux de glace', 'De suie', 'D’ozone'],
      explanation: 'Les moteurs rejettent de la vapeur d’eau, qui gèle instantanément à −55 °C. Une traînée de condensation est un cirrus fabriqué par l’homme, et elle ne persiste que si l’air est déjà humide.'
    },
    es: {
      question: '¿De qué está hecha una estela de condensación?',
      options: ['Combustible sin quemar', 'Cristales de hielo', 'Hollín', 'Ozono'],
      explanation: 'Los motores expulsan vapor de agua, que a −55 °C se congela al instante. Una estela es un cirro fabricado por el hombre, y solo perdura si el aire ya está húmedo.'
    },
    ja: {
      question: '飛行機雲は何でできている？',
      options: ['燃え残りの燃料', '氷の結晶', 'すす', 'オゾン'],
      explanation: 'エンジンが出す水蒸気は−55 °Cで瞬時に凍ります。飛行機雲は人がつくった巻雲で、空気がもともと湿っているときにだけ長く残ります。'
    }
  }
];

const QUIZ_LOCALES: readonly string[] = ['en', 'ru', 'de', 'fr', 'es', 'ja'];

function textFor(quiz: Quiz): QuizText {
  const loc = getLocale().slice(0, 2);
  return quiz[(QUIZ_LOCALES.includes(loc) ? loc : 'en') as QuizLocale];
}

export interface LocalisedQuiz extends QuizText {
  id: string;
  correctIdx: number;
}

/**
 * A quiz for the place just read, in the active language.
 *
 * Prefers one matching the category so the question follows from the card, and
 * falls back to a general aviation question when that category has none left.
 */
export function getRandomQuiz(category?: string): LocalisedQuiz {
  const matching = category ? QUIZZES.filter((q) => q.triggerCategory === category) : [];
  const pool = matching.length > 0 ? matching : QUIZZES.filter((q) => !q.triggerCategory);
  const source = pool.length > 0 ? pool : QUIZZES;
  const quiz = source[Math.floor(Math.random() * source.length)]!;
  return { id: quiz.id, correctIdx: quiz.correctIdx, ...textFor(quiz) };
}
