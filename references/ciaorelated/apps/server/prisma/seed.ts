import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "dogankaraarslan2@icloud.com";
  const username = "dogankaraarslan";

  // User anlegen oder wiederverwenden
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      username,
      email,
      avatarUrl: "https://i.pravatar.cc/150?u=dogan",
    },
  });

  // Beispiel-Post hinzufügen
  await prisma.post.create({
    data: {
      image: "https://picsum.photos/400/400?random=1",
      caption: "Mein erster Post 🚀",
      author: { connect: { id: user.id } },
    },
  });

  console.log("✅ Seed erfolgreich ausgeführt!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
