import { prisma } from '../../shared/database/prisma.js';
import { deleteImage } from '../../shared/storage/minio.js';

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

    async updateAbout(data: any) {
        const current = await this.getAbout();

        // 1. Verifica se existe uma foto velha, e se a nova foto for diferente, apaga a velha do MinIO!
        if (current && current.image_url && data.image_url && current.image_url !== data.image_url) {
            await deleteImage(current.image_url);
        }

        // 2. Atualiza os dados no banco
        return await prisma.siteAbout.update({
            where: { id: current.id },
            data
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

    async updateContacts(data: any) {
        const current = await this.getContacts();
        return await prisma.siteContact.update({
            where: { id: current.id },
            data
        });
    }

    // ==========================================
    // PROGRAMAÇÕES (CULTOS)
    // ==========================================
    async getPrograms() {
        return await prisma.siteProgram.findMany({ orderBy: { order: 'asc' } });
    }

    async createProgram(data: any) {
        return await prisma.siteProgram.create({ data });
    }

    async updateProgram(id: string, data: any) {
        return await prisma.siteProgram.update({
            where: { id },
            data
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

    async createPastor(data: any) {
        return await prisma.sitePastor.create({ data });
    }

    async updatePastor(id: string, data: any) {
        // 1. Procura o pastor atual no banco
        const pastorAtual = await prisma.sitePastor.findUnique({ where: { id } });

        // 2. Se houver uma imagem antiga, e a nova imagem que veio no 'data' for diferente, apaga a velha!
        if (pastorAtual && pastorAtual.image_url && data.image_url && pastorAtual.image_url !== data.image_url) {
            await deleteImage(pastorAtual.image_url);
        }

        // 3. Atualiza na base de dados normalmente
        return await prisma.sitePastor.update({
            where: { id },
            data
        });
    }

    async deletePastor(id: string) {
        // 1. Procura o pastor para saber se ele tem foto
        const pastorAtual = await prisma.sitePastor.findUnique({ where: { id } });

        // 2. Se tiver foto, apaga do MinIO primeiro
        if (pastorAtual && pastorAtual.image_url) {
            await deleteImage(pastorAtual.image_url);
        }

        // 3. Depois elimina o registo do banco
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

    async createCell(data: any) {
        return await prisma.siteCell.create({ data });
    }

    async updateCell(id: string, data: any) {
        const celulaAtual = await prisma.siteCell.findUnique({ where: { id } });

        if (celulaAtual && celulaAtual.image_url && data.image_url && celulaAtual.image_url !== data.image_url) {
            await deleteImage(celulaAtual.image_url);
        }

        return await prisma.siteCell.update({
            where: { id },
            data
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

    async createMinistry(data: any) {
        return await prisma.siteMinistry.create({ data });
    }

    async updateMinistry(id: string, data: any) {
        // 1. Procura o ministério atual para saber a foto antiga
        const ministerioAtual = await prisma.siteMinistry.findUnique({ where: { id } });

        // 2. Se houver uma foto antiga, e a nova foto for diferente, apaga a velha do MinIO!
        if (ministerioAtual && ministerioAtual.image_url && data.image_url && ministerioAtual.image_url !== data.image_url) {
            await deleteImage(ministerioAtual.image_url);
        }

        // 3. Atualiza os dados no banco
        return await prisma.siteMinistry.update({
            where: { id },
            data
        });
    }

    async deleteMinistry(id: string) {
        // 1. Procura o ministério primeiro
        const ministerioAtual = await prisma.siteMinistry.findUnique({ where: { id } });

        // 2. Se ele tiver uma foto, detona ela do MinIO
        if (ministerioAtual && ministerioAtual.image_url) {
            await deleteImage(ministerioAtual.image_url);
        }

        // 3. Só depois apaga o registo do banco de dados
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

    async createProject(data: any) {
        return await prisma.siteProject.create({ data });
    }

    async updateProject(id: string, data: any) {
        const projetoAtual = await prisma.siteProject.findUnique({ where: { id } });

        // Se houver uma foto antiga, e a nova for diferente, apaga a velha do MinIO!
        if (projetoAtual && projetoAtual.image_url && data.image_url && projetoAtual.image_url !== data.image_url) {
            await deleteImage(projetoAtual.image_url);
        }

        return await prisma.siteProject.update({
            where: { id },
            data
        });
    }

    async deleteProject(id: string) {
        const projetoAtual = await prisma.siteProject.findUnique({ where: { id } });

        // Se o projeto tiver uma foto, apaga do MinIO antes de excluir do banco
        if (projetoAtual && projetoAtual.image_url) {
            await deleteImage(projetoAtual.image_url);
        }

        return await prisma.siteProject.delete({
            where: { id }
        });
    }
}