// Shared tag palette for the guest list manager + seating arranger.
// Edit/extend in one place — both pages reflect the change.

export const TAG_DEFS = [
  { id: "family",     label: "Family",     bg: "#fce7f3", fg: "#9d174d", dot: "#ec4899" },
  { id: "friend",     label: "Friend",     bg: "#dbeafe", fg: "#1e40af", dot: "#3b82f6" },
  { id: "churchmate", label: "Churchmate", bg: "#dcfce7", fg: "#166534", dot: "#16a34a" },
  { id: "coworker",   label: "Coworker",   bg: "#e0e7ff", fg: "#3730a3", dot: "#6366f1" },
  { id: "classmate",  label: "Classmate",  bg: "#fef3c7", fg: "#92400e", dot: "#f59e0b" },
  { id: "neighbor",   label: "Neighbor",   bg: "#f5f5f4", fg: "#44403c", dot: "#78716c" },
];

export function tagDef(id) {
  return TAG_DEFS.find((t) => t.id === id) || null;
}
