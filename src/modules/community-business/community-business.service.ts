// src/modules/community-business/community-business.service.ts
import { prisma } from '../../shared/database/prisma.js';
import { CommunityBusinessCreateType, CommunityBusinessUpdateType } from './community-business.schemas.js';
import { deleteImage } from '../../shared/storage/minio.js';

export class CommunityBusinessService {

    // === PARA O SITE PÚBLICO ===
    // Só retorna os negócios que foram aprovados (is_active: true)
    async getPublicBusinesses() {
        return await prisma.communityBusiness.findMany({
            where: { is_active: true },
            // 👇 ISTO É O QUE FALTA PARA O NOME DA CATEGORIA APARECER 👇
            include: {
                categories: true
            },
            orderBy: { created_at: 'desc' }
        });
    }

    // === PARA O PAINEL CMS ===
    // Retorna TODOS, para a secretaria poder aprovar os novos
    async getAllForCms() {
        return await prisma.communityBusiness.findMany({
            orderBy: { business_name: 'asc' },
            include: {
                categories: true // 👈 Aqui tem que ser PLURAL (categories) e não singular
            },
        });
    }

    // === CRIAÇÃO ===
    async create(data: CommunityBusinessCreateType) {
        return await prisma.communityBusiness.create({
            data: {
                full_name: data.full_name,
                business_name: data.business_name,

                // ❌ A LINHA category_id FOI COMPLETAMENTE APAGADA DAQUI

                professional_type: data.professional_type,
                phone: data.phone,
                business_model: data.business_model,
                description: data.description,
                products_services: data.products_services,
                address: data.address ?? null,
                instagram: data.instagram ?? null,
                logo_url: data.logo_url ?? null,
                is_active: data.is_active ?? false,

                // ✅ O bloco 'categories' tem que ficar AQUI DENTRO do 'data', e não fora!
                categories: {
                    connect: data.categoryIds.map((id: string) => ({ id }))
                }
            } // 👈 O bloco 'data' só fecha aqui!
        });
    }

    async update(id: string, data: CommunityBusinessUpdateType) {
        // 1. Destruímos o objeto 'data' para separar o que é campo de texto (restData)
        // do que é o array de categorias (categoryIds)
        const { categoryIds, ...restData } = data;

        // 2. Criamos o objeto de atualização apenas com os campos que não são 'undefined'
        const updateData: any = Object.fromEntries(
            Object.entries(restData).filter(([_, value]) => value !== undefined)
        );

        // 3. Tratamos a relação Many-to-Many de forma especial
        // O Prisma exige que usemos 'set' para substituir as relações antigas pelas novas
        if (categoryIds && Array.isArray(categoryIds)) {
            updateData.categories = {
                set: categoryIds.map((catId: string) => ({ id: catId }))
            };
        }

        // 4. Agora sim, chamamos o update sem o 'categoryIds' perdido lá dentro
        return await prisma.communityBusiness.update({
            where: { id },
            data: updateData
        });
    }

    async delete(id: string) {
        // 1. Procura o negócio primeiro para saber se ele tem uma logo cadastrada
        const business = await prisma.communityBusiness.findUnique({
            where: { id }
        });

        if (!business) {
            throw new Error("Negócio não encontrado na base de dados.");
        }

        // 2. Se tiver uma imagem, apaga ela do MinIO para não deixar "lixo" no servidor
        if (business.logo_url) {
            await deleteImage(business.logo_url);
        }

        // 3. Finalmente, apaga o registo da base de dados
        await prisma.communityBusiness.delete({
            where: { id }
        });

        return { success: true };
    }

    // === REGISTRO DE CLIQUES ===
    async registerClick(id: string, platform: 'whatsapp' | 'instagram') {
        // Verifica qual plataforma recebeu o clique e prepara o incremento
        const dataToUpdate = platform === 'whatsapp' 
            ? { whatsapp_clicks: { increment: 1 } }
            : { instagram_clicks: { increment: 1 } };

        return await prisma.communityBusiness.update({
            where: { id },
            data: dataToUpdate
        });
    }
}