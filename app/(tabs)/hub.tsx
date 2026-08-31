import React, { useState, useCallback, useEffect } from 'react';
import {
  View, ScrollView, TouchableOpacity,
  StyleSheet, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { randomUUID } from 'expo-crypto';

import { createEvent, eventExists, type EventCategory } from '@/db/events';
import {
  getUserTemplates, createTemplate, deleteTemplate,
  type Template, type TemplateBlock,
} from '@/db/templates';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Dialog } from '@/components/ui/Dialog';
import { HeadlineMd, BodyMd, LabelMd, LabelSm } from '@/components/ui/Typography';
import { useThemeColors } from '@/theme/ThemeContext';
import { spacing, radius, typography } from '@/theme/tokens';

// ── Built-in template definitions ─────────────────────────────────────────────
const BUILTIN_TEMPLATES = [
  {
    id: 'deep-work',
    name: 'Deep Work Day',
    description: 'Expansive blocks for uninterrupted cognitive focus.',
    icon: 'head-cog-outline' as const,
    blocks: [
      { title: 'Morning Prep',       start: '08:00', end: '08:30', category: 'personal' },
      { title: 'Deep Work Block 1',  start: '09:00', end: '11:00', category: 'focus'    },
      { title: 'Break',              start: '11:00', end: '11:15', category: 'personal' },
      { title: 'Deep Work Block 2',  start: '11:15', end: '13:15', category: 'focus'    },
      { title: 'Lunch',              start: '13:15', end: '14:15', category: 'personal' },
      { title: 'Deep Work Block 3',  start: '14:15', end: '16:15', category: 'focus'    },
      { title: 'Review & Wind-down', start: '16:15', end: '16:45', category: 'focus'    },
    ],
  },
  {
    id: 'meeting-heavy',
    name: 'Meeting Heavy',
    description: 'Structured buffers between back-to-back commitments.',
    icon: 'account-group-outline' as const,
    blocks: [
      { title: 'Standup',   start: '09:00', end: '09:30', category: 'meeting'  },
      { title: 'Buffer',    start: '09:30', end: '09:45', category: 'personal' },
      { title: 'Meeting 1', start: '10:00', end: '11:00', category: 'meeting'  },
      { title: 'Buffer',    start: '11:00', end: '11:15', category: 'personal' },
      { title: 'Meeting 2', start: '11:15', end: '12:15', category: 'meeting'  },
      { title: 'Lunch',     start: '12:15', end: '13:15', category: 'personal' },
      { title: 'Meeting 3', start: '13:15', end: '14:15', category: 'meeting'  },
      { title: 'Buffer',    start: '14:15', end: '14:30', category: 'personal' },
    ],
  },
  {
    id: 'relaxed-weekend',
    name: 'Relaxed Weekend',
    description: 'Fluid structure prioritizing recovery and personal time.',
    icon: 'coffee-outline' as const,
    blocks: [
      { title: 'Morning Ease',     start: '09:00', end: '10:00', category: 'personal' },
      { title: 'Personal Project', start: '10:00', end: '12:00', category: 'focus'    },
      { title: 'Lunch & Walk',     start: '12:00', end: '13:00', category: 'personal' },
      { title: 'Rest / Read',      start: '13:00', end: '15:00', category: 'personal' },
      { title: 'Social / Errands', start: '15:00', end: '17:00', category: 'personal' },
      { title: 'Wind Down',        start: '17:00', end: '18:00', category: 'personal' },
    ],
  },
];

const CATEGORY_ICONS: Record<string, string> = {
  focus: 'head-cog-outline',
  meeting: 'account-group-outline',
  personal: 'heart-outline',
};

const CATEGORIES = ['focus', 'meeting', 'personal'] as const;

function todayISO() { return new Date().toISOString().slice(0, 10); }

// ── ICS parser ────────────────────────────────────────────────────────────────
function getICSField(block: string, key: string): string {
  const unfolded = block.replace(/\r?\n[ \t]/g, '');
  const match = unfolded.match(new RegExp(`(?:^|\n)${key}[^:\n]*:([^\n]*)`, 'i'));
  return match?.[1]?.trim() ?? '';
}
function parseICSDateTime(raw: string): { date: string; time: string } | null {
  const clean = raw.replace(/Z$/, '');
  const m = clean.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}
