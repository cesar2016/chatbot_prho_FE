import { createClient } from '@supabase/supabase-js';

// Usamos process.env (Vercel Node.js) en vez de import.meta.env (Vite)
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
