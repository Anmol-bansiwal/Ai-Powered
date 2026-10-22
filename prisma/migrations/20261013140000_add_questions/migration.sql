-- This runs on the same connection that applies the migration.
-- A wrong database aborts the transaction before any table is created.
DO $$
BEGIN
  IF current_database() IS DISTINCT FROM 'edusearch_ai' THEN
    RAISE EXCEPTION 'migration refused because the connected database is not edusearch_ai';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'SHORT', 'LONG');

-- CreateEnum
CREATE TYPE "EmbeddingStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "question_text" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "subtopic" TEXT,
    "exam_year" INTEGER,
    "exam_type" TEXT,
    "difficulty" "Difficulty" NOT NULL,
    "question_type" "QuestionType" NOT NULL,
    "source_document" TEXT,
    "page_reference" TEXT,
    "embedding_status" "EmbeddingStatus" NOT NULL DEFAULT 'PENDING',
    "embedding_model" TEXT,
    "embedding" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "questions_subject_exam_year_difficulty_idx" ON "questions"("subject", "exam_year", "difficulty");
