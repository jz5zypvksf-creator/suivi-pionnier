import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://zvkdermfabpyseuijtrr.supabase.co";
const supabasePublishableKey = "sb_publishable_CehaIgi5bMa34yaefYzjdA_mvWyjtxy";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
