import { z } from 'zod';

export const memberBodySchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("E-mail inválido").optional().or(z.literal('')),
  phone: z.string().optional().nullable(),
  ministry: z.string().min(1, "O ministério é obrigatório"),
  role: z.string().optional().nullable(),
  team: z.string().optional().nullable(),
  congregation_id: z.string().uuid("ID de congregação inválido").optional().nullable(),
  // 👇 AQUI! Zod permitindo a lista de IDs das áreas (strings)
  areas: z.array(z.string()).optional(),
  is_active: z.boolean().optional()
});

export type MemberBodyType = z.infer<typeof memberBodySchema>;