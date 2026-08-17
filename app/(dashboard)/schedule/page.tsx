const days = [
  { day: "Monday", slots: ["9:00 am", "12:30 pm", "7:15 pm"] },
  { day: "Tuesday", slots: ["9:00 am", "12:30 pm", "7:15 pm"] },
  { day: "Wednesday", slots: ["9:00 am", "4:00 pm"] },
  { day: "Thursday", slots: ["9:00 am", "12:30 pm", "7:15 pm"] },
  { day: "Friday", slots: ["9:00 am", "12:30 pm", "4:00 pm", "7:15 pm"] },
  { day: "Saturday", slots: ["11:00 am"] },
  { day: "Sunday", slots: ["Off"] },
];

export default function SchedulePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl tracking-tight">Schedule</h1>
      <p className="mt-2 text-muted">
        These are the slots the queue fills. Empty times stay empty.
      </p>

      <ul className="mt-8 divide-y divide-black/10 border-y border-black/10">
        {days.map((row) => (
          <li key={row.day} className="flex items-baseline gap-8 py-4">
            <span className="w-28 shrink-0">{row.day}</span>
            <span className="text-muted">{row.slots.join("  ·  ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
