
export enum EventType {
  KICKOFF = 'Kickoff',
  HALF_START = 'Half Started',
  HALF_END = 'Half Ended',
  GOAL = 'Goal',
  GOAL_REMOVED = 'Goal Removed',
  YELLOW_CARD = 'Yellow Card',
  RED_CARD = 'Red Card',
  EXTRA_TIME = 'Extra Time Added',
}

export type Team = 'home' | 'away';
export type Tab = 'game' | 'report' | 'coin-flip' | 'rules';
export type MatchStatus = 'pre-match' | 'in-progress' | 'half-time' | 'full-time' | 'extra-time';

export interface EventLog {
  id: string;
  gameTimeInSeconds: number;
  type: EventType;
  team?: Team;
  details?: string;
}

export interface Score {
  home: number;
  away: number;
}

export interface Cards {
  home: { yellow: number; red: number };
  away: { yellow: number; red: number };
}

export interface MatchData {
  status: MatchStatus;
  kickoffTeam: Team | null;
  currentHalf: number;
  score: Score;
  cards: Cards;
  eventLog: EventLog[];
  finalScore?: Score;
  date?: number;
}

export interface Settings {
  halfDuration: number; // in seconds
  vibration: boolean;
  theme?: 'light' | 'dark';
}

export interface Rule {
  title: string;
  content: string;
}
