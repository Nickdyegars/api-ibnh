// src/modules/members/member.schemas.ts
import { z } from 'zod';

export const memberBodySchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  phone: z.string().optional().nullable(),
  ministry: z.string().min(1, "O ministério é obrigatório"),
});

export type MemberBodyType = z.infer<typeof memberBodySchema>;