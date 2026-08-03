// =====================================================================
//  WEDDING BAR  —  YOUR SETTINGS
//  Angelica & Peter
// =====================================================================
//
//  This is the ONLY file you need to edit.
//  Change the text between the "quotes", save the file, refresh the page.
//  You never have to open script.js.
//
// =====================================================================

window.WEDDING_CONFIG = {
  // -------------------------------------------------------------------
  //  YOUR NAMES
  //  These label the two "sides" everywhere you sort guests.
  // -------------------------------------------------------------------
  partnerA: "Peter",
  partnerB: "Angelica",

  // -------------------------------------------------------------------
  //  YOUR WEDDING DATE
  //
  //  No exact day picked yet?   Just the month + year:  "February 2027"
  //                             The countdown will count in months.
  //
  //  Picked the day?            The full date:          "February 14, 2027"
  //                             The countdown switches to exact days.
  //
  //  Not even the month yet?    Leave it as null  ->    weddingDate: null,
  // -------------------------------------------------------------------
  weddingDate: "February 2027",

  // -------------------------------------------------------------------
  //  APP NAME  — shown in the browser tab and on your phone home screen.
  // -------------------------------------------------------------------
  appTitle: "Wedding Costs",

  // -------------------------------------------------------------------
  //  MONEY FORMAT  — "en-PH" + "PHP" gives you ₱1,234.
  //  For US dollars use "en-US" and "USD".
  // -------------------------------------------------------------------
  locale: "en-PH",
  currency: "PHP",

  // -------------------------------------------------------------------
  //  WHERE YOUR DATA IS SAVED
  //
  //  ⚠️  DO NOT CHANGE THIS unless you know what you're doing.
  //  Everything you type is saved online under this name. Changing it
  //  points the app at a different, empty drawer — your existing
  //  expenses, checklist and guest list would look like they vanished.
  //  (They wouldn't really be gone: changing it back brings them right
  //  back.)  But there is no reason to touch it.
  // -------------------------------------------------------------------
  dataRoot: "angelicaPeter",
};
