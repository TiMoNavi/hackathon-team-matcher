ALTER TABLE "Message" ADD COLUMN "clientId" TEXT;

CREATE UNIQUE INDEX "Message_threadId_senderId_clientId_key" ON "Message"("threadId", "senderId", "clientId");
