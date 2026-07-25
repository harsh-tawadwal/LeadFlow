import { PrismaClient, ActivityType, LeadStatus, Role } from "@prisma/client";

import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

/**
 * Seed credentials are read from environment variables, never hardcoded.
 * Sensible defaults are provided for local development only; production
 * seeding must set these explicitly (enforced below).
 */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@leadflow.dev";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!Admin";
const MEMBER_EMAIL = process.env.SEED_MEMBER_EMAIL ?? "member@leadflow.dev";
const MEMBER_PASSWORD =
  process.env.SEED_MEMBER_PASSWORD ?? "ChangeMe123!Member";

function assertSafeToSeed() {
  const isProduction = process.env.NODE_ENV === "production";
  const usingDefaultAdminPassword = !process.env.SEED_ADMIN_PASSWORD;
  const usingDefaultMemberPassword = !process.env.SEED_MEMBER_PASSWORD;

  if (
    isProduction &&
    (usingDefaultAdminPassword || usingDefaultMemberPassword)
  ) {
    throw new Error(
      "Refusing to seed production with default passwords. " +
        "Set SEED_ADMIN_PASSWORD and SEED_MEMBER_PASSWORD explicitly.",
    );
  }
}

async function main() {
  assertSafeToSeed();

  console.log("Seeding database...");

  // Clean slate for idempotent re-seeding. Lead -> Note and Lead ->
  // Activity are onDelete: Restrict (soft delete is the only supported
  // deletion path for the app; see schema.prisma), so children must be
  // deleted explicitly, in dependency order, before their parents.
  await prisma.activity.deleteMany();
  await prisma.note.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.user.deleteMany();

  const adminPasswordHash = await hashPassword(ADMIN_PASSWORD);
  const memberPasswordHash = await hashPassword(MEMBER_PASSWORD);

  const admin = await prisma.user.create({
    data: {
      name: "Alex Admin",
      email: ADMIN_EMAIL,
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
    },
  });

  const member = await prisma.user.create({
    data: {
      name: "Morgan Member",
      email: MEMBER_EMAIL,
      passwordHash: memberPasswordHash,
      role: Role.MEMBER,
    },
  });

  console.log(`Created admin user: ${admin.email}`);
  console.log(`Created member user: ${member.email}`);

  // --- Lead 1: unassigned, NEW, created via the public form (no actor) ---
  await prisma.lead.create({
    data: {
      name: "Alice Johnson",
      email: "alice.johnson@example.com",
      phone: "+15550100001",
      company: "Johnson Retail",
      message: "Interested in the starter plan.",
      source: "Website",
      status: LeadStatus.NEW,
      activities: {
        create: {
          type: ActivityType.LEAD_CREATED,
          actorId: null,
          metadata: { source: "public_form" },
        },
      },
    },
  });

  // --- Lead 2: assigned to member, CONTACTED, created + assigned by admin,
  //     status changed by the member, with one note ---
  const bob = await prisma.lead.create({
    data: {
      name: "Bob Smith",
      email: "bob.smith@example.com",
      phone: "+15550100002",
      company: "Smith & Co",
      message: "Requesting a demo.",
      source: "Referral",
      status: LeadStatus.NEW,
      assignedToId: member.id,
      activities: {
        create: [
          {
            type: ActivityType.LEAD_CREATED,
            actorId: admin.id,
          },
          {
            type: ActivityType.LEAD_ASSIGNED,
            actorId: admin.id,
            metadata: { assignedToId: member.id },
          },
        ],
      },
    },
  });

  await prisma.lead.update({
    where: { id: bob.id },
    data: {
      status: LeadStatus.CONTACTED,
      activities: {
        create: {
          type: ActivityType.STATUS_CHANGED,
          actorId: member.id,
          metadata: {
            previousStatus: LeadStatus.NEW,
            newStatus: LeadStatus.CONTACTED,
          },
        },
      },
    },
  });

  const bobNote = await prisma.note.create({
    data: {
      leadId: bob.id,
      authorId: member.id,
      content: "Left a voicemail, will follow up Thursday.",
    },
  });

  await prisma.activity.create({
    data: {
      leadId: bob.id,
      actorId: member.id,
      type: ActivityType.NOTE_ADDED,
      metadata: { noteId: bobNote.id },
    },
  });

  // --- Lead 3: assigned to admin, QUALIFIED ---
  const carol = await prisma.lead.create({
    data: {
      name: "Carol Lee",
      email: "carol.lee@example.com",
      company: "Lee Consulting",
      message: "Needs pricing for the enterprise tier.",
      source: "Website",
      status: LeadStatus.NEW,
      assignedToId: admin.id,
      activities: {
        create: [
          { type: ActivityType.LEAD_CREATED, actorId: admin.id },
          {
            type: ActivityType.LEAD_ASSIGNED,
            actorId: admin.id,
            metadata: { assignedToId: admin.id },
          },
        ],
      },
    },
  });

  await prisma.lead.update({
    where: { id: carol.id },
    data: {
      status: LeadStatus.QUALIFIED,
      activities: {
        create: {
          type: ActivityType.STATUS_CHANGED,
          actorId: admin.id,
          metadata: {
            previousStatus: LeadStatus.NEW,
            newStatus: LeadStatus.QUALIFIED,
          },
        },
      },
    },
  });

  // --- Lead 4: unassigned, PROPOSAL, created via public form ---
  await prisma.lead.create({
    data: {
      name: "David Kim",
      email: "david.kim@example.com",
      phone: "+15550100004",
      source: "Website",
      status: LeadStatus.PROPOSAL,
      activities: {
        create: [
          {
            type: ActivityType.LEAD_CREATED,
            actorId: null,
            metadata: { source: "public_form" },
          },
          {
            type: ActivityType.STATUS_CHANGED,
            actorId: null,
            metadata: {
              previousStatus: LeadStatus.NEW,
              newStatus: LeadStatus.PROPOSAL,
            },
          },
        ],
      },
    },
  });

  // --- Lead 5: assigned to member, WON, full lifecycle + note ---
  const eve = await prisma.lead.create({
    data: {
      name: "Eve Martinez",
      email: "eve.martinez@example.com",
      company: "Martinez Group",
      source: "Referral",
      status: LeadStatus.NEW,
      assignedToId: member.id,
      activities: {
        create: [
          { type: ActivityType.LEAD_CREATED, actorId: admin.id },
          {
            type: ActivityType.LEAD_ASSIGNED,
            actorId: admin.id,
            metadata: { assignedToId: member.id },
          },
        ],
      },
    },
  });

  const eveTransitions: LeadStatus[] = [
    LeadStatus.CONTACTED,
    LeadStatus.QUALIFIED,
    LeadStatus.PROPOSAL,
    LeadStatus.WON,
  ];
  let previousStatus: LeadStatus = LeadStatus.NEW;
  for (const nextStatus of eveTransitions) {
    await prisma.lead.update({
      where: { id: eve.id },
      data: {
        status: nextStatus,
        activities: {
          create: {
            type: ActivityType.STATUS_CHANGED,
            actorId: member.id,
            metadata: { previousStatus, newStatus: nextStatus },
          },
        },
      },
    });
    previousStatus = nextStatus;
  }

  const eveNote = await prisma.note.create({
    data: {
      leadId: eve.id,
      authorId: member.id,
      content: "Closed! Signed the annual contract.",
    },
  });

  await prisma.activity.create({
    data: {
      leadId: eve.id,
      actorId: member.id,
      type: ActivityType.NOTE_ADDED,
      metadata: { noteId: eveNote.id },
    },
  });

  // --- Lead 6: unassigned, LOST ---
  const frank = await prisma.lead.create({
    data: {
      name: "Frank Wright",
      email: "frank.wright@example.com",
      company: "Wright Industries",
      message: "Went with a competitor.",
      source: "Cold outreach",
      status: LeadStatus.NEW,
      activities: {
        create: { type: ActivityType.LEAD_CREATED, actorId: admin.id },
      },
    },
  });

  await prisma.lead.update({
    where: { id: frank.id },
    data: {
      status: LeadStatus.LOST,
      activities: {
        create: {
          type: ActivityType.STATUS_CHANGED,
          actorId: admin.id,
          metadata: {
            previousStatus: LeadStatus.NEW,
            newStatus: LeadStatus.LOST,
          },
        },
      },
    },
  });

  const leadCount = await prisma.lead.count();
  const noteCount = await prisma.note.count();
  const activityCount = await prisma.activity.count();

  console.log(
    `Seed complete: ${leadCount} leads, ${noteCount} notes, ${activityCount} activities.`,
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
