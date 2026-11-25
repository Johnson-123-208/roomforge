export type MeetingStatus = 'active' | 'ended' | 'expired';

export type SafeMeeting = {
  room_id: string;
  title: string;
  status: MeetingStatus;
  max_participants: number;
  created_at: string;
  expires_at: string | null;
  ended_at: string | null;
};

export type CreateMeetingResponse = {
  room_id: string;
  title: string;
  meeting_url: string;
  passcode: string;
  host_secret: string;
  max_participants: number;
  expires_at: string;
  status: MeetingStatus;
};

export type VerifyJoinedResponse = {
  status: 'joined';
  meeting: SafeMeeting;
  token: string;
  participant_identity: string;
  display_name: string;
  is_host: boolean;
  host_token?: string;
  livekit_url: string;
};

export type VerifyWaitingResponse = {
  status: 'waiting';
  meeting: SafeMeeting;
  participant_identity: string;
  display_name: string;
  is_host: false;
  message?: string;
};

export type VerifyJoinResponse = VerifyJoinedResponse | VerifyWaitingResponse;

export type WaitingPerson = {
  participant_identity: string;
  display_name: string;
  joined_at: string;
  connection_status: string;
};

export type HostTokenResponse = {
  host_token: string;
  expires_in: number;
  meeting: SafeMeeting;
};

export type ApiErrorBody = {
  error: string;
  code?: string;
  details?: Array<{ path: string; message: string }>;
};

export type JoinSession = {
  roomId: string;
  token: string;
  livekitUrl: string;
  participantIdentity: string;
  displayName: string;
  isHost: boolean;
  hostToken?: string;
  meeting: SafeMeeting;
  enableCamera: boolean;
  enableMicrophone: boolean;
};
