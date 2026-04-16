// src/modules/community-business-category/community-business-category.schemas.ts
import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string().min(2, "O nome da categoria deve ter pelo menos 2 caracteres"),
  is_active: z.boolean().optional(),
});

export const updateCategorySchema = categorySchema.partial();

export type CategoryCreateType = z.infer<typeof categorySchema>;
export type CategoryUpdateType = z.infer<typeof updateCategorySchema>;