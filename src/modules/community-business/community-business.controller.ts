// src/modules/community-business/community-business.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { CommunityBusinessService } from './community-business.service.js';
import { communityBusinessSchema, updateCommunityBusinessSchema } from './community-business.schemas.js';
import { uploadImage } from '../../shared/storage/minio.js';

const businessService = new CommunityBusinessService();

export class CommunityBusinessController {

    // Rota Pública
    async getPublic(request: FastifyRequest, reply: FastifyReply) {
        try {
            const businesses = await businessService.getPublicBusinesses();
            return reply.send(businesses);
        } catch (error) {
            return reply.status(500).send({ error: 'Erro ao buscar guia de negócios' });
        }
    }

    // Rotas CMS
    async getAllCms(request: FastifyRequest, reply: FastifyReply) {
        try {
            const businesses = await businessService.getAllForCms();
            return reply.send(businesses);
        } catch (error) {
            return reply.status(500).send({ error: 'Erro ao buscar negócios no CMS' });
        }
    }

    async create(request: FastifyRequest, reply: FastifyReply) {
        try {
            const data = communityBusinessSchema.parse(request.body);
            const newBusiness = await businessService.create(data);
            return reply.status(201).send(newBusiness);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    }

    async update(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { id } = request.params as { id: string };
            const data = updateCommunityBusinessSchema.parse(request.body);
            const updated = await businessService.update(id, data);
            return reply.send(updated);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    }

    async delete(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { id } = request.params as { id: string };
            await businessService.delete(id);
            return reply.send({ message: 'Negócio e imagem apagados com sucesso' });
        } catch (error: any) {
            // 👇 AGORA O SEU TERMINAL VAI MOSTRAR O ERRO REAL 👇
            console.error("❌ Erro ao deletar negócio:", error);
            return reply.status(400).send({ error: error.message || 'Erro ao apagar negócio' });
        }
    }

    async uploadLogo(request: FastifyRequest, reply: FastifyReply) {
        try {
            const data = await request.file();

            if (!data) {
                return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });
            }

            const buffer = await data.toBuffer();

            // Usa a sua função pronta, guardando na pasta 'empreendedores'
            const fileUrl = await uploadImage(data.filename, buffer, data.mimetype, 'empreendedores');

            return reply.send({ url: fileUrl });
        } catch (error) {
            console.error('Erro no upload da logo:', error);
            return reply.status(500).send({ error: 'Erro ao fazer upload da imagem.' });
        }
    }

    async registerClick(request: any, reply: any) {
        try {
            const { id } = request.params;
            const { platform } = request.body;

            // Proteção básica para garantir que só aceitamos 'whatsapp' ou 'instagram'
            if (platform !== 'whatsapp' && platform !== 'instagram') {
                return reply.status(400).send({ error: "Plataforma inválida para registro de clique." });
            }

            // Chama o service para incrementar
            await businessService.registerClick(id, platform);

            return reply.status(200).send({ success: true });
        } catch (error: any) {
            console.error("Erro ao registrar clique:", error);
            return reply.status(500).send({ error: "Erro interno ao registrar métrica." });
        }
    }
}