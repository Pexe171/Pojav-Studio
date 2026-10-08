CREATE TABLE "TelemetryEvent" (
  "id" TEXT NOT NULL,
  "deviceKey" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "projectId" TEXT,
  "releaseId" TEXT,
  "kind" TEXT NOT NULL,
  "launcherVersion" TEXT NOT NULL,
  "device" JSONB NOT NULL,
  "data" JSONB NOT NULL,
  "log" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TelemetryEvent_deviceKey_occurredAt_idx" ON "TelemetryEvent"("deviceKey", "occurredAt");
CREATE INDEX "TelemetryEvent_projectId_occurredAt_idx" ON "TelemetryEvent"("projectId", "occurredAt");
CREATE INDEX "TelemetryEvent_receivedAt_idx" ON "TelemetryEvent"("receivedAt");
