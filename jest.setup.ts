// Polyfill TextEncoder/TextDecoder for JSDOM (needed by next/cache etc.)
if (typeof globalThis.TextEncoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextEncoder, TextDecoder } = require("util");
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

import "@testing-library/jest-dom";
