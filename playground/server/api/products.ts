const PRODUCTS = [
    { id: 1, name: 'Arc Lamp', price: 129.0, stock: 14, category: 'Lighting' },
    { id: 2, name: 'Canvas Chair', price: 249.0, stock: 6, category: 'Seating' },
    { id: 3, name: 'Marble Tray', price: 49.5, stock: 32, category: 'Accessories' },
    { id: 4, name: 'Linen Throw', price: 79.0, stock: 18, category: 'Textiles' },
    { id: 5, name: 'Oak Shelf', price: 189.0, stock: 9, category: 'Storage' },
    { id: 6, name: 'Ceramic Pot', price: 39.0, stock: 45, category: 'Plants' },
    { id: 7, name: 'Brass Hook', price: 24.0, stock: 60, category: 'Accessories' },
    { id: 8, name: 'Wool Rug', price: 319.0, stock: 4, category: 'Textiles' },
]

export default defineEventHandler(() => {
    return PRODUCTS
})
