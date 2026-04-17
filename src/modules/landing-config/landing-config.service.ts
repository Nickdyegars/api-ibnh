// Ajuste o caminho de importação do seu prisma client conforme o seu projeto
import { prisma } from '../../shared/database/prisma.js';
import { UpdateLandingConfigType } from './landing-config.schemas.js'; // Importe a tipagem que criamos no Zod

export class LandingConfigService {

    // Busca as configurações. Se a tabela estiver vazia (primeira vez), ele cria a linha padrão.
    async getConfig() {
        let config = await prisma.landingPageConfig.findFirst();

        if (!config) {
            config = await prisma.landingPageConfig.create({
                data: {
                    show_business_form: true,
                    business_form_url: ""
                }
            });
        }

        return config;
    }

    // Atualiza a linha de configuração existente
    async updateConfig(data: UpdateLandingConfigType) {
        const config = await this.getConfig();

        // Criamos um objeto vazio para guardar apenas o que vamos atualizar
        const dataToUpdate: any = {};

        // Só adiciona a propriedade se ela foi enviada na requisição (diferente de undefined)
        if (data.show_business_form !== undefined) {
            dataToUpdate.show_business_form = data.show_business_form;
        }

        if (data.business_form_url !== undefined) {
            // Se o usuário apagou o link no painel (string vazia), salvamos como null no banco
            dataToUpdate.business_form_url = data.business_form_url === "" ? null : data.business_form_url;
        }

        return await prisma.landingPageConfig.update({
            where: { id: config.id },
            data: dataToUpdate // 👈 Agora o Prisma não vai reclamar de undefined
        });
    }
}