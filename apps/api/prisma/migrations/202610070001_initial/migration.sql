-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "customVersion" TEXT NOT NULL DEFAULT 'Custom 1.0',
    "draft" JSONB NOT NULL,
    "importedFrom" JSONB,
    "upstreamSnapshot" JSONB,
    "modified" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "draft" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "bundle" JSONB NOT NULL,
    "manifest" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" JSONB NOT NULL,
    "progress" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Build" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "storageKey" TEXT,
    "sha256" TEXT,
    "versionCode" INTEGER NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Build_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "releaseId" TEXT,
    "kind" TEXT NOT NULL,
    "launcherVersion" TEXT NOT NULL,
    "device" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "log" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Revision_projectId_number_key" ON "Revision"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Release_projectId_version_key" ON "Release"("projectId", "version");

-- CreateIndex
CREATE INDEX "Job_status_createdAt_idx" ON "Job"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Build_jobId_key" ON "Build"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Build_versionCode_key" ON "Build"("versionCode");

-- CreateIndex
CREATE INDEX "DiagnosticReport_createdAt_idx" ON "DiagnosticReport"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

