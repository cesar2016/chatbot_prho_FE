import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  let res;
  
  res = await supabase.from('conversations').select('*, users!assigned_user_id(name,avatar)');
  console.log("users!assigned_user_id ->", res.error?.message || "SUCCESS");

  res = await supabase.from('conversations').select('*, users!conversations_assigned_user_id_foreign(name,avatar)');
  console.log("users!fk_name ->", res.error?.message || "SUCCESS");

  res = await supabase.from('conversations').select('*, assigned_user_id(name,avatar)');
  console.log("assigned_user_id ->", res.error?.message || "SUCCESS");

  res = await supabase.from('conversations').select('*, users(name,avatar)');
  console.log("users ->", res.error?.message || "SUCCESS");
}
run();
