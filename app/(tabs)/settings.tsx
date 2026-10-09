import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ScrollView, TouchableOpacity,
  StyleSheet, Switch, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { HeadlineMd, LabelMd, LabelSm } from '@/components/ui/Typography';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Dialog } from '@/components/ui/Dialog';
import { spacing, radius } from '@/theme/tokens';
import { getDb } from '@/db/client';
import { useLlama } from '@/hooks/useLlama';
import type { ModelDef, ModelState } from '@/hooks/useLlama';
import { getModelSizeOnDisk } from '@/services/llamaService';
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

// ── ModelSettingsCard ──────────────────────────────────────────────────────────
// Inline card for a single model inside the Settings AI Models group.
function ModelSettingsCard({
  def,
  state,
  sizeOnDisk,
  onDownload,
  onCancel,
  onDelete,
}: {
  def: ModelDef;
  state: ModelState;
  sizeOnDisk: number;  // bytes; 0 if not downloaded
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const colors = useThemeColors();

  const sizeLabel = sizeOnDisk > 0
    ? `${(sizeOnDisk / 1_000_000).toFixed(1)} MB on disk`
    : def.sizeLabel;

  return (
    <View style={[modelCardStyles.card, { borderColor: `${colors.outlineVariant}60` }]}>

      {/* Title row */}
      <View style={modelCardStyles.titleRow}>
        <MaterialCommunityIcons name="robot-outline" size={18} color={colors.primary} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={modelCardStyles.nameRow}>
            <LabelMd color={colors.onSurface}>{def.name}</LabelMd>
            <View style={[modelCardStyles.tag, { backgroundColor: `${colors.primary}18` }]}>
              <LabelSm style={{ fontSize: 10, color: colors.primary }}>{def.tag}</LabelSm>
            </View>
          </View>
          <LabelSm style={{ color: colors.onSurfaceVariant, marginTop: 1 }}>
            {def.description}
          </LabelSm>
        </View>
      </View>

      {/* Status + size */}
      <View style={modelCardStyles.statusRow}>
        {state.isDownloaded ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <MaterialCommunityIcons name="check-circle-outline" size={13} color={colors.primary} />
            <LabelSm style={{ fontSize: 11, color: colors.primary }}>Downloaded</LabelSm>
            <LabelSm style={{ fontSize: 11, color: colors.onSurfaceVariant }}>
              · {sizeLabel}
            </LabelSm>
          </View>
        ) : state.isDownloading ? null : (
          <LabelSm style={{ fontSize: 11, color: colors.onSurfaceVariant }}>
            Not downloaded · {def.sizeLabel}
          </LabelSm>
        )}
      </View>

      {/* Progress bar (downloading) */}
      {state.isDownloading && (
        <View style={{ marginTop: 8 }}>
          <View style={[modelCardStyles.progressTrack, { backgroundColor: `${colors.outlineVariant}40` }]}>
            <View
              style={[
                modelCardStyles.progressFill,
                { width: `${state.downloadProgress}%` as any, backgroundColor: colors.primary },
              ]}
            />
          </View>
          <View style={modelCardStyles.progressRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <ActivityIndicator size={11} color={colors.primary} />
              <LabelSm style={{ fontSize: 11, color: colors.primary }}>
                Downloading {state.downloadProgress}%
              </LabelSm>
            </View>
            <TouchableOpacity onPress={onCancel}>
              <LabelSm style={{ fontSize: 11, color: colors.error }}>Cancel</LabelSm>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Download error */}
      {state.downloadError && (
        <LabelSm style={{ fontSize: 11, color: colors.error, marginTop: 6 }}>
          ⚠ {state.downloadError}
        </LabelSm>
      )}

      {/* Action buttons */}
      <View style={modelCardStyles.actionRow}>
        {/* Download button (not downloaded, not in progress) */}
        {!state.isDownloaded && !state.isDownloading && (
          <TouchableOpacity
            id={`download-${def.id}`}
            style={[modelCardStyles.btn, { backgroundColor: colors.primary }]}
            onPress={onDownload}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="download-outline" size={13} color={colors.onPrimary} />
            <LabelSm style={{ color: colors.onPrimary, marginLeft: 4, fontWeight: '600' }}>
              Download {def.sizeLabel}
            </LabelSm>
          </TouchableOpacity>
        )}

        {/* Retry (error state) */}
        {state.downloadError && !state.isDownloading && (
          <TouchableOpacity
            id={`retry-${def.id}`}
            style={[modelCardStyles.btn, { backgroundColor: `${colors.primary}20`, borderWidth: 1, borderColor: `${colors.primary}40` }]}
            onPress={onDownload}
            activeOpacity={0.8}
          >
            <LabelSm style={{ color: colors.primary }}>Retry</LabelSm>
          </TouchableOpacity>
        )}

        {/* Delete button (downloaded) */}
        {state.isDownloaded && (
          <TouchableOpacity
            id={`delete-${def.id}`}
            style={[modelCardStyles.btn, { backgroundColor: `${colors.errorContainer}55`, borderWidth: 1, borderColor: `${colors.error}40` }]}
            onPress={onDelete}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="delete-outline" size={13} color={colors.error} />
            <LabelSm style={{ color: colors.error, marginLeft: 4 }}>Delete</LabelSm>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const modelCardStyles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  statusRow: {
    marginTop: 6,
    marginLeft: 28,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 10,
    marginLeft: 28,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
});

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
  const [clearDialog, setClearDialog] = useState(false);
  const [toast, setToast] = useState('');

  // Per-model delete: which model ID is pending confirmation (null = none)
  const [deleteDialogModelId, setDeleteDialogModelId] = useState<string | null>(null);

  // On-disk sizes fetched asynchronously for display
  const [modelSizes, setModelSizes] = useState<Record<string, number>>({});

  useEffect(() => {
    setTimeFmtLocal(getTimeFormatPref());
    setNotifEnabled(getNotificationEnabled());
  }, []);

  // Fetch on-disk sizes whenever download state changes
  useEffect(() => {
    (async () => {
      const sizes: Record<string, number> = {};
      for (const m of llama.models) {
        if (llama.modelStates[m.id]?.isDownloaded) {
          sizes[m.id] = await getModelSizeOnDisk(m.id);
        } else {
          sizes[m.id] = 0;
        }
      }
      setModelSizes(sizes);
    })();
  }, [llama.modelStates, llama.models]);

  // ── Theme ──
  const cycleTheme = () => {
    const next: Record<ThemePref, ThemePref> = { System: 'Light', Light: 'Dark', Dark: 'System' };
    setThemePref(next[themePref]);
  };

  // ── Time format ──
  const toggleTimeFmt = () => {
    const next: TimeFormat = timeFmt === '24h' ? '12h' : '24h';
    setTimeFmtLocal(next);
    setTimeFmtCtx(next);
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

  // ── Model delete (confirmed) ──
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteDialogModelId) return;
    const modelId = deleteDialogModelId;
    setDeleteDialogModelId(null);
    await llama.deleteModel(modelId);
    // Clear cached size
    setModelSizes((prev) => ({ ...prev, [modelId]: 0 }));
  }, [deleteDialogModelId, llama]);

  // Derive dialog model def for the confirmation message
  const deleteTargetDef = llama.models.find((m) => m.id === deleteDialogModelId);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader subtitle="Settings" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Toast */}
        {!!toast && (
          <View style={[styles.toast, { backgroundColor: colors.onSurface }]}>
            <LabelSm color={colors.surface}>{toast}</LabelSm>
          </View>
        )}

        {/* ── Preferences group ── */}
        <HeadlineMd style={styles.sectionTitle}>Preferences</HeadlineMd>
        <View style={[styles.group, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>

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

          <SettingsRow
            icon="shield-outline"
            label="Privacy Policy"
            onPress={() => router.push('/privacy' as any)}
          />
          <Divider />

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

        {/* ── AI Models group ── */}
        <HeadlineMd style={[styles.sectionTitle, { marginTop: spacing.xl }]}>AI Models</HeadlineMd>
        <LabelSm style={[styles.sectionSub, { color: colors.onSurfaceVariant }]}>
          One model loaded at a time. Both run fully offline on your device.
        </LabelSm>

        <View style={[styles.group, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>
          {llama.models.map((def, idx) => (
            <React.Fragment key={def.id}>
              <ModelSettingsCard
                def={def}
                state={llama.modelStates[def.id] ?? {
                  isDownloaded: false, isDownloading: false,
                  downloadProgress: 0, downloadError: null,
                }}
                sizeOnDisk={modelSizes[def.id] ?? 0}
                onDownload={() => llama.startDownload(def.id)}
                onCancel={() => llama.cancelDownload(def.id)}
                onDelete={() => setDeleteDialogModelId(def.id)}
              />
              {idx < llama.models.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </View>

        {/* ── Data group ── */}
        <HeadlineMd style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Data</HeadlineMd>
        <View style={[styles.group, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>
          <SettingsRow
            icon="calendar-remove-outline"
            label="Clear Imported Events"
            onPress={() => setClearDialog(true)}
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

      {/* ── Delete model confirmation ── */}
      <Dialog
        visible={deleteDialogModelId !== null}
        title={`Delete ${deleteTargetDef?.name ?? 'Model'}?`}
        message={
          deleteTargetDef
            ? `This removes the ${deleteTargetDef.name} model (${deleteTargetDef.sizeLabel} freed). You can re-download it anytime.`
            : ''
        }
        actions={[
          { label: 'Cancel', onPress: () => setDeleteDialogModelId(null) },
          { label: 'Delete', destructive: true, onPress: handleConfirmDelete },
        ]}
        onDismiss={() => setDeleteDialogModelId(null)}
      />

      {/* ── Clear imported events confirmation ── */}
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
            },
          },
        ]}
        onDismiss={() => setClearDialog(false)}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: spacing.marginMobile, paddingTop: spacing.lg },
  sectionTitle: { marginBottom: spacing.xs },
  sectionSub: { marginBottom: spacing.sm, fontSize: 12 },
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
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
});
