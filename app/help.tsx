import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HeadlineMd, BodyMd, LabelMd, LabelSm } from '@/components/ui/Typography';
import { useThemeColors } from '@/theme/ThemeContext';
import { spacing, radius } from '@/theme/tokens';

const FAQS = [
  {
    q: 'How do I add an event?',
    a: 'On the Schedule screen, tap the "Add event to schedule…" bar at the bottom. You can add multiple events at once by tapping "+ Add Another Event" before saving.',
  },
  {
    q: 'How do I drag and reorder events?',
    a: 'Long-press any event block on the timeline for about 400ms until it lifts, then drag it to your desired time slot. Release to snap it to the nearest 15-minute interval.',
  },
  {
    q: 'How do I apply a day template?',
    a: 'Go to the Hub screen and tap any template card. It will add all time blocks to today\'s schedule. You can also create your own templates with "Create Template".',
  },
  {
    q: 'How does the AI work?',
    a: 'freeflow uses SmolLM2, a small language model that runs 100% on your device. Tap "Download AI Model" in Settings or the AI screen to download it (~200MB, one-time). Once downloaded, no internet is needed.',
  },
  {
    q: 'Can I switch between 12-hour and 24-hour time?',
    a: 'Yes. Go to Settings → Time Format to toggle between 24H (military) and 12H (AM/PM) display. Your events are always stored internally in 24hr format.',
  },
  {
    q: 'How do I set a daily reminder?',
    a: 'In Settings, toggle on "Daily Reminder". The app will ask for notification permission and schedule an 8:00 AM reminder every day. Toggle it off to cancel.',
  },
  {
    q: 'Can I import my Google Calendar?',
    a: 'Yes. Export your Google Calendar as an .ics file (in Google Calendar settings → Export), then go to Hub → Import and select the file.',
  },
  {
    q: 'Is my data private?',
    a: 'Completely. freeflow stores everything locally on your device with no accounts, no cloud sync, and no analytics. See the Privacy Policy for full details.',
  },
  {
    q: 'How do I delete all imported events?',
    a: 'Go to Settings → Clear Imported Events. This removes all .ics imported events while keeping your manually created ones.',
  },
  {
    q: 'Why is the AI screen showing "No streak"?',
    a: 'Your streak counts consecutive days where you had at least one scheduled event. Add events to today and previous days to build a streak.',
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const colors = useThemeColors();
  return (
    <TouchableOpacity
      style={[styles.faqItem, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}
      onPress={() => setOpen((v) => !v)}
      activeOpacity={0.8}
    >
      <View style={styles.faqHeader}>
        <LabelMd color={colors.onSurface} style={styles.faqQ}>{q}</LabelMd>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.outline}
        />
      </View>
      {open && (
        <BodyMd color={colors.onSurfaceVariant} style={styles.faqA}>{a}</BodyMd>
      )}
    </TouchableOpacity>
  );
}

export default function HelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, borderBottomColor: colors.outlineVariant, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <LabelMd color={colors.onSurface}>Help Center</LabelMd>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <HeadlineMd style={styles.heading}>Frequently Asked Questions</HeadlineMd>
        <LabelSm color={colors.onSurfaceVariant} style={styles.subtitle}>Tap a question to expand the answer.</LabelSm>

        {FAQS.map((faq) => (
          <FAQItem key={faq.q} q={faq.q} a={faq.a} />
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
  subtitle: { marginBottom: spacing.lg },
  faqItem: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  faqQ: { flex: 1, fontWeight: '600' },
  faqA: { marginTop: spacing.sm },
});
