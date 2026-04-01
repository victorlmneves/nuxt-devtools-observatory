const PRODUCTS: Record<number, { id: number; name: string; price: number; stock: number; category: string; description: string }> = {
    1: {
        id: 1,
        name: 'Arc Lamp',
        price: 129.0,
        stock: 14,
        category: 'Lighting',
        description: 'A sleek arc floor lamp with a matte black finish.',
    },
    2: {
        id: 2,
        name: 'Canvas Chair',
        price: 249.0,
        stock: 6,
        category: 'Seating',
        description: 'Lightweight folding chair in natural canvas.',
    },
    3: {
        id: 3,
        name: 'Marble Tray',
        price: 49.5,
        stock: 32,
        category: 'Accessories',
        description: 'Hand-cut Carrara marble serving tray.',
    },
    4: { id: 4, name: 'Linen Throw', price: 79.0, stock: 18, category: 'Textiles', description: 'Stone-washed linen throw in oatmeal.' },
    5: { id: 5, name: 'Oak Shelf', price: 189.0, stock: 9, category: 'Storage', description: 'Solid white oak floating shelf, 90 cm.' },
    6: { id: 6, name: 'Ceramic Pot', price: 39.0, stock: 45, category: 'Plants', description: 'Matte terracotta ceramic planter, 18 cm.' },
    7: {
        id: 7,
        name: 'Brass Hook',
        price: 24.0,
        stock: 60,
        category: 'Accessories',
        description: 'Solid brass wall hook, antique finish.',
    },
    8: {
        id: 8,
        name: 'Wool Rug',
        price: 319.0,
        stock: 4,
        category: 'Textiles',
        description: 'Hand-knotted New Zealand wool rug, 160×230 cm.',
    },
}

export default defineEventHandler((event) => {
    const id = Number(getRouterParam(event, 'id'))

    if (!PRODUCTS[id]) {
        throw createError({ statusCode: 404, statusMessage: `Product ${id} not found` })
    }

    return PRODUCTS[id]
})
