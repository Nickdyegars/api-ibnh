import bcrypt from 'bcrypt';
import { prisma } from '../../shared/database/prisma.js';

export class AuthService {
  async register(data: { name: string; email: string; password: string; role: string; ministry: string }) {
    
    const userExists = await prisma.user.findUnique({ where: { email: data.email } });
    if (userExists) {
      throw new Error('Este e-mail já está cadastrado.');
    }

    let level = 2;
    if (data.role === 'admin') level = 0;
    if (data.role === 'leader') level = 1;

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(data.password, salt);

    const newUser = await prisma.user.create({
      data: {
        email: data.email,
        password_hash,
        user_level: level,
        ministry_access: data.ministry,
        profile: {
          create: { full_name: data.name }
        }
      },
      include: { profile: true }
    });

    return newUser;
  }

  async login(data: { email: string; password: string }) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) throw new Error('Credenciais inválidas.');

    const isPasswordValid = await bcrypt.compare(data.password, user.password_hash);
    if (!isPasswordValid) throw new Error('Credenciais inválidas.');

    return user;
  }

  // ==========================================
  // LISTAR USUÁRIOS (GET)
  // ==========================================
  async getUsers() {
    const users = await prisma.user.findMany({
      include: { profile: true },
      // Opcional: ordenar pelos mais recentes
      orderBy: { id: 'desc' } 
    });

    // Formatamos para o frontend entender facilmente
    return users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.profile?.full_name || 'Sem nome',
      level: u.user_level,
      role: u.user_level === 0 ? 'admin' : 'leader',
      ministry: u.ministry_access
    }));
  }

  // ==========================================
  // ATUALIZAR USUÁRIO (PUT)
  // ==========================================
  async updateUser(id: string, data: { name?: string | undefined; email?: string | undefined; password?: string | undefined; role?: 'admin' | 'leader' | undefined; ministry?: string | undefined }) {
    const userExists = await prisma.user.findUnique({ where: { id } });
    if (!userExists) throw new Error('Usuário não encontrado.');

    // Prepara os dados básicos
    const updateData: any = {};
    
    if (data.role) {
      updateData.user_level = data.role === 'admin' ? 0 : 1;
    }
    if (data.ministry !== undefined) {
      updateData.ministry_access = data.ministry;
    }

    // Verifica se o email novo já pertence a outra pessoa
    if (data.email && data.email !== userExists.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: data.email } });
      if (emailTaken) throw new Error('Este e-mail já está em uso por outro usuário.');
      updateData.email = data.email;
    }

    // Se ele digitou uma senha nova, criptografa! Se não, o banco ignora.
    if (data.password && data.password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      updateData.password_hash = await bcrypt.hash(data.password, salt);
    }

    // Executa o Update no banco
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...updateData,
        // Atualiza o nome na tabela de Perfil
        profile: data.name ? {
          update: { full_name: data.name }
        } : undefined
      },
      include: { profile: true }
    });

    return updatedUser;
  }

  // ==========================================
  // APAGAR USUÁRIO (DELETE)
  // ==========================================
  async deleteUser(id: string) {
    const userExists = await prisma.user.findUnique({ where: { id } });
    if (!userExists) throw new Error('Usuário não encontrado.');

    // Apaga o usuário (Se o seu schema.prisma não tiver onDelete: Cascade no Profile,
    // avisarei caso dê erro de foreign key, mas o Fastify tratará isso).
    await prisma.user.delete({ where: { id } });
    
    return true;
  }
}