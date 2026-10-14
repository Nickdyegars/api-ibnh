import { prisma } from '../../shared/database/prisma.js';
import { deleteImage } from '../../shared/storage/minio.js';
import {
    UpdateAboutType,
    UpdateContactsType,
    ProgramType,
    UpdateProgramType,
    PastorType,
    UpdatePastorType,
    CellType,
    UpdateCellType,
    SiteMinistryType,
    UpdateSiteMinistryType,
    ProjectType,
    UpdateProjectType
} from './cms.schemas.js';

export class CmsService {

    // ==========================================
    // SOBRE NÓS
    // ==========================================
    async getAbout() {
        let about = await prisma.siteAbout.findFirst();
        if (!about) {
            about = await prisma.siteAbout.create({
                data: {
                    content: "Bem-vindo à Igreja Batista Novo Horizonte. Edite este texto através do painel administrativo."
                }
            });
        }
        return about;
    }

    async updateAbout(data: UpdateAboutType) {
        const current = await this.getAbout();

        if (current && current.image_url && data.image_url && current.image_url !== data.image_url) {
            await deleteImage(current.image_url);
        }

        return await prisma.siteAbout.update({
            where: { id: current.id },
            data: data as any
        });
    }

    // ==========================================
    // CONTATOS E REDES SOCIAIS
    // ==========================================
    async getContacts() {
        let contacts = await prisma.siteContact.findFirst();
        if (!contacts) {
            contacts = await prisma.siteContact.create({ data: {} });
        }
        return contacts;
    }

    async updateContacts(data: UpdateContactsType) {
        const current = await this.getContacts();
        return await prisma.siteContact.update({
            where: { id: current.id },
            data: data as any
        });
    }

    // ==========================================
    // PROGRAMAÇÕES (CULTOS)
    // ==========================================
    async getPrograms() {
        return await prisma.siteProgram.findMany({ orderBy: { order: 'asc' } });
    }

    async createProgram(data: ProgramType) {
        return await prisma.siteProgram.create({ data: data as any });
    }

    async updateProgram(id: string, data: UpdateProgramType) {
        return await prisma.siteProgram.update({
            where: { id },
            data: data as any
        });
    }

    async deleteProgram(id: string) {
        return await prisma.siteProgram.delete({
            where: { id }
        });
    }

    // ==========================================
    // PASTORES / LIDERANÇA
    // ==========================================
    async getPastors() {
        return await prisma.sitePastor.findMany({ orderBy: { order: 'asc' } });
    }

    async createPastor(data: PastorType) {
        return await prisma.sitePastor.create({ data: data as any });
    }

    async updatePastor(id: string, data: UpdatePastorType) {
        const pastorAtual = await prisma.sitePastor.findUnique({ where: { id } });

        if (pastorAtual && pastorAtual.image_url && data.image_url && pastorAtual.image_url !== data.image_url) {
            await deleteImage(pastorAtual.image_url);
        }

        return await prisma.sitePastor.update({
            where: { id },
            data: data as any
        });
    }

    async deletePastor(id: string) {
        const pastorAtual = await prisma.sitePastor.findUnique({ where: { id } });

        if (pastorAtual && pastorAtual.image_url) {
            await deleteImage(pastorAtual.image_url);
        }

        return await prisma.sitePastor.delete({
            where: { id }
        });
    }

    // ==========================================
    // CÉLULAS / PEQUENOS GRUPOS
    // ==========================================
    async getCells() {
        return await prisma.siteCell.findMany({ orderBy: { order: 'asc' } });
    }

    async createCell(data: CellType) {
        return await prisma.siteCell.create({ data: data as any });
    }

    async updateCell(id: string, data: UpdateCellType) {
        const celulaAtual = await prisma.siteCell.findUnique({ where: { id } });

        if (celulaAtual && celulaAtual.image_url && data.image_url && celulaAtual.image_url !== data.image_url) {
            await deleteImage(celulaAtual.image_url);
        }

        return await prisma.siteCell.update({
            where: { id },
            data: data as any
        });
    }

    async deleteCell(id: string) {
        const celulaAtual = await prisma.siteCell.findUnique({ where: { id } });

        if (celulaAtual && celulaAtual.image_url) {
            await deleteImage(celulaAtual.image_url);
        }

        return await prisma.siteCell.delete({
            where: { id }
        });
    }

    // ==========================================
    // MINISTÉRIOS
    // ==========================================
    async getMinistries() {
        return await prisma.siteMinistry.findMany({ orderBy: { order: 'asc' } });
    }

    async createMinistry(data: SiteMinistryType) {
        return await prisma.siteMinistry.create({ data: data as any });
    }

    async updateMinistry(id: string, data: UpdateSiteMinistryType) {
        const ministerioAtual = await prisma.siteMinistry.findUnique({ where: { id } });

        if (ministerioAtual && ministerioAtual.image_url && data.image_url && ministerioAtual.image_url !== data.image_url) {
            await deleteImage(ministerioAtual.image_url);
        }

        return await prisma.siteMinistry.update({
            where: { id },
            data: data as any
        });
    }

    async deleteMinistry(id: string) {
        const ministerioAtual = await prisma.siteMinistry.findUnique({ where: { id } });

        if (ministerioAtual && ministerioAtual.image_url) {
            await deleteImage(ministerioAtual.image_url);
        }

        return await prisma.siteMinistry.delete({
            where: { id }
        });
    }

    // ==========================================
    // PROJETOS SOCIAIS
    // ==========================================
    async getProjects() {
        return await prisma.siteProject.findMany({ orderBy: { order: 'asc' } });
    }

    async createProject(data: ProjectType) {
        return await prisma.siteProject.create({ data: data as any });
    }

    async updateProject(id: string, data: UpdateProjectType) {
        const projetoAtual = await prisma.siteProject.findUnique({ where: { id } });

        if (projetoAtual && projetoAtual.image_url && data.image_url && projetoAtual.image_url !== data.image_url) {
            await deleteImage(projetoAtual.image_url);
        }

        return await prisma.siteProject.update({
            where: { id },
            data: data as any
        });
    }

    async deleteProject(id: string) {
        const projetoAtual = await prisma.siteProject.findUnique({ where: { id } });

        if (projetoAtual && projetoAtual.image_url) {
            await deleteImage(projetoAtual.image_url);
        }

        return await prisma.siteProject.delete({
            where: { id }
        });
    }
}