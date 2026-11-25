import { useCallback, useEffect, useRef, useState } from 'react';

export type MediaPermissionState = 'prompt' | 'granted' | 'denied' | 'unknown';

export type UseMediaDevicesResult = {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  selectedCameraId: string;
  selectedMicId: string;
  setSelectedCameraId: (id: string) => void;
  setSelectedMicId: (id: string) => void;
  cameraEnabled: boolean;
  micEnabled: boolean;
  setCameraEnabled: (v: boolean) => void;
  setMicEnabled: (v: boolean) => void;
  previewStream: MediaStream | null;
  permissionState: MediaPermissionState;
  error: string | null;
  statusMessage: string;
  refreshDevices: () => Promise<void>;
  requestPermissions: () => Promise<boolean>;
};

function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // ignore
    }
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useMediaDevices(): UseMediaDevicesResult {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedMicId, setSelectedMicId] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [permissionState, setPermissionState] = useState<MediaPermissionState>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Starting camera…');

  const streamRef = useRef<MediaStream | null>(null);
  const requestIdRef = useRef(0);
  const selectedCameraIdRef = useRef(selectedCameraId);
  const selectedMicIdRef = useRef(selectedMicId);
  const cameraEnabledRef = useRef(cameraEnabled);
  const micEnabledRef = useRef(micEnabled);
  const userPickedCameraRef = useRef(false);
  const userPickedMicRef = useRef(false);

  selectedCameraIdRef.current = selectedCameraId;
  selectedMicIdRef.current = selectedMicId;
  cameraEnabledRef.current = cameraEnabled;
  micEnabledRef.current = micEnabled;

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      const mics = devices.filter((d) => d.kind === 'audioinput');
      setCameras(cams);
      setMicrophones(mics);

      // Fill defaults without treating this as a user device switch (avoids killing a live preview).
      setSelectedCameraId((prev) => {
        if (prev) return prev;
        const next = cams[0]?.deviceId || '';
        selectedCameraIdRef.current = next;
        return next;
      });
      setSelectedMicId((prev) => {
        if (prev) return prev;
        const next = mics[0]?.deviceId || '';
        selectedMicIdRef.current = next;
        return next;
      });
    } catch {
      setError('Unable to list media devices.');
    }
  }, []);

  const startPreview = useCallback(
    async (camId: string, micId: string, camOn: boolean, micOn: boolean) => {
      const requestId = ++requestIdRef.current;

      stopStream(streamRef.current);
      streamRef.current = null;
      setPreviewStream(null);

      if (!camOn && !micOn) {
        setStatusMessage('Camera and microphone are off');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser does not support camera/microphone access.');
        setStatusMessage('Media not supported');
        return;
      }

      setStatusMessage('Requesting camera and microphone…');
      setError(null);

      // Prefer unconstrained first open — exact deviceId often fails on Windows integrated cams.
      const videoConstraint: boolean | MediaTrackConstraints = camOn
        ? camId
          ? {
              deviceId: { ideal: camId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
        : false;

      const audioConstraint: boolean | MediaTrackConstraints = micOn
        ? micId
          ? { deviceId: { ideal: micId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true }
        : false;

      const openStream = async (): Promise<MediaStream> => {
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: videoConstraint,
            audio: audioConstraint,
          });
        } catch (combinedErr) {
          if (camOn) {
            try {
              const videoOnly = await navigator.mediaDevices.getUserMedia({
                video: videoConstraint,
                audio: false,
              });
              setError('Microphone could not be started. You can still join with camera only.');
              return videoOnly;
            } catch {
              if (micOn) {
                const audioOnly = await navigator.mediaDevices.getUserMedia({
                  video: false,
                  audio: audioConstraint || true,
                });
                setError('Camera could not be started. You can still join with microphone only.');
                return audioOnly;
              }
            }
          }
          throw combinedErr;
        }
      };

      try {
        let stream: MediaStream;
        try {
          stream = await openStream();
        } catch (err) {
          const name = err instanceof DOMException ? err.name : '';
          // Windows often needs a brief pause after the previous track was stopped.
          if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
            await sleep(350);
            if (requestId !== requestIdRef.current) return;
            stream = await navigator.mediaDevices.getUserMedia({
              video: camOn,
              audio: micOn,
            });
          } else if (name === 'OverconstrainedError') {
            stream = await navigator.mediaDevices.getUserMedia({
              video: camOn,
              audio: micOn,
            });
          } else {
            throw err;
          }
        }

        if (requestId !== requestIdRef.current) {
          stopStream(stream);
          return;
        }

        // Align toggle state with what we actually opened
        stream.getVideoTracks().forEach((t) => {
          t.enabled = camOn;
        });
        stream.getAudioTracks().forEach((t) => {
          t.enabled = micOn;
        });

        streamRef.current = stream;
        setPreviewStream(stream);
        setPermissionState('granted');

        const hasVideo = stream.getVideoTracks().some((t) => t.readyState === 'live');
        const hasAudio = stream.getAudioTracks().some((t) => t.readyState === 'live');
        if (hasVideo && hasAudio) setStatusMessage('Camera and microphone ready');
        else if (hasVideo) setStatusMessage('Camera ready');
        else if (hasAudio) setStatusMessage('Microphone ready');
        else setStatusMessage('Media started');

        // Update labels only — do not restart preview.
        await refreshDevices();
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        const name = err instanceof DOMException ? err.name : '';
        streamRef.current = null;
        setPreviewStream(null);

        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setPermissionState('denied');
          setError(
            'Camera or microphone permission was denied. Allow access in your browser settings, then refresh.',
          );
          setStatusMessage('Permission denied');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setError('No camera or microphone was found on this device.');
          setStatusMessage('No devices found');
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          setError(
            'Camera/microphone is busy (maybe used by another app). Close other apps and try again.',
          );
          setStatusMessage('Device busy');
        } else {
          setError('Could not access camera or microphone.');
          setStatusMessage('Media failed');
          console.error('[media] getUserMedia failed:', err);
        }
      }
    },
    [refreshDevices],
  );

  const requestPermissions = useCallback(async () => {
    setPermissionState('prompt');
    setCameraEnabled(true);
    setMicEnabled(true);
    await startPreview(
      selectedCameraIdRef.current,
      selectedMicIdRef.current,
      true,
      true,
    );
    return Boolean(streamRef.current);
  }, [startPreview]);

  const chooseCamera = useCallback((id: string) => {
    userPickedCameraRef.current = true;
    setSelectedCameraId(id);
  }, []);

  const chooseMic = useCallback((id: string) => {
    userPickedMicRef.current = true;
    setSelectedMicId(id);
  }, []);

  // Keep track.enabled in sync without reopening the device
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = cameraEnabled;
    });
    stream.getAudioTracks().forEach((t) => {
      t.enabled = micEnabled;
    });
    if (!cameraEnabled && !micEnabled) {
      setStatusMessage('Camera and microphone are off');
    } else if (cameraEnabled && micEnabled) {
      setStatusMessage((prev) =>
        prev.startsWith('Camera and microphone') ? prev : 'Camera and microphone ready',
      );
    }
  }, [cameraEnabled, micEnabled]);

  // Initial open + when user explicitly picks another device
  useEffect(() => {
    void startPreview(
      selectedCameraIdRef.current,
      selectedMicIdRef.current,
      cameraEnabledRef.current,
      micEnabledRef.current,
    );
    return () => {
      requestIdRef.current += 1;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
    // Intentionally mount-only. Device changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userPickedCameraRef.current && !userPickedMicRef.current) return;
    // Reset flags so both changing together only restarts once per commit
    const camPicked = userPickedCameraRef.current;
    const micPicked = userPickedMicRef.current;
    userPickedCameraRef.current = false;
    userPickedMicRef.current = false;
    if (!camPicked && !micPicked) return;

    void startPreview(
      selectedCameraId,
      selectedMicId,
      cameraEnabledRef.current,
      micEnabledRef.current,
    );
  }, [selectedCameraId, selectedMicId, startPreview]);

  // If both were off and user turns one back on with no live stream, reopen
  useEffect(() => {
    if ((cameraEnabled || micEnabled) && !streamRef.current) {
      void startPreview(
        selectedCameraIdRef.current,
        selectedMicIdRef.current,
        cameraEnabled,
        micEnabled,
      );
    }
    if (!cameraEnabled && !micEnabled && streamRef.current) {
      // Soft-disable only via track.enabled above; keep stream so re-enable is instant.
      // If you prefer releasing hardware when both off, stop here instead.
    }
  }, [cameraEnabled, micEnabled, startPreview]);

  useEffect(() => {
    const onChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  }, [refreshDevices]);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  return {
    cameras,
    microphones,
    selectedCameraId,
    selectedMicId,
    setSelectedCameraId: chooseCamera,
    setSelectedMicId: chooseMic,
    cameraEnabled,
    micEnabled,
    setCameraEnabled,
    setMicEnabled,
    previewStream,
    permissionState,
    error,
    statusMessage,
    refreshDevices,
    requestPermissions,
  };
}
