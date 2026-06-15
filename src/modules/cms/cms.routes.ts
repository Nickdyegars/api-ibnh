import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CmsController } from './cms.controller.js';
import { uploadImage } from '../../shared/storage/minio.js';

export async function cmsRoutes(app: FastifyInstance) {
    const cmsController = new CmsController();

    // 👇 1. O SEGURANÇA BLINDADO (Verifica Token E Privilégio de Admin)
    const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
        try { 
            await request.jwtVerify(); 
            const requester = request.user as any;
            
            // Trava RBAC: Somente o Administrador (Nível 0) mexe no site público
            if (requester.level !== 0) {
                return reply.status(403).send({ error: 'Acesso negado. Apenas administradores podem editar o site.' });
            }
        }
        catch (err) { 
            return reply.status(401).send({ error: 'Sessão inválida ou expirada. Faça login novamente.' }); 
        }
    };

    // ==========================================
    // UPLOAD DE IMAGENS (MinIO) COM DETECTOR DE METAIS
    // ==========================================
    app.post('/upload', { onRequest: [authenticate] }, async (request, reply) => {
        try {
            const parts = request.parts(); 
            let fileData: any = null;
            let folder = 'geral'; 

            // 👇 2. LISTA VIP DE ARQUIVOS (Apenas imagens seguras)
            const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

            for await (const part of parts) {
                if (part.type === 'file') {
                    
                    // Trava de Extensão/Vírus
                    if (!allowedMimeTypes.includes(part.mimetype)) {
                        return reply.status(400).send({ 
                            error: `Formato de arquivo não permitido: ${part.mimetype}. Envie apenas imagens JPG, PNG ou WEBP.` 
                        });
                    }

                    const buffer = await part.toBuffer();
                    
                    // Trava de Arquivo Vazio
                    if (buffer.length === 0) {
                        return reply.status(400).send({ error: 'O arquivo enviado está vazio.' });
                    }

                    fileData = {
                        filename: part.filename,
                        buffer: buffer,
                        mimetype: part.mimetype
                    };
                } else if (part.type === 'field' && part.fieldname === 'folder') {
                    folder = part.value as string; 
                }
            }

            if (!fileData) return reply.status(400).send({ error: 'Nenhum ficheiro enviado.' });

            const imageUrl = await uploadImage(fileData.filename, fileData.buffer, fileData.mimetype, folder);

            return reply.send({ url: imageUrl });
        } catch (error: any) {
            return reply.status(500).send({ error: 'Erro ao fazer upload: ' + error.message });
        }
    });

    // ==========================================
    // SOBRE NÓS E CONTATOS
    // ==========================================
    app.get('/about', (req, rep) => cmsController.getAbout(req, rep));
    app.put('/about', { onRequest: [authenticate] }, (req, rep) => cmsController.updateAbout(req, rep));

    app.get('/contacts', (req, rep) => cmsController.getContacts(req, rep));
    app.put('/contacts', { onRequest: [authenticate] }, (req, rep) => cmsController.updateContacts(req, rep));

    // ==========================================
    // PROGRAMAÇÕES (CULTOS)
    // ==========================================
    app.get('/programs', (req, rep) => cmsController.getPrograms(req, rep));
    app.post('/programs', { onRequest: [authenticate] }, (req, rep) => cmsController.createProgram(req, rep));
    app.put('/programs/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.updateProgram(req, rep));
    app.delete('/programs/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.deleteProgram(req, rep));

    // ==========================================
    // PASTORES / LIDERANÇA
    // ==========================================
    app.get('/pastors', (req, rep) => cmsController.getPastors(req, rep));
    app.post('/pastors', { onRequest: [authenticate] }, (req, rep) => cmsController.createPastor(req, rep));
    app.put('/pastors/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.updatePastor(req, rep));
    app.delete('/pastors/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.deletePastor(req, rep));

    // ==========================================
    // CÉLULAS / PEQUENOS GRUPOS
    // ==========================================
    app.get('/cells', (req, rep) => cmsController.getCells(req, rep));
    app.post('/cells', { onRequest: [authenticate] }, (req, rep) => cmsController.createCell(req, rep));
    app.put('/cells/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.updateCell(req, rep));
    app.delete('/cells/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.deleteCell(req, rep));

    // ==========================================
    // MINISTÉRIOS
    // ==========================================
    app.get('/ministries', (req, rep) => cmsController.getMinistries(req, rep));
    app.post('/ministries', { onRequest: [authenticate] }, (req, rep) => cmsController.createMinistry(req, rep));
    app.put('/ministries/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.updateMinistry(req, rep));
    app.delete('/ministries/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.deleteMinistry(req, rep));

    // ==========================================
    // PROJETOS SOCIAIS
    // ==========================================
    app.get('/projects', (req, rep) => cmsController.getProjects(req, rep));
    app.post('/projects', { onRequest: [authenticate] }, (req, rep) => cmsController.createProject(req, rep));
    app.put('/projects/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.updateProject(req, rep));
    app.delete('/projects/:id', { onRequest: [authenticate] }, (req, rep) => cmsController.deleteProject(req, rep));
}