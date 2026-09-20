import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { RideCall } from '@/lib/types';
import InAppCallModal from './InAppCallModal';
import { triggerIncomingCallPush, stopAllCallSounds } from '@/lib/notifications';

export default function GlobalCallManager() {
  const { user, token } = useAuth();
  const [incomingCall, setIncomingCall] = useState<RideCall | null>(null);
  const [showModal, setShowModal] = useState(false);
  const handledCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !token) return;

    let isMounted = true;

    const interval = setInterval(async () => {
      try {
        const { data, error } = await api.getActiveIncomingCall();
        if (error || !isMounted) return;

        if (data && data.active && data.call) {
          const c = data.call as RideCall;
          if (c.receiver_id === user.id && c.status === 'ringing') {
            if (!showModal && handledCallIdRef.current !== c.id) {
              handledCallIdRef.current = c.id;
              setIncomingCall(c);
              setShowModal(true);
              triggerIncomingCallPush(c.caller?.full_name || 'Driver / Passenger', c.ride_id, c.id);
            }
          }
        } else if (showModal && incomingCall && data && data.active === false) {
          // Explicit confirmation that call is no longer active (cancelled or ended)
          stopAllCallSounds();
          setShowModal(false);
          setIncomingCall(null);
          handledCallIdRef.current = null;
        }
      } catch (_) {}
    }, 2400);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user, token, showModal, incomingCall]);

  if (!showModal || !incomingCall) return null;

  return (
    <InAppCallModal
      visible={showModal}
      onClose={() => {
        stopAllCallSounds();
        setShowModal(false);
        setIncomingCall(null);
        handledCallIdRef.current = null;
      }}
      rideId={incomingCall.ride_id}
      rideStatus="open"
      otherPartyName={incomingCall.caller?.full_name || 'Driver / Passenger'}
      otherPartyRole={incomingCall.caller?.is_driver ? 'Driver' : 'Passenger'}
      otherPartyAvatar={incomingCall.caller?.avatar_url}
      isIncoming={true}
      existingCall={incomingCall}
    />
  );
}
