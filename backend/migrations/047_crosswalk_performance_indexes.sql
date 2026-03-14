-- Migration: Add performance indexes for auto-crosswalk feature
-- Description: Add indexes on control_mappings table to optimize crosswalk queries
-- Date: 2026-02-13

-- Index on control_mappings source_control_id for faster lookup when finding mapped controls
CREATE INDEX IF NOT EXISTS idx_control_mappings_source 
  ON control_mappings(source_control_id);

-- Index on control_mappings target_control_id for faster lookup when finding mapped controls
CREATE INDEX IF NOT EXISTS idx_control_mappings_target 
  ON control_mappings(target_control_id);

-- Composite index on control_mappings for similarity-based filtering
CREATE INDEX IF NOT EXISTS idx_control_mappings_similarity 
  ON control_mappings(similarity_score DESC) WHERE similarity_score IS NOT NULL;

-- Composite index for optimal auto-crosswalk query performance
CREATE INDEX IF NOT EXISTS idx_control_mappings_source_similarity 
  ON control_mappings(source_control_id, similarity_score DESC);

CREATE INDEX IF NOT EXISTS idx_control_mappings_target_similarity 
  ON control_mappings(target_control_id, similarity_score DESC);
