import { queryCollectionSearchSections } from '@nuxt/content/server'

export default eventHandler((event) => {
    return queryCollectionSearchSections(event, 'docs')
})
