import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'

export function InventoryPage(): React.JSX.Element {
  return (
    <div className="h-full flex flex-col p-6 bg-background">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Inventory Management</h1>
        <p className="text-muted-foreground">Manage products, categories, suppliers, and stock</p>
      </div>

      <Tabs defaultValue="products" className="flex-1">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="stock">Stock Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-6">
          <div className="text-muted-foreground">Products list will go here</div>
        </TabsContent>

        <TabsContent value="categories" className="mt-6">
          <div className="text-muted-foreground">Categories list will go here</div>
        </TabsContent>

        <TabsContent value="suppliers" className="mt-6">
          <div className="text-muted-foreground">Suppliers list will go here</div>
        </TabsContent>

        <TabsContent value="stock" className="mt-6">
          <div className="text-muted-foreground">Stock batches will go here</div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
