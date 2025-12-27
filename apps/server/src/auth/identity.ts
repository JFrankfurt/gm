import { z } from "zod";

const zIdentityQuery = z.object({
  as: z.string().min(1).optional(),
});

export type Identity = {
  viewerId: string; // mock identity for PoC
};

export function getIdentityFromQuery(query: unknown): Identity {
  const q = zIdentityQuery.parse(query);
  return { viewerId: q.as ?? "anon" };
}
