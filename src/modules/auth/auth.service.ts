import bcrypt from 'bcrypt';
import { prisma } from '../../shared/database/prisma.js';

export class AuthService {
  async register(data: {
    name: string;
    email: string;
    password: string;
    role: string;
    ministry: string;
    congregation_id?: string | null | undefined;
  }) {
    const userExists = await prisma.user.findUnique({ where: { email: data.email } });
    if (userExists) {
      throw new Error('Este e-mail já está cadastrado.');
    }

    let level = 2; // Default: Líder de Ministério
    let ministry = data.ministry;
    let targetCongregationId = data.congregation_id || null;

    if (data.role === 'admin' || data.role === 'admin_geral') {
      level = 0;
      ministry = 'all';
      targetCongregationId = null; // Admin Geral é global
    } else if (data.role === 'admin_congregacao') {
      level = 1;
      ministry = 'all'; // Admin de Congregação tem acesso a todos os ministérios da sua filial
      if (!targetCongregationId) {
        const sede = await prisma.congregation.findFirst({ where: { is_main: true } });
        targetCongregationId = sede?.id || null;
      }
    } else if (data.role === 'leader' || data.role === 'lider_ministerio') {
      level = 2;
      if (!targetCongregationId) {
        const sede = await prisma.congregation.findFirst({ where: { is_main: true } });
        targetCongregationId = sede?.id || null;
      }
    } else if (
      data.role === 'member' ||
      data.role === 'voluntario' ||
      data.role === 'storymaker' ||
      data.role === 'operator'
    ) {
      level = 3;
      if (!targetCongregationId) {
        const sede = await prisma.congregation.findFirst({ where: { is_main: true } });
        targetCongregationId = sede?.id || null;
      }
      if (data.role === 'storymaker') {
        if (!ministry || ministry === 'all') {
          ministry = 'Multimídia';
        }
      }
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(data.password, salt);

    const newUser = await prisma.user.create({
      data: {
        email: data.email,
        password_hash,
        user_level: level,
        ministry_access: ministry,
        congregation_id: targetCongregationId,
        profile: {
          create: { full_name: data.name }
        }
      },
      include: {
        profile: true,
        congregation: { select: { id: true, name: true, is_main: true } }
      }
    });

    return newUser;
  }

  async login(data: { email: string; password: string }) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        profile: true,
        congregation: { select: { id: true, name: true, is_main: true } }
      }
    });
    if (!user) throw new Error('Credenciais inválidas.');

    const isPasswordValid = await bcrypt.compare(data.password, user.password_hash);
    if (!isPasswordValid) throw new Error('Credenciais inválidas.');

    return user;
  }

  // ==========================================
  // LISTAR USUÁRIOS (GET)
  // ==========================================
  async getUsers(filterCongregationId?: string) {
    const where: any = {};
    if (filterCongregationId) {
      where.congregation_id = filterCongregationId;
    }

    const users = await prisma.user.findMany({
      where,
      include: {
        profile: true,
        congregation: { select: { id: true, name: true, is_main: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    return users.map((u) => {
      let role = 'voluntario';
      if (u.user_level === 0) role = 'admin_geral';
      else if (u.user_level === 1) role = 'admin_congregacao';
      else if (u.user_level === 2) role = 'lider_ministerio';
      else if (u.user_level === 3) role = 'voluntario';

      return {
        id: u.id,
        email: u.email,
        name: u.profile?.full_name || 'Sem nome',
        level: u.user_level,
        role,
        ministry: u.ministry_access,
        congregation_id: u.congregation_id,
        congregation: u.congregation,
        custom_permissions: (u as any).custom_permissions || []
      };
    });
  }

  // ==========================================
  // ATUALIZAR USUÁRIO (PUT)
  // ==========================================
  async updateUser(
    id: string,
    data: {
      name?: string | undefined;
      email?: string | undefined;
      password?: string | undefined;
      role?: string | undefined;
      ministry?: string | undefined;
      congregation_id?: string | null | undefined;
    }
  ) {
    const userExists = await prisma.user.findUnique({ where: { id } });
    if (!userExists) throw new Error('Usuário não encontrado.');

    const updateData: any = {};

    if (data.role) {
      if (data.role === 'admin' || data.role === 'admin_geral') {
        updateData.user_level = 0;
        updateData.ministry_access = 'all';
        updateData.congregation_id = null;
      } else if (data.role === 'admin_congregacao') {
        updateData.user_level = 1;
        updateData.ministry_access = 'all';
        if (data.congregation_id !== undefined) {
          updateData.congregation_id = data.congregation_id;
        }
      } else if (data.role === 'leader' || data.role === 'lider_ministerio') {
        updateData.user_level = 2;
        if (data.congregation_id !== undefined) {
          updateData.congregation_id = data.congregation_id;
        }
      } else if (
        data.role === 'member' ||
        data.role === 'voluntario' ||
        data.role === 'storymaker' ||
        data.role === 'operator'
      ) {
        updateData.user_level = 3;
        if (data.congregation_id !== undefined) {
          updateData.congregation_id = data.congregation_id;
        }
        if (data.role === 'storymaker') {
          if (!data.ministry || data.ministry === 'all') {
            updateData.ministry_access = 'Multimídia';
          }
        }
      }
    }

    if (data.congregation_id !== undefined && !['admin', 'admin_geral'].includes(data.role || '')) {
      updateData.congregation_id = data.congregation_id;
    }

    if (data.ministry !== undefined) {
      updateData.ministry_access = data.ministry;
    }

    if (data.email && data.email !== userExists.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: data.email } });
      if (emailTaken) throw new Error('Este e-mail já está em uso por outro usuário.');
      updateData.email = data.email;
    }

    if (data.password && data.password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      updateData.password_hash = await bcrypt.hash(data.password, salt);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...updateData,
        profile: data.name
          ? {
              upsert: {
                create: { full_name: data.name },
                update: { full_name: data.name }
              }
            }
          : undefined
      },
      include: {
        profile: true,
        congregation: { select: { id: true, name: true, is_main: true } }
      }
    });

    return updatedUser;
  }

  // ==========================================
  // APAGAR USUÁRIO (DELETE)
  // ==========================================
  async deleteUser(id: string) {
    const userExists = await prisma.user.findUnique({ where: { id } });
    if (!userExists) throw new Error('Usuário não encontrado.');

    await prisma.user.delete({ where: { id } });
    return true;
  }

  async updateFirstPassword(id: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('Usuário não encontrado.');
    if (!user.must_change_password) throw new Error('Este usuário já redefiniu sua senha.');

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id },
      data: {
        password_hash,
        must_change_password: false
      }
    });

    return true;
  }
}
