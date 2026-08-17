import { FastifyInstance } from 'fastify';
import { EcdController } from './ecd.controller.js';

export async function ecdRoutes(app: FastifyInstance) {
  const ecdController = new EcdController();

  // === ROTAS PÚBLICAS (Acesso externo pelo site/landing page) ===
  // URL Final: /v1/ecd/public/register
  app.post('/public/register', (req, rep) => ecdController.register(req, rep));
  app.get('/public/validate-token/:token', (req, rep) => ecdController.validateToken(req as any, rep));
  app.post('/public/validate-pin', (req, rep) => ecdController.validatePinPublic(req, rep));
  app.get('/public/leaders', (req, rep) => ecdController.getLeaders(req, rep));

  // === ROTAS PRIVADAS (Requer Login no Painel) ===
  app.register(async function privateRoutes(childApp) {
    
    // 👇 TRAVA DE SEGURANÇA MÁXIMA: NÍVEL 0 👇
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
        const requester = request.user as any;
        
        // Verifica ambas as nomenclaturas (level ou user_level) para evitar bugs de JWT
        if (requester.level !== 0 && requester.user_level !== 0) {
          return reply.status(403).send({ 
            error: 'Acesso negado. Apenas administradores (Nível 0) podem gerenciar o Painel do ECD.' 
          });
        }
      } catch (err) {
        return reply.status(401).send({ error: 'Não autorizado. Faça login novamente.' });
      }
    });

    // Edições
    // URL Final: /v1/ecd/editions
    childApp.get('/editions', (req, rep) => ecdController.getEditions(req, rep));
    childApp.post('/editions', (req, rep) => ecdController.createEdition(req, rep));
    childApp.put('/editions/:id', (req, rep) => ecdController.updateEdition(req, rep));
    childApp.delete('/editions/:id', (req, rep) => ecdController.deleteEdition(req, rep));

    // Líderes
    // URL Final: /v1/ecd/leaders
    childApp.get('/leaders', (req, rep) => ecdController.getLeaders(req, rep));
    childApp.post('/leaders', (req, rep) => ecdController.createLeader(req, rep));
    childApp.patch('/leaders/:id', (req, rep) => ecdController.updateLeader(req, rep));
    childApp.delete('/leaders/:id', (req, rep) => ecdController.deleteLeader(req, rep));
    
    // Inscritos / Fichas
    // URL Final: /v1/ecd/registrations
    childApp.get('/registrations', (req, rep) => ecdController.getRegistrations(req, rep));
    childApp.patch('/registrations/:id/payment', (req, rep) => ecdController.updatePayment(req, rep));
    childApp.delete('/registrations/:id', (req, rep) => ecdController.deleteRegistration(req, rep));
    childApp.put('/registrations/:id/complete', (req, rep) => ecdController.completeRegistration(req, rep));
    childApp.put('/registrations/:id/approve', (req, rep) => ecdController.approveRegistration(req, rep));

    childApp.patch('/registrations/:id/receipt', (req, rep) => ecdController.uploadReceiptAdmin(req, rep));
    // Vincular à rota de transferência de titularidade do token
    childApp.patch('/registrations/:id/transfer-leader', (req, rep) => ecdController.transferRegistrationLeader(req, rep));

    // Finalização de edicao
    childApp.get('/:id/report', ecdController.generateEditionReport);
    childApp.post('/:id/finalize', (req, rep) => ecdController.finalizeEdition(req, rep));
    childApp.get('/history', (req, rep) => ecdController.getEditionHistory(req, rep));

    childApp.post('/tokens/generate-pdf', (req, rep) => ecdController.generateBatchPdf(req, rep));
    childApp.get('/tokens/export-codes', (req, rep) => ecdController.exportLeadersPdf(req, rep));
    childApp.get('/tokens/reprint', (req, rep) => ecdController.reprintBatchPdf(req, rep));
    childApp.get('/editions/history-pdf', (req, rep) => ecdController.exportHistoryPdf(req, rep));

    childApp.get('/editions/encontristas-pdf', (req, rep) => ecdController.exportEncontristasPdf(req, rep));
    childApp.get('/registrations/search-by-code', (req, rep) => ecdController.searchRegistrationByShortCode(req, rep));
    childApp.get('/registrations/search-by-number', (req, rep) => ecdController.searchRegistrationByTokenNumber(req, rep));
    childApp.get('/editions/pendentes-pdf', (req, rep) => ecdController.exportPendentesPdf(req, rep));
  });
}