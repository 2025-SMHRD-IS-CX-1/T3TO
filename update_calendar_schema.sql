-- Add event_date to calendar_events
ALTER TABLE public.calendar_events 
ADD COLUMN event_date timestamp with time zone DEFAULT now();

-- Add other useful fields if missing, to match UI
ALTER TABLE public.calendar_events 
ADD COLUMN event_type varchar(50) DEFAULT 'online'; -- online, offline
