// src/modules/landing-config/landing-config.controller.ts
import { LandingConfigService } from './landing-config.service.js';
import { updateLandingConfigSchema } from './landing-config.schemas.js';

export class LandingConfigController {
    private landingConfigService = new LandingConfigService();

    async getPublicConfig(request: any, reply: any) {
        try {
            const config = await this.landingConfigService.getConfig();
            return reply.status(200).send(config);
        } catch (error) {
            console.error("Erro ao buscar Landing Page Config:", error);
            return reply.status(500).send({ error: "Erro interno ao carregar configurações." });
        }
    }

    async updateConfig(request: any, reply: any) {
        try {
            // 👇 A validação do Zod acontece aqui! 
            // Se o painel enviar dados errados, o parse() atira um erro e cai direto no catch
            const data = updateLandingConfigSchema.parse(request.body);
            
            const updatedConfig = await this.landingConfigService.updateConfig(data);
            
            return reply.status(200).send(updatedConfig);
        } catch (error: any) {
            console.error("Erro ao atualizar Landing Page Config:", error);
            
            // Retorna status 400 (Bad Request) se a validação do Zod falhar
            return reply.status(400).send({ 
                error: "Dados inválidos.", 
                details: error.errors // Opcional: devolve qual campo falhou para ajudar no debug
            });
        }
    }
}