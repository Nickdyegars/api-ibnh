// src/shared/storage/minio.ts
import * as Minio from 'minio';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';

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

// Sanitiza o nome do álbum para ser usado como pasta no storage/MinIO
export function sanitizeAlbumFolderName(title: string): string {
    if (!title) return 'sem-nome';
    return title
        .trim()
        .replace(/[/\\:*?"<>|]/g, '-') // Remove caracteres inválidos para pastas
        .replace(/\s+/g, ' ')          // Remove múltiplos espaços seguidos
        .trim();
}

// Faz o upload e devolve o link usando a MINIO_PUBLIC_URL
export async function uploadImage(fileName: string, fileBuffer: Buffer, mimeType: string, folder: string = 'geral') {
    const ext = path.extname(fileName);
    const uniqueId = crypto.randomUUID();
    const safeFileName = `${uniqueId}${ext}`;

    const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
    const objectPath = cleanFolder ? `${cleanFolder}/${safeFileName}` : safeFileName;

    await minioClient.putObject(BUCKET_NAME, objectPath, fileBuffer, undefined, {
        'Content-Type': mimeType
    });

    return `${PUBLIC_URL}/${BUCKET_NAME}/${objectPath}`;
}

// Deleta um arquivo individual a partir da sua URL completa
export async function deleteImage(imageUrl: string) {
    if (!imageUrl) return;

    try {
        const parsedUrl = new URL(imageUrl);
        const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
        const bucketFromUrl = pathParts[0]; 
        const objectPath = decodeURIComponent(pathParts.slice(1).join('/'));

        if (bucketFromUrl === BUCKET_NAME && objectPath) {
            await minioClient.removeObject(BUCKET_NAME, objectPath);
            console.log(`🗑️ Arquivo expurgado com sucesso do MinIO: ${objectPath}`);
        } else {
            console.warn(`⚠️ MinIO ignorou o link pois não pertence ao bucket '${BUCKET_NAME}': ${imageUrl}`);
        }
    } catch (error) {
        console.error(`❌ Falha ao deletar arquivo do MinIO (${imageUrl}):`, error);
    }
}

// Deleta uma pasta inteira e todos os arquivos contidos nela no MinIO
export async function deleteFolder(prefix: string) {
    if (!prefix) return;

    try {
        const cleanPrefix = prefix.replace(/^\/+/, '');
        const objectsToDelete: string[] = [];
        const stream = minioClient.listObjectsV2(BUCKET_NAME, cleanPrefix, true);

        for await (const obj of stream) {
            if (obj.name) objectsToDelete.push(obj.name);
        }

        if (objectsToDelete.length > 0) {
            await minioClient.removeObjects(BUCKET_NAME, objectsToDelete);
            console.log(`🗑️ Pasta '${cleanPrefix}' com ${objectsToDelete.length} arquivo(s) expurgada do MinIO.`);
        } else {
            console.log(`ℹ️ Nenhum arquivo encontrado no MinIO com prefixo '${cleanPrefix}'.`);
        }
    } catch (error) {
        console.error(`❌ Erro ao deletar pasta '${prefix}' do MinIO:`, error);
    }
}

// Move/renomeia um objeto dentro do bucket
export async function moveObject(oldKey: string, newKey: string) {
    if (!oldKey || !newKey || oldKey === newKey) return;
    const conds = new Minio.CopyConditions();
    await minioClient.copyObject(BUCKET_NAME, newKey, `/${BUCKET_NAME}/${oldKey}`, conds);
    await minioClient.removeObject(BUCKET_NAME, oldKey);
}
