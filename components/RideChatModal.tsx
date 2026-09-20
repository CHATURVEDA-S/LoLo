import { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { X, Send, MessageSquare, Check, Clock, AlertCircle, RefreshCw, PhoneCall, ShieldAlert } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { triggerNotificationSoundAlert } from '@/lib/sound-alert';
import { RideStatus } from '@/lib/types';

interface ChatMessageItem {
  id: string;
  ride_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  status?: 'sending' | 'sent' | 'failed';
  sender?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
}

interface RideChatModalProps {
  visible: boolean;
  onClose: () => void;
  rideId: string;
  rideStatus: RideStatus;
  otherPartyName: string;
  isDriver: boolean;
  onStartCall?: () => void;
}

// Tailored quick replies for Driver (Captain) vs Passenger
const DRIVER_QUICK_REPLIES = [
  '🚗 On my way to your pickup',
  '📍 Arrived at your pickup spot',
  '⏳ Reaching in 2-3 minutes',
  '🚦 In traffic, reaching shortly',
  '👋 Parked near the main gate',
  '📞 Arrived, please come out',
  '✅ OK, noted!',
];

const PASSENGER_QUICK_REPLIES = [
  '📍 Waiting at the pickup spot',
  '👋 Standing near the main entrance',
  '⏳ Coming down in 2 minutes',
  '🚗 Where are you right now?',
  '🚕 What is your vehicle color/number?',
  '🏃 Heading to the vehicle now',
  '✅ Got it, thanks!',
];

export default function RideChatModal({
  visible,
  onClose,
  rideId,
  rideStatus,
  otherPartyName,
  isDriver,
  onStartCall,
}: RideChatModalProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const lastMessageCountRef = useRef(0);

  const quickReplies = isDriver ? DRIVER_QUICK_REPLIES : PASSENGER_QUICK_REPLIES;

  const fetchMessages = useCallback(async () => {
    if (!rideId || !visible) return;
    const { data } = await api.getChatMessages(rideId);
    if (data) {
      const msgs = (data as ChatMessageItem[]) || [];
      // If a new message arrived from the other party while modal was open
      if (
        msgs.length > lastMessageCountRef.current &&
        lastMessageCountRef.current > 0
      ) {
        const newest = msgs[msgs.length - 1];
        if (newest && newest.sender_id !== user?.id) {
          triggerNotificationSoundAlert(
            `Message from ${otherPartyName}`,
            newest.content
          );
        }
      }
      lastMessageCountRef.current = msgs.length;

      // Merge incoming server messages while preserving any pending optimistic ones
      setMessages((prev) => {
        const pending = prev.filter((m) => m.status === 'sending' || m.status === 'failed');
        const serverIds = new Set(msgs.map((m) => m.id));
        const remainingPending = pending.filter((p) => !serverIds.has(p.id));
        return [...msgs, ...remainingPending];
      });
    }
    setLoading(false);
  }, [rideId, visible, user?.id, otherPartyName]);

  // Initial load + interval polling
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchMessages();

    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [visible, fetchMessages]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 80);
    }
  }, [messages.length]);

  async function handleSend(textToSend?: string) {
    const isQuickReply = Boolean(textToSend);
    const text = (textToSend ?? inputContent).trim();
    if (!text || !rideId) return;

    // Provide immediate tactile click
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {}

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimisticMessage: ChatMessageItem = {
      id: tempId,
      ride_id: rideId,
      sender_id: user?.id || '',
      content: text,
      created_at: new Date().toISOString(),
      status: 'sending',
      sender: {
        id: user?.id || '',
        full_name: user?.full_name || 'Me',
      },
    };

    // 1. Optimistic append immediately
    setMessages((prev) => [...prev, optimisticMessage]);
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 50);

    const savedDraft = inputContent;
    if (!isQuickReply) {
      setInputContent('');
    }

    setSending(true);
    const { data, error } = await api.sendChatMessage(rideId, text);
    setSending(false);

    if (data) {
      // 2. Replace optimistic message with confirmed server message
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...(data as ChatMessageItem), status: 'sent' } : m))
      );
      lastMessageCountRef.current += 1;
    } else {
      // 3. Mark optimistic message as failed & restore draft if typed
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
      );
      if (!isQuickReply) {
        setInputContent(savedDraft);
      }
      Alert.alert(
        'Message Not Sent',
        error || 'Could not send your message. Please check your network and try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => handleRetry(tempId, text) },
        ]
      );
    }
  }

  async function handleRetry(failedId: string, text: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === failedId ? { ...m, status: 'sending' } : m))
    );
    const { data, error } = await api.sendChatMessage(rideId, text);
    if (data) {
      setMessages((prev) =>
        prev.map((m) => (m.id === failedId ? { ...(data as ChatMessageItem), status: 'sent' } : m))
      );
      lastMessageCountRef.current += 1;
    } else {
      setMessages((prev) =>
        prev.map((m) => (m.id === failedId ? { ...m, status: 'failed' } : m))
      );
      Alert.alert('Send Failed', error || 'Failed to resend message.');
    }
  }

  function formatTime(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.chatContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.chatAvatar}>
                <Text style={styles.chatAvatarText}>
                  {otherPartyName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.headerTextGroup}>
                <Text style={styles.headerName} numberOfLines={1}>
                  {otherPartyName}
                </Text>
                <Text style={styles.headerRole}>
                  {isDriver ? 'Passenger' : 'Driver'} • In-Ride Live Chat
                </Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              {onStartCall && (
                <TouchableOpacity
                  style={[
                    styles.headerCallBtn,
                    (rideStatus === 'completed' || rideStatus === 'cancelled') && styles.headerCallBtnDisabled,
                  ]}
                  onPress={() => {
                    if (rideStatus === 'completed' || rideStatus === 'cancelled') {
                      Alert.alert(
                        'Ride Completed',
                        'In-app calling and chat are closed after ride completion to protect user privacy.'
                      );
                      return;
                    }
                    onStartCall();
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <PhoneCall
                    size={17}
                    color={
                      rideStatus === 'completed' || rideStatus === 'cancelled'
                        ? Colors.neutral[400]
                        : '#16a34a'
                    }
                    strokeWidth={2.2}
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={Colors.neutral[700]} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Messages List */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {loading && messages.length === 0 ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="small" color={Colors.primary[600]} />
              </View>
            ) : messages.length === 0 ? (
              <View style={styles.emptyState}>
                <MessageSquare size={40} color={Colors.neutral[300]} strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>Coordinate your pickup</Text>
                <Text style={styles.emptySub}>
                  {isDriver
                    ? 'Let passengers know your vehicle location, traffic, or arrival time.'
                    : 'Send a quick message to clarify your exact pickup location or timing.'}
                </Text>
              </View>
            ) : (
              messages.map((msg) => {
                const isMe = msg.sender_id === user?.id;
                const isFailed = msg.status === 'failed';
                const isSending = msg.status === 'sending';

                return (
                  <View
                    key={msg.id}
                    style={[
                      styles.messageRow,
                      isMe ? styles.messageRowMe : styles.messageRowOther,
                    ]}
                  >
                    {!isMe && (
                      <View style={styles.smallAvatar}>
                        <Text style={styles.smallAvatarText}>
                          {(msg.sender?.full_name ?? otherPartyName).charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View
                      style={[
                        styles.bubble,
                        isMe ? styles.bubbleMe : styles.bubbleOther,
                        isFailed && styles.bubbleFailed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.bubbleText,
                          isMe ? styles.bubbleTextMe : styles.bubbleTextOther,
                        ]}
                      >
                        {msg.content}
                      </Text>
                      <View style={styles.bubbleFooter}>
                        <Text
                          style={[
                            styles.bubbleTime,
                            isMe ? styles.bubbleTimeMe : styles.bubbleTimeOther,
                          ]}
                        >
                          {formatTime(msg.created_at)}
                        </Text>
                        {isMe && (
                          <View style={styles.statusIconWrap}>
                            {isSending ? (
                              <Clock size={11} color="rgba(255, 255, 255, 0.7)" strokeWidth={2} />
                            ) : isFailed ? (
                              <TouchableOpacity
                                onPress={() => handleRetry(msg.id, msg.content)}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <AlertCircle size={13} color="#fca5a5" strokeWidth={2.4} />
                              </TouchableOpacity>
                            ) : (
                              <Check size={11} color="rgba(255, 255, 255, 0.85)" strokeWidth={2.5} />
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                    {isFailed && (
                      <TouchableOpacity
                        style={styles.retryBtn}
                        onPress={() => handleRetry(msg.id, msg.content)}
                        activeOpacity={0.7}
                      >
                        <RefreshCw size={13} color={Colors.error[600]} strokeWidth={2.2} />
                        <Text style={styles.retryText}>Retry</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Bottom Actions: If ride is completed/cancelled, show locked notice. Otherwise show quick replies & input */}
          {rideStatus === 'completed' || rideStatus === 'cancelled' ? (
            <View style={styles.chatClosedCard}>
              <ShieldAlert size={22} color="#b45309" strokeWidth={2.2} />
              <View style={{ flex: 1 }}>
                <Text style={styles.chatClosedTitle}>Ride Completed • Chat & Calling Closed</Text>
                <Text style={styles.chatClosedDesc}>
                  To protect user privacy, in-app calling and live messaging are permanently disabled after ride completion.
                </Text>
              </View>
            </View>
          ) : (
            <>
              {/* Quick Replies Chips */}
              <View style={styles.quickRepliesWrap}>
                <View style={styles.quickRepliesHeader}>
                  <Text style={styles.quickRepliesLabel}>
                    {isDriver ? 'Driver Quick Replies' : 'Passenger Quick Replies'}
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickRepliesList}
                  keyboardShouldPersistTaps="handled"
                >
                  {quickReplies.map((replyText, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.quickChip}
                      onPress={() => handleSend(replyText)}
                      activeOpacity={0.65}
                    >
                      <Text style={styles.quickChipText}>{replyText}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Input Bar */}
              <View style={styles.inputBar}>
                <TextInput
                  style={styles.textInput}
                  placeholder={isDriver ? 'Message passenger...' : 'Message driver...'}
                  placeholderTextColor={Colors.neutral[400]}
                  value={inputContent}
                  onChangeText={setInputContent}
                  multiline
                  maxLength={400}
                  returnKeyType="send"
                  onSubmitEditing={() => handleSend()}
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    !inputContent.trim() && !sending && styles.sendBtnDisabled,
                  ]}
                  onPress={() => handleSend()}
                  disabled={!inputContent.trim() && !sending}
                  activeOpacity={0.8}
                >
                  {sending && !inputContent.trim() ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Send size={18} color="#ffffff" strokeWidth={2.2} />
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  chatContainer: {
    height: '78%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...Shadow.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[200],
    backgroundColor: '#f0f9ff',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    paddingRight: Spacing.sm,
  },
  chatAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  chatAvatarText: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.md,
    color: '#ffffff',
  },
  headerTextGroup: {
    flex: 1,
  },
  headerName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.md,
    color: Colors.neutral[900],
  },
  headerRole: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.primary[700],
    marginTop: 1,
  },
  closeBtn: {
    padding: Spacing.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.neutral[100],
  },
  messageList: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  messageListContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  centerLoading: {
    paddingTop: Spacing.xxl,
    alignItems: 'center',
  },
  emptyState: {
    paddingTop: Spacing.xxl * 1.5,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.md,
    color: Colors.neutral[700],
    marginTop: Spacing.sm,
  },
  emptySub: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: Colors.neutral[400],
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 260,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  smallAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  smallAvatarText: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    color: Colors.primary[700],
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 1,
    borderRadius: Radius.lg,
  },
  bubbleMe: {
    backgroundColor: Colors.primary[600],
    borderBottomRightRadius: 3,
    ...Shadow.sm,
  },
  bubbleOther: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 3,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
    ...Shadow.sm,
  },
  bubbleFailed: {
    backgroundColor: '#dc2626',
  },
  bubbleText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13.5,
    lineHeight: 19,
    flexShrink: 1,
  },
  bubbleTextMe: {
    color: '#ffffff',
  },
  bubbleTextOther: {
    color: Colors.neutral[800],
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  bubbleTime: {
    fontFamily: 'Inter-Regular',
    fontSize: 9.5,
  },
  bubbleTimeMe: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  bubbleTimeOther: {
    color: Colors.neutral[400],
  },
  statusIconWrap: {
    marginLeft: 1,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    alignSelf: 'center',
  },
  retryText: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: Colors.error[600],
  },
  quickRepliesWrap: {
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[200],
    backgroundColor: '#ffffff',
    paddingTop: 6,
    paddingBottom: 8,
  },
  quickRepliesHeader: {
    paddingHorizontal: Spacing.md,
    marginBottom: 4,
  },
  quickRepliesLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10.5,
    color: Colors.neutral[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickRepliesList: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs + 2,
  },
  quickChip: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  quickChipText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11.5,
    color: Colors.primary[700],
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[200],
    backgroundColor: '#ffffff',
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.neutral[50],
    borderWidth: 1,
    borderColor: Colors.neutral[200],
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 9 : 7,
    fontFamily: 'Inter-Regular',
    fontSize: 13.5,
    color: Colors.neutral[900],
    maxHeight: 90,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  sendBtnDisabled: {
    backgroundColor: Colors.neutral[300],
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  headerCallBtnDisabled: {
    backgroundColor: Colors.neutral[100],
    borderColor: Colors.neutral[300],
  },
  chatClosedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: '#fffbeb',
    borderTopWidth: 1,
    borderTopColor: '#fde68a',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  chatClosedTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#92400e',
    marginBottom: 2,
  },
  chatClosedDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 11.5,
    color: '#b45309',
    lineHeight: 16,
  },
});
