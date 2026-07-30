DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_parking_lot_items;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
