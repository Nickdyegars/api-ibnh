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
            // 👇 1. A TRAVA DE SEGURANÇA (Máx: 5MB) 👇
            // Isso impede ataques de esgotamento de memória (DDoS)
            const data = await request.file({
                limits: {
                    fileSize: 5 * 1024 * 1024, // 5 Megabytes em bytes
                }
            });

            if (!data) {
                return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });
            }

            // 👇 2. VERIFICA SE O ARQUIVO FOI CORTADO PELO LIMITE 👇
            if (data.file.truncated) {
                return reply.status(400).send({ 
                    error: 'A imagem é muito grande. O tamanho máximo permitido é de 5MB.' 
                });
            }

            // 3. LISTA VIP DE ARQUIVOS (Apenas imagens seguras)
            const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

            if (!allowedMimeTypes.includes(data.mimetype)) {
                return reply.status(400).send({
                    error: `Formato não permitido: ${data.mimetype}. Envie apenas imagens JPG, PNG ou WEBP.`
                });
            }

            // Agora é seguro converter para buffer, pois garantimos que tem no máximo 5MB
            const buffer = await data.toBuffer();

            // Trava de Arquivo Vazio
            if (buffer.length === 0) {
                return reply.status(400).send({ error: 'O arquivo enviado está vazio.' });
            }

            // Usa a sua função pronta, guardando na pasta 'empreendedores'
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

    // Adicione junto das outras funções públicas no community-business.controller.ts
    async registerPublic(request: FastifyRequest, reply: FastifyReply) {
        try {
            // 1. Valida os dados usando o Schema Zod para não entrar "lixo" no banco
            const data = communityBusinessSchema.parse(request.body);

            // 2. A CHAVE MESTRA DA SEGURANÇA:
            // Forçamos o negócio a nascer inativo (pendente), não importa o que o "hacker" mandou no JSON
            data.is_active = false;

            // 3. Cria o registro
            const newBusiness = await businessService.create(data);
            return reply.status(201).send(newBusiness);

        } catch (error: any) {
            console.error("Erro no cadastro público:", error);
            // Se for erro do Zod, enviamos a mensagem bonitinha do primeiro erro
            if (error.errors) {
                return reply.status(400).send({ error: error.errors[0].message });
            }
            return reply.status(400).send({ error: 'Erro ao processar cadastro. Tente novamente.' });
        }
    }
}