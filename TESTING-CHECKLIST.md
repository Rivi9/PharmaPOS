# Phase 2 - Testing & Deployment Checklist

## Pre-Merge Verification

### 1. Build & Type Checking

Run these commands to verify code quality:

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Format check
npm run format
```

**Expected:** All checks should pass with no errors

### 2. Development Build

```bash
npm install  # Install dependencies in worktree
npm run dev  # Start development server
```

**Verify:**
- Application launches without errors
- Login works
- POS page loads

### 3. Sample Data Seeding

To test with sample data, temporarily add seed call in `src/main/index.ts`:

```typescript
import { seedProducts } from './scripts/seed-products'

// In app.whenReady()
initializeDatabase()
seedProducts() // Add this line
registerIpcHandlers()
```

Run `npm run dev` to seed the database, then remove the line.

**Result:** 8 products with stock should be available

---

## Manual Testing Workflow

### Test 1: Barcode Scanning

1. Focus should be on barcode input by default
2. Type a barcode (e.g., `8850123456789`)
3. Press Enter
4. **Expected:** Product added to cart

### Test 2: Product Search

1. Press **F2** or click search icon
2. Type "panadol"
3. **Expected:** Search results appear
4. Click a product
5. **Expected:** Product added, modal closes

### Test 3: Quick Items

1. Check Quick Items grid (8 products)
2. **Expected:** Products show stock indicators (colored dots)
3. Click a product
4. **Expected:** Added to cart with qty 1

### Test 4: Cart Operations

1. Add multiple products
2. Adjust quantities using +/- buttons
3. **Expected:** Line totals update
4. **Expected:** Subtotal, tax, and total recalculate
5. Remove an item
6. **Expected:** Cart updates, totals recalculate

### Test 5: Hold & Recall

1. Add items to cart
2. Press **F4** (Hold)
3. **Expected:** Cart clears, items held
4. Add different items
5. Press **F5** (Recall)
6. **Expected:** Original cart restored

### Test 6: Cash Payment

1. Add products to cart (e.g., total = Rs. 1,000)
2. Press **F9**
3. Select **Cash**
4. Enter Rs. 1,500
5. **Expected:** Change shows Rs. 500
6. Click "Complete Sale"
7. **Expected:**
   - Sale saved
   - Receipt preview shows
   - Receipt number format: R-2025-NNNNNN
   - Cart clears

### Test 7: Card Payment

1. Add products
2. Press **F9**
3. Select **Card**
4. **Expected:** Amount auto-fills with total
5. Complete sale
6. **Expected:** Receipt shows card payment

### Test 8: Mixed Payment

1. Add products (total = Rs. 1,000)
2. Select **Mixed**
3. Enter cash: Rs. 600
4. **Expected:** Card amount auto-calculates to Rs. 400
5. Complete sale
6. **Expected:** Receipt shows both cash and card

### Test 9: Keyboard Shortcuts

Test each shortcut:
- **F2:** Opens search ✓
- **F4:** Holds sale (if cart has items) ✓
- **F5:** Recalls sale (if sale held) ✓
- **F8:** Clears cart (confirms first) ✓
- **F9:** Opens payment (if cart has items) ✓
- **ESC:** Closes modals ✓

### Test 10: FEFO Stock Deduction

1. Check product with multiple batches in database
2. Note batch expiry dates
3. Sell 5 units
4. **Expected:** Stock deducted from earliest expiry batch first
5. Check `stock_batches` table to verify

### Test 11: Receipt Accuracy

1. Complete a sale with:
   - 3 different products
   - Different quantities
   - Mixed payment
2. **Verify receipt shows:**
   - Correct receipt number
   - All items with quantities
   - Correct subtotal
   - Tax (18%) calculated on subtotal
   - Correct total
   - Payment method breakdown
   - Change (if cash)

### Test 12: Error Handling

Test these scenarios:

**Insufficient stock:**
1. Find product with low stock
2. Try to add more than available
3. **Expected:** Error: "Only X available"

**Product not found:**
1. Scan invalid barcode
2. **Expected:** "Product not found"

**Payment validation:**
1. Try to pay with cash less than total
2. **Expected:** "Insufficient cash" error

---

## Edge Cases to Test

1. **Empty cart payment:** F9 should not open payment modal
2. **Very long product names:** Should truncate in cart
3. **Zero quantity:** Should prevent (minimum 1)
4. **Multiple items same product:** Each should be separate cart row
5. **Clear cart confirmation:** Should ask before clearing
6. **Receipt auto-close:** Should close after 30 seconds (test with timer)
7. **Today's sales total:** Should update in status bar after sale

---

## Performance Checks

1. **Search response time:** < 300ms for queries
2. **Cart updates:** Instant (no lag when adding/removing)
3. **Payment completion:** < 2 seconds
4. **Receipt generation:** Instant

---

## Database Verification

After testing, check database integrity:

```sql
-- Sales should have receipt numbers
SELECT receipt_number, total FROM sales;

-- Stock should be deducted
SELECT p.name, SUM(sb.quantity) as stock
FROM products p
LEFT JOIN stock_batches sb ON p.id = sb.product_id
GROUP BY p.id;

-- Sales items should reference batches
SELECT * FROM sale_items WHERE batch_id IS NULL; -- Should be empty
```

---

## Known Limitations (Phase 2)

✅ **Implemented:**
- Barcode scanning (keyboard input)
- Product search
- Quick items (auto-populated)
- Shopping cart with quantities
- Hold/recall sales
- Cash, card, and mixed payments
- Receipt preview with copy
- FEFO stock deduction
- Keyboard shortcuts
- Tax calculation (18%)

❌ **Not Yet Implemented:**
- Line-item discounts (UI exists, not functional)
- Sale-level discounts (UI exists, not functional)
- Actual printer integration (receipt preview only)
- Barcode scanner hardware integration (uses keyboard)
- Today's sales total in status bar (shows Rs. 0.00)
- Shift info in status bar
- Customer database integration

**These are planned for future phases.**

---

## Ready for Merge Criteria

- [ ] All build commands pass
- [ ] All manual tests pass
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Sample products seed successfully
- [ ] Complete sale workflow tested end-to-end
- [ ] FEFO stock deduction verified
- [ ] Receipt displays correctly
- [ ] Keyboard shortcuts work

---

## Post-Merge Tasks

1. Update main branch documentation
2. Create release notes for Phase 2
3. Plan Phase 3 (Inventory Management)
4. Train users on POS terminal

---

*Last updated: 2025-01-24*
