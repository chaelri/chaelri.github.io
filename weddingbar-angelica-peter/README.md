# Wedding Costs — Peter & Angelica

Congratulations on the engagement. This is your own copy of a wedding
budget tracker: expenses, a checklist, and a guest list, all in one page
that syncs live between your phones. Open it on both your phones and
whatever one of you types shows up on the other in a second or two.

There is no login and no install. It's just a web address.

---

## What's in it

**Costs** — the main screen. Add every expense (venue, catering, gown,
photographer…) with what it costs in total and what you've paid so far.
Each one becomes a bar that fills up as you pay it off. The circle at the
top shows how far along the whole wedding is, plus a countdown.

Tap a bar to open it, and you can attach photos of quotes and receipts to
that expense. Tap the countdown to switch it between months, weeks and days.

**Checklist** — *Menu ▾ → Checklist.* Tasks with deadlines and priorities.

**Guests** — *Menu ▾ → Guests.* Names, which side they're from, family or
friend, their role, and whether they've RSVP'd. There's a drag-and-drop
board view for sorting people into roles, and a search box and filters for
when the list gets long.

**Seating Planner** — *Menu ▾ → Seating Planner.*

---

## Changing your names and your date

Open **`config.js`**. That one file is the only thing you ever need to edit:

```js
partnerA: "Peter",
partnerB: "Angelica",
weddingDate: "February 2027",
```

Save the file, refresh the page, done.

### About the date

Right now it's set to `"February 2027"` — a month with no specific day —
so the countdown honestly says **"~ 6 MONTHS LEFT"** rather than pretending
to know a day you haven't picked.

Once you settle on the actual day, write the full date instead:

```js
weddingDate: "February 14, 2027",
```

The countdown switches itself to counting exact days. Nothing else to change.

If you'd rather not show a date at all yet, use `weddingDate: null,` and it
displays "SET YOUR DATE" until you're ready.

---

## Where your stuff is saved

Everything saves automatically to the cloud as you type — there's no Save
button, and nothing is stored only on your phone. Your data lives in its
own separate area from anybody else's copy of this app.

One honest caveat worth knowing: **there's no password on this.** Anyone
who has the link can view and edit. That's fine for a budget you're sharing
between the two of you — just don't post the link publicly, and don't put
bank details or anything genuinely sensitive in the notes.

---

## Installing it on your phone

You can make it behave like a real app with its own icon:

- **iPhone (Safari):** Share button → *Add to Home Screen*
- **Android (Chrome):** ⋮ menu → *Install app* / *Add to Home screen*

---

## Credits

Built from the tracker Charlie & Karla used for their own wedding.
Handed over with love — good luck with the planning. 💜
