import { z } from 'zod';

export const areaBodySchema = z.object({
  name: z.string().min(2, "O nome da área deve ter pelo menos 2 caracteres"),
  ministry: z.string().min(1, "O ministério é obrigatório"),
});

export type AreaBodyType = z.infer<typeof areaBodySchema>;