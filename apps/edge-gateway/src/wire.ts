import { sign, verify } from "node:crypto";
import { z } from "zod";

export const envelopeSchema = z
  .object({
    credentialId: z.string().min(1).max(160),
    body: z.string().max(262144),
    signature: z.string().max(128),
  })
  .strict();
export function signedMessage(
  topic: string,
  credentialId: string,
  body: unknown,
  privateKey: string,
) {
  const encoded = JSON.stringify(body);
  return JSON.stringify({
    credentialId,
    body: encoded,
    signature: sign(
      null,
      Buffer.from(`${topic}\n${credentialId}\n${encoded}`),
      privateKey,
    ).toString("base64"),
  });
}
export function verifyMessage(
  topic: string,
  envelope: z.infer<typeof envelopeSchema>,
  publicKey: string,
) {
  return verify(
    null,
    Buffer.from(`${topic}\n${envelope.credentialId}\n${envelope.body}`),
    publicKey,
    Buffer.from(envelope.signature, "base64"),
  );
}
