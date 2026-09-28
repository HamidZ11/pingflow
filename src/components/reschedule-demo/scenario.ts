// The fictional example the site follows: the Sarah story on the homepage
// and the How it works page. Keeping the facts in one place stops the
// panels (and the later motion pass) drifting apart.
export const scenario = {
  customer: { name: "Sarah Khan", firstName: "Sarah", initials: "SK" },
  receivedAt: { label: "14:12", dateTime: "2026-10-12T14:12" },
  approvedAt: { label: "14:15", dateTime: "2026-10-12T14:15" },
  lesson: { day: "Tue 13 Oct", start: "16:00", end: "17:00" },
  proposal: {
    weekday: "Friday",
    day: "Fri 16 Oct",
    start: "17:00",
    end: "18:00",
  },
  reminder: { day: "Thu 15 Oct", time: "17:00" },
  // Friday around the proposed slot, as the built-in schedule shows it.
  // Hours are decimal (15.5 = 15:30).
  friday: [
    { kind: "lesson", name: "Omar Ali", from: 15.5, to: 16.5 },
    { kind: "buffer", from: 16.5, to: 16.75 },
    { kind: "proposal", from: 17, to: 18 },
    { kind: "lesson", name: "Priya Shah", from: 18, to: 19 },
  ],
  // The instructor's week once Sarah's lesson has moved.
  week: [
    {
      day: "Mon",
      date: "12",
      items: [
        { time: "09:00", name: "Jamie Lee" },
        { time: "13:00", name: "Omar Ali" },
      ],
    },
    {
      day: "Tue",
      date: "13",
      items: [
        { time: "09:00", name: "Jamie Lee" },
        { time: "11:30", name: "Tom Reed" },
        { time: "13:00", name: "Priya Shah" },
      ],
    },
    { day: "Wed", date: "14", blocked: "Day off", items: [] },
    {
      day: "Thu",
      date: "15",
      items: [
        { time: "09:00", name: "Jamie Lee" },
        { time: "12:00", name: "Tom Reed" },
        { time: "13:15", name: "Priya Shah" },
      ],
      free: ["10:00–12:00", "14:30–19:00"],
    },
    {
      day: "Fri",
      date: "16",
      items: [
        { time: "15:30", name: "Omar Ali" },
        { time: "17:00", name: "Sarah Khan", moved: true },
        { time: "18:00", name: "Priya Shah" },
      ],
    },
  ],
} as const;
