import { z } from 'zod';

export const registerActionBodySchema = z.object({
  action: z.string().min(1, 'A ação é obrigatória'),
  page: z.string().optional(),
});