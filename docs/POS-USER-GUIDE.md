# PharmaPOS - User Guide

**Version:** Phase 2 - Core POS Terminal
**Last Updated:** 2025-01-24

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Adding Products to Cart](#adding-products-to-cart)
3. [Managing the Cart](#managing-the-cart)
4. [Completing a Sale](#completing-a-sale)
5. [Keyboard Shortcuts](#keyboard-shortcuts)
6. [Common Operations](#common-operations)
7. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Logging In

1. Tap your name on the sign-in screen
2. Enter your PIN (quick login), or tap **Use Password**
3. Click **Login**

### Starting a Shift

Before you can process sales, you must start a shift:

1. Navigate to **Settings** from the sidebar
2. Click **Start Shift**
3. Enter opening cash amount
4. Click **Start**

---

## Adding Products to Cart

### Method 1: Barcode Scanner (Fastest)

1. The barcode input is **always ready** - just scan
2. Product is added automatically
3. Scanner clears and is ready for next item

**Stock warnings** pop up at the top of the screen and clear themselves:

- "Nothing matches …" - Check the barcode, or type the name instead
- "Only X … in stock" - You asked for more than is on the shelf
- "… has no stock" - Product is out of stock
- "… expires in N days" / "… is EXPIRED" - check the pack before handing it over

### Method 2: Quick Items (Touch-Friendly)

The Quick Items grid shows your 8 best-selling products:

1. Tap any product tile to add 1 unit
2. **Stock badge** on each tile:
   - Green "N in stock": good stock (10+)
   - Amber "N left": low stock (< 10)
   - Red "Out of stock": the tile is greyed out and cannot be tapped

**Note:** Quick items update daily based on sales

### Method 3: Type to Search

The same box the scanner uses also searches by name. Type **two or more
letters** and suggestions appear underneath:

- Words can be **partial and in any order**: `azi 500`, `500 azithro` and
  `para syr` all work. Each word can match the name, generic name, SKU or
  barcode.
- The best matches come first: names that **start** with what you typed, then
  names with a word starting with it, then anything containing it. In-stock
  products come before out-of-stock ones.
- **Tap** a suggestion to add it. You can scroll the list with your finger
  without adding anything; only a tap adds.
- On a keyboard: **↓ / ↑** to move, **Enter** to add the highlighted row.
  Enter without using the arrows looks up exactly what you typed (this is what
  a barcode scanner does).
- **Browse** (or **F2**) opens the full list with up to 50 results.

---

## Appearance

Settings → **Appearance** switches this till between **Light**, **Dark** and
**System** (follow Windows). It is saved on this computer only.

---

## Managing the Cart

### Adjusting Quantities

Each cart item shows:

- Product name and generic name
- Quantity controls (**−** / **+** buttons)
- Manual quantity input (type directly)
- Unit price and line total
- Remove button (bin icon)

**To change quantity:**

1. Tap **+** or **−**
2. Or tap the quantity box and type: the cursor always goes to the end, and
   the number keypad opens on a touch keyboard
3. Line total updates automatically; you cannot go above the stock on hand

### Removing Items

- Tap the bin icon on any item

### Discounts

**Coming in future update:**

- Line-item discounts (click price to edit)
- Sale-level discounts (apply to entire cart)

### Cart Actions

- **Hold (F4):** Save current cart, start fresh sale
- **Recall (F5):** Restore the held sale
- **Clear (F8):** Empty cart (asks for confirmation)

**Use cases:**

- Customer needs to get their wallet → Hold sale
- Phone rings, need to help someone → Hold sale
- Customer changes their mind → Clear cart

---

## Completing a Sale

### 1. Review Cart

Check that all items and quantities are correct

### 2. Tap "Pay Rs. …" (F9)

Payment modal opens showing:

- Total amount
- Payment method options
- Customer info (optional)

### 3. Select Payment Method

**Cash:**

1. Enter amount received
2. Change is calculated automatically
3. Must be ≥ total

**Card:**

1. Amount auto-fills with total
2. Process card payment externally
3. Click "Complete Sale"

**Mixed (Cash + Card):**

1. Enter cash amount received
2. Card amount auto-calculates (remaining)
3. Ensure total matches

### 4. Customer Info (Optional)

For receipts or loyalty tracking:

- Customer name
- Phone number

### 5. Complete Sale

1. Click **"Complete Sale"**
2. Sale is saved to database
3. Stock is deducted automatically (FEFO)
4. Receipt preview appears

### 6. Receipt

The receipt shows:

- Receipt number (R-YYYY-NNNNNN)
- Date and time
- All items with quantities and prices
- Payment breakdown
- Customer info (if provided)

**Actions:**

- **Copy to Clipboard:** For pasting into email/SMS
- **New Sale:** Close receipt, start fresh

**Note:** Receipt auto-closes after 30 seconds or on next scan

---

## Keyboard Shortcuts

| Key     | Action                           |
| ------- | -------------------------------- |
| **F2**  | Open product search              |
| **F4**  | Hold current sale                |
| **F5**  | Recall held sale                 |
| **F8**  | Clear cart (with confirmation)   |
| **F9**  | Open payment (if cart has items) |
| **ESC** | Close any open modal             |

**Pro tip:** Memorize F4 (Hold) and F5 (Recall) for busy periods!

---

## Common Operations

### Quick Single-Item Sale

1. Scan product barcode
2. Press **F9** (Pay Now)
3. Enter cash received
4. Complete sale

**Typical time:** 5-10 seconds

### Hold and Resume Sale

**Scenario:** Customer forgot wallet

1. Press **F4** (Hold)
2. Help next customer
3. When original customer returns: Press **F5** (Recall)
4. Continue with payment

### Handling Low Stock Warnings

When adding product with low stock:

- Check stock indicator (Quick Items grid)
- Note "Only X available" message
- Inform customer of stock level
- Adjust quantity if needed

### End of Day

1. Complete all pending sales
2. Navigate to **Settings**
3. Click **End Shift**
4. Enter closing cash amount
5. Add notes if needed (discrepancies, issues)
6. Click **End Shift**

System calculates expected vs actual cash variance.

---

## Troubleshooting

### Barcode Scanner Not Working

**Symptoms:**

- Nothing happens when scanning
- Characters appear in wrong places

**Solutions:**

1. Check scanner cable connection
2. Click on barcode input field (should auto-focus)
3. Use Product Search (F2) as fallback
4. Contact IT support

### "No active shift found"

**Solution:**

1. Go to Settings
2. Start a shift before processing sales

### Product Not Found

**Causes:**

- Barcode not in database
- Scanner misread barcode
- Product not activated

**Solutions:**

1. Try scanning again
2. Use Product Search (F2) to find by name
3. Check if product exists in inventory
4. Contact manager if product should exist

### Payment Validation Errors

**"Insufficient cash":** Enter amount ≥ total

**"Payment mismatch":** For mixed payments, ensure cash + card = total

### Cart Won't Clear

If cart items persist after sale:

- Sale may have failed - check error message
- Database issue - contact IT support
- Don't process again - might duplicate sale

---

## Best Practices

✅ **DO:**

- Keep barcode input focused (auto-focused by design)
- Use Quick Items for frequently sold products
- Hold sales during busy periods (don't make customers wait)
- Double-check quantities before payment
- Verify change amount before handing to customer

❌ **DON'T:**

- Leave POS terminal unattended while logged in
- Process sales without active shift
- Complete sales if stock warnings appear (inform customer first)
- Skip receipt preview (verify amounts are correct)

---

## Tips for Efficiency

1. **Memorize top 8 product locations** on Quick Items grid
2. **Use keyboard shortcuts** - F9 is fastest way to payment
3. **Keep scanner pointed at products** while bagging
4. **Hold sales liberally** during rushes - it's faster than making people wait
5. **Let the suggestions work** - two or three letters of each word is usually enough (`azi 500`)

---

## Getting Help

**During shift:** Ask your supervisor

**Technical issues:** Contact IT support

**Training:** Refer to this guide or request refresher session

---

_This guide covers Phase 2 (Core POS). Additional features coming in future phases._
