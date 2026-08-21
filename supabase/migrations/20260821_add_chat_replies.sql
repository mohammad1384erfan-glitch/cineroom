-- Migration to support chat message replies
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS reply_to_id TEXT REFERENCES public.chat_messages(id) ON DELETE SET NULL;
