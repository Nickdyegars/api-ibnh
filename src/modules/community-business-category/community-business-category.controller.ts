// src/modules/community-business-category/community-business-category.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { CommunityBusinessCategoryService } from './community-business-category.service.js';
import { categorySchema, updateCategorySchema } from './community-business-category.schemas.js';

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
      const data = categorySchema.parse(request.body);
      const newCategory = await categoryService.create(data);
      return reply.status(201).send(newCategory);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const data = updateCategorySchema.parse(request.body);
      const updated = await categoryService.update(id, data);
      return reply.send(updated);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await categoryService.delete(id);
      return reply.send({ message: 'Categoria apagada com sucesso' });
    } catch (error) {
      // Se a categoria estiver em uso por algum negócio, o Prisma lançará um erro.
      return reply.status(400).send({ error: 'Erro ao apagar. Verifique se existem negócios usando esta categoria.' });
    }
  }
}