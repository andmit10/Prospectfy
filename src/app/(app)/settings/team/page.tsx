import { Header } from '@/components/layout/header'
import { TeamManager } from '@/components/settings/team-manager'

export default function TeamSettingsPage() {
  return (
    <>
      <Header title="Time & Organização" />
      <div className="p-6 max-w-3xl space-y-6">
        <TeamManager />
      </div>
    </>
  )
}
