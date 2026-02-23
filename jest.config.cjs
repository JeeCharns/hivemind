/* eslint-disable @typescript-eslint/no-require-imports */
// Force UTC timezone before any test worker spawns (deterministic date formatting)
process.env.TZ = "UTC";

const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

/** @type {import('jest').Config} */
const customConfig = {
  testEnvironment: "jsdom",
  clearMocks: true,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/tests/"],
};

module.exports = createJestConfig(customConfig);