async function importICS(): Promise<number> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/calendar', 'application/ics', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return 0;
  const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
  const veventBlocks = content.split(/BEGIN:VEVENT/i).slice(1);
  let imported = 0;
  for (const block of veventBlocks) {
    const summary = getICSField(block, 'SUMMARY');
    const dtStart = parseICSDateTime(getICSField(block, 'DTSTART'));
    const dtEnd   = parseICSDateTime(getICSField(block, 'DTEND'));
    const desc    = getICSField(block, 'DESCRIPTION') || null;
    if (!summary || !dtStart) continue;
    if (eventExists(summary, dtStart.date, dtStart.time)) continue;
    createEvent({
      id: randomUUID(), title: summary, date: dtStart.date,
      start_time: dtStart.time, end_time: dtEnd?.time ?? null,
      description: desc, category: 'imported', completed: 0, source: 'imported',
    });
    imported++;
  }
  return imported;
}

// ── Template time block row ───────────────────────────────────────────────────
function BlockRow({
  block, index, total, onChange, onRemove,
}: {
  block: TemplateBlock;
  index: number;
  total: number;
  onChange: (i: number, field: keyof TemplateBlock, v: string) => void;
  onRemove: (i: number) => void;
}) {
  const colors = useThemeColors();
  const inp = [styles.blockInput, { color: colors.onSurface, backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }];
  return (
    <View style={[styles.blockRow, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}>
      <View style={styles.blockRowHeader}>
        <LabelSm color={colors.onSurfaceVariant}>Block {index + 1}</LabelSm>
        {total > 1 && (
          <TouchableOpacity onPress={() => onRemove(index)} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={14} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        )}
      </View>
      <TextInput style={inp} value={block.title} onChangeText={(v) => onChange(index, 'title', v)} placeholder="Block title" placeholderTextColor={`${colors.onSurfaceVariant}70`} />
      <View style={styles.blockTimeRow}>
        <TextInput style={[inp, { flex: 1 }]} value={block.start} onChangeText={(v) => onChange(index, 'start', v)} placeholder="HH:MM" keyboardType="numeric" maxLength={5} placeholderTextColor={`${colors.onSurfaceVariant}70`} />
        <MaterialCommunityIcons name="arrow-right" size={14} color={colors.outline} />
        <TextInput style={[inp, { flex: 1 }]} value={block.end} onChangeText={(v) => onChange(index, 'end', v)} placeholder="HH:MM" keyboardType="numeric" maxLength={5} placeholderTextColor={`${colors.onSurfaceVariant}70`} />
      </View>
      <View style={styles.catChips}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.catChip, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainer }, block.category === cat && { borderColor: colors.primary, backgroundColor: `${colors.primary}18` }]}
            onPress={() => onChange(index, 'category', cat)}
          >
            <LabelSm color={block.category === cat ? colors.primary : colors.onSurfaceVariant}>{cat}</LabelSm>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function HubScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const [importing, setImporting] = useState(false);
  const [makerVisible, setMakerVisible] = useState(false);
  const [userTemplates, setUserTemplates] = useState<Template[]>([]);
  const [toast, setToast] = useState('');
  const [applyDialog, setApplyDialog] = useState<{ name: string; blocks: TemplateBlock[] } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<Template | null>(null);

  // Template maker state
  const [tplName, setTplName] = useState('');
  const [tplBlocks, setTplBlocks] = useState<TemplateBlock[]>([{ title: '', start: '09:00', end: '10:00', category: 'personal' }]);

  const loadUserTemplates = useCallback(() => setUserTemplates(getUserTemplates()), []);

  useEffect(() => { loadUserTemplates(); }, [loadUserTemplates]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }, []);

  // ── Apply template ─────────────────────────────────────────────────────────
  const applyTemplate = useCallback((blocks: TemplateBlock[]) => {
    const today = todayISO();
    let added = 0;
    let skipped = 0;
    try {
      for (const b of blocks) {
        if (eventExists(b.title, today, b.start)) { skipped++; continue; }
        createEvent({
          id: randomUUID(), title: b.title, date: today,
          start_time: b.start, end_time: b.end || null,
          description: null, category: b.category as EventCategory,
          completed: 0, source: 'template',
        });
        added++;
      }
      showToast(skipped > 0
        ? `Added ${added} block${added !== 1 ? 's' : ''}, ${skipped} already existed`
        : `Added ${added} block${added !== 1 ? 's' : ''} to today ✓`
      );
    } catch (e) {
      showToast('Error applying template');
    }
    setApplyDialog(null);
  }, [showToast]);

  // ── Import ICS ─────────────────────────────────────────────────────────────
  const handleImport = async () => {
    try {
      setImporting(true);
      const count = await importICS();
      showToast(count > 0 ? `Imported ${count} event${count === 1 ? '' : 's'}` : 'No new events found');
    } catch {
      showToast('Import failed — ensure it is a valid .ics file');
    } finally {
      setImporting(false);
    }
  };

  // ── Template maker ─────────────────────────────────────────────────────────
  const resetMaker = () => {
    setTplName('');
    setTplBlocks([{ title: '', start: '09:00', end: '10:00', category: 'personal' }]);
  };

  const handleBlockChange = useCallback((i: number, field: keyof TemplateBlock, v: string) => {
    setTplBlocks((prev) => prev.map((b, idx) => idx === i ? { ...b, [field]: v } : b));
  }, []);

  const addBlock = () => setTplBlocks((prev) => [...prev, { title: '', start: '', end: '', category: 'personal' }]);
  const removeBlock = (i: number) => setTplBlocks((prev) => prev.filter((_, idx) => idx !== i));

  const saveTemplate = () => {
    if (!tplName.trim()) { showToast('Template needs a name'); return; }
    if (tplBlocks.some((b) => !b.title.trim())) { showToast('All blocks need a title'); return; }
    createTemplate(tplName.trim(), tplBlocks);
    loadUserTemplates();
    resetMaker();
    setMakerVisible(false);
    showToast(`Template "${tplName.trim()}" saved ✓`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader subtitle="Hub" />

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

        {/* ── Import ───────────────────────────────────────────────────────── */}
        <HeadlineMd style={styles.sectionTitle}>Import</HeadlineMd>
        <BodyMd color={colors.onSurfaceVariant} style={styles.sectionSub}>
          Connect external sources to your schedule.
        </BodyMd>
        <TouchableOpacity
          style={[styles.card, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest }]}
          onPress={handleImport}
          disabled={importing}
          activeOpacity={0.85}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }]}>
            <MaterialCommunityIcons name="calendar-import" size={22} color={colors.onSurfaceVariant} />
          </View>
          <View style={{ flex: 1 }}>
            <LabelMd color={colors.onSurface}>Google Calendar (.ics)</LabelMd>
            <LabelSm color={colors.onSurfaceVariant}>Export from Google → Import here</LabelSm>
          </View>
          <View style={[styles.pill, { backgroundColor: colors.primary }]}>
            <LabelSm color={colors.onPrimary}>{importing ? 'Importing…' : 'Import'}</LabelSm>
          </View>
        </TouchableOpacity>

        {/* ── Built-in Templates ────────────────────────────────────────────── */}
        <HeadlineMd style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Templates</HeadlineMd>
        <BodyMd color={colors.onSurfaceVariant} style={styles.sectionSub}>
          Architectural foundations for your days.
        </BodyMd>
        {BUILTIN_TEMPLATES.map((tpl) => (
          <TouchableOpacity
            key={tpl.id}
            style={[styles.card, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest }]}
            onPress={() => setApplyDialog({ name: tpl.name, blocks: tpl.blocks as TemplateBlock[] })}
            activeOpacity={0.85}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }]}>
              <MaterialCommunityIcons name={tpl.icon} size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <LabelMd color={colors.onSurface}>{tpl.name}</LabelMd>
              <LabelSm color={colors.onSurfaceVariant} numberOfLines={2}>{tpl.description}</LabelSm>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.outline} />
          </TouchableOpacity>
        ))}

        {/* ── User Templates ────────────────────────────────────────────────── */}
        {userTemplates.length > 0 && (
          <>
            <LabelSm color={colors.onSurfaceVariant} style={{ marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 1, textTransform: 'uppercase' }}>
              My Templates
            </LabelSm>
            {userTemplates.map((tpl) => (
              <View
                key={tpl.id}
                style={[styles.card, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest }]}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${colors.primaryContainer}40`, borderColor: colors.outlineVariant }]}>
                  <MaterialCommunityIcons name="bookmark-outline" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <LabelMd color={colors.onSurface}>{tpl.name}</LabelMd>
                  <LabelSm color={colors.onSurfaceVariant}>{tpl.blocks.length} blocks</LabelSm>
                </View>
                <TouchableOpacity
                  style={[styles.pill, { backgroundColor: colors.primary }]}
                  onPress={() => setApplyDialog({ name: tpl.name, blocks: tpl.blocks })}
                >
                  <LabelSm color={colors.onPrimary}>Apply</LabelSm>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pill, { backgroundColor: 'transparent', borderWidth: 1, borderColor: `${colors.error}55` }]}
                  onPress={() => setDeleteDialog(tpl)}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={14} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* ── Create Template ───────────────────────────────────────────────── */}
        <HeadlineMd style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Create Template</HeadlineMd>
        <BodyMd color={colors.onSurfaceVariant} style={styles.sectionSub}>
          Build a full-day schedule blueprint to reuse anytime.
        </BodyMd>
        <TouchableOpacity
          style={[styles.dashedCard, { borderColor: colors.outline, backgroundColor: colors.surfaceContainerLow }]}
          onPress={() => { resetMaker(); setMakerVisible(true); }}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="plus" size={28} color={colors.primary} />
          <LabelMd color={colors.primary}>New Template</LabelMd>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Template Maker Bottom Sheet ─────────────────────────────────────── */}
      <BottomSheet visible={makerVisible} onClose={() => setMakerVisible(false)}>
        <View style={styles.makerHeader}>
          <HeadlineMd>New Template</HeadlineMd>
          <TouchableOpacity onPress={() => setMakerVisible(false)} style={[styles.closeBtn, { backgroundColor: colors.surfaceContainerHigh }]}>
            <MaterialCommunityIcons name="close" size={18} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
          <TextInput
            style={[styles.nameInput, { color: colors.onSurface, backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }]}
            value={tplName}
            onChangeText={setTplName}
            placeholder="Template name (e.g. Productive Monday)"
            placeholderTextColor={`${colors.onSurfaceVariant}70`}
            autoFocus
          />

          {tplBlocks.map((block, i) => (
            <BlockRow key={i} block={block} index={i} total={tplBlocks.length} onChange={handleBlockChange} onRemove={removeBlock} />
          ))}

          <TouchableOpacity style={[styles.addBlockBtn, { borderColor: colors.outlineVariant }]} onPress={addBlock}>
            <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
            <LabelSm color={colors.primary}>Add Block</LabelSm>
          </TouchableOpacity>
        </ScrollView>

        <View style={[styles.makerFooter, { borderTopColor: colors.outlineVariant }]}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setMakerVisible(false)}>
            <LabelMd color={colors.onSurfaceVariant}>Cancel</LabelMd>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={saveTemplate}>
            <MaterialCommunityIcons name="bookmark-check" size={16} color={colors.onPrimary} />
            <LabelMd color={colors.onPrimary}>Save Template</LabelMd>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Apply confirmation */}
      <Dialog
        visible={!!applyDialog}
        title={`Apply "${applyDialog?.name}"?`}
        message={`Adds ${applyDialog?.blocks.length ?? 0} time blocks to today's schedule. Already-existing blocks are skipped.`}
        actions={[
          { label: 'Cancel', onPress: () => setApplyDialog(null) },
          { label: 'Apply', primary: true, onPress: () => applyDialog && applyTemplate(applyDialog.blocks) },
        ]}
        onDismiss={() => setApplyDialog(null)}
      />

      {/* Delete user template confirmation */}
      <Dialog
        visible={!!deleteDialog}
        title={`Delete "${deleteDialog?.name}"?`}
        message="This template will be permanently removed."
        actions={[
          { label: 'Cancel', onPress: () => setDeleteDialog(null) },
          { label: 'Delete', destructive: true, onPress: () => { if (deleteDialog) { deleteTemplate(deleteDialog.id); loadUserTemplates(); } setDeleteDialog(null); } },
        ]}
        onDismiss={() => setDeleteDialog(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: spacing.marginMobile, paddingTop: spacing.lg },
  sectionTitle: { marginBottom: 2 },
  sectionSub: { marginBottom: spacing.md, fontSize: 14 },

  toast: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  iconWrap: {
    width: 44, height: 44,
    borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  dashedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },

  // Maker sheet
  makerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: spacing.md },
  closeBtn: { padding: spacing.xs, borderRadius: radius.full },
  nameInput: {
    ...typography.bodyMd,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  blockRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  blockRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  blockInput: {
    ...typography.bodyMd,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 14,
  },
  blockTimeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  catChips: { flexDirection: 'row', gap: spacing.xs },
  catChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.default,
    borderWidth: 1,
  },
  addBlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: spacing.sm,
  },
  makerFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.default },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.default,
  },
});
