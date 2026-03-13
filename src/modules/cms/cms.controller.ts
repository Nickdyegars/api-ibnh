import { FastifyReply, FastifyRequest } from 'fastify';
import { CmsService } from './cms.service.js';

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
        try { return reply.send(await cmsService.updateAbout(request.body)); } 
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
        try { return reply.send(await cmsService.updateContacts(request.body)); } 
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
        try { return reply.status(201).send(await cmsService.createProgram(request.body)); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async updateProgram(request: FastifyRequest, reply: FastifyReply) {
        try { return reply.send(await cmsService.updateProgram((request.params as any).id, request.body)); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async deleteProgram(request: FastifyRequest, reply: FastifyReply) {
        try { await cmsService.deleteProgram((request.params as any).id); return reply.send({ success: true }); } 
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
        try { return reply.status(201).send(await cmsService.createPastor(request.body)); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async updatePastor(request: FastifyRequest, reply: FastifyReply) {
        try { return reply.send(await cmsService.updatePastor((request.params as any).id, request.body)); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async deletePastor(request: FastifyRequest, reply: FastifyReply) {
        try { await cmsService.deletePastor((request.params as any).id); return reply.send({ success: true }); } 
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
        try { return reply.status(201).send(await cmsService.createCell(request.body)); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async updateCell(request: FastifyRequest, reply: FastifyReply) {
        try { return reply.send(await cmsService.updateCell((request.params as any).id, request.body)); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async deleteCell(request: FastifyRequest, reply: FastifyReply) {
        try { await cmsService.deleteCell((request.params as any).id); return reply.send({ success: true }); } 
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
        try { return reply.status(201).send(await cmsService.createMinistry(request.body)); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async updateMinistry(request: FastifyRequest, reply: FastifyReply) {
        try { return reply.send(await cmsService.updateMinistry((request.params as any).id, request.body)); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async deleteMinistry(request: FastifyRequest, reply: FastifyReply) {
        try { await cmsService.deleteMinistry((request.params as any).id); return reply.send({ success: true }); } 
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
        try { return reply.status(201).send(await cmsService.createProject(request.body)); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async updateProject(request: FastifyRequest, reply: FastifyReply) {
        try { return reply.send(await cmsService.updateProject((request.params as any).id, request.body)); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
    async deleteProject(request: FastifyRequest, reply: FastifyReply) {
        try { await cmsService.deleteProject((request.params as any).id); return reply.send({ success: true }); } 
        catch (error: any) { return reply.status(400).send({ error: error.message }); }
    }
}