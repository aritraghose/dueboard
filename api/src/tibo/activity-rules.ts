export { currentActivity } from "./protocol.ts";

const TOOL_LABELS: Record<string, string> = {
  list_tasks: "Looking at your tasks",
  create_task: "Adding a task",
  update_task: "Updating a task",
  set_task_status: "Updating a task",
  delete_task: "Deleting a task",
  list_habits: "Looking at your habits",
  create_habit: "Adding a habit",
  check_in_habit: "Checking in a habit",
  undo_check_in: "Undoing a check-in",
  pause_habit: "Pausing a habit",
  resume_habit: "Resuming a habit",
  delete_habit: "Deleting a habit",
  list_goals: "Looking at your goals",
  create_goal: "Adding a goal",
  set_goal_progress: "Updating a goal",
  link_goal_item: "Linking to a goal",
  unlink_goal_item: "Unlinking from a goal",
  set_goal_status: "Updating a goal",
  delete_goal: "Deleting a goal",
  create_note: "Writing a note",
  list_notes: "Looking at your notes",
  get_active_session: "Checking your focus session",
  start_session: "Starting a focus session",
  control_session: "Changing your focus session",
  list_tags: "Looking at your tags",
  create_tag: "Adding a tag",
  read_live: "Reading Live",
  read_diary: "Reading a diary",
  search_conversation: "Searching our past chats",
  remember: "Saving a memory",
  forget: "Forgetting a memory",
  relay_message: "Passing a message on",
  answer_relay: "Sending your answer",
  decline_relay: "Declining a message",
  list_relays: "Checking messages between people",
  set_reminder: "Setting a reminder",
  list_reminders: "Looking at your reminders",
  cancel_reminder: "Cancelling a reminder",
  confirm_action: "Doing what you confirmed",
  make_image: "Making a picture",
};

export const toolLabel = (name: string) => TOOL_LABELS[name] ?? "Working on it";

export const THINKING_DETAIL_MAX = 200;

export function thinkingDetail(summary: string): string {
  const text = summary
    .replace(/^\s*\*\*[^*\n]+\*\*\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= THINKING_DETAIL_MAX) return text;
  const cut = text.slice(0, THINKING_DETAIL_MAX);
  const space = cut.lastIndexOf(" ");
  return `${(space > THINKING_DETAIL_MAX * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

export const ACTIVITY_KEEP_DAYS = 60;
export const ACTIVITY_KEEP_THREADS = 3000;

export function memoryRunDetail(change: { memories: number; files: number; summaries: number }): string | null {
  const parts = [
    change.memories > 0 ? `learned ${change.memories} ${change.memories === 1 ? "memory" : "memories"}` : null,
    change.files > 0 ? `noted ${change.files} ${change.files === 1 ? "file" : "files"}` : null,
    change.summaries > 0 ? `wrote ${change.summaries} ${change.summaries === 1 ? "summary" : "summaries"}` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  const text = parts.join(", ");
  return `${text[0]!.toUpperCase()}${text.slice(1)}`;
}
