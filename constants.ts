
import { Settings, Rule } from './types';

export const DEFAULT_SETTINGS: Settings = {
  halfDuration: 45 * 60, // 45 minutes in seconds
  extraHalfDuration: 15 * 60, // 15 minutes in seconds
  vibration: true,
  theme: 'light',
  quickExtraTime: [2 * 60, 3 * 60, 4 * 60], // 2, 3, 4 minutes in seconds
};

export const RULES_CONTENT: Rule[] = [
  {
    title: "Offside",
    content: "A player is in an offside position if any part of their head, body or feet is in the opponents' half (excluding the halfway line) and is nearer to the opponents' goal line than both the ball and the second-last opponent. It is not an offence to be in an offside position. A player is only penalised for offside if, at the moment the ball is played by a teammate, they are involved in active play by: interfering with play, interfering with an opponent, or gaining an advantage by being in that position.",
  },
  {
    title: "Fouls & Misconduct",
    content: "A direct free kick is awarded for fouls like kicking, tripping, charging, pushing, or tackling an opponent carelessly, recklessly, or with excessive force. A penalty kick is awarded if a direct free kick offence occurs inside the player's own penalty area. An indirect free kick is awarded for less serious offences like dangerous play or impeding an opponent without contact. Misconduct is punished with a yellow (caution) or red (sending-off) card.",
  },
  {
    title: "Free Kicks",
    content: "Direct Free Kick: A goal can be scored directly against the opposing team. Indirect Free Kick: A goal can only be scored if the ball touches another player before it enters the goal. The referee indicates an indirect free kick by raising their arm above their head. For all free kicks, opponents must be at least 9.15 m (10 yds) from the ball until it is in play.",
  },
  {
    title: "Penalty Kicks",
    content: "A penalty kick is taken from the penalty mark. The goalkeeper must remain on the goal line, facing the kicker, between the goalposts, without touching the goalposts, crossbar or goal net until the ball has been kicked. All other players must be outside the penalty area, behind the penalty mark, and at least 9.15 m (10 yds) from the penalty mark.",
  },
  {
    title: "Substitutions",
    content: "The number of substitutions allowed is determined by the competition rules. The substitution procedure requires the player being replaced to leave the field at the nearest point on the boundary line, unless the referee indicates otherwise. The substitute can only enter the field after the player being replaced has left and after receiving a signal from the referee.",
  },
  {
    title: "Advantage Rule",
    content: "The referee allows play to continue when a team against which an offence has been committed will benefit from such an advantage. If the anticipated advantage does not ensue at that time or within a few seconds, the referee must penalise the original offence.",
  },
];
