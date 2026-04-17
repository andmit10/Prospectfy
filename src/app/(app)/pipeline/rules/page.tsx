import { Header } from '@/components/layout/header'
import { PipelineRulesEditor } from '@/components/pipeline/rules-editor'

export default function PipelineRulesPage() {
  return (
    <>
      <Header title="Regras de auto-progressão" />
      <div className="p-6 max-w-4xl">
        <PipelineRulesEditor />
      </div>
    </>
  )
}
