ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'STORY_MENTION';

CREATE TABLE "StoryMention" (
  "id" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "mentionedUserId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StoryMention_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoryMentionClick" (
  "id" TEXT NOT NULL,
  "mentionId" TEXT NOT NULL,
  "viewerId" TEXT NOT NULL,
  "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StoryMentionClick_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoryLinkClick" (
  "id" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "overlayId" TEXT,
  "url" TEXT NOT NULL,
  "viewerId" TEXT NOT NULL,
  "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StoryLinkClick_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoryLocationClick" (
  "id" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "overlayId" TEXT,
  "label" TEXT NOT NULL,
  "viewerId" TEXT NOT NULL,
  "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StoryLocationClick_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoryPollClick" (
  "id" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "overlayId" TEXT,
  "question" TEXT NOT NULL,
  "optionIndex" INTEGER NOT NULL,
  "optionText" TEXT NOT NULL,
  "viewerId" TEXT NOT NULL,
  "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StoryPollClick_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoryQuestionAnswer" (
  "id" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "overlayId" TEXT,
  "prompt" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "respondentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StoryQuestionAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoryMention_storyId_mentionedUserId_key" ON "StoryMention"("storyId", "mentionedUserId");
CREATE INDEX "StoryMention_mentionedUserId_createdAt_idx" ON "StoryMention"("mentionedUserId", "createdAt");
CREATE INDEX "StoryMention_storyId_idx" ON "StoryMention"("storyId");
CREATE INDEX "StoryMentionClick_mentionId_clickedAt_idx" ON "StoryMentionClick"("mentionId", "clickedAt");
CREATE INDEX "StoryMentionClick_viewerId_clickedAt_idx" ON "StoryMentionClick"("viewerId", "clickedAt");
CREATE INDEX "StoryLinkClick_storyId_clickedAt_idx" ON "StoryLinkClick"("storyId", "clickedAt");
CREATE INDEX "StoryLinkClick_storyId_overlayId_clickedAt_idx" ON "StoryLinkClick"("storyId", "overlayId", "clickedAt");
CREATE INDEX "StoryLinkClick_viewerId_clickedAt_idx" ON "StoryLinkClick"("viewerId", "clickedAt");
CREATE INDEX "StoryLocationClick_storyId_clickedAt_idx" ON "StoryLocationClick"("storyId", "clickedAt");
CREATE INDEX "StoryLocationClick_storyId_overlayId_clickedAt_idx" ON "StoryLocationClick"("storyId", "overlayId", "clickedAt");
CREATE INDEX "StoryLocationClick_viewerId_clickedAt_idx" ON "StoryLocationClick"("viewerId", "clickedAt");
CREATE INDEX "StoryPollClick_storyId_clickedAt_idx" ON "StoryPollClick"("storyId", "clickedAt");
CREATE INDEX "StoryPollClick_storyId_overlayId_clickedAt_idx" ON "StoryPollClick"("storyId", "overlayId", "clickedAt");
CREATE INDEX "StoryPollClick_viewerId_clickedAt_idx" ON "StoryPollClick"("viewerId", "clickedAt");
CREATE INDEX "StoryQuestionAnswer_storyId_createdAt_idx" ON "StoryQuestionAnswer"("storyId", "createdAt");
CREATE INDEX "StoryQuestionAnswer_storyId_overlayId_createdAt_idx" ON "StoryQuestionAnswer"("storyId", "overlayId", "createdAt");
CREATE INDEX "StoryQuestionAnswer_respondentId_createdAt_idx" ON "StoryQuestionAnswer"("respondentId", "createdAt");

ALTER TABLE "StoryMention"
  ADD CONSTRAINT "StoryMention_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryMention"
  ADD CONSTRAINT "StoryMention_mentionedUserId_fkey"
  FOREIGN KEY ("mentionedUserId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryMentionClick"
  ADD CONSTRAINT "StoryMentionClick_mentionId_fkey"
  FOREIGN KEY ("mentionId") REFERENCES "StoryMention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryMentionClick"
  ADD CONSTRAINT "StoryMentionClick_viewerId_fkey"
  FOREIGN KEY ("viewerId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryLinkClick"
  ADD CONSTRAINT "StoryLinkClick_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryLinkClick"
  ADD CONSTRAINT "StoryLinkClick_viewerId_fkey"
  FOREIGN KEY ("viewerId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryLocationClick"
  ADD CONSTRAINT "StoryLocationClick_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryLocationClick"
  ADD CONSTRAINT "StoryLocationClick_viewerId_fkey"
  FOREIGN KEY ("viewerId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryPollClick"
  ADD CONSTRAINT "StoryPollClick_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryPollClick"
  ADD CONSTRAINT "StoryPollClick_viewerId_fkey"
  FOREIGN KEY ("viewerId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryQuestionAnswer"
  ADD CONSTRAINT "StoryQuestionAnswer_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryQuestionAnswer"
  ADD CONSTRAINT "StoryQuestionAnswer_respondentId_fkey"
  FOREIGN KEY ("respondentId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
