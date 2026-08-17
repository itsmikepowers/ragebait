const queue = [
  {
    time: "9:00 am",
    text: "Pineapple on pizza should be a federal crime.",
  },
  {
    time: "12:30 pm",
    text: "Your morning routine is a personality disorder.",
  },
  {
    time: "4:00 pm",
    text: "Phones were better when they couldn't do anything.",
  },
  {
    time: "7:15 pm",
    text: "That team you love? Overrated. Always was.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
      <p className="mt-2 text-muted-foreground">
        Write the bait, drop it in the queue, let the comments do the rest.
      </p>

      <div className="mt-8 rounded-xl border border-black/10 p-4">
        <p className="text-sm text-muted-foreground">Composer</p>
        <p className="mt-3 min-h-24 text-foreground/40">
          What would you like to share?
        </p>
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>0 / 280</span>
          <span>Add to queue</span>
        </div>
      </div>

      <h2 className="mt-10 text-sm text-muted-foreground">Upcoming</h2>
      <ul className="mt-3 divide-y divide-black/10 border-y border-black/10">
        {queue.map((item) => (
          <li key={item.time} className="flex gap-6 py-4">
            <span className="w-24 shrink-0 text-sm text-muted-foreground">{item.time}</span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
