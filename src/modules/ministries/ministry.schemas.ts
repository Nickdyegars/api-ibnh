import { z } from 'zod';

export const createMinistrySchema = z.object({
  name: z.string().min(2, "O nome da equipe/ministério deve ter pelo menos 2 caracteres").max(100),
  color: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Cor inválida. Use formato hexadecimal (#3b82f6)").optional().default("#3b82f6"),
  congregation_id: z.string().uuid("ID de congregação inválido").optional().nullable()
});

export const updateMinistrySchema = z.object({
  name: z.string().min(2, "O nome da equipe/ministério deve ter pelo menos 2 caracteres").max(100),
  color: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Cor inválida. Use formato hexadecimal (#3b82f6)").optional().default("#3b82f6"),
  congregation_id: z.string().uuid("ID de congregação inválido").optional().nullable()
});

export type CreateMinistryType = z.infer<typeof createMinistrySchema>;
export type UpdateMinistryType = z.infer<typeof updateMinistrySchema>;
