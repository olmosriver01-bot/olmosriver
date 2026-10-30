"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/access";
import type { GlobalRole } from "@/lib/constants";

export type UserInput = {
  name: string;
  email: string;
  role: GlobalRole;
  password?: string;
};

export async function createUser(input: UserInput) {
  await requireAdmin();
  if (!input.name?.trim()) throw new Error("Исм киритилиши шарт");
  if (!input.email?.trim()) throw new Error("Email киритилиши шарт");
  if (!input.password || input.password.length < 6) throw new Error("Парол камида 6 белгидан иборат бўлиши керак");

  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase().trim() } });
  if (existing) throw new Error("Бу email билан фойдаланувчи аллақачон мавжуд");

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: input.email.toLowerCase().trim(),
      role: input.role,
      passwordHash,
    },
  });
  revalidatePath("/admin/users");
  return user.id;
}

export async function updateUser(userId: string, input: { name: string; role: GlobalRole; password?: string }) {
  await requireAdmin();
  const data: { name: string; role: GlobalRole; passwordHash?: string } = {
    name: input.name.trim(),
    role: input.role,
  };
  if (input.password) {
    if (input.password.length < 6) throw new Error("Парол камида 6 белгидан иборат бўлиши керак");
    data.passwordHash = await bcrypt.hash(input.password, 10);
  }
  await prisma.user.update({ where: { id: userId }, data });
  revalidatePath("/admin/users");
}

export async function deleteUser(userId: string) {
  const admin = await requireAdmin();
  if (admin.id === userId) throw new Error("Ўзингизни ўчира олмайсиз");
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
}
