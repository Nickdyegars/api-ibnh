import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CmsController } from './cms.controller.js';
import { uploadImage } from '../../shared/storage/minio.js';

export async function cmsRoutes(app: FastifyInstance) {
    const cmsController = new CmsController();

    // Middleware de Autenticação
    const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
        try { await request.jwtVerify(); }
        catch (err) { return reply.status(401).send({ error: 'Não autorizado.' }); }
    };

    // ==========================================
    // UPLOAD DE IMAGENS (MinIO)
    // ==========================================
    app.post('/cms/upload', { onRequest: [authenticate] }, async (request, reply) => {
        try {
            const parts = request.parts(); // Lê o formulário parte por parte
            let fileData: any = null;
            let folder = 'geral'; // Pasta padrão

            for await (const part of parts) {
                if (part.type === 'file') {
                    const buffer = await part.toBuffer();
                    fileData = {
                        filename: part.filename,
                        buffer: buffer,
                        mimetype: part.mimetype
                    };
                } else if (part.type === 'field' && part.fieldname === 'folder') {
                    folder = part.value as string; // Pega o nome da pasta enviada pelo React
                }
            }

            if (!fileData) return reply.status(400).send({ error: 'Nenhum ficheiro enviado.' });

            // Passamos a pasta para a função do MinIO
            const imageUrl = await uploadImage(fileData.filename, fileData.buffer, fileData.mimetype, folder);

            return reply.send({ url: imageUrl });
        } catch (error: any) {
            return reply.status(500).send({ error: 'Erro ao fazer upload: ' + error.message });
        }
    });
    // ==========================================
    // SOBRE NÓS E CONTATOS
    // ==========================================
    app.get('/cms/about', (req, rep) => cmsController.getAbout(req, rep));
    app.put('/cms/about', { onRequest: [authenticate] }, (req, rep) => cmsController.updateAbout(req, rep));

    app.get('/cms/contacts', (req, rep) => cmsController.getContacts(req, rep));
    app.put('/cms/contacts', { onRequest: [authenticate] }, (req, rep) => cmsController.updateContacts(req, rep));

    // ==========================================
    // PROGRAMAÇÕES (CULTOS)
    // ==========================================
    app.get('/cms/programs', (req, rep) => cmsController.getPrograms(req, rep));
    app.post('/cms/programs', { onRequest: [authenticate] }, (req, rep) => cmsController.createProgram(req, rep));
    app.put('/cms/programs/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.updateProgram(req, rep));
    app.delete('/cms/programs/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.deleteProgram(req, rep));

    // ==========================================
    // PASTORES / LIDERANÇA
    // ==========================================
    app.get('/cms/pastors', (req, rep) => cmsController.getPastors(req, rep));
    app.post('/cms/pastors', { onRequest: [authenticate] }, (req, rep) => cmsController.createPastor(req, rep));
    app.put('/cms/pastors/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.updatePastor(req, rep));
    app.delete('/cms/pastors/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.deletePastor(req, rep));

    // ==========================================
    // CÉLULAS / PEQUENOS GRUPOS
    // ==========================================
    app.get('/cms/cells', (req, rep) => cmsController.getCells(req, rep));
    app.post('/cms/cells', { onRequest: [authenticate] }, (req, rep) => cmsController.createCell(req, rep));
    app.put('/cms/cells/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.updateCell(req, rep));
    app.delete('/cms/cells/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.deleteCell(req, rep));

    // ==========================================
    // MINISTÉRIOS
    // ==========================================
    app.get('/cms/ministries', (req, rep) => cmsController.getMinistries(req, rep));
    app.post('/cms/ministries', { onRequest: [authenticate] }, (req, rep) => cmsController.createMinistry(req, rep));
    app.put('/cms/ministries/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.updateMinistry(req, rep));
    app.delete('/cms/ministries/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.deleteMinistry(req, rep));

    // ==========================================
    // PROJETOS SOCIAIS
    // ==========================================
    app.get('/cms/projects', (req, rep) => cmsController.getProjects(req, rep));
    app.post('/cms/projects', { onRequest: [authenticate] }, (req, rep) => cmsController.createProject(req, rep));
    app.put('/cms/projects/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.updateProject(req, rep));
    app.delete('/cms/projects/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.deleteProject(req, rep));
}