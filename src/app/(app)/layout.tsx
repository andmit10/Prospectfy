import { Sidebar } from '@/components/layout/sidebar'
import { ImpersonationBanner } from '@/components/layout/impersonation-banner'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ImpersonationBanner />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
