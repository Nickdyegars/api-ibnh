// src/modules/community-business/community-business.schemas.ts
import { z } from 'zod';

export const communityBusinessSchema = z.object({
  full_name: z.string().min(3, "Nome muito curto"),
  business_name: z.string().min(2, "Nome do negócio obrigatório"),
  categoryIds: z.array(z.string().uuid()).min(1, "Selecione pelo menos uma categoria"),
  professional_type: z.string(),
  phone: z.string().min(10, "Telefone inválido"),
  business_model: z.string(),
  address: z.string().optional().nullable(),
  instagram: z.string().optional().nullable(),
  description: z.string().min(5, "Descrição obrigatória"),
  products_services: z.string().min(5, "Produtos/Serviços obrigatórios"),
  logo_url: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

// Schema para atualização (tudo opcional)
export const updateCommunityBusinessSchema = communityBusinessSchema.partial();

export type CommunityBusinessCreateType = z.infer<typeof communityBusinessSchema>;
export type CommunityBusinessUpdateType = z.infer<typeof updateCommunityBusinessSchema>;