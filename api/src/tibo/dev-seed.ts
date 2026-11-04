import type { TiboRole } from "./protocol.ts";

export interface SeedMessage {
  readonly role: TiboRole;
  readonly body: string;
  readonly createdAt: number;
  readonly turnId: string;
}

type SeedDay = readonly [day: string, lines: readonly string[]];

const DAYS: readonly SeedDay[] = [
  [
    "2024-06-10",
    [
      "Hi Tibo! I just moved to New York for a new job",
      "NEW YORK. Big city energy! | What's the job?",
      "I'm a product designer at a small design studio called Fieldwork, in Brooklyn",
      "A designer in Brooklyn. You're basically a movie montage now.",
      "Also heads up, I'm allergic to peanuts, so no peanut snack ideas please",
      "Noted forever. **No peanuts.** I take that very seriously.",
    ],
  ],
  [
    "2024-06-12",
    [
      "My sister Priya is visiting me in July, she lives in Chicago",
      "A Priya visit! | What are you two doing?",
      "Probably eating ramen everywhere. I love ramen more than anything",
      "A ramen crawl. This is the best plan I've heard all week.",
    ],
  ],
  [
    "2024-08-03",
    [
      "I adopted a kitten today!! Her name is Mochi",
      "MOCHI. I already love her. | Tell me everything.",
      "She's grey and tiny and she bit my charger cable already",
      "A chaos goblin. Perfect. Hide your cables.",
    ],
  ],
  [
    "2024-11-18",
    [
      "I signed up for the Brooklyn Half Marathon in April",
      "Okay athlete! | Training plan time?",
      "Yes but please never put runs before 9am. I hate mornings, and I hate morning meetings even more",
      "No mornings. Got it. Evening runs only, like a mysterious night jogger.",
    ],
  ],
  [
    "2024-12-24",
    [
      "Flying home to Pune for the holidays to see my parents",
      "Pune for the holidays! Safe flight. | Eat everything your mom makes.",
    ],
  ],
  [
    "2025-03-02",
    [
      "New project: I'm learning Portuguese",
      "Olá! What sparked that?",
      "We're going to Lisbon in September, and I want to order food without pointing",
      "Pointing is a valid language but I respect the ambition.",
    ],
  ],
  [
    "2025-03-05",
    [
      "Portuguese update: I'm on a 10 day streak and I can finally say obrigada properly",
      "TEN DAYS. Obrigada to you. | Keep that streak alive.",
    ],
  ],
  [
    "2025-04-27",
    [
      "I RAN THE HALF MARATHON. 1:58!!",
      "UNDER TWO HOURS. You legend. | How do your legs feel?",
      "Like noodles. Happy noodles",
      "Happy noodle legs are the best kind.",
    ],
  ],
  [
    "2025-07-14",
    [
      "Got promoted to senior designer at Fieldwork today",
      "SENIOR DESIGNER. Look at you climbing! | Celebrating tonight?",
      "Ramen obviously",
      "Obviously. The ramen tradition continues.",
    ],
  ],
  [
    "2025-09-20",
    [
      "I'm in Lisbon!! I ordered pastéis de nata in Portuguese and nobody switched to English",
      "THE PORTUGUESE PAID OFF. | I'm so proud I could cry custard.",
    ],
  ],
  [
    "2025-12-31",
    [
      "New year's resolution: read 20 books in 2026",
      "Twenty books. Bold. I'll be checking in like a tiny librarian.",
    ],
  ],
  [
    "2026-02-01",
    [
      "Big news: I moved to Boston. I left Fieldwork and started at the Harbor Museum as their design lead",
      "BOSTON. And design lead! | That's a whole new chapter.",
      "Mochi hated the car ride but she's exploring the new apartment now",
      "Mochi will own that apartment by tomorrow.",
    ],
  ],
  [
    "2026-02-03",
    [
      "The apartment is in Somerville, it's tiny but it has a window seat Mochi already claimed",
      "Of course she claimed it. Cats know prime real estate.",
    ],
  ],
  [
    "2026-05-09",
    [
      "It's Mochi's second birthday! She got a tuna cake",
      "Happy birthday Mochi! | A tuna cake is very fancy.",
    ],
  ],
  [
    "2026-08-15",
    [
      "Priya got engaged!! The wedding is in Chicago in March 2027",
      "AN ENGAGEMENT. Tell Priya I'm thrilled. | You're giving a speech, right?",
      "Probably, I'm already nervous about it",
      "We'll make it great. Plenty of time to practice.",
    ],
  ],
  [
    "2026-10-20",
    [
      "I want to run a full marathon next. The Cape Cod Marathon in October 2027",
      "A FULL marathon. From happy noodles to legend. | Evening training, as always.",
    ],
  ],
  [
    "2026-10-22",
    [
      "Book count is at 14 so far this year",
      "Fourteen! Six to go and two months to do it. Very doable.",
    ],
  ],
];

export const devSeedThread = (): SeedMessage[] =>
  DAYS.flatMap(([day, lines]) => {
    const start = Date.parse(`${day}T13:00:00Z`);
    let minute = 0;
    let turnId = crypto.randomUUID();
    return lines.flatMap((line, index): SeedMessage[] => {
      if (index % 2 === 0) {
        turnId = crypto.randomUUID();
        minute += 2;
        return [{ role: "user", body: line, createdAt: start + minute * 60_000, turnId: crypto.randomUUID() }];
      }
      return line.split(" | ").map((bubble) => {
        minute += 1;
        return { role: "tibo", body: bubble, createdAt: start + minute * 60_000, turnId };
      });
    });
  });
