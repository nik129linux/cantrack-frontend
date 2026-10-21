import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://cantrack-demo.supabase.co";
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbnRyYWNrLWRlbW8iLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYyMzg4MDAwMCwiZXhwIjoxOTM5NDU2MDAwfQ.dummy";

export const supabase = createClient(supabaseUrl, supabaseKey);
