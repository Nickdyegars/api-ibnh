import { z } from 'zod';

export const areaBodySchema = z.object({
  name: z.string().min(2, "O nome da área deve ter pelo menos 2 caracteres"),
  ministry: z.string().min(1, "O ministério é obrigatório"),
  congregation_id: z.string().uuid("ID de congregação inválido").optional().nullable(),
});

export const getAreasQuerySchema = z.object({
  ministry: z.string().min(1, "O ministério é obrigatório"),
  congregationId: z.string().optional().nullable(),
});

export type AreaBodyType = z.infer<typeof areaBodySchema>;
