import React, { useCallback, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Event } from '@/db/events';
import { deleteEvent } from '@/db/events';
import type { Task } from '@/db/tasks';
import { toggleTask, createTask } from '@/db/tasks';
import { HeadlineMd, LabelSm, LabelMd, BodyMd } from '@/components/ui/Typography';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Dialog } from '@/components/ui/Dialog';
import { useThemeColors } from '@/theme/ThemeContext';
import { colors, spacing, radius, typography } from '@/theme/tokens';
import { randomUUID } from 'expo-crypto';
import { getTimeFormatPref, formatTime } from '@/hooks/useTimeFormat';

interface EventModalProps {
  event: Event | null;
  tasks: Task[];
  visible: boolean;
  onClose: () => void;
  onTasksChanged: () => void;
  onEdit: (event: Event) => void;
  onDelete: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  focus:    colors.secondaryContainer,
  meeting:  colors.tertiaryFixed,
  personal: colors.primaryFixed,
  imported: colors.surfaceContainerHigh,
};

export function EventModal({ event, tasks, visible, onClose, onTasksChanged, onEdit, onDelete }: EventModalProps) {
  const themeColors = useThemeColors();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [deleteDialog, setDeleteDialog] = useState(false);

  const handleToggleTask = useCallback((task: Task) => {
    toggleTask(task.id, task.completed === 0);
    onTasksChanged();
  }, [onTasksChanged]);

  const handleAddTask = useCallback(() => {
    if (!event || !newTaskTitle.trim()) return;
    createTask({ id: randomUUID(), event_id: event.id, title: newTaskTitle.trim(), completed: 0 });
    setNewTaskTitle('');
    onTasksChanged();
  }, [event, newTaskTitle, onTasksChanged]);

  const handleEdit = useCallback(() => {
    if (!event) return;
    onClose();
    setTimeout(() => onEdit(event), 280);
  }, [event, onClose, onEdit]);

  const handleConfirmDelete = useCallback(() => {
    if (!event) return;
    deleteEvent(event.id);
    setDeleteDialog(false);
    onClose();
    setTimeout(onDelete, 280);
  }, [event, onClose, onDelete]);

  if (!event) return null;

  const fmt = getTimeFormatPref();
  const timeLabel = formatTime(event.start_time, fmt) +
    (event.end_time ? ` – ${formatTime(event.end_time, fmt)}` : '');
  const categoryColor = CATEGORY_COLORS[event.category] ?? colors.surfaceContainerHigh;

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.metaRow}>
              <LabelSm color={themeColors.primary}>{timeLabel}</LabelSm>
              <View style={styles.dot} />
              <View style={[styles.categoryChip, { backgroundColor: categoryColor }]}>
                <LabelSm color={themeColors.onSurfaceVariant} style={styles.categoryText}>
                  {event.category}
                </LabelSm>
              </View>
            </View>
            <HeadlineMd color={themeColors.onSurface}>{event.title}</HeadlineMd>
          </View>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: themeColors.surfaceContainerHigh }]}>
            <MaterialCommunityIcons name="close" size={20} color={themeColors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>

        {/* Tasks */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.taskList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {tasks.map((task) => (
              <TouchableOpacity
                key={task.id}
                style={styles.taskRow}
                onPress={() => handleToggleTask(task)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={task.completed ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={20}
                  color={task.completed ? themeColors.primary : themeColors.outline}
                />
                <BodyMd
                  color={task.completed ? themeColors.onSurfaceVariant : themeColors.onSurface}
                  style={task.completed ? { flex: 1, textDecorationLine: 'line-through', opacity: 0.6 } : styles.taskTitle}
                >
                  {task.title}
                </BodyMd>
              </TouchableOpacity>
            ))}

            {/* Add task input */}
            <View style={styles.addTaskRow}>
              <MaterialCommunityIcons name="plus" size={18} color={themeColors.onSurfaceVariant} />
              <TextInput
                style={[styles.addTaskInput, { color: themeColors.onSurface }]}
                placeholder="Add task..."
                placeholderTextColor={themeColors.onSurfaceVariant}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                onSubmitEditing={handleAddTask}
                returnKeyType="done"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: `${themeColors.outlineVariant}80` }]}>
          <TouchableOpacity style={[styles.btnDelete, { backgroundColor: `${themeColors.errorContainer}55` }]} onPress={() => setDeleteDialog(true)}>
            <MaterialCommunityIcons name="trash-can-outline" size={16} color={themeColors.error} />
            <LabelMd color={themeColors.error}>Delete</LabelMd>
          </TouchableOpacity>
          <View style={styles.footerRight}>
            <TouchableOpacity style={[styles.btnSecondary, { backgroundColor: themeColors.surfaceContainerLow }]} onPress={handleEdit}>
              <MaterialCommunityIcons name="pencil-outline" size={16} color={themeColors.onSurfaceVariant} />
              <LabelMd color={themeColors.onSurfaceVariant}>Edit</LabelMd>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: themeColors.primary }]} onPress={onClose}>
              <LabelMd color={themeColors.onPrimary}>Done</LabelMd>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>

      {/* Delete confirmation — replaces Alert.alert */}
      <Dialog
        visible={deleteDialog}
        title="Delete Event?"
        message={`Delete "${event.title}"? This cannot be undone.`}
        actions={[
          { label: 'Cancel', onPress: () => setDeleteDialog(false) },
          { label: 'Delete', destructive: true, onPress: handleConfirmDelete },
        ]}
        onDismiss={() => setDeleteDialog(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  headerLeft: { flex: 1, gap: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 4, height: 4,
    borderRadius: 2,
    backgroundColor: colors.outlineVariant,
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  categoryText: { textTransform: 'capitalize' },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  taskList: { flexGrow: 0, maxHeight: 260, marginBottom: spacing.md },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
    borderRadius: radius.md,
  },
  taskTitle: { flex: 1 },
  addTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  addTaskInput: {
    flex: 1,
    ...typography.bodyMd,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  footerRight: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  btnDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.default,
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.default,
  },
  btnPrimary: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.default,
  },
});
