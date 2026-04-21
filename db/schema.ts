import {
  pgEnum,
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  index,
  primaryKey,
  integer,
} from "drizzle-orm/pg-core";

// Enums

export const userRoleEnum = pgEnum("user_role", ["admin", "player"]);

export const tournamentStatusEnum = pgEnum("tournament_status", [
  "draft",
  "active",
  "finished",
]);

export const roundKindEnum = pgEnum("round_kind", ["groups", "playoff"]);

export const roundStatusEnum = pgEnum("round_status", [
  "sin_abrir",
  "abierta",
  "cerrada",
]);

export const slotTypeEnum = pgEnum("slot_type", [
  "team",
  "bye",
  "group_position",
  "match_winner",
  "match_loser",
]);

// Users

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("player"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Tournaments

export const tournaments = pgTable("tournaments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  status: tournamentStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;

// Teams

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    player1Name: text("player_1_name").notNull(),
    player2Name: text("player_2_name").notNull(),
  },
  (table) => ({
    tournamentIdx: index("teams_tournament_idx").on(table.tournamentId),
  })
);

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

// Groups

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    order: integer("order").notNull(),
  },
  (table) => ({
    tournamentIdx: index("groups_tournament_idx").on(table.tournamentId),
  })
);

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;

// Group teams (join)

export const groupTeams = pgTable(
  "group_teams",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    finalPosition: integer("final_position"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.teamId] }),
    teamIdx: index("group_teams_team_idx").on(table.teamId),
  })
);

export type GroupTeam = typeof groupTeams.$inferSelect;
export type NewGroupTeam = typeof groupTeams.$inferInsert;

// Rounds

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    kind: roundKindEnum("kind").notNull(),
    order: integer("order").notNull(),
    name: text("name").notNull(),
    status: roundStatusEnum("status").notNull().default("sin_abrir"),
  },
  (table) => ({
    tournamentIdx: index("rounds_tournament_idx").on(table.tournamentId),
  })
);

export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;

// Matches

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    order: integer("order").notNull(),
    slotAType: slotTypeEnum("slot_a_type").notNull(),
    slotARef: text("slot_a_ref"),
    slotBType: slotTypeEnum("slot_b_type").notNull(),
    slotBRef: text("slot_b_ref"),
    resultWinnerTeamId: uuid("result_winner_team_id").references(
      () => teams.id,
      { onDelete: "set null" }
    ),
    resultSets: integer("result_sets"),
  },
  (table) => ({
    roundIdx: index("matches_round_idx").on(table.roundId),
    groupIdx: index("matches_group_idx").on(table.groupId),
  })
);

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;

// Predictions

export const predictions = pgTable(
  "predictions",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    predictedWinnerTeamId: uuid("predicted_winner_team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    predictedSets: integer("predicted_sets").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.matchId, table.userId] }),
    userIdx: index("predictions_user_idx").on(table.userId),
  })
);

export type Prediction = typeof predictions.$inferSelect;
export type NewPrediction = typeof predictions.$inferInsert;

// Password reset tokens

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("password_reset_tokens_user_idx").on(table.userId),
  })
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
