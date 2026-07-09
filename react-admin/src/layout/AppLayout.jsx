import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar/Sidebar'

const AppLayout = () => {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50 text-gray-900 dark:bg-[#05060a] dark:text-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default AppLayout
