import { FastifyReply, FastifyRequest } from 'fastify';
import { CmsService } from './cms.service.js';
import { AuditService } from '../../shared/services/audit/audit.service.js';
import {
    updateAboutSchema,
    updateContactsSchema,
    programSchema,
    updateProgramSchema,
    pastorSchema,
    updatePastorSchema,
    cellSchema,
    updateCellSchema,
    siteMinistrySchema,
    updateSiteMinistrySchema,
    projectSchema,
    updateProjectSchema
} from './cms.schemas.js';

const cmsService = new CmsService();

function handleCmsError(error: any, reply: FastifyReply, defaultMessage: string = 'Erro interno no servidor') {
    if (error.name === 'ZodError') {
        return reply.status(400).send({ error: error.errors?.[0]?.message || 'Dados inválidos' });
    }
    return reply.status(400).send({ error: error.message || defaultMessage });
}

export class CmsController {
    // ==========================================
    // SOBRE NÓS
    // ==========================================
    async getAbout(request: FastifyRequest, reply: FastifyReply) {
        try {
            return reply.send(await cmsService.getAbout());
        } catch (error: any) {
            return handleCmsError(error, reply, 'Erro ao buscar Sobre Nós');
        }
    }

    async updateAbout(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const data = updateAboutSchema.parse(request.body);
            const result = await cmsService.updateAbout(data);

            AuditService.log(requester.sub, 'UPDATE', 'CMS_ABOUT', undefined, data);
            return reply.send(result);
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    // ==========================================
    // CONTATOS
    // ==========================================
    async getContacts(request: FastifyRequest, reply: FastifyReply) {
        try {
            return reply.send(await cmsService.getContacts());
        } catch (error: any) {
            return handleCmsError(error, reply, 'Erro ao buscar Contatos');
        }
    }

    async updateContacts(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const data = updateContactsSchema.parse(request.body);
            const result = await cmsService.updateContacts(data);

            AuditService.log(requester.sub, 'UPDATE', 'CMS_CONTACTS', undefined, data);
            return reply.send(result);
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    // ==========================================
    // PROGRAMAÇÕES
    // ==========================================
    async getPrograms(request: FastifyRequest, reply: FastifyReply) {
        try {
            return reply.send(await cmsService.getPrograms());
        } catch (error: any) {
            return handleCmsError(error, reply, 'Erro ao buscar programações');
        }
    }

    async createProgram(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const data = programSchema.parse(request.body);
            const result = await cmsService.createProgram(data) as any;

            AuditService.log(requester.sub, 'CREATE', 'CMS_PROGRAM', result?.id, data);
            return reply.status(201).send(result);
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    async updateProgram(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const data = updateProgramSchema.parse(request.body);
            const result = await cmsService.updateProgram(id, data);

            AuditService.log(requester.sub, 'UPDATE', 'CMS_PROGRAM', id, data);
            return reply.send(result);
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    async deleteProgram(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await cmsService.deleteProgram(id);

            AuditService.log(requester.sub, 'DELETE', 'CMS_PROGRAM', id);
            return reply.send({ success: true });
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    // ==========================================
    // PASTORES
    // ==========================================
    async getPastors(request: FastifyRequest, reply: FastifyReply) {
        try {
            return reply.send(await cmsService.getPastors());
        } catch (error: any) {
            return handleCmsError(error, reply, 'Erro ao buscar pastores');
        }
    }

    async createPastor(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const data = pastorSchema.parse(request.body);
            const result = await cmsService.createPastor(data) as any;

            AuditService.log(requester.sub, 'CREATE', 'CMS_PASTOR', result?.id, data);
            return reply.status(201).send(result);
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    async updatePastor(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const data = updatePastorSchema.parse(request.body);
            const result = await cmsService.updatePastor(id, data);

            AuditService.log(requester.sub, 'UPDATE', 'CMS_PASTOR', id, data);
            return reply.send(result);
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    async deletePastor(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await cmsService.deletePastor(id);

            AuditService.log(requester.sub, 'DELETE', 'CMS_PASTOR', id);
            return reply.send({ success: true });
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    // ==========================================
    // CÉLULAS
    // ==========================================
    async getCells(request: FastifyRequest, reply: FastifyReply) {
        try {
            return reply.send(await cmsService.getCells());
        } catch (error: any) {
            return handleCmsError(error, reply, 'Erro ao buscar células');
        }
    }

    async createCell(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const data = cellSchema.parse(request.body);
            const result = await cmsService.createCell(data) as any;

            AuditService.log(requester.sub, 'CREATE', 'CMS_CELL', result?.id, data);
            return reply.status(201).send(result);
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    async updateCell(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const data = updateCellSchema.parse(request.body);
            const result = await cmsService.updateCell(id, data);

            AuditService.log(requester.sub, 'UPDATE', 'CMS_CELL', id, data);
            return reply.send(result);
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    async deleteCell(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await cmsService.deleteCell(id);

            AuditService.log(requester.sub, 'DELETE', 'CMS_CELL', id);
            return reply.send({ success: true });
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    // ==========================================
    // MINISTÉRIOS
    // ==========================================
    async getMinistries(request: FastifyRequest, reply: FastifyReply) {
        try {
            return reply.send(await cmsService.getMinistries());
        } catch (error: any) {
            return handleCmsError(error, reply, 'Erro ao buscar ministérios');
        }
    }

    async createMinistry(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const data = siteMinistrySchema.parse(request.body);
            const result = await cmsService.createMinistry(data) as any;

            AuditService.log(requester.sub, 'CREATE', 'CMS_MINISTRY', result?.id, data);
            return reply.status(201).send(result);
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    async updateMinistry(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const data = updateSiteMinistrySchema.parse(request.body);
            const result = await cmsService.updateMinistry(id, data);

            AuditService.log(requester.sub, 'UPDATE', 'CMS_MINISTRY', id, data);
            return reply.send(result);
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    async deleteMinistry(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await cmsService.deleteMinistry(id);

            AuditService.log(requester.sub, 'DELETE', 'CMS_MINISTRY', id);
            return reply.send({ success: true });
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    // ==========================================
    // PROJETOS SOCIAIS
    // ==========================================
    async getProjects(request: FastifyRequest, reply: FastifyReply) {
        try {
            return reply.send(await cmsService.getProjects());
        } catch (error: any) {
            return handleCmsError(error, reply, 'Erro ao buscar projetos');
        }
    }

    async createProject(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const data = projectSchema.parse(request.body);
            const result = await cmsService.createProject(data) as any;

            AuditService.log(requester.sub, 'CREATE', 'CMS_PROJECT', result?.id, data);
            return reply.status(201).send(result);
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    async updateProject(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const data = updateProjectSchema.parse(request.body);
            const result = await cmsService.updateProject(id, data);

            AuditService.log(requester.sub, 'UPDATE', 'CMS_PROJECT', id, data);
            return reply.send(result);
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }

    async deleteProject(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await cmsService.deleteProject(id);

            AuditService.log(requester.sub, 'DELETE', 'CMS_PROJECT', id);
            return reply.send({ success: true });
        } catch (error: any) {
            return handleCmsError(error, reply);
        }
    }
}