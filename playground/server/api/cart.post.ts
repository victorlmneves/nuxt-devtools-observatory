/**
 * POST /api/cart — simulates adding an item to the server-side cart.
 * Used to exercise the fetch dashboard's POST request tracking.
 */
export default defineEventHandler(async (event) => {
    const body = await readBody(event)

    if (!body?.productId || typeof body.productId !== 'number') {
        throw createError({ statusCode: 400, statusMessage: 'productId (number) is required' })
    }

    // Simulate a small server-side processing delay
    await new Promise((resolve) => setTimeout(resolve, 80))

    return {
        ok: true,
        cartId: `cart_${Math.random().toString(36).slice(2, 9)}`,
        productId: body.productId,
        quantity: body.quantity ?? 1,
        addedAt: new Date().toISOString(),
    }
})
