import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY (см. .env.example)')
}

export const supabase = createClient(url, key)
