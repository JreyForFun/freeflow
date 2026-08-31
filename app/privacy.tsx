import React from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HeadlineMd, BodyMd, LabelMd } from '@/components/ui/Typography';
import { useThemeColors } from '@/theme/ThemeContext';
import { spacing, radius } from '@/theme/tokens';

export default function PrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, borderBottomColor: colors.outlineVariant, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <LabelMd color={colors.onSurface}>Privacy Policy</LabelMd>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <HeadlineMd style={styles.heading}>Privacy Policy</HeadlineMd>
        <BodyMd color={colors.onSurfaceVariant} style={styles.updated}>Last updated: August 2026</BodyMd>

        {[
          {
            title: 'No Data Collection',
            body: 'freeflow does not collect, transmit, or share any personal data. All your schedule data lives exclusively on your device in a local SQLite database.',
          },
          {
            title: 'No Internet Required',
            body: 'The app works fully offline. The only network activity is the optional one-time AI model download (~200 MB) from HuggingFace, which you must explicitly initiate.',
          },
          {
            title: 'Local Storage Only',
            body: 'All events, tasks, templates, and settings are stored in the app\'s private document directory on your device. This data is deleted when you uninstall the app.',
          },
          {
            title: 'AI Model',
            body: 'The AI model (SmolLM2) runs entirely on your device. No queries, schedule data, or responses are sent to any external server.',
          },
          {
            title: 'No Analytics',
            body: 'freeflow does not include any analytics, tracking, or crash reporting SDKs.',
          },
          {
            title: 'Notifications',
            body: 'If you enable daily reminders, notifications are scheduled locally on your device using Android\'s notification system. No server is involved.',
          },
          {
            title: 'Contact',
            body: 'Questions? Reach out at jreyforfun@gmail.com.',
          },
        ].map((section) => (
          <View key={section.title} style={[styles.section, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>
            <LabelMd color={colors.onSurface} style={styles.sectionTitle}>{section.title}</LabelMd>
            <BodyMd color={colors.onSurfaceVariant}>{section.body}</BodyMd>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.marginMobile,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: { padding: spacing.xs },
  content: { paddingHorizontal: spacing.marginMobile, paddingTop: spacing.lg },
  heading: { marginBottom: spacing.xs },
  updated: { marginBottom: spacing.lg, fontSize: 12 },
  section: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  sectionTitle: { fontWeight: '600', marginBottom: 4 },
});
