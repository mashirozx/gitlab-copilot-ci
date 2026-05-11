import migration0001 from "./0001_initial.sql" with { type: "text" };

export type Migration = {
  name: string;
  sql: string;
};

export const migrations: Migration[] = [
  { name: "0001_initial", sql: migration0001 },
];
