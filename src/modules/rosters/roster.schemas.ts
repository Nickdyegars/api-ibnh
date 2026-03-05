import { z } from 'zod';

export const getRostersQuerySchema = z.object({
  ministry: z.string().optional().default('all'),
});

// NOVA VALIDAÇÃO PARA CRIAR ESCALA
export const createRosterBodySchema = z.object({
  month: z.string(),
  ministry: z.string(),
  createdBy: z.string().optional(),
  authorId: z.string().optional(),
  shifts: z.array(z.object({
    date: z.string(), // "DD/MM/YYYY"
    dayName: z.string(),
    ministry: z.string().optional(),
    team: z.array(z.string())
  }))
});

export type CreateRosterBodyType = z.infer<typeof createRosterBodySchema>;