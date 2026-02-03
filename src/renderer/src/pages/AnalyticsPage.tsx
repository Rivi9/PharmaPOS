import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'

export function AnalyticsPage(): React.JSX.Element {
  return (
    <div className="h-full flex flex-col p-6 bg-background">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Analytics & Reports</h1>
        <p className="text-muted-foreground">Sales insights, reports, and AI recommendations</p>
      </div>

      <Tabs defaultValue="dashboard" className="flex-1">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="ai">AI Insights</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="flex-1">
          <div className="text-muted-foreground">Dashboard content will go here</div>
        </TabsContent>

        <TabsContent value="reports" className="flex-1">
          <div className="text-muted-foreground">Reports content will go here</div>
        </TabsContent>

        <TabsContent value="ai" className="flex-1">
          <div className="text-muted-foreground">AI insights content will go here</div>
        </TabsContent>

        <TabsContent value="alerts" className="flex-1">
          <div className="text-muted-foreground">Alerts content will go here</div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
