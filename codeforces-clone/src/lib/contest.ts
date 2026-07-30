import raw from "@/data/contest2250.json";

export interface ProblemRow {
  index: string;
  name: string;
  href: string | null;
  /** e.g. "standard input/output" */
  ioMode: string;
  /** e.g. "1 s, 256 MB" */
  limits: string;
  submitHref: string | null;
  solvedCount: string;
  solvedHref: string | null;
}

export interface QuestionRow {
  time: string;
  question: string;
  questionHtml: string;
  answerHtml: string;
}

export interface SidebarBox {
  caption: string;
  classes: string;
  html: string;
}

export interface CapturedTable {
  found: boolean;
  headers: string[];
  rows: string[][];
  /** Original markup, kept so verdict colours and rank classes survive. */
  html?: string;
}

export interface Statement {
  index: string;
  title: string;
  timeLimit: string;
  memoryLimit: string;
  inputFile: string;
  outputFile: string;
  html: string;
}

export interface ContestData {
  contest: { id: string; title: string; phase: string };
  problems: ProblemRow[];
  questions: QuestionRow[];
  sidebar: SidebarBox[];
  /** Per-page sidebars, keyed by capture slug. Room has none. */
  sidebars: Record<string, SidebarBox[]>;
  hacks: CapturedTable;
  mySubmissions: CapturedTable;
  room: CapturedTable;
  /** Whole #pageContent for the Room tab (tab bar and scripts stripped). */
  roomContentHtml: string | null;
  statements: Record<string, Statement>;
}

export const contestData = raw as unknown as ContestData;
export const CONTEST_ID = contestData.contest.id;

/** The room the contest nav actually links to. Discovered from the live page, not guessed. */
export const ROOM_ID = "1";

export const problemIndexes = contestData.problems.map((p) => p.index);
