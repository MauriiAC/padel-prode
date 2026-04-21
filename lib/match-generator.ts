import { randomUUID } from "crypto";

export type SlotType =
  | "team"
  | "bye"
  | "group_position"
  | "match_winner"
  | "match_loser";

export type GeneratedMatch = {
  tempId: string;
  order: number;
  slotAType: SlotType;
  slotARef: string | null;
  slotBType: SlotType;
  slotBRef: string | null;
};

export function generateMatchesForGroup(teamIds: string[]): GeneratedMatch[] {
  if (teamIds.length === 3)
    return generate3(teamIds as [string, string, string]);
  if (teamIds.length === 4)
    return generate4(teamIds as [string, string, string, string]);
  throw new Error(
    `Invalid group size ${teamIds.length}. Groups must have 3 or 4 teams.`
  );
}

function generate3([a, b, c]: [string, string, string]): GeneratedMatch[] {
  return [
    match(0, "team", a, "team", b),
    match(1, "team", a, "team", c),
    match(2, "team", b, "team", c),
  ];
}

function generate4([a, b, c, d]: [
  string,
  string,
  string,
  string
]): GeneratedMatch[] {
  const m1 = match(0, "team", a, "team", b);
  const m2 = match(1, "team", c, "team", d);
  const m3 = match(2, "match_winner", m1.tempId, "match_loser", m2.tempId);
  const m4 = match(3, "match_loser", m1.tempId, "match_winner", m2.tempId);
  return [m1, m2, m3, m4];
}

function match(
  order: number,
  slotAType: SlotType,
  slotARef: string,
  slotBType: SlotType,
  slotBRef: string
): GeneratedMatch {
  return {
    tempId: randomUUID(),
    order,
    slotAType,
    slotARef,
    slotBType,
    slotBRef,
  };
}
