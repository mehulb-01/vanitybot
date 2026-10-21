-- CreateTable
CREATE TABLE "VoiceTime" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "totalSeconds" INTEGER NOT NULL DEFAULT 0,
    "currentSessionStart" TIMESTAMP(3),
    "lastVoiceChannel" TEXT,
    "lastJoinTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceTime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceTime_userId_idx" ON "VoiceTime"("userId");

-- CreateIndex
CREATE INDEX "VoiceTime_guildId_idx" ON "VoiceTime"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceTime_userId_guildId_key" ON "VoiceTime"("userId", "guildId");
