# Phase 3 Inventory Management - Testing Checklist

**Date:** 2025-01-26
**Phase:** Phase 3 - Inventory Management
**Status:** Ready for Testing

---

## Overview

This document provides a comprehensive testing checklist for the Phase 3 Inventory Management system implementation. The system includes CRUD operations for Products, Categories, Suppliers, and Stock Batches, along with low stock alerts and CSV export functionality.

---

## Testing Environment Setup

### Prerequisites
- [ ] Application is running in development mode
- [ ] Database is initialized with seed data
- [ ] Test user account is available
- [ ] Browser DevTools/Console is open for error monitoring

### Test Data Requirements
- [ ] At least 3 categories (including nested subcategories)
- [ ] At least 3 suppliers
- [ ] At least 5 products with varying stock levels
- [ ] At least 3 stock batches with different expiry dates
- [ ] At least 2 products below reorder level (for low stock testing)

---

## 1. Products Module Testing

### 1.1 Product List Display
- [ ] **Test:** Navigate to Inventory > Products tab
- [ ] **Verify:** Products table displays correctly with all columns:
  - SKU
  - Product Name
  - Category
  - Supplier
  - Cost Price
  - Unit Price
  - Stock
  - Unit
  - Active status
  - Actions (Edit/Delete)
- [ ] **Verify:** Product count is displayed correctly (e.g., "5 products")
- [ ] **Verify:** Products with stock <= reorder_level are highlighted in red
- [ ] **Verify:** Export CSV button is visible
- [ ] **Verify:** Add Product button is visible

### 1.2 Create Product - Valid Data
- [ ] **Test:** Click "Add Product" button
- [ ] **Verify:** Product form dialog opens
- [ ] **Fill:** All required fields:
  - Name: "Test Paracetamol 500mg"
  - Generic Name: "Paracetamol"
  - Barcode: "1234567890123"
  - SKU: "TEST-001"
  - Category: Select existing category
  - Supplier: Select existing supplier
  - Cost Price: 50.00
  - Unit Price: 75.00
  - Tax Rate: 10
  - Reorder Level: 10
  - Reorder Qty: 50
  - Unit: "box"
  - Track Expiry: Checked
  - Is Active: Checked
- [ ] **Test:** Click "Create" button
- [ ] **Verify:** Dialog closes
- [ ] **Verify:** Product appears in the table
- [ ] **Verify:** Product data matches input
- [ ] **Verify:** Stock shows as 0 initially

### 1.3 Create Product - Validation Tests
- [ ] **Test:** Try creating product with empty name
- [ ] **Verify:** Validation error "Product name is required"
- [ ] **Test:** Try creating product with negative cost price
- [ ] **Verify:** Validation error "Cost price must be positive"
- [ ] **Test:** Try creating product with negative unit price
- [ ] **Verify:** Validation error "Unit price must be positive"
- [ ] **Test:** Try creating product with cost price > unit price
- [ ] **Verify:** Warning message about pricing (if implemented)

### 1.4 Edit Product
- [ ] **Test:** Click "Edit" button on existing product
- [ ] **Verify:** Form opens with pre-filled data
- [ ] **Modify:** Change unit price from 75.00 to 85.00
- [ ] **Test:** Click "Update" button
- [ ] **Verify:** Dialog closes
- [ ] **Verify:** Product table shows updated price
- [ ] **Verify:** Updated_at timestamp is updated

### 1.5 Delete Product (Soft Delete)
- [ ] **Test:** Click "Delete" button on a product
- [ ] **Verify:** Confirmation dialog appears
- [ ] **Test:** Click "Cancel"
- [ ] **Verify:** Product remains in table
- [ ] **Test:** Click "Delete" again, then "OK"
- [ ] **Verify:** Product disappears from table (is_active = 0)
- [ ] **Verify:** Product still exists in database with is_active = 0

### 1.6 CSV Export
- [ ] **Test:** Click "Export CSV" button
- [ ] **Verify:** CSV file downloads with filename format: `products-YYYY-MM-DD.csv`
- [ ] **Open CSV:** Verify all columns are present
- [ ] **Verify CSV Content:**
  - All products are included
  - Data matches table display
  - Proper CSV formatting (quoted fields, commas)
  - Status shows "Active" or "Inactive"

---

## 2. Categories Module Testing

