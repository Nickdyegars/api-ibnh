// src/modules/community-business-category/community-business-category.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { CommunityBusinessCategoryService } from './community-business-category.service.js';
import { categorySchema, updateCategorySchema } from './community-business-category.schemas.js';
// 👇 Importando o nosso serviço de Auditoria
import { AuditService } from '../../shared/services/audit/audit.service.js';

const categoryService = new CommunityBusinessCategoryService();

export class CommunityBusinessCategoryController {
  
  async getPublic(request: FastifyRequest, reply: FastifyReply) {
    try {
      const categories = await categoryService.getPublicCategories();
      return reply.send(categories);
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar categorias' });
    }
  }

  async getAllCms(request: FastifyRequest, reply: FastifyReply) {
    try {
      const categories = await categoryService.getAllForCms();
      return reply.send(categories);
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar categorias no CMS' });
    }
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const data = categorySchema.parse(request.body);
      const newCategory = await categoryService.create(data) as any;

      // 📝 LOG: Criação de nova categoria de negócio
      AuditService.log(requester.sub, 'CREATE', 'BUSINESS_CATEGORY', newCategory?.id, data);

      return reply.status(201).send(newCategory);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      const data = updateCategorySchema.parse(request.body);
      const updated = await categoryService.update(id, data);

      // 📝 LOG: Edição de categoria de negócio existente
      AuditService.log(requester.sub, 'UPDATE', 'BUSINESS_CATEGORY', id, data);

      return reply.send(updated);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      await categoryService.delete(id);

      // 📝 LOG: Remoção de categoria do guia
      AuditService.log(requester.sub, 'DELETE', 'BUSINESS_CATEGORY', id);

      return reply.send({ message: 'Categoria apagada com sucesso' });
    } catch (error) {
      // Se a categoria estiver em uso por algum negócio, o Prisma lançará um erro.
      return reply.status(400).send({ error: 'Erro ao apagar. Verifique se existem negócios usando esta categoria.' });
    }
  }
}