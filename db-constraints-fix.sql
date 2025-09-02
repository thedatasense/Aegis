-- Add unique constraint to conversation_state table
ALTER TABLE conversation_state 
ADD CONSTRAINT conversation_state_user_id_unique UNIQUE (user_id);

-- Fix daily_plans unique constraint to include user_id
ALTER TABLE daily_plans 
DROP CONSTRAINT IF EXISTS daily_plans_date_key;

ALTER TABLE daily_plans 
ADD CONSTRAINT daily_plans_user_date_unique UNIQUE (user_id, date);