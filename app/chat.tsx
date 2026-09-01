/**
 * app/chat.tsx — Full-screen AI chat
 *
 * Opened via router.push('/chat') from the AI screen FAB.
 * No tab bar (this screen is outside the (tabs) group).
 * Header has a back button on the left and the app name on the right.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, TextInput, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  TouchableOpacity, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { getEventsByDate } from '@/db/events';
import { BodyMd, LabelMd, LabelSm } from '@/components/ui/Typography';
import { spacing, radius, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeContext';
import { useLlama } from '@/hooks/useLlama';

function todayISO() { return new Date().toISOString().slice(0, 10); }

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [input, setInput] = useState('');
  const llama = useLlama();
  const { isDownloaded, isDownloading, isThinking, sendMessage: llamaSend } = llama;

  const today = todayISO();
  const todayEvents = getEventsByDate(today);

  // Auto-scroll to latest message
  useEffect(() => {
    if (llama.messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [llama.messages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isThinking || !isDownloaded) return;
    const text = input.trim();
    setInput('');
    llamaSend(text, todayEvents);
  }, [input, isThinking, isDownloaded, llamaSend, todayEvents]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.surfaceContainerLowest,
            borderBottomColor: colors.outlineVariant,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.headerBtn, { backgroundColor: colors.surfaceContainerHigh }]}
          hitSlop={8}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.onSurface} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <MaterialCommunityIcons name="robot" size={18} color={colors.primary} />
          <LabelMd color={colors.onSurface} style={{ marginLeft: 6 }}>freeflow AI</LabelMd>
        </View>

        <View style={styles.headerRight}>
          {/* Status indicator */}
          <LabelSm
            color={llama.isLoaded ? colors.secondary : colors.onSurfaceVariant}
            style={{ fontSize: 10 }}
          >
            {llama.isLoaded
              ? '● ready'
              : isDownloading
                ? `↓ ${llama.downloadProgress}%`
                : '○ offline'}
          </LabelSm>

          {/* Clear chat */}
          <TouchableOpacity
            onPress={llama.clearMessages}
            style={[styles.headerBtn, { backgroundColor: colors.surfaceContainerHigh }]}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="delete-sweep-outline" size={18} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Download progress bar ── */}
      {isDownloading && (
        <View style={[styles.progressWrap, { backgroundColor: `${colors.primaryContainer}55` }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${llama.downloadProgress}%` as any, backgroundColor: colors.primary },
            ]}
          />
        </View>
      )}

      {/* ── Error banner ── */}
      {llama.downloadError ? (
        <View style={[styles.errorBanner, { backgroundColor: `${colors.errorContainer}88`, borderColor: colors.error }]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={15} color={colors.error} />
          <LabelSm color={colors.error} style={{ flex: 1 }}>{llama.downloadError}</LabelSm>
          <TouchableOpacity onPress={llama.startDownload}>
            <LabelSm color={colors.primary}>Retry</LabelSm>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Chat area ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <FlatList
          ref={flatListRef}
          data={llama.messages}
          keyExtractor={(_, i) => String(i)}
          style={styles.msgList}
          contentContainerStyle={{
            gap: spacing.sm,
            padding: spacing.md,
            paddingBottom: spacing.xl,
          }}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <MaterialCommunityIcons name="robot-outline" size={48} color={`${colors.outline}88`} />
              <LabelMd color={colors.onSurfaceVariant} style={{ textAlign: 'center', marginTop: spacing.sm }}>
                Ask me about your schedule,{'\n'}focus tips, or anything else.
              </LabelMd>
              {!isDownloaded && !isDownloading && (
                <LabelSm color={colors.onSurfaceVariant} style={{ textAlign: 'center', marginTop: spacing.xs, opacity: 0.7 }}>
                  Model not yet downloaded. Go back to the AI screen to download it.
                </LabelSm>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === 'user'
                  ? [styles.bubbleUser, { backgroundColor: colors.primary }]
                  : [styles.bubbleAI, { backgroundColor: colors.surfaceContainerHigh }],
              ]}
            >
              <BodyMd
                color={item.role === 'user' ? colors.onPrimary : colors.onSurface}
                style={{ fontSize: 15, lineHeight: 22 }}
              >
                {item.text}{item.streaming ? '▍' : ''}
              </BodyMd>
            </View>
          )}
        />

        {isThinking && !llama.messages[llama.messages.length - 1]?.streaming && (
          <View style={styles.thinkingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <LabelSm color={colors.onSurfaceVariant}>Thinking…</LabelSm>
          </View>
        )}

        {/* ── Input row ── */}
        <View
          style={[
            styles.inputRow,
            {
              borderTopColor: colors.outlineVariant,
              backgroundColor: colors.surfaceContainerLowest,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              {
                color: colors.onSurface,
                backgroundColor: colors.surfaceContainerHigh,
                borderColor: colors.outlineVariant,
              },
            ]}
            placeholder={!isDownloaded ? 'Model not downloaded…' : 'Ask about your schedule…'}
            placeholderTextColor={`${colors.onSurfaceVariant}99`}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            multiline
            editable={isDownloaded && !isThinking}
          />
          <TouchableOpacity
            onPress={handleSend}
            style={[
              styles.sendBtn,
              { backgroundColor: colors.primary },
              (!isDownloaded || isThinking) && { opacity: 0.38 },
            ]}
            disabled={!isDownloaded || isThinking}
          >
            <MaterialCommunityIcons name="send" size={18} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  headerBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  // Download progress
  progressWrap: {
    height: 3,
    overflow: 'hidden',
  },
  progressFill: { height: 3 },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomWidth: 1,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
  },

  // Messages
  msgList: { flex: 1 },
  emptyChat: {
    alignItems: 'center',
    paddingTop: 60,
    opacity: 0.7,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  bubbleUser: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleAI:   { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 120,
    ...typography.bodyMd,
  },
  sendBtn: {
    padding: 10,
    borderRadius: radius.full,
    marginBottom: 2,
  },
});
