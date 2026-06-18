// src/modules/community-business/community-business.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { CommunityBusinessService } from './community-business.service.js';
import { communityBusinessSchema, updateCommunityBusinessSchema } from './community-business.schemas.js';
import { uploadImage } from '../../shared/storage/minio.js';
// 👇 Importando o nosso serviço de Auditoria
import { AuditService } from '../../shared/services/audit/audit.service.js';

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
            const requester = request.user as any;
            const data = communityBusinessSchema.parse(request.body);
            const newBusiness = await businessService.create(data) as any;

            // 📝 LOG: Cadastro de empresa via Painel Admin
            AuditService.log(requester.sub, 'CREATE', 'COMMUNITY_BUSINESS', newBusiness?.id, data);

            return reply.status(201).send(newBusiness);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    }

    async update(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const data = updateCommunityBusinessSchema.parse(request.body);
            const updated = await businessService.update(id, data);

            // 📝 LOG: Atualização de dados/aprovação da empresa
            AuditService.log(requester.sub, 'UPDATE', 'COMMUNITY_BUSINESS', id, data);

            return reply.send(updated);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    }

    async delete(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await businessService.delete(id);

            // 📝 LOG: Exclusão permanente de empresa do guia
            AuditService.log(requester.sub, 'DELETE', 'COMMUNITY_BUSINESS', id);

            return reply.send({ message: 'Negócio e imagem apagados com sucesso' });
        } catch (error: any) {
            console.error("❌ Erro ao deletar negócio:", error);
            return reply.status(400).send({ error: error.message || 'Erro ao apagar negócio' });
        }
    }

    async uploadLogo(request: FastifyRequest, reply: FastifyReply) {
        try {
            const data = await request.file({
                limits: {
                    fileSize: 5 * 1024 * 1024,
                }
            });

            if (!data) {
                return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });
            }

            if (data.file.truncated) {
                return reply.status(400).send({
                    error: 'A imagem é muito grande. O tamanho máximo permitido é de 5MB.'
                });
            }

            const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

            if (!allowedMimeTypes.includes(data.mimetype)) {
                return reply.status(400).send({
                    error: `Formato não permitido: ${data.mimetype}. Envie apenas imagens JPG, PNG ou WEBP.`
                });
            }

            const buffer = await data.toBuffer();

            if (buffer.length === 0) {
                return reply.status(400).send({ error: 'O arquivo enviado está vazio.' });
            }

            const fileUrl = await uploadImage(data.filename, buffer, data.mimetype, 'empreendedores');

            return reply.send({ url: fileUrl });
        } catch (error) {
            console.error('Erro no upload da logo:', error);
            return reply.status(500).send({ error: 'Erro interno ao processar a imagem.' });
        }
    }

    async registerClick(request: any, reply: any) {
        try {
            const { id } = request.params;
            const { platform } = request.body;

            if (platform !== 'whatsapp' && platform !== 'instagram') {
                return reply.status(400).send({ error: "Plataforma inválida para registro de clique." });
            }

            await businessService.registerClick(id, platform);

            return reply.status(200).send({ success: true });
        } catch (error: any) {
            console.error("Erro ao registrar clique:", error);
            return reply.status(500).send({ error: "Erro interno ao registrar métrica." });
        }
    }

    async registerPublic(request: FastifyRequest, reply: FastifyReply) {
        try {
            const data = communityBusinessSchema.parse(request.body);

            // 👇 FORÇAMOS AS CONFIGURAÇÕES DE SEGURANÇA E ORIGEM
            data.is_active = false;
            data.created_by_role = 'PUBLIC';

            const newBusiness = await businessService.create(data);
            return reply.status(201).send(newBusiness);

        } catch (error: any) {
            console.error("Erro no cadastro público:", error);
            if (error.errors) {
                return reply.status(400).send({ error: error.errors[0].message });
            }
            return reply.status(400).send({ error: 'Erro ao processar cadastro. Tente novamente.' });
        }
    }
}