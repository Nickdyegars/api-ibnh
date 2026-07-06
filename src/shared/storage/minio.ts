// src/shared/storage/minio.ts
import * as Minio from 'minio';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';

// Carrega as variáveis (ajuste o path se a sua estrutura de pastas for diferente)
dotenv.config();

export const BUCKET_NAME = process.env.MINIO_BUCKET || 'ibnh-uploads';
export const PUBLIC_URL = process.env.MINIO_PUBLIC_URL || '';

// Cliente ÚNICO para Upload (Usa IP Interno do VPS)
export const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: Number(process.env.MINIO_PORT) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.MINIO_SECRET_KEY || '',
});

// Garante que o Bucket existe e tem permissão de leitura pública
export async function setupMinioBucket() {
    try {
        const exists = await minioClient.bucketExists(BUCKET_NAME);
        if (!exists) {
            await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');

            const policy = {
                Version: '2012-10-17',
                Statement: [{
                    Action: ['s3:GetObject'],
                    Effect: 'Allow',
                    Principal: '*',
                    Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`]
                }]
            };
            await minioClient.setBucketPolicy(BUCKET_NAME, JSON.stringify(policy));
            console.log(`✅ Bucket '${BUCKET_NAME}' criado e configurado como público.`);
        } else {
            console.log(`✅ Conectado ao bucket MinIO: '${BUCKET_NAME}'`);
        }
    } catch (error) {
        console.error("❌ Erro ao configurar MinIO:", error);
    }
}

// Faz o upload e devolve o link usando a MINIO_PUBLIC_URL
// minio.ts
export async function uploadImage(fileName: string, fileBuffer: Buffer, mimeType: string, folder: string = 'geral') {
    // 1. Extrai apenas a extensão do arquivo original (ex: '.jpg', '.png')
    const ext = path.extname(fileName);

    // 2. Gera um ID 100% único, impossível de colidir e livre de caracteres estranhos
    const uniqueId = crypto.randomUUID();

    // 3. Monta o novo nome limpo e seguro (ex: 'f47ac10b-58cc-4372-a567-0e02b2c3d479.jpg')
    const safeFileName = `${uniqueId}${ext}`;

    // O caminho final
    const objectPath = `${folder}/${safeFileName}`;

    await minioClient.putObject(BUCKET_NAME, objectPath, fileBuffer, undefined, {
        'Content-Type': mimeType
    });

    return `${PUBLIC_URL}/${BUCKET_NAME}/${objectPath}`;
}

export async function deleteImage(imageUrl: string) {
    if (!imageUrl) return;

    try {
        // 1. Extrai os dados de forma nativa, ignorando domínio, porta ou IP base
        const parsedUrl = new URL(imageUrl);
        
        // 2. O pathname vai retornar algo como: "/ibnh-uploads/comprovantes/foto.jpg"
        // Removemos a primeira barra e dividimos os caminhos
        const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
        
        // 3. O primeiro elemento após a barra sempre será o nome do bucket
        const bucketFromUrl = pathParts[0]; 
        
        // 4. Todo o restante do caminho será a Key exata do arquivo no storage
        // Ex: "comprovantes/foto.jpg" ou "profiles/foto.png"
        const objectPath = pathParts.slice(1).join('/');

        // 5. Dispara a exclusão com a chave exata
        if (bucketFromUrl === BUCKET_NAME && objectPath) {
            await minioClient.removeObject(BUCKET_NAME, objectPath);
            console.log(`🗑️ Arquivo expurgado com sucesso do MinIO: ${objectPath}`);
        } else {
            // Agora o console vai te avisar se algum link for ignorado!
            console.warn(`⚠️ MinIO ignorou o link pois não pertence ao bucket '${BUCKET_NAME}': ${imageUrl}`);
        }
    } catch (error) {
        console.error(`❌ Falha crítica ao deletar arquivo do MinIO (${imageUrl}):`, error);
    }
}