### 2.1 Category List Display
- [ ] **Test:** Navigate to Inventory > Categories tab
- [ ] **Verify:** Categories table displays with columns:
  - Name
  - Parent Category
  - Product Count
  - Actions (Edit/Delete)
- [ ] **Verify:** Category count is displayed correctly
- [ ] **Verify:** Add Category button is visible

### 2.2 Create Root Category
- [ ] **Test:** Click "Add Category" button
- [ ] **Fill:**
  - Name: "Over-the-Counter Medications"
  - Description: "Non-prescription medications"
  - Parent Category: None (leave empty)
- [ ] **Test:** Click "Create" button
- [ ] **Verify:** Category appears in table with no parent
- [ ] **Verify:** Product count shows 0

### 2.3 Create Subcategory
- [ ] **Test:** Click "Add Category" button
- [ ] **Fill:**
  - Name: "Pain Relief"
  - Description: "Pain and fever relief medications"
  - Parent Category: Select "Over-the-Counter Medications"
- [ ] **Test:** Click "Create" button
- [ ] **Verify:** Category appears with parent category displayed

### 2.4 Create Category - Validation
- [ ] **Test:** Try creating category with empty name
- [ ] **Verify:** Validation error "Category name is required"

### 2.5 Edit Category
- [ ] **Test:** Click "Edit" on a category
- [ ] **Verify:** Form opens with pre-filled data
- [ ] **Modify:** Change description
- [ ] **Test:** Click "Update" button
- [ ] **Verify:** Changes are saved

### 2.6 Delete Category - With Products
- [ ] **Test:** Try to delete a category that has products
- [ ] **Verify:** Error message "Cannot delete category with products"
- [ ] **Verify:** Category remains in table

### 2.7 Delete Category - With Subcategories
- [ ] **Test:** Try to delete a category that has child categories
- [ ] **Verify:** Error message "Cannot delete category with sub-categories"
- [ ] **Verify:** Category remains in table

### 2.8 Delete Category - Empty Category
- [ ] **Test:** Delete a category with no products or subcategories
- [ ] **Verify:** Confirmation dialog appears
- [ ] **Test:** Click "OK"
- [ ] **Verify:** Category is permanently deleted (hard delete)

---

## 3. Suppliers Module Testing

### 3.1 Supplier List Display
- [ ] **Test:** Navigate to Inventory > Suppliers tab
- [ ] **Verify:** Suppliers table displays with columns:
  - Name
  - Contact Person
  - Phone
  - Email
  - Lead Time (days)
  - Product Count
  - Batch Count
  - Active status
  - Actions (Edit/Deactivate)
- [ ] **Verify:** Supplier count is displayed correctly

### 3.2 Create Supplier - Full Data
- [ ] **Test:** Click "Add Supplier" button
- [ ] **Fill:**
  - Name: "MediSupply Corp"
  - Contact Person: "John Doe"
  - Phone: "555-0123"
  - Email: "john@medisupply.com"
  - Address: "123 Medical Plaza, City"
  - Lead Time: 5 days
  - Is Active: Checked
- [ ] **Test:** Click "Create" button
- [ ] **Verify:** Supplier appears in table
- [ ] **Verify:** Product count and batch count show 0

### 3.3 Create Supplier - Minimal Data
- [ ] **Test:** Create supplier with only name
- [ ] **Verify:** Supplier is created with default lead time (3 days)
- [ ] **Verify:** Optional fields show as empty/null

### 3.4 Create Supplier - Validation
- [ ] **Test:** Try creating supplier with empty name
- [ ] **Verify:** Validation error "Supplier name is required"
- [ ] **Test:** Try invalid email format
- [ ] **Verify:** Email validation error (if implemented)

### 3.5 Edit Supplier
- [ ] **Test:** Click "Edit" on a supplier
- [ ] **Verify:** Form opens with all data pre-filled
- [ ] **Modify:** Update contact person and phone
- [ ] **Test:** Click "Update" button
- [ ] **Verify:** Changes are reflected in table

### 3.6 Deactivate Supplier (Soft Delete)
- [ ] **Test:** Click "Deactivate" button on a supplier
- [ ] **Verify:** Confirmation dialog with message about deactivation
- [ ] **Test:** Click "OK"
- [ ] **Verify:** Supplier disappears from active list (is_active = 0)
- [ ] **Verify:** Supplier still exists in database

