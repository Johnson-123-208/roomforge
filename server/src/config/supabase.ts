import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const env = getEnv();
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return client;
}

export type MeetingRow = {
  id: string;
  room_id: string;
  title: string;
  passcode_hash: string;
  host_secret_hash: string;
  max_participants: number;
  status: 'active' | 'ended' | 'expired';
  created_at: string;
  expires_at: string | null;
  ended_at: string | null;
};

export type ParticipantRow = {
  id: string;
  meeting_id: string;
  participant_identity: string;
  display_name: string;
  is_host: boolean;
  joined_at: string;
  left_at: string | null;
  connection_status: 'connected' | 'disconnected' | 'reconnecting';
};
