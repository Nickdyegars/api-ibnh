import { z } from 'zod';

export const cultDaysEnum = z.enum([
  'DOMINGO',
  'SEGUNDA',
  'TERCA',
  'QUARTA',
  'QUINTA',
  'SEXTA',
  'SABADO'
]);

export const createCongregationSchema = z.object({
  name: z.string().min(2, "O nome da congregação deve ter no mínimo 2 caracteres").max(150),
  city: z.string().max(100).optional().default("Itamaraju"),
  address: z.string().max(255).optional().nullable(),
  cult_days: z.array(z.string()).min(1, "Selecione ao menos um dia de culto na semana").default(["DOMINGO", "QUINTA"]),
  is_main: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true)
});

export const updateCongregationSchema = z.object({
  name: z.string().min(2, "O nome da congregação deve ter no mínimo 2 caracteres").max(150).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(255).optional().nullable(),
  cult_days: z.array(z.string()).min(1, "Selecione ao menos um dia de culto na semana").optional(),
  is_main: z.boolean().optional(),
  is_active: z.boolean().optional()
});

export type CreateCongregationType = z.infer<typeof createCongregationSchema>;
export type UpdateCongregationType = z.infer<typeof updateCongregationSchema>;