---

## 4. Stock Batches Module Testing

### 4.1 Stock Batches List Display
- [ ] **Test:** Navigate to Inventory > Stock Batches tab
- [ ] **Verify:** Batches table displays with columns:
  - Batch Number
  - Product (Name + SKU)
  - Supplier
  - Quantity
  - Cost Price
  - Received Date
  - Expiry Date
  - Actions (Edit/Delete)
- [ ] **Verify:** Batch count is displayed correctly
- [ ] **Verify:** Batches are ordered by expiry date (FEFO - First Expired First Out)

### 4.2 Stock Batch Expiry Display
- [ ] **Verify:** Expired batches (expiry date < today) are shown in RED
- [ ] **Verify:** Expiring soon batches (expiry date < 30 days) are shown in ORANGE
- [ ] **Verify:** Non-expiring products show "-" for expiry date
- [ ] **Verify:** Days until expiry is displayed correctly

### 4.3 Create Stock Batch - With Expiry
- [ ] **Test:** Click "Receive Stock" button
- [ ] **Fill:**
  - Product: Select existing product
  - Batch Number: "BATCH-2025-001"
  - Quantity: 100
  - Cost Price: 45.00
  - Expiry Date: (Date 60 days from now)
  - Received Date: (Today's date)
  - Supplier: Select existing supplier
- [ ] **Test:** Click "Create" button
- [ ] **Verify:** Batch appears in table
- [ ] **Verify:** Product total stock is updated (+100)
- [ ] **Verify:** Expiry date displays correctly
- [ ] **Verify:** No color warning (>30 days away)

### 4.4 Create Stock Batch - Without Expiry
- [ ] **Test:** Create batch for non-expiry product
- [ ] **Fill:** All fields except expiry date
- [ ] **Test:** Click "Create" button
- [ ] **Verify:** Batch is created with null expiry date
- [ ] **Verify:** Expiry column shows "-"

### 4.5 Create Stock Batch - Validation
- [ ] **Test:** Try creating batch without selecting product
- [ ] **Verify:** Validation error "Product is required"
- [ ] **Test:** Try negative or zero quantity
- [ ] **Verify:** Validation error "Quantity must be greater than 0"
- [ ] **Test:** Try negative cost price
- [ ] **Verify:** Validation error "Cost price must be positive"

### 4.6 Edit Stock Batch
- [ ] **Test:** Click "Edit" on a batch
- [ ] **Verify:** Form opens with all data pre-filled
- [ ] **Modify:** Change quantity from 100 to 80
- [ ] **Test:** Click "Update" button
- [ ] **Verify:** Batch quantity updated in table
- [ ] **Verify:** Product total stock reflects change (-20)

### 4.7 Delete Stock Batch - With Stock
- [ ] **Test:** Try to delete batch with quantity > 0
- [ ] **Verify:** Confirmation dialog appears
- [ ] **Test:** Click "OK"
- [ ] **Verify:** Error message "Cannot delete batch with remaining stock"
- [ ] **Verify:** Batch remains in table

### 4.8 Delete Stock Batch - Empty Batch
- [ ] **Test:** Create or edit a batch to have quantity = 0
- [ ] **Test:** Click "Delete" button
- [ ] **Verify:** Confirmation dialog appears
- [ ] **Test:** Click "OK"
- [ ] **Verify:** Batch is permanently deleted (hard delete)
- [ ] **Verify:** Product total stock remains accurate

### 4.9 Stock Impact on Products
- [ ] **Test:** Note current total_stock for a product
- [ ] **Test:** Create new batch with quantity 50
- [ ] **Verify:** Product total_stock increases by 50
- [ ] **Test:** Delete batch (if quantity = 0)
- [ ] **Verify:** Product total_stock updates correctly

---

## 5. Low Stock Alerts Testing

### 5.1 Alert Display
- [ ] **Precondition:** Ensure at least 2 products have total_stock <= reorder_level
- [ ] **Test:** Navigate to Inventory page
- [ ] **Verify:** Orange alert banner appears at top of page
- [ ] **Verify:** Alert shows count: "Low Stock Alert (X)"
- [ ] **Verify:** Alert icon (AlertTriangle) is visible

### 5.2 Alert Content
- [ ] **Verify:** Shows top 5 low stock products
- [ ] **Verify:** Each product displays:
  - Product name (bold)
  - SKU (in parentheses, if available)
  - Current stock in red
  - Unit
  - Reorder level in parentheses
- [ ] **Example format:** "Aspirin 100mg (ASP-100) - **5 tablets** (reorder at 10)"

### 5.3 Alert With Many Products
- [ ] **Precondition:** Have more than 5 products below reorder level
- [ ] **Verify:** Only top 5 are displayed
- [ ] **Verify:** Message shows: "and X more products..."

### 5.4 Alert Auto-Hide
- [ ] **Precondition:** All products have stock > reorder_level
- [ ] **Verify:** Alert banner does NOT appear
- [ ] **Test:** Reduce a product's stock below reorder level
- [ ] **Verify:** Alert appears immediately after refresh

### 5.5 Alert Refresh on Operations
- [ ] **Test:** Receive new stock that brings product above reorder level
- [ ] **Verify:** Alert updates or disappears if no more low stock
- [ ] **Test:** Update product reorder level to be higher than current stock
- [ ] **Verify:** Product appears in low stock alert

---

## 6. Form Validation & Error Handling

### 6.1 Required Fields Validation
- [ ] **Test:** Try submitting each form type with empty required fields
- [ ] **Verify:** Appropriate error messages appear
- [ ] **Verify:** Form does not submit
- [ ] **Verify:** First invalid field is focused

### 6.2 Data Type Validation
- [ ] **Test:** Enter text in numeric fields (prices, quantities)
- [ ] **Verify:** Validation error or field prevents non-numeric input
- [ ] **Test:** Enter negative numbers where not allowed
- [ ] **Verify:** Validation error messages

### 6.3 Email Validation (Suppliers)
- [ ] **Test:** Enter invalid email format (e.g., "notanemail")
- [ ] **Verify:** Email validation error (if implemented)
- [ ] **Test:** Enter valid email format
- [ ] **Verify:** Accepted

### 6.4 Date Validation (Stock Batches)
- [ ] **Test:** Enter expiry date in the past
- [ ] **Verify:** Warning or validation (if implemented)
- [ ] **Test:** Enter future date
- [ ] **Verify:** Accepted

### 6.5 Network Error Handling
- [ ] **Test:** Simulate network failure (disconnect or kill backend)
- [ ] **Test:** Try any CRUD operation
- [ ] **Verify:** User-friendly error message appears
- [ ] **Verify:** Application doesn't crash
- [ ] **Verify:** Can retry after network restored

---

## 7. Database Integrity Testing

### 7.1 Foreign Key Relationships
- [ ] **Test:** Delete a category with products
- [ ] **Verify:** Blocked with error message
- [ ] **Test:** Deactivate a supplier with stock batches
- [ ] **Verify:** Allowed (soft delete)
- [ ] **Verify:** Stock batches still reference supplier correctly

### 7.2 Cascading Operations
- [ ] **Test:** Update a category name
- [ ] **Verify:** Products referencing category show updated name
- [ ] **Test:** Update a supplier name
- [ ] **Verify:** Products and batches show updated supplier name

### 7.3 Stock Calculation Accuracy
- [ ] **Test:** Create product with no batches
- [ ] **Verify:** total_stock = 0
- [ ] **Test:** Add batch with quantity 50
- [ ] **Verify:** total_stock = 50
- [ ] **Test:** Add another batch with quantity 30
- [ ] **Verify:** total_stock = 80
- [ ] **Test:** Update first batch quantity to 40
- [ ] **Verify:** total_stock = 70
- [ ] **Test:** Delete batch with quantity 0
- [ ] **Verify:** total_stock remains accurate

### 7.4 Soft Delete vs Hard Delete
- [ ] **Verify:** Products marked is_active = 0 don't appear in lists
- [ ] **Verify:** Products still exist in database
- [ ] **Verify:** Categories are hard deleted when empty
- [ ] **Verify:** Stock batches with quantity = 0 are hard deleted

---

## 8. UI/UX Testing

### 8.1 Responsive Layout
- [ ] **Test:** Resize browser window to various widths
- [ ] **Verify:** Tables scroll horizontally if needed
- [ ] **Verify:** Dialogs remain centered and usable
- [ ] **Verify:** Buttons remain accessible

### 8.2 Tab Navigation
- [ ] **Test:** Click through all 4 tabs (Products, Categories, Suppliers, Stock Batches)
- [ ] **Verify:** Each tab displays correct content
- [ ] **Verify:** Tab switching is instant
- [ ] **Verify:** Selected tab is highlighted

### 8.3 Dialog Behavior
- [ ] **Test:** Open any form dialog
- [ ] **Verify:** Background is dimmed/overlayed
- [ ] **Verify:** Clicking outside dialog does NOT close it
- [ ] **Verify:** Close button (X) closes dialog
- [ ] **Verify:** Cancel button closes dialog without saving
- [ ] **Verify:** Escape key closes dialog

### 8.4 Loading States
- [ ] **Test:** Monitor network requests during data loading
- [ ] **Verify:** No jarring layout shifts
- [ ] **Verify:** Data appears promptly
- [ ] **Note:** Loading spinners (if implemented)

### 8.5 Visual Feedback
- [ ] **Verify:** Low stock products highlighted in RED
- [ ] **Verify:** Expired batches highlighted in RED
- [ ] **Verify:** Expiring soon batches highlighted in ORANGE
- [ ] **Verify:** Hover effects on buttons
- [ ] **Verify:** Cursor changes appropriately (pointer on buttons)

---

## 9. Integration Testing

### 9.1 End-to-End Product Creation Flow
- [ ] **Test:** Complete flow from category → supplier → product → stock batch
  1. Create category "Test Category"
  2. Create supplier "Test Supplier"
  3. Create product "Test Product" with above category and supplier
  4. Receive stock batch for the product
- [ ] **Verify:** All entities are linked correctly
- [ ] **Verify:** Product displays correct category and supplier names
- [ ] **Verify:** Stock batch displays correct product and supplier names
- [ ] **Verify:** Product total_stock reflects batch quantity

### 9.2 Cross-Module Impact
- [ ] **Test:** Update product's reorder level
- [ ] **Verify:** Low stock alert updates if threshold crossed
- [ ] **Test:** Receive new stock batch
- [ ] **Verify:** Product list updates stock immediately
- [ ] **Verify:** Low stock alert updates if product now above threshold

### 9.3 Data Consistency
- [ ] **Test:** Open product list in one tab
- [ ] **Test:** Create new product
- [ ] **Verify:** Product count updates
- [ ] **Verify:** New product appears in table
- [ ] **Test:** Export CSV
- [ ] **Verify:** CSV includes newly created product

---

## 10. Performance Testing

### 10.1 Large Dataset Handling
- [ ] **Precondition:** Database has 100+ products
- [ ] **Test:** Load product list
- [ ] **Verify:** List loads in reasonable time (<2 seconds)
- [ ] **Test:** Scroll through table
- [ ] **Verify:** Smooth scrolling, no lag

### 10.2 Form Submission Speed
- [ ] **Test:** Submit various forms
- [ ] **Verify:** Response time is acceptable (<500ms for local DB)
- [ ] **Verify:** UI provides immediate feedback

### 10.3 CSV Export Performance
- [ ] **Test:** Export products list (100+ items)
- [ ] **Verify:** Export completes in reasonable time (<3 seconds)
- [ ] **Verify:** Browser doesn't freeze during export

---

## 11. Regression Testing

### 11.1 Phase 1 & 2 Functionality
- [ ] **Test:** Login still works
- [ ] **Test:** POS screen is accessible
- [ ] **Test:** Sales transactions can be completed
- [ ] **Test:** Shift management still works
- [ ] **Verify:** No existing features are broken

### 11.2 Navigation
- [ ] **Test:** Navigate between POS and Inventory pages
- [ ] **Verify:** Smooth transitions
- [ ] **Verify:** Data persists correctly

---

## 12. Edge Cases & Boundary Testing

### 12.1 Numeric Boundaries
- [ ] **Test:** Create product with cost_price = 0.01
- [ ] **Verify:** Accepted
- [ ] **Test:** Create product with very large prices (e.g., 999999.99)
- [ ] **Verify:** Accepted and displayed correctly
- [ ] **Test:** Create batch with quantity = 1
- [ ] **Verify:** Accepted

### 12.2 String Length Boundaries
- [ ] **Test:** Create product with very long name (255 characters)
- [ ] **Verify:** Accepted (or validation message if limit is lower)
- [ ] **Test:** Create category with long description
- [ ] **Verify:** Text wraps or truncates appropriately in UI

### 12.3 Special Characters
- [ ] **Test:** Product name with special characters: "Test & Product (50%)"
- [ ] **Verify:** Saved and displayed correctly
- [ ] **Test:** CSV export with special characters
- [ ] **Verify:** CSV properly escapes/quotes fields

### 12.4 Null/Empty Handling
- [ ] **Test:** Create product with no category or supplier
- [ ] **Verify:** Allowed (both are optional)
- [ ] **Verify:** Table shows "-" or empty for missing data
- [ ] **Test:** CSV export includes products with null category/supplier
- [ ] **Verify:** CSV shows empty fields correctly

---

## 13. Security Testing (Basic)

### 13.1 SQL Injection Prevention
- [ ] **Test:** Enter SQL injection strings in form fields (e.g., `' OR '1'='1`)
- [ ] **Verify:** Strings are treated as literal data, not executed

### 13.2 XSS Prevention
- [ ] **Test:** Enter script tags in text fields: `<script>alert('xss')</script>`
- [ ] **Verify:** Tags are escaped and displayed as text
- [ ] **Verify:** No script execution

---

## 14. Accessibility Testing (Basic)

### 14.1 Keyboard Navigation
- [ ] **Test:** Tab through form fields
- [ ] **Verify:** Focus order is logical
- [ ] **Verify:** All interactive elements are reachable
- [ ] **Test:** Press Enter to submit forms
- [ ] **Verify:** Forms submit correctly
- [ ] **Test:** Press Escape in dialogs
- [ ] **Verify:** Dialogs close

### 14.2 Screen Reader (if available)
- [ ] **Test:** Use screen reader on tables
- [ ] **Verify:** Headers are announced
- [ ] **Test:** Use screen reader on forms
- [ ] **Verify:** Labels are read correctly

---

## 15. Error Recovery Testing

### 15.1 Form Error Recovery
- [ ] **Test:** Fill form with invalid data, get validation error
- [ ] **Correct:** Fix validation errors
- [ ] **Test:** Submit again
- [ ] **Verify:** Form submits successfully

### 15.2 Operation Failure Recovery
- [ ] **Test:** Attempt invalid operation (e.g., delete category with products)
- [ ] **Verify:** Error message appears
- [ ] **Verify:** Can continue using application
- [ ] **Test:** Perform valid operation after
- [ ] **Verify:** Works correctly

---

## Test Summary Template

### Test Execution Summary
- **Tester Name:** _________________
- **Date:** _________________
- **Environment:** _________________
- **Total Test Cases:** _________________
- **Passed:** _________________
- **Failed:** _________________
- **Blocked:** _________________
- **Pass Rate:** __________________%

### Critical Issues Found
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Minor Issues Found
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Notes / Observations
_______________________________________________
_______________________________________________
_______________________________________________

### Sign-off
- [ ] All critical functionality tested
- [ ] No critical bugs remaining
- [ ] Ready for production deployment

**Tester Signature:** _________________
**Date:** _________________

---

## Appendix: Quick Reference

### Test Data Templates

#### Sample Product
```
Name: Paracetamol 500mg Tablets
Generic Name: Paracetamol
Barcode: 1234567890123
SKU: PAR-500-TAB
Category: Pain Relief
Supplier: PharmaCorp
Cost Price: 50.00
Unit Price: 75.00
Tax Rate: 10
Reorder Level: 20
Reorder Qty: 100
Unit: box
Track Expiry: Yes
```

#### Sample Category
```
Name: Pain Relief
Description: Medications for pain and fever management
Parent Category: Over-the-Counter
```

#### Sample Supplier
```
Name: PharmaCorp International
Contact Person: Jane Smith
Phone: 555-0199
Email: jane@pharmacorp.com
Address: 456 Medical Drive, City, State
Lead Time: 7 days
```

#### Sample Stock Batch
```
Product: Paracetamol 500mg Tablets
Batch Number: BATCH-2025-001
Quantity: 100
Cost Price: 45.00
Expiry Date: 2026-12-31
Received Date: 2025-01-26
Supplier: PharmaCorp International
```

---

**End of Testing Checklist**
