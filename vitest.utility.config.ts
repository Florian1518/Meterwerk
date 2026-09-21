import { mergeConfig, defineConfig } from "vitest/config";
import base from "./vitest.config";
export default mergeConfig(
  base,
  defineConfig({
    test: { include: ["tests/utility-db.spec.ts"], testTimeout: 30000 },
  }),
);
