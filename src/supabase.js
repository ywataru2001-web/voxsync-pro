import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ijwmgubddlzdxfydccow.supabase.co'
const supabaseAnonKey = 'sb_publishable_fewaQ4G5uVDJzz7_XuwN4g_x4rhyu6u'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
