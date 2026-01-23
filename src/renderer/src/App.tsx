import { useAuthStore } from './stores/authStore'
import { MainLayout } from './components/layout'
import { LoginPage } from './pages/LoginPage'

function App(): React.JSX.Element {
  const { user, isAuthenticated, logout } = useAuthStore()

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return <MainLayout user={user} onLogout={logout} />
}

export default App
