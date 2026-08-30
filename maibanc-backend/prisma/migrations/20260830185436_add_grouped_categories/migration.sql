-- CreateTable
CREATE TABLE "GroupedCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "members" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupedCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupedCategory_userId_idx" ON "GroupedCategory"("userId");

-- AddForeignKey
ALTER TABLE "GroupedCategory" ADD CONSTRAINT "GroupedCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
