// src/modules/landing-config/landing-config.schemas.ts
import { z } from 'zod';

export const landingConfigSchema = z.object({
  show_business_form: z.boolean().default(true),
  
  business_form_url: z.string()
    .url("Insira um link válido")
    .optional()
    .nullable()
    .or(z.literal("")),

  // 👇 NOVOS CAMPOS ADICIONADOS 👇
  show_whatsapp: z.boolean().default(true),
  
  whatsapp_number: z.string()
    .optional()
    .nullable()
    .or(z.literal("")),
});

export const updateLandingConfigSchema = landingConfigSchema.partial();

export type LandingConfigType = z.infer<typeof landingConfigSchema>;
export type UpdateLandingConfigType = z.infer<typeof updateLandingConfigSchema>;