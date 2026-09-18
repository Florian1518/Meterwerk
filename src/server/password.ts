import { hash, verify } from "@node-rs/argon2";
// 2 = Argon2id; numeric literal avoids ambient const-enum incompatibility with isolatedModules.
export const hashPassword = (password: string) =>
  hash(password, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
export const verifyPassword = (encoded: string, password: string) =>
  verify(encoded, password);
