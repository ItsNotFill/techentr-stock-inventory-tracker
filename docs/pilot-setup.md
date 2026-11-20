# Pilot setup checklist

For whoever runs the pilot with the restaurant. Stage 6 in `PROGRESS.md`: one real restaurant uses the app for two to four weeks on its real sales. It is done when the restaurant does a weekly count without our help and we have their feedback written down.

## 1. Choosing the restaurant

A good pilot has:

- **One location**, open at least five days a week.
- **A till (POS) that exports item-level sales**: one line per item sold, with an order or receipt number, the item, the quantity and the time. Ask them to try the export before you agree; some tills only give totals.
- **A manager who will count once a week**, ideally on the same day and before service.
- **Stock that matters in euros**: cheese, meat, wine, spirits. A pizzeria, trattoria or bar is ideal.
- **Phones** for the staff who count and receive deliveries (any recent Android or iPhone).

What we offer: the pilot is free, we do the setup with them, their data stays theirs, and they get a weekly "unexplained usage" figure in euros.

## 2. What to ask them for

Before the setup meeting, or at it:

| What | Why | Tip |
| --- | --- | --- |
| The POS name and version | Decides which POS connection we build later | A photo of the till's "About" screen is enough |
| One week of sales as a CSV export, item level | Proves the import works with their till | Not the daily totals. Ask for "product sales per receipt" or similar |
| A photo of the till's end-of-day report | Tells us whether sales by photo can work | It must list items and quantities, not only payment types |
| The menu as the till names it, with modifiers ("extra cheese", "large") | Menu items must match the till's names exactly | A POS item list export is best; a photo of the menu screens works |
| Portions per dish: what goes into one sale | These become the recipes | Kitchen spec sheets, or a 30-minute session with the chef |
| Last month's supplier invoices | Ingredient list, cost per kg or unit, pack sizes | Photos are fine |
| Where things are stored (walk-in fridge, dry store, bar, cellar) | The count screen is grouped by storage area | A quick walk-through |
| The team: names, e-mail addresses, roles | Owner, manager and staff accounts | Staff only need a phone |
| Which day they will count | The weekly rhythm | Same day each week, before service |

## 3. Setting up the restaurant in the app

In this order. The app is at <https://techentr-stock-inventory-tracker.vercel.app>.

1. **Account.** The owner signs up with their own e-mail address. The app creates the restaurant on the first login. Do this together.
2. **Ingredients and recipes.** Open **Ingredients**, then **Import from spreadsheet**, and download the two templates.
   - Fill `ingredients.csv` from the invoices: one line per ingredient, with its unit (g, ml or unit), cost and pack sizes.
   - Fill `recipes.csv` from the menu and portions: one line per ingredient per dish, with the dish named exactly as on the till.
   - Upload both, click **Check files**, fix what it lists, then **Import**.
   - Running it again is safe: it only adds what is missing and replaces recipes you changed.
3. **Things that use no stock.** Service charge, gift cards and similar items: on **Needs recipe**, mark them **Ignore**.
4. **Team.** In **Settings**, add the manager and staff. Each gets a one-time link to set a password; send it by chat.
5. **One week of sales.** Open **Import sales** and upload the CSV.
   - Match the columns once; the app remembers them.
   - Check the preview: skipped orders, and items that need a recipe.
   - Give every remaining item a recipe, or ignore it. Sales of those items are taken off stock as soon as the recipe exists.
6. **Opening count.** Count everything once, by storage area. The first count of each ingredient is its starting stock, not unexplained usage.
7. **Phones.** On each staff phone, open the app and install it ("Install app" on Android, "Add to Home Screen" on iPhone). Show them **Count**, **Deliveries** and **Waste**.

## 4. During the pilot

The weekly rhythm:

- **Sales:** imported daily or weekly (manager).
- **Deliveries and waste:** logged when they happen (staff, on a phone).
- **Count:** once a week. Staff count, and the manager approves.
- **Unexplained usage:** read by the owner after each approved count.

What to watch:

- Items that keep appearing under **Needs recipe**: new dishes or renamed till items.
- Counts that are far off for drinks or packaged goods: often a unit or pack size mistake, not loss.
- Anything they do on paper instead of in the app.

## 5. Feedback to write down

After the first week, and again at the end:

- How long did the weekly count take? The setup?
- Which screen did they not understand, or not use?
- Do they trust the unexplained usage figure? Which ingredient surprised them?
- Would they keep using it? What would they pay per month, and for what?
- What did they expect that is missing (for example the POS connection, sales by photo, or invoices by photo)?

Write it in `docs/pilot-feedback.md`, with the date and who said it.

## Known limits during the pilot

- Sales come in by CSV export; a direct POS connection is built once we know their till.
- Reading photos of end-of-day reports, invoices and menus is planned and waits for the Claude API key (`NEXT_STEPS_FOR_FILIPPO.md`).
- Counting without signal (a walk-in or a cellar) is being built: screens opened before already work offline, and typed counts will be kept on the phone and sent once there is signal.
- One restaurant per account in the app for now.
