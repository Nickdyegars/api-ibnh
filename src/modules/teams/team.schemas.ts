import { z } from 'zod';

export const teamBodySchema = z.object({
  name: z.string().min(2, "O nome da equipe deve ter pelo menos 2 caracteres"),
  ministry: z.string().min(1, "O ministério é obrigatório"),
});

export const getTeamsQuerySchema = z.object({
  ministry: z.string().min(1, "O ministério é obrigatório para buscar as equipes"),
});

export type TeamBodyType = z.infer<typeof teamBodySchema>;