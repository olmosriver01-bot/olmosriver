-- CreateTable
CREATE TABLE "InboxSettings" (
    "companyId" TEXT NOT NULL PRIMARY KEY,
    "reminderMinutes" INTEGER NOT NULL DEFAULT 5,
    "managerMinutes" INTEGER NOT NULL DEFAULT 15,
    "adminMinutes" INTEGER NOT NULL DEFAULT 30,
    "reportTime" TEXT NOT NULL DEFAULT '23:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tashkent',
    "retentionDays" INTEGER NOT NULL DEFAULT 180,
    "autoReplyPatterns" TEXT NOT NULL DEFAULT '',
    "deliveryTerms" TEXT NOT NULL DEFAULT '',
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiModel" TEXT NOT NULL DEFAULT 'claude-opus-5-5',
    "tgBotTokenEnc" TEXT,
    "tgBotUsername" TEXT,
    "tgBotId" TEXT,
    "tgWebhookSecretEnc" TEXT,
    "tgLastCheckAt" DATETIME,
    "tgLastOkAt" DATETIME,
    "tgLastError" TEXT,
    "igAppId" TEXT,
    "igAppSecretEnc" TEXT,
    "igVerifyToken" TEXT,
    "lastReportKey" TEXT,
    "lastRetentionAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InboxSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "externalId" TEXT NOT NULL,
    "altExternalId" TEXT,
    "businessConnectionId" TEXT,
    "tokenEnc" TEXT,
    "tokenExpiresAt" DATETIME,
    "tokenRefreshedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusDetail" TEXT,
    "canReply" BOOLEAN NOT NULL DEFAULT false,
    "trackingStartedAt" DATETIME,
    "lastEventAt" DATETIME,
    "lastSyncOkAt" DATETIME,
    "lastCheckAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InboxChannel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxOutage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "reason" TEXT NOT NULL,
    CONSTRAINT "InboxOutage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "InboxChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "linkCodeHash" TEXT,
    "linkCodeExpiresAt" DATETIME,
    "notifyReminder" BOOLEAN NOT NULL DEFAULT true,
    "notifyManager" BOOLEAN NOT NULL DEFAULT false,
    "notifyAdmin" BOOLEAN NOT NULL DEFAULT false,
    "receiveReport" BOOLEAN NOT NULL DEFAULT false,
    "allChannels" BOOLEAN NOT NULL DEFAULT true,
    "monitoringAckAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboxMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InboxMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxChannelAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "InboxChannelAccess_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "InboxChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InboxChannelAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "days" TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    CONSTRAINT "InboxShift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InboxShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalChatId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerUsername" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "assigneeId" TEXT,
    "orderRef" TEXT,
    "isSpam" BOOLEAN NOT NULL DEFAULT false,
    "waitingSince" DATETIME,
    "waitingMessageId" TEXT,
    "resolvedThroughAt" DATETIME,
    "closedAt" DATETIME,
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "firstMessageAt" DATETIME,
    "lastMessageAt" DATETIME,
    "lastCustomerAt" DATETIME,
    "lastStaffAt" DATETIME,
    "aiAnalyzedAt" DATETIME,
    "aiSummary" TEXT,
    "promiseDueAt" DATETIME,
    "promiseMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InboxConversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InboxConversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "InboxChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InboxConversation_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "externalId" TEXT,
    "direction" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorUserId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'TEXT',
    "text" TEXT NOT NULL DEFAULT '',
    "originalText" TEXT,
    "needsReply" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" DATETIME NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" DATETIME,
    "deletedAt" DATETIME,
    "deliveryStatus" TEXT,
    "deliveryError" TEXT,
    "clientToken" TEXT,
    CONSTRAINT "InboxMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InboxMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "byUserId" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboxEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "InboxAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "conversationId" TEXT,
    "channelId" TEXT,
    "recipientUserId" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "InboxFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "messageIds" TEXT NOT NULL,
    "suggestedReply" TEXT,
    "verification" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "source" TEXT NOT NULL DEFAULT 'AI',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboxFinding_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxAiRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "InboxCatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InboxCatalogItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "InboxChannel_companyId_idx" ON "InboxChannel"("companyId");

-- CreateIndex
CREATE INDEX "InboxChannel_businessConnectionId_idx" ON "InboxChannel"("businessConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxChannel_companyId_platform_externalId_key" ON "InboxChannel"("companyId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "InboxOutage_companyId_startedAt_idx" ON "InboxOutage"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "InboxOutage_channelId_idx" ON "InboxOutage"("channelId");

-- CreateIndex
CREATE INDEX "InboxMember_linkCodeHash_idx" ON "InboxMember"("linkCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "InboxMember_companyId_userId_key" ON "InboxMember"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxChannelAccess_channelId_userId_key" ON "InboxChannelAccess"("channelId", "userId");

-- CreateIndex
CREATE INDEX "InboxShift_companyId_idx" ON "InboxShift"("companyId");

-- CreateIndex
CREATE INDEX "InboxConversation_companyId_status_idx" ON "InboxConversation"("companyId", "status");

-- CreateIndex
CREATE INDEX "InboxConversation_companyId_waitingSince_idx" ON "InboxConversation"("companyId", "waitingSince");

-- CreateIndex
CREATE INDEX "InboxConversation_companyId_lastMessageAt_idx" ON "InboxConversation"("companyId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "InboxConversation_assigneeId_idx" ON "InboxConversation"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxConversation_channelId_externalChatId_key" ON "InboxConversation"("channelId", "externalChatId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxMessage_clientToken_key" ON "InboxMessage"("clientToken");

-- CreateIndex
CREATE INDEX "InboxMessage_conversationId_sentAt_idx" ON "InboxMessage"("conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "InboxMessage_companyId_sentAt_idx" ON "InboxMessage"("companyId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboxMessage_conversationId_externalId_key" ON "InboxMessage"("conversationId", "externalId");

-- CreateIndex
CREATE INDEX "InboxEvent_conversationId_createdAt_idx" ON "InboxEvent"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboxWebhookEvent_dedupeKey_key" ON "InboxWebhookEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "InboxWebhookEvent_receivedAt_idx" ON "InboxWebhookEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboxAlert_dedupeKey_key" ON "InboxAlert"("dedupeKey");

-- CreateIndex
CREATE INDEX "InboxAlert_companyId_createdAt_idx" ON "InboxAlert"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboxFinding_dedupeKey_key" ON "InboxFinding"("dedupeKey");

-- CreateIndex
CREATE INDEX "InboxFinding_companyId_status_idx" ON "InboxFinding"("companyId", "status");

-- CreateIndex
CREATE INDEX "InboxFinding_conversationId_idx" ON "InboxFinding"("conversationId");

-- CreateIndex
CREATE INDEX "InboxAiRun_companyId_createdAt_idx" ON "InboxAiRun"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "InboxCatalogItem_companyId_idx" ON "InboxCatalogItem"("companyId");
