import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, TouchableOpacity,
  StyleSheet, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { HeadlineMd, BodyMd, LabelMd, LabelSm } from '@/components/ui/Typography';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Dialog } from '@/components/ui/Dialog';
import { colors as staticColors, spacing, radius } from '@/theme/tokens';
import { getDb } from '@/db/client';
import { useLlama } from '@/hooks/useLlama';
import { useTheme } from '@/theme/ThemeContext';
import { useThemeColors } from '@/theme/ThemeContext';
import type { ThemePref } from '@/theme/ThemeContext';
import {
  getTimeFormatPref, setTimeFormatPref, type TimeFormat,
} from '@/hooks/useTimeFormat';
import { useTimeFormatCtx } from '@/hooks/useTimeFormatContext';
import {
  scheduleAllNotifications, cancelAllNotifications,
  getNotificationEnabled, setNotificationEnabled,
  requestNotificationPermission,
} from '@/services/notificationService';
import { getEventsByDate } from '@/db/events';

// ── SettingsRow ────────────────────────────────────────────────────────────────
function SettingsRow({
  icon, label, right, onPress, tinted,
}: {
  icon: string;
  label: string;
  right?: React.ReactNode;
  onPress?: () => void;
  tinted?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <TouchableOpacity
      style={[
        styles.row,
        tinted && { backgroundColor: `${colors.secondaryContainer}30` },
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <MaterialCommunityIcons
        name={icon as any}
        size={20}
        color={tinted ? colors.primary : colors.outline}
        style={styles.rowIcon}
      />
      <LabelMd color={colors.onSurface} style={styles.rowLabel}>{label}</LabelMd>
      {right ?? (
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.outline} />
      )}
    </TouchableOpacity>
  );
}

function Divider() {
  const colors = useThemeColors();
  return <View style={[styles.divider, { backgroundColor: `${colors.outlineVariant}80` }]} />;
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { themePref, setThemePref } = useTheme();
  const llama = useLlama();

  const [timeFmt, setTimeFmtLocal] = useState<TimeFormat>('24h');
  const { setTimeFmt: setTimeFmtCtx } = useTimeFormatCtx();
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [removeDialog, setRemoveDialog] = useState(false);
  const [clearDialog, setClearDialog] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    setTimeFmtLocal(getTimeFormatPref());
    setNotifEnabled(getNotificationEnabled());
  }, []);

  // ── Theme ──
  const cycleTheme = () => {
    const next: Record<ThemePref, ThemePref> = { System: 'Light', Light: 'Dark', Dark: 'System' };
    setThemePref(next[themePref]);
  };

  // ── Time format ──
  const toggleTimeFmt = () => {
    const next: TimeFormat = timeFmt === '24h' ? '12h' : '24h';
    setTimeFmtLocal(next);
    setTimeFmtCtx(next); // updates context (saves to DB + notifies all consumers)
  };

  // ── Notifications ──
  const handleNotifToggle = async (value: boolean) => {
    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        setNotifEnabled(false);
        setNotificationEnabled(false);
        setToast('Notification permission denied. Enable it in Settings.');
        setTimeout(() => setToast(''), 3000);
        return;
      }
      setNotifEnabled(true);
      setNotificationEnabled(true);
      const today = new Date().toISOString().slice(0, 10);
      const todayEvents = getEventsByDate(today);
      await scheduleAllNotifications(todayEvents);
    } else {
      setNotifEnabled(false);
      setNotificationEnabled(false);
      await cancelAllNotifications();
    }
  };

  // ── AI model ──
  const handleModelDownload = () => {
    llama.startDownload();
  };

  const handleModelRemove = () => setRemoveDialog(true);

  // ── Clear imported events ──
  const handleClearImported = () => setClearDialog(true);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader subtitle="Settings" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Toast for notifications feedback */}
        {!!toast && (
          <View style={[styles.toast, { backgroundColor: colors.onSurface }]}>
            <LabelSm color={colors.surface}>{toast}</LabelSm>
          </View>
        )}

        <HeadlineMd style={styles.sectionTitle}>Preferences</HeadlineMd>

        {/* ── Preferences group ── */}
        <View style={[styles.group, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>

          {/* Notifications */}
          <SettingsRow
            icon="bell-outline"
            label="Daily Reminder"
            right={
              <Switch
                value={notifEnabled}
                onValueChange={handleNotifToggle}
                trackColor={{ false: colors.outlineVariant, true: colors.primary }}
                thumbColor={colors.onPrimary}
              />
            }
          />
          <Divider />

          {/* App Theme */}
          <SettingsRow
            icon="palette-outline"
            label="App Theme"
            right={
              <TouchableOpacity onPress={cycleTheme} style={styles.chipBtn}>
                <LabelSm color={colors.onSurfaceVariant}>{themePref}</LabelSm>
                <MaterialCommunityIcons name="chevron-down" size={16} color={colors.outline} />
              </TouchableOpacity>
            }
            onPress={cycleTheme}
          />
          <Divider />

          {/* Time Format */}
          <SettingsRow
            icon="clock-outline"
            label="Time Format"
            right={
              <TouchableOpacity onPress={toggleTimeFmt} style={styles.chipBtn}>
                <LabelSm color={colors.onSurfaceVariant}>{timeFmt === '24h' ? '24H' : '12H'}</LabelSm>
                <MaterialCommunityIcons name="chevron-down" size={16} color={colors.outline} />
              </TouchableOpacity>
            }
            onPress={toggleTimeFmt}
          />
          <Divider />

          {/* Privacy Policy — in-app */}
          <SettingsRow
            icon="shield-outline"
            label="Privacy Policy"
            onPress={() => router.push('/privacy' as any)}
          />
          <Divider />

          {/* Help Center — in-app */}
          <SettingsRow
            icon="help-circle-outline"
            label="Help Center"
            onPress={() => router.push('/help' as any)}
          />
          <Divider />

          <SettingsRow
            icon="coffee"
            label="Buy me a coffee ☕"
            onPress={() => {}}
            tinted
          />
        </View>

        {/* ── AI Model group ── */}
        <HeadlineMd style={[styles.sectionTitle, { marginTop: spacing.xl }]}>AI Model</HeadlineMd>
        <View style={[styles.group, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>
          <View style={styles.row}>
            <MaterialCommunityIcons name="brain" size={20} color={colors.outline} style={styles.rowIcon} />
            <View style={{ flex: 1 }}>
              <LabelMd color={colors.onSurface}>SmolLM2 360M</LabelMd>
              <LabelSm color={colors.onSurfaceVariant}>Q4_K_M · ~200 MB · On-device</LabelSm>
            </View>

            {llama.isDownloading ? (
              <LabelSm color={colors.primary}>{llama.downloadProgress}%</LabelSm>
            ) : llama.isDownloaded ? (
              <TouchableOpacity onPress={handleModelRemove} style={[styles.chipBtn, { borderWidth: 1, borderColor: `${colors.error}55`, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full }]}>
                <LabelSm color={colors.error}>Remove</LabelSm>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleModelDownload} style={[styles.downloadBtn, { backgroundColor: colors.primary }]}>
                <MaterialCommunityIcons name="download" size={14} color={colors.onPrimary} />
                <LabelSm color={colors.onPrimary}>Download</LabelSm>
              </TouchableOpacity>
            )}
          </View>

          {llama.isDownloading && (
            <View style={[styles.progressWrap, { backgroundColor: `${colors.primaryContainer}55` }]}>
              <View style={[styles.progressFill, { width: `${llama.downloadProgress}%` as any, backgroundColor: colors.primary }]} />
            </View>
          )}

          {llama.downloadError ? (
            <View style={[styles.row, { paddingTop: 0 }]}>
              <LabelSm color={colors.error} style={{ flex: 1, paddingLeft: spacing.md }}>
                ⚠ {llama.downloadError}
              </LabelSm>
              <TouchableOpacity onPress={llama.startDownload} style={{ marginRight: spacing.md }}>
                <LabelSm color={colors.primary}>Retry</LabelSm>
              </TouchableOpacity>
            </View>
          ) : null}

          <Divider />
          <SettingsRow
            icon="calendar-remove-outline"
            label="Clear Imported Events"
            onPress={handleClearImported}
            right={<MaterialCommunityIcons name="chevron-right" size={20} color={colors.error} />}
          />
        </View>

        {/* Version */}
        <View style={styles.versionRow}>
          <LabelSm color={colors.outline}>freeflow v1.0.0</LabelSm>
          <LabelSm color={colors.outline}>·</LabelSm>
          <LabelSm color={colors.outline}>InnovaREV - Ging</LabelSm>
        </View>
      </ScrollView>

      {/* Remove model dialog */}
      <Dialog
        visible={removeDialog}
        title="Remove AI Model?"
        message="This deletes the SmolLM2 model (~200 MB freed). You can re-download anytime."
        actions={[
          { label: 'Cancel', onPress: () => setRemoveDialog(false) },
          {
            label: 'Remove', destructive: true, onPress: () => {
              llama.deleteModel();
              setRemoveDialog(false);
            }
          },
        ]}
        onDismiss={() => setRemoveDialog(false)}
      />

      {/* Clear imported dialog */}
      <Dialog
        visible={clearDialog}
        title="Clear Imported Events?"
        message="Deletes all .ics imported events. Manually created events are kept."
        actions={[
          { label: 'Cancel', onPress: () => setClearDialog(false) },
          {
            label: 'Clear', destructive: true, onPress: () => {
              getDb().runSync("DELETE FROM events WHERE source = 'imported'");
              setClearDialog(false);
            }
          },
        ]}
        onDismiss={() => setClearDialog(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: spacing.marginMobile, paddingTop: spacing.lg },
  sectionTitle: { marginBottom: spacing.sm },
  toast: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  group: {
    borderWidth: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowIcon: { marginRight: spacing.md },
  rowLabel: { flex: 1 },
  divider: { height: 1, marginLeft: spacing.md + 20 + spacing.md },
  chipBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  progressWrap: {
    height: 3,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: 3, borderRadius: 2 },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
});
