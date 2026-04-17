import { Header } from '@/components/layout/header'
import { PipelineSelector } from '@/components/pipeline/pipeline-selector'

export default function PipelinePage() {
  return (
    <>
      <Header title="Pipeline" />
      <div className="p-6 overflow-hidden">
        <PipelineSelector />
      </div>
    </>
  )
}
