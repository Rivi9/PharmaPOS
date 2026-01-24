import { getDatabase, generateId } from '../services/database'

interface Product {
  name: string
  generic_name: string | null
  barcode: string
  sku: string
  unit_price: number
}

interface StockBatch {
  product_id: string
  quantity: number
  cost_per_unit: number
  expiry_date: string | null
  received_date: string
}

const sampleProducts: Product[] = [
  {
    name: 'Panadol 500mg',
    generic_name: 'Paracetamol',
    barcode: '8850123456789',
    sku: 'MED-001',
    unit_price: 15.00,
  },
  {
    name: 'Strepsils Honey & Lemon',
    generic_name: null,
    barcode: '5000347022104',
    sku: 'MED-002',
    unit_price: 18.50,
  },
  {
    name: 'Piriton 4mg',
    generic_name: 'Chlorpheniramine',
    barcode: '8850987654321',
    sku: 'MED-003',
    unit_price: 12.00,
  },
  {
    name: 'Amoxil 250mg',
    generic_name: 'Amoxicillin',
    barcode: '8851234567890',
    sku: 'MED-004',
    unit_price: 25.00,
  },
  {
    name: 'Ventolin Inhaler',
    generic_name: 'Salbutamol',
    barcode: '5000456789012',
    sku: 'MED-005',
    unit_price: 450.00,
  },
  {
    name: 'Dettol Antiseptic Liquid 500ml',
    generic_name: null,
    barcode: '6001106082109',
    sku: 'GEN-001',
    unit_price: 380.00,
  },
  {
    name: 'Cetaphil Gentle Skin Cleanser',
    generic_name: null,
    barcode: '3499320001618',
    sku: 'SKN-001',
    unit_price: 1200.00,
  },
  {
    name: 'Vitamin C 1000mg',
    generic_name: 'Ascorbic Acid',
    barcode: '8852468024567',
    sku: 'SUP-001',
    unit_price: 35.00,
  },
]

export function seedProducts(): void {
  const db = getDatabase()

  console.log('Seeding sample products...')

  db.transaction(() => {
    // Clear existing products and stock (optional - comment out to keep existing data)
    // db.prepare('DELETE FROM stock_batches').run()
    // db.prepare('DELETE FROM products').run()

    for (const product of sampleProducts) {
      const productId = generateId()

      // Insert product
      db.prepare(`
        INSERT INTO products (
          id, name, generic_name, barcode, sku, unit_price, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(
        productId,
        product.name,
        product.generic_name,
        product.barcode,
        product.sku,
        product.unit_price
      )

      // Add stock batches (2-3 batches per product with varying quantities and expiry dates)
      const batches: StockBatch[] = [
        {
          product_id: productId,
          quantity: Math.floor(Math.random() * 50) + 20, // 20-70 units
          cost_per_unit: product.unit_price * 0.6, // 60% of selling price
          expiry_date: getRandomExpiryDate(6, 12), // 6-12 months from now
          received_date: getRandomReceivedDate(30), // Within last 30 days
        },
        {
          product_id: productId,
          quantity: Math.floor(Math.random() * 30) + 10, // 10-40 units
          cost_per_unit: product.unit_price * 0.6,
          expiry_date: getRandomExpiryDate(12, 24), // 12-24 months from now
          received_date: getRandomReceivedDate(15), // Within last 15 days
        },
      ]

      for (const batch of batches) {
        const batchId = generateId()
        db.prepare(`
          INSERT INTO stock_batches (
            id, product_id, batch_number, quantity, cost_per_unit,
            expiry_date, received_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          batchId,
          batch.product_id,
          `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          batch.quantity,
          batch.cost_per_unit,
          batch.expiry_date,
          batch.received_date
        )
      }

      console.log(`  ✓ ${product.name} (${productId})`)
    }
  })()

  console.log(`✓ Seeded ${sampleProducts.length} products with stock batches`)
}

function getRandomExpiryDate(minMonths: number, maxMonths: number): string {
  const months = Math.floor(Math.random() * (maxMonths - minMonths + 1)) + minMonths
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  return date.toISOString().split('T')[0]
}

function getRandomReceivedDate(daysAgo: number): string {
  const days = Math.floor(Math.random() * daysAgo)
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().split('T')[0]
}
