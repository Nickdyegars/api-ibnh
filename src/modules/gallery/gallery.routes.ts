import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GalleryController } from './gallery.controller.js';

export async function galleryRoutes(app: FastifyInstance) {
  const galleryController = new GalleryController();

  // ==========================================
  // ROTAS PÚBLICAS (Acesso via QR Code e Landing Page)
  // ==========================================
  app.get('/public', (req, rep) => galleryController.listPublic(req, rep));
  app.get('/public/:id', (req, rep) => galleryController.getAlbum(req, rep));

  // ==========================================
  // ROTAS PROTEGIDAS (Painel da Mídia)
  // ==========================================
  app.register(async (protectedApp) => {
    
    // O Cadeado Blindado
    protectedApp.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
        const requester = request.user as any;
        
        // Bloqueia se não for Admin (0) ou Mídia (acesso específico)
        if (requester.level !== 0 && requester.ministry_access !== 'Mídia') {
           return reply.status(403).send({ error: 'Acesso negado. Apenas a equipe de Mídia pode gerenciar a galeria.' });
        }
      } catch (err) {
        return reply.status(401).send({ error: 'Sessão inválida. Faça login.' });
      }
    });

    protectedApp.get('/', (req, rep) => galleryController.listAdmin(req, rep));
    protectedApp.post('/', (req, rep) => galleryController.create(req, rep));
    protectedApp.put('/:id', (req, rep) => galleryController.update(req, rep));
    protectedApp.delete('/:id', (req, rep) => galleryController.delete(req, rep));
    
    // Upload de Fotos (Envio das URLs geradas)
    protectedApp.post('/:id/photos', (req, rep) => galleryController.addPhotos(req, rep));
    protectedApp.delete('/photos/:photoId', (req, rep) => galleryController.deletePhoto(req, rep));
  });
}