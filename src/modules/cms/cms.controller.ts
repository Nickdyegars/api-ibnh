import { FastifyReply, FastifyRequest } from 'fastify';
import { CmsService } from './cms.service.js';
// 👇 Importando o nosso serviço de Auditoria
import { AuditService } from '../../shared/services/audit/audit.service.js';

const cmsService = new CmsService();

export class CmsController {
    // ==========================================
    // SOBRE NÓS
    // ==========================================
    async getAbout(request: FastifyRequest, reply: FastifyReply) {
        try { return reply.send(await cmsService.getAbout()); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async updateAbout(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const result = await cmsService.updateAbout(request.body);
            
            // 📝 LOG: Atualização do "Sobre Nós"
            AuditService.log(requester.sub, 'UPDATE', 'CMS_ABOUT', undefined, request.body);
            
            return reply.send(result); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }

    // ==========================================
    // CONTATOS
    // ==========================================
    async getContacts(request: FastifyRequest, reply: FastifyReply) {
        try { return reply.send(await cmsService.getContacts()); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async updateContacts(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const result = await cmsService.updateContacts(request.body);
            
            // 📝 LOG: Atualização de Contatos Institucionais
            AuditService.log(requester.sub, 'UPDATE', 'CMS_CONTACTS', undefined, request.body);
            
            return reply.send(result); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }

    // ==========================================
    // PROGRAMAÇÕES
    // ==========================================
    async getPrograms(request: FastifyRequest, reply: FastifyReply) {
        try { return reply.send(await cmsService.getPrograms()); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async createProgram(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const result = await cmsService.createProgram(request.body) as any;
            
            // 📝 LOG: Criação de nova programação semanal
            AuditService.log(requester.sub, 'CREATE', 'CMS_PROGRAM', result?.id, request.body);
            
            return reply.status(201).send(result); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async updateProgram(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const result = await cmsService.updateProgram(id, request.body);
            
            // 📝 LOG: Edição de programação existente
            AuditService.log(requester.sub, 'UPDATE', 'CMS_PROGRAM', id, request.body);
            
            return reply.send(result); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async deleteProgram(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await cmsService.deleteProgram(id);
            
            // 📝 LOG: Exclusão de programação
            AuditService.log(requester.sub, 'DELETE', 'CMS_PROGRAM', id);
            
            return reply.send({ success: true }); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }

    // ==========================================
    // PASTORES
    // ==========================================
    async getPastors(request: FastifyRequest, reply: FastifyReply) {
        try { return reply.send(await cmsService.getPastors()); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async createPastor(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const result = await cmsService.createPastor(request.body) as any;
            
            // 📝 LOG: Cadastro de Pastor/Líder no site
            AuditService.log(requester.sub, 'CREATE', 'CMS_PASTOR', result?.id, request.body);
            
            return reply.status(201).send(result); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async updatePastor(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const result = await cmsService.updatePastor(id, request.body);
            
            // 📝 LOG: Atualização dos dados do pastor
            AuditService.log(requester.sub, 'UPDATE', 'CMS_PASTOR', id, request.body);
            
            return reply.send(result); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async deletePastor(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await cmsService.deletePastor(id);
            
            // 📝 LOG: Remoção de pastor do site
            AuditService.log(requester.sub, 'DELETE', 'CMS_PASTOR', id);
            
            return reply.send({ success: true }); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }

    // ==========================================
    // CÉLULAS
    // ==========================================
    async getCells(request: FastifyRequest, reply: FastifyReply) {
        try { return reply.send(await cmsService.getCells()); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async createCell(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const result = await cmsService.createCell(request.body) as any;
            
            // 📝 LOG: Nova célula cadastrada
            AuditService.log(requester.sub, 'CREATE', 'CMS_CELL', result?.id, request.body);
            
            return reply.status(201).send(result); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async updateCell(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const result = await cmsService.updateCell(id, request.body);
            
            // 📝 LOG: Alteração de dados da célula
            AuditService.log(requester.sub, 'UPDATE', 'CMS_CELL', id, request.body);
            
            return reply.send(result); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async deleteCell(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await cmsService.deleteCell(id);
            
            // 📝 LOG: Célula excluída do banco
            AuditService.log(requester.sub, 'DELETE', 'CMS_CELL', id);
            
            return reply.send({ success: true }); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }

    // ==========================================
    // MINISTÉRIOS
    // ==========================================
    async getMinistries(request: FastifyRequest, reply: FastifyReply) {
        try { return reply.send(await cmsService.getMinistries()); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async createMinistry(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const result = await cmsService.createMinistry(request.body) as any;
            
            // 📝 LOG: Cadastro de ministério da igreja
            AuditService.log(requester.sub, 'CREATE', 'CMS_MINISTRY', result?.id, request.body);
            
            return reply.status(201).send(result); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async updateMinistry(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const result = await cmsService.updateMinistry(id, request.body);
            
            // 📝 LOG: Edição de dados do ministério
            AuditService.log(requester.sub, 'UPDATE', 'CMS_MINISTRY', id, request.body);
            
            return reply.send(result); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async deleteMinistry(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await cmsService.deleteMinistry(id);
            
            // 📝 LOG: Ministério removido do sistema
            AuditService.log(requester.sub, 'DELETE', 'CMS_MINISTRY', id);
            
            return reply.send({ success: true }); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }

    // ==========================================
    // PROJETOS SOCIAIS
    // ==========================================
    async getProjects(request: FastifyRequest, reply: FastifyReply) {
        try { return reply.send(await cmsService.getProjects()); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async createProject(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const result = await cmsService.createProject(request.body) as any;
            
            // 📝 LOG: Novo projeto social publicado
            AuditService.log(requester.sub, 'CREATE', 'CMS_PROJECT', result?.id, request.body);
            
            return reply.status(201).send(result); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async updateProject(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const result = await cmsService.updateProject(id, request.body);
            
            // 📝 LOG: Projeto social atualizado
            AuditService.log(requester.sub, 'UPDATE', 'CMS_PROJECT', id, request.body);
            
            return reply.send(result); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async deleteProject(request: FastifyRequest, reply: FastifyReply) {
        try { 
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await cmsService.deleteProject(id);
            
            // 📝 LOG: Exclusão de projeto social
            AuditService.log(requester.sub, 'DELETE', 'CMS_PROJECT', id);
            
            return reply.send({ success: true }); 
        } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
}