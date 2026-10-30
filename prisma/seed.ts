import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { BLOCKS } from "../src/lib/kpi-data";

const prisma = new PrismaClient();

async function main() {
  const adminPassHash = await bcrypt.hash("Admin123!", 10);
  const managerPassHash = await bcrypt.hash("Manager123!", 10);
  const employeePassHash = await bcrypt.hash("Employee123!", 10);

  await prisma.user.upsert({
    where: { email: "admin@kpiaudit.pro" },
    update: {},
    create: {
      name: "Админ Фойдаланувчи",
      email: "admin@kpiaudit.pro",
      passwordHash: adminPassHash,
      role: "ADMIN",
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@kpiaudit.pro" },
    update: {},
    create: {
      name: "Менежер Алиев",
      email: "manager@kpiaudit.pro",
      passwordHash: managerPassHash,
      role: "MANAGER",
    },
  });

  const employee = await prisma.user.upsert({
    where: { email: "employee@kpiaudit.pro" },
    update: {},
    create: {
      name: "Ходим Каримова",
      email: "employee@kpiaudit.pro",
      passwordHash: employeePassHash,
      role: "EMPLOYEE",
    },
  });

  const company = await prisma.company.upsert({
    where: { id: "demo-company" },
    update: {},
    create: {
      id: "demo-company",
      name: "Olmos Trade MChJ",
      industry: "Чакана савдо",
      employeeCount: 120,
    },
  });

  const company2 = await prisma.company.upsert({
    where: { id: "demo-company-2" },
    update: {},
    create: {
      id: "demo-company-2",
      name: "Rivojlanish Logistika",
      industry: "Логистика",
      employeeCount: 45,
    },
  });

  for (const c of [company, company2]) {
    await prisma.companyMember.upsert({
      where: { userId_companyId: { userId: manager.id, companyId: c.id } },
      update: {},
      create: { userId: manager.id, companyId: c.id },
    });
  }
  await prisma.companyMember.upsert({
    where: { userId_companyId: { userId: employee.id, companyId: company.id } },
    update: {},
    create: { userId: employee.id, companyId: company.id },
  });

  // Demo uchun 2 ta tarixiy audit (bir biri bilan solishtirish uchun) va 1 ta jarayondagi audit.
  const existingAudits = await prisma.audit.count({ where: { companyId: company.id } });
  if (existingAudits === 0) {
    const octoberAudit = await prisma.audit.create({
      data: {
        companyId: company.id,
        title: "2026-йил октябрь аудити",
        status: "COMPLETED",
        startedAt: new Date("2026-10-05"),
        completedAt: new Date("2026-10-08"),
        createdById: manager.id,
      },
    });

    // Past ballar (ko'proq muammo) - dastlabki audit
    for (const block of BLOCKS) {
      for (const q of block.questions) {
        const score = block.id <= 2 ? 0 : block.id <= 4 ? 1 : 2;
        await prisma.auditAnswer.create({
          data: { auditId: octoberAudit.id, questionId: q.id, score },
        });
      }
    }

    const decemberAudit = await prisma.audit.create({
      data: {
        companyId: company.id,
        title: "2026-йил декабрь аудити",
        status: "COMPLETED",
        startedAt: new Date("2026-12-02"),
        completedAt: new Date("2026-12-05"),
        createdById: manager.id,
      },
    });

    for (const block of BLOCKS) {
      for (const q of block.questions) {
        const score = block.id <= 1 ? 1 : block.id <= 3 ? 2 : 3;
        await prisma.auditAnswer.create({
          data: { auditId: decemberAudit.id, questionId: q.id, score },
        });
      }
    }

    // Davom etayotgan (tugallanmagan) audit - faqat qisman javob berilgan
    const inProgressAudit = await prisma.audit.create({
      data: {
        companyId: company.id,
        title: "2027-йил февраль аудити (жараёнда)",
        status: "DRAFT",
        startedAt: new Date("2027-02-01"),
        createdById: manager.id,
      },
    });
    for (const block of BLOCKS.slice(0, 3)) {
      for (const q of block.questions) {
        await prisma.auditAnswer.create({
          data: { auditId: inProgressAudit.id, questionId: q.id, score: 2 },
        });
      }
    }

    // Dekabr audit asosida bir nechta namunaviy vazifa
    await prisma.issue.create({
      data: {
        companyId: company.id,
        auditId: decemberAudit.id,
        questionId: 9,
        blockId: 2,
        title: "Lavozimlar bo'yicha KPI sonini me'yorga keltirish",
        cause: "Ba'zi lavozimlarda 8-10 tagacha KPI belgilangan, bu e'tiborni tarqatib yuboradi.",
        solutionPlan: "Har bir lavozim uchun KPI sonini 3-5 (dizayn tavsiyasiga ko'ra 3-7) taga qisqartirish, ustuvor ko'rsatkichlarni tanlash.",
        ownerName: "HR bo'limi boshlig'i",
        startDate: new Date("2026-12-10"),
        dueDate: new Date("2027-01-15"),
        priority: "HIGH",
        status: "IN_PROGRESS",
        createdById: manager.id,
      },
    });
    await prisma.issue.create({
      data: {
        companyId: company.id,
        auditId: decemberAudit.id,
        questionId: 42,
        blockId: 7,
        title: "KPI tizimi bo'yicha rasmiy nizom ishlab chiqish",
        cause: "KPI tizimi hozircha hujjatlashtirilmagan, bu yangi xodimlar uchun tushunarsizlikka olib keladi.",
        solutionPlan: "KPI nizomini tayyorlash, tasdiqlash va barcha bo'limlarga tanishtirish.",
        ownerName: "Bosh direktor o'rinbosari",
        startDate: new Date("2026-12-10"),
        dueDate: new Date("2027-02-01"),
        priority: "MEDIUM",
        status: "PLANNED",
        createdById: manager.id,
      },
    });
  }

  console.log("Seed tugadi:");
  console.log("  ADMIN:    admin@kpiaudit.pro / Admin123!");
  console.log("  MANAGER:  manager@kpiaudit.pro / Manager123!");
  console.log("  EMPLOYEE: employee@kpiaudit.pro / Employee123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
