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

1. Select your user from the dropdown
2. Enter your PIN (quick login) or password
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

**Stock Warnings:**

- "Product not found" - Check barcode or use search
- "Only X available" - Insufficient stock
- "No stock available" - Product out of stock

### Method 2: Quick Items (Touch-Friendly)

The Quick Items grid shows your 8 best-selling products:

1. Click any product tile to add 1 unit
2. **Stock indicators** (colored dots):
   - 🟢 Green: Good stock (10+)
   - 🟠 Amber: Low stock (< 10)
   - 🔴 Red: Out of stock

**Note:** Quick items update daily based on sales

### Method 3: Product Search (When Needed)

Use when barcode doesn't scan or customer doesn't know product name:

1. Click the **Search icon** (🔍) or press **F2**
2. Type product name, generic name, SKU, or barcode
3. Results appear as you type
4. Click a product to add it

---

## Managing the Cart

### Adjusting Quantities

Each cart item shows:

- Product name and generic name
- Quantity controls (**-** / **+** buttons)
- Manual quantity input (type directly)
- Unit price and line total
- Remove button (**×**)

**To change quantity:**

1. Click **+** or **-** buttons
2. Or type directly in the quantity box
3. Line total updates automatically

### Removing Items

- Click the **×** button on any item

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

### 2. Click "Pay Now" (F9)

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
5. **Let autocomplete work** in search - don't type full names

---

## Getting Help

**During shift:** Ask your supervisor

**Technical issues:** Contact IT support

**Training:** Refer to this guide or request refresher session

---

_This guide covers Phase 2 (Core POS). Additional features coming in future phases._
