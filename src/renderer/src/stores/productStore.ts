import { create } from 'zustand'
import type { Product } from '../lib/types'

interface ProductStore {
  quickItems: Product[]
  searchCache: Map<string, Product[]>
  setQuickItems: (products: Product[]) => void
  cacheSearchResults: (query: string, results: Product[]) => void
  getSearchResults: (query: string) => Product[] | undefined
}

export const useProductStore = create<ProductStore>((set, get) => ({
  quickItems: [],
  searchCache: new Map(),

  setQuickItems: (products) => {
    set({ quickItems: products })
  },

  cacheSearchResults: (query, results) => {
    set((state) => {
      const newCache = new Map(state.searchCache)
      newCache.set(query.toLowerCase(), results)
      return { searchCache: newCache }
    })
  },

  getSearchResults: (query) => {
    return get().searchCache.get(query.toLowerCase())
  }
}))
