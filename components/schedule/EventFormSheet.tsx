/**
 * EventFormSheet — create or edit schedule events.
 *
 * Modes:
 *   - Create (editingEvent undefined): shows a list of event rows.
 *     User can add multiple events at once with "+ Add Another".
 *   - Edit (editingEvent defined): shows a single event form.
 *
 * Uses the custom BottomSheet (not native Modal) for consistent look.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity,
  TextInput, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';

import { createEvent, updateEvent, type Event, type EventCategory } from '@/db/events';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { HeadlineMd, LabelMd, LabelSm } from '@/components/ui/Typography';
import { useThemeColors } from '@/theme/ThemeContext';
import { spacing, radius, typography } from '@/theme/tokens';
import { getTimeFormatPref, type TimeFormat } from '@/hooks/useTimeFormat';

// ── Types ─────────────────────────────────────────────────────────────────────
interface EventRow {
  key: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  category: EventCategory;
  description: string;
}

export interface EventFormSheetProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingEvent?: Event;
  prefillDate?: string;
  prefillTime?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const CATEGORIES: { value: EventCategory; label: string; icon: string }[] = [
  { value: 'focus',    label: 'Focus',    icon: 'head-cog-outline' },
  { value: 'meeting',  label: 'Meeting',  icon: 'account-group-outline' },
  { value: 'personal', label: 'Personal', icon: 'heart-outline' },
];

function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function isValidTime(t: string): boolean {
  const m = t.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  return +m[1] < 24 && +m[2] < 60;
}

// Convert 12hr display input + period back to 24hr HH:MM string
function to24hr(hhmm: string, period: 'AM' | 'PM'): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hhmm;
  let h = parseInt(m[1], 10);
  if (period === 'AM' && h === 12) h = 0;
  if (period === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

// Convert 24hr HH:MM to display HH:MM for 12hr mode (strips leading zero on hour)
function to12hrDisplay(hhmm: string): string {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return hhmm;
  const h = parseInt(m[1], 10);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]}`;
}

function getPeriod(hhmm: string): 'AM' | 'PM' {
  const m = hhmm.match(/^(\d{2})/);
  if (!m) return 'AM';
  return parseInt(m[1], 10) < 12 ? 'AM' : 'PM';
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeBlankRow(prefillDate?: string, prefillTime?: string): EventRow {
  return {
    key: randomUUID(),
    title: '',
    date: prefillDate ?? todayISO(),
    startTime: prefillTime ?? '09:00',
    endTime: '',
    category: 'personal',
    description: '',
  };
}

// ── AM/PM chip ────────────────────────────────────────────────────────────────
function AmPmChip({
  value,
  colors,
  onToggle,
}: {
  value: 'AM' | 'PM';
  colors: ReturnType<typeof useThemeColors>;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={[
        styles.amPmChip,
        { backgroundColor: `${colors.primary}18`, borderColor: colors.primary },
      ]}
    >
      <LabelSm color={colors.primary}>{value}</LabelSm>
    </TouchableOpacity>
  );
}

// ── Single event row editor ───────────────────────────────────────────────────
function EventRowEditor({
  row,
  index,
  total,
  timeFmt,
  onChange,
  onRemove,
}: {
  row: EventRow;
  index: number;
  total: number;
  timeFmt: TimeFormat;
  onChange: (key: string, field: keyof EventRow, value: string) => void;
  onRemove: (key: string) => void;
}) {
  const colors = useThemeColors();
  const inputStyle = [styles.input, { color: colors.onSurface, backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }];
  const labelStyle = [styles.label, { color: colors.onSurfaceVariant }];
  const is12 = timeFmt === '12h';

  const togglePeriod = (field: 'startTime' | 'endTime') => {
    const raw = field === 'startTime' ? row.startTime : row.endTime;
    if (!raw) return;
    const current = getPeriod(raw);
    const next: 'AM' | 'PM' = current === 'AM' ? 'PM' : 'AM';
    onChange(row.key, field, to24hr(is12 ? to12hrDisplay(raw) : raw, next));
  };

  return (
    <View style={[styles.rowCard, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}>
      {/* Row header */}
      <View style={styles.rowHeader}>
        <LabelSm style={[labelStyle, { fontWeight: '600' }]}>Event {index + 1}</LabelSm>
        {total > 1 && (
          <TouchableOpacity onPress={() => onRemove(row.key)} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={16} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        )}
      </View>

      {/* Title */}
      <TextInput
        style={inputStyle}
        value={row.title}
        onChangeText={(v) => onChange(row.key, 'title', v)}
        placeholder="Event title *"
        placeholderTextColor={`${colors.onSurfaceVariant}70`}
        autoFocus={index === 0}
        returnKeyType="next"
      />

      {/* Date */}
      <TextInput
        style={[inputStyle, styles.inputSm]}
        value={row.date}
        onChangeText={(v) => onChange(row.key, 'date', v)}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={`${colors.onSurfaceVariant}70`}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />

      {/* Time row — shows AM/PM chip in 12hr mode */}
      <View style={styles.timeRow}>
        <TextInput
          style={[inputStyle, { flex: 1 }]}
          value={is12 && row.startTime ? to12hrDisplay(row.startTime) : row.startTime}
          onChangeText={(v) => {
            const raw24 = is12 ? to24hr(formatTimeInput(v), getPeriod(row.startTime || '09:00')) : formatTimeInput(v);
            onChange(row.key, 'startTime', raw24);
          }}
          placeholder={is12 ? 'Start H:MM' : 'Start HH:MM'}
          placeholderTextColor={`${colors.onSurfaceVariant}70`}
          keyboardType="numeric"
          maxLength={5}
        />
        {is12 && (
          <AmPmChip
            value={getPeriod(row.startTime || '09:00')}
            colors={colors}
            onToggle={() => togglePeriod('startTime')}
          />
        )}
        <MaterialCommunityIcons name="arrow-right" size={14} color={colors.outline} />
        <TextInput
          style={[inputStyle, { flex: 1 }]}
          value={is12 && row.endTime ? to12hrDisplay(row.endTime) : row.endTime}
          onChangeText={(v) => {
            const raw24 = is12 ? to24hr(formatTimeInput(v), getPeriod(row.endTime || '10:00')) : formatTimeInput(v);
            onChange(row.key, 'endTime', raw24);
          }}
          placeholder={is12 ? 'End H:MM' : 'End HH:MM'}
          placeholderTextColor={`${colors.onSurfaceVariant}70`}
          keyboardType="numeric"
          maxLength={5}
        />
        {is12 && row.endTime ? (
          <AmPmChip
            value={getPeriod(row.endTime)}
            colors={colors}
            onToggle={() => togglePeriod('endTime')}
          />
        ) : null}
      </View>

      {/* Category chips */}
      <View style={styles.catRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.value}
            style={[
              styles.catChip,
              { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant },
              row.category === cat.value && { borderColor: colors.primary, backgroundColor: `${colors.primary}18` },
            ]}
            onPress={() => onChange(row.key, 'category', cat.value)}
          >
            <MaterialCommunityIcons
              name={cat.icon as any}
              size={13}
              color={row.category === cat.value ? colors.primary : colors.onSurfaceVariant}
            />
            <LabelSm color={row.category === cat.value ? colors.primary : colors.onSurfaceVariant}>
              {cat.label}
            </LabelSm>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function EventFormSheet({
  visible,
  onClose,
  onSaved,
  editingEvent,
  prefillDate,
  prefillTime,
}: EventFormSheetProps) {
  const colors = useThemeColors();
  const isEditing = Boolean(editingEvent);
  const [timeFmt, setTimeFmt] = useState<TimeFormat>('24h');

  // Read format pref whenever the sheet opens
  useEffect(() => {
    if (visible) setTimeFmt(getTimeFormatPref());
  }, [visible]);

  // ── Multi-row state (create mode) ──────────────────────────────────────────
  const [rows, setRows] = useState<EventRow[]>([makeBlankRow(prefillDate, prefillTime)]);
  const [errors, setErrors] = useState<string[]>([]);

  // ── Single-row state (edit mode) ──────────────────────────────────────────
  const [editTitle, setEditTitle] = useState(editingEvent?.title ?? '');
  const [editDate, setEditDate] = useState(editingEvent?.date ?? prefillDate ?? todayISO());
  const [editStartTime, setEditStartTime] = useState(editingEvent?.start_time ?? prefillTime ?? '09:00');
  const [editEndTime, setEditEndTime] = useState(editingEvent?.end_time ?? '');
  const [editCategory, setEditCategory] = useState<EventCategory>(editingEvent?.category ?? 'personal');
  const [editDescription, setEditDescription] = useState(editingEvent?.description ?? '');

  // Reset when opened for new event
  useEffect(() => {
    if (visible && !isEditing) {
      setRows([makeBlankRow(prefillDate, prefillTime)]);
      setErrors([]);
    }
    if (visible && isEditing && editingEvent) {
      setEditTitle(editingEvent.title);
      setEditDate(editingEvent.date);
      setEditStartTime(editingEvent.start_time);
      setEditEndTime(editingEvent.end_time ?? '');
      setEditCategory(editingEvent.category);
      setEditDescription(editingEvent.description ?? '');
    }
  }, [visible, isEditing, editingEvent, prefillDate, prefillTime]);

  // ── Row operations ─────────────────────────────────────────────────────────
  const handleRowChange = useCallback(
    (key: string, field: keyof EventRow, value: string) => {
      setRows((prev) =>
        prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
      );
    },
    [],
  );

  const addRow = useCallback(() => {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, makeBlankRow(last?.date, undefined)];
    });
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (isEditing && editingEvent) {
      // Single edit
      if (!editTitle.trim()) return;
      if (!isValidTime(editStartTime)) return;
      updateEvent(editingEvent.id, {
        title: editTitle.trim(),
        date: editDate,
        start_time: editStartTime,
        end_time: editEndTime || null,
        description: editDescription.trim() || null,
        category: editCategory,
      });
      onSaved();
      onClose();
      return;
    }

    // Multi-add: validate all rows
    const errs = rows.map((r) => {
      if (!r.title.trim()) return 'Title required';
      if (!r.date.match(/^\d{4}-\d{2}-\d{2}$/)) return 'Date: YYYY-MM-DD';
      if (!isValidTime(r.startTime)) return 'Start time: HH:MM';
      if (r.endTime && !isValidTime(r.endTime)) return 'End time: HH:MM';
      return '';
    });
    setErrors(errs);
    if (errs.some(Boolean)) return;

    // All valid — save all
    for (const r of rows) {
      createEvent({
        id: randomUUID(),
        title: r.title.trim(),
        date: r.date,
        start_time: r.startTime,
        end_time: r.endTime || null,
        description: r.description.trim() || null,
        category: r.category,
        completed: 0,
        source: 'manual',
      });
    }

    onSaved();
    onClose();
  }, [
    isEditing, editingEvent, editTitle, editDate, editStartTime,
    editEndTime, editCategory, editDescription, rows, onSaved, onClose,
  ]);

  // ── Edit mode render ───────────────────────────────────────────────────────
  const inputStyle = [styles.input, { color: colors.onSurface, backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }];

  const editContent = (
    <>
      <TextInput style={inputStyle} value={editTitle} onChangeText={setEditTitle} placeholder="Title *" placeholderTextColor={`${colors.onSurfaceVariant}70`} autoFocus />
      <TextInput style={[inputStyle, styles.inputSm]} value={editDate} onChangeText={setEditDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} placeholderTextColor={`${colors.onSurfaceVariant}70`} />
      <View style={styles.timeRow}>
        <TextInput style={[inputStyle, { flex: 1 }]} value={editStartTime} onChangeText={(v) => setEditStartTime(formatTimeInput(v))} placeholder="Start HH:MM" keyboardType="numeric" maxLength={5} placeholderTextColor={`${colors.onSurfaceVariant}70`} />
        <MaterialCommunityIcons name="arrow-right" size={14} color={colors.outline} style={{ marginTop: 2 }} />
        <TextInput style={[inputStyle, { flex: 1 }]} value={editEndTime} onChangeText={(v) => setEditEndTime(formatTimeInput(v))} placeholder="End HH:MM" keyboardType="numeric" maxLength={5} placeholderTextColor={`${colors.onSurfaceVariant}70`} />
      </View>
      <View style={styles.catRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity key={cat.value} style={[styles.catChip, { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }, editCategory === cat.value && { borderColor: colors.primary, backgroundColor: `${colors.primary}18` }]} onPress={() => setEditCategory(cat.value)}>
            <MaterialCommunityIcons name={cat.icon as any} size={13} color={editCategory === cat.value ? colors.primary : colors.onSurfaceVariant} />
            <LabelSm color={editCategory === cat.value ? colors.primary : colors.onSurfaceVariant}>{cat.label}</LabelSm>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput style={[inputStyle, { minHeight: 72, paddingTop: spacing.sm, textAlignVertical: 'top' }]} value={editDescription} onChangeText={setEditDescription} placeholder="Notes (optional)" multiline placeholderTextColor={`${colors.onSurfaceVariant}70`} />
    </>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Sheet header */}
      <View style={styles.sheetHeader}>
        <HeadlineMd>{isEditing ? 'Edit Event' : 'Add Events'}</HeadlineMd>
        <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surfaceContainerHigh }]}>
          <MaterialCommunityIcons name="close" size={18} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
        {isEditing ? (
          <View style={styles.editPad}>{editContent}</View>
        ) : (
          <>
            {rows.map((row, i) => (
              <View key={row.key}>
                <EventRowEditor
                  row={row}
                  index={i}
                  total={rows.length}
                  timeFmt={timeFmt}
                  onChange={handleRowChange}
                  onRemove={removeRow}
                />
                {errors[i] ? (
                  <LabelSm style={{ color: colors.error, marginBottom: spacing.xs, paddingHorizontal: spacing.xs }}>
                    ⚠ {errors[i]}
                  </LabelSm>
                ) : null}
              </View>
            ))}

            {/* Add another row button */}
            <TouchableOpacity
              style={[styles.addRowBtn, { borderColor: colors.outlineVariant }]}
              onPress={addRow}
            >
              <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
              <LabelMd color={colors.primary}>Add Another Event</LabelMd>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: colors.outlineVariant }]}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <LabelMd color={colors.onSurfaceVariant}>Cancel</LabelMd>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          onPress={handleSave}
        >
          <MaterialCommunityIcons name={isEditing ? 'check' : 'plus'} size={16} color={colors.onPrimary} />
          <LabelMd color={colors.onPrimary}>
            {isEditing ? 'Save Changes' : `Add Event${rows.length > 1 ? 's' : ''}`}
          </LabelMd>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.md,
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  editPad: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.md,
  },
  rowCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  input: {
    ...typography.bodyMd,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputSm: {
    paddingVertical: 6,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  catRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  catChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: radius.default,
    borderWidth: 1,
  },
  amPmChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.default,
    borderWidth: 1,
  },
  label: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  addRowBtn: {
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.default,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.default,
  },
});
