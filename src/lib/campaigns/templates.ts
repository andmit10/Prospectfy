/**
 * Rich campaign templates — these are the "starter kits" users pick when
 * they don't know where to begin. Each template ships with a complete
 * cadence (messages + delays + channels) tuned for a specific scenario.
 *
 * Philosophy: we want the user to FINISH their first campaign. Copy here
 * is production-grade pt-BR that works for real SDRs — not placeholders.
 */

import type { CanalTipo } from '@/types'

export type CampaignTemplate = {
  id: string
  name: string
  description: string
  category: 'outbound' | 'follow_up' | 'reactivation' | 'event' | 'post_demo' | 'nurture'
  icon: string // lucide name (resolved in component)
  color: string // hex
  useCase: string // when to use this
  expectedResult: string // what to expect
  tags: string[]
  steps: Array<{
    step_order: number
    canal: CanalTipo
    delay_hours: number
    tipo_mensagem: 'texto' | 'imagem' | 'documento' | 'audio'
    mensagem_template: string
    note?: string // tooltip for the user explaining why this step exists
  }>
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'outbound-wpp-classico-5-steps',
    name: 'Outbound frio WhatsApp — 5 toques',
    description:
      'Sequência clássica de 5 mensagens para leads que nunca ouviram falar de você. Progride de apresentação → prova social → CTA → última chance.',
    category: 'outbound',
    icon: 'Zap',
    color: '#F59E0B',
    useCase: 'Lista nova (Google Maps, LinkedIn) sem relacionamento prévio.',
    expectedResult: '8–15% de taxa de resposta em B2B brasileiro quando bem segmentado.',
    tags: ['whatsapp', 'frio', 'outbound', 'b2b'],
    steps: [
      {
        step_order: 1,
        canal: 'whatsapp',
        delay_hours: 0,
        tipo_mensagem: 'texto',
        mensagem_template:
          'Oi {{decisor_nome}}, aqui é [SEU NOME] da [SUA EMPRESA]. Vi que a {{empresa_nome}} atua com {{segmento}} e quis te mandar uma ideia rápida.\n\nAjudamos empresas como a sua a [RESULTADO PRINCIPAL — ex: fechar 3x mais reuniões qualificadas por mês] sem aumentar o time.\n\nFaz sentido trocarmos 10 min essa semana pra eu te mostrar o caso de um cliente parecido?',
        note: 'Primeiro toque: apresentação + problema + pergunta suave. Nunca mande proposta aqui.',
      },
      {
        step_order: 2,
        canal: 'whatsapp',
        delay_hours: 48,
        tipo_mensagem: 'texto',
        mensagem_template:
          '{{decisor_nome}}, sei que a rotina é corrida 🙂\n\nSó pra te dar contexto: o último cliente do seu porte subiu de [MÉTRICA ANTES] para [MÉTRICA DEPOIS] em [TEMPO] usando nosso método.\n\nPosso te mandar um resumo de 2 min em vídeo ou prefere 10 min de call?',
        note: 'Bump 2 dias depois com prova social específica. Oferece 2 formatos.',
      },
      {
        step_order: 3,
        canal: 'whatsapp',
        delay_hours: 72,
        tipo_mensagem: 'texto',
        mensagem_template:
          'Fiz uma análise rápida da {{empresa_nome}} e vi 3 pontos onde conseguimos ajudar especificamente:\n\n1️⃣ [PONTO 1 baseado no segmento]\n2️⃣ [PONTO 2]\n3️⃣ [PONTO 3]\n\nQuer que eu te envie o diagnóstico detalhado?',
        note: 'Personalização real. Se não tiver tempo de personalizar, ative o agente de IA aqui.',
      },
      {
        step_order: 4,
        canal: 'whatsapp',
        delay_hours: 96,
        tipo_mensagem: 'texto',
        mensagem_template:
          '{{decisor_nome}}, entendo se não for o momento.\n\nSó pra não te encher o WhatsApp: posso te marcar um lembrete pra daqui 30 dias ou esse tema não tá na mesa nesse trimestre?\n\nQualquer resposta me ajuda 👊',
        note: 'Pergunta de saída elegante. Abre porta pra "não agora" sem quemar ponte.',
      },
      {
        step_order: 5,
        canal: 'whatsapp',
        delay_hours: 168,
        tipo_mensagem: 'texto',
        mensagem_template:
          '{{decisor_nome}}, última mensagem minha por aqui.\n\nCaso queira retomar no futuro é só responder "sim" que te chamo.\n\nDesejo ótimas vendas pra {{empresa_nome}} 🚀',
        note: 'Break-up message. Libera o lead e deixa a porta aberta.',
      },
    ],
  },
  {
    id: 'follow-up-pos-evento',
    name: 'Follow-up pós-evento / feira',
    description:
      'Para leads que você conheceu presencialmente. Tom mais quente, puxa a conversa e evita o clássico "prazer, segue meu contato".',
    category: 'event',
    icon: 'Handshake',
    color: '#10B981',
    useCase: 'Após evento, feira, meetup ou reunião de network.',
    expectedResult: '30–50% de resposta nas primeiras 48h.',
    tags: ['quente', 'evento', 'network'],
    steps: [
      {
        step_order: 1,
        canal: 'whatsapp',
        delay_hours: 2,
        tipo_mensagem: 'texto',
        mensagem_template:
          'Oi {{decisor_nome}}, foi ótimo te conhecer no [EVENTO] hoje!\n\nLembra que comentei sobre [TÓPICO CONVERSADO]? Separei o material que te prometi + 1 case rápido de quem usou na {{segmento}}.\n\nPosso te mandar?',
        note: 'Refere-se à conversa real. O cérebro do lead lembra melhor ao receber hoje.',
      },
      {
        step_order: 2,
        canal: 'whatsapp',
        delay_hours: 48,
        tipo_mensagem: 'texto',
        mensagem_template:
          '{{decisor_nome}}, aqui está o material 👇\n\n[LINK DO MATERIAL]\n\nSe fizer sentido dar um passo a mais, tenho quinta 14h ou sexta 10h livre pra um papo de 20min. Topa?',
        note: 'Dois horários específicos performam 3x melhor que "me avisa quando puder".',
      },
      {
        step_order: 3,
        canal: 'email',
        delay_hours: 120,
        tipo_mensagem: 'texto',
        mensagem_template:
          'Assunto: Continuamos aquele papo do [EVENTO]?\n\nOi {{decisor_nome}},\n\nPassando por e-mail caso o WhatsApp tenha escapado. Seguimos com aquele bate-papo sobre [TÓPICO]?\n\nSe for melhor, chama no {{decisor_nome}}@[SEU DOMÍNIO].',
        note: 'Backup por e-mail. Alguns decisores leem e-mail antes de WhatsApp.',
      },
    ],
  },
  {
    id: 'reativacao-leads-frios',
    name: 'Reativação — leads que esfriaram',
    description:
      'Traga de volta leads que já interagiram no passado mas sumiram. Assume honestidade: "sei que você sumiu, mas tenho novidade".',
    category: 'reactivation',
    icon: 'RefreshCw',
    color: '#A855F7',
    useCase: 'Leads que responderam no passado e ficaram 60+ dias sem resposta.',
    expectedResult: '15–25% retomam quando há gatilho novo claro.',
    tags: ['morno', 'reativacao'],
    steps: [
      {
        step_order: 1,
        canal: 'whatsapp',
        delay_hours: 0,
        tipo_mensagem: 'texto',
        mensagem_template:
          '{{decisor_nome}}, tudo bem? [SEU NOME] aqui de novo.\n\nA gente conversou há um tempo sobre [TÓPICO] e depois a conversa esfriou — sei que a rotina pega 😅\n\nTô te chamando porque [GATILHO NOVO: lançamento / cliente no mesmo setor / caso]. Achei que faria sentido retomar.',
        note: 'Reconhece o sumiço sem cobrança. O gatilho novo é o que reativa.',
      },
      {
        step_order: 2,
        canal: 'whatsapp',
        delay_hours: 72,
        tipo_mensagem: 'texto',
        mensagem_template:
          '{{decisor_nome}}, mandei o material que te prometi:\n\n[LINK ou VÍDEO DE 2 MIN]\n\nSe a {{empresa_nome}} ainda tiver esse desafio, consigo te mostrar em 15min como resolveríamos. Te chamo quinta 16h?',
        note: 'Proposta concreta de horário específico. Se não responder, pipeline avança pra "perdido".',
      },
    ],
  },
  {
    id: 'pos-demo-agendamento',
    name: 'Pós-demo — converter em proposta',
    description:
      'Para leads que já viram a solução. Foco em tirar objeções finais e avançar pra proposta comercial.',
    category: 'post_demo',
    icon: 'Target',
    color: '#3B82F6',
    useCase: 'Após demo técnica, antes de enviar proposta.',
    expectedResult: 'Acelera decisão em 2x vs follow-up genérico.',
    tags: ['quente', 'proposta', 'fechamento'],
    steps: [
      {
        step_order: 1,
        canal: 'email',
        delay_hours: 3,
        tipo_mensagem: 'texto',
        mensagem_template:
          'Assunto: Resumo da call de hoje + próximos passos\n\nOi {{decisor_nome}},\n\nFoi ótimo apresentar a solução pra {{empresa_nome}}. Anotei os 3 pontos principais:\n\n• [PONTO 1]\n• [PONTO 2]\n• [PONTO 3]\n\nSegue o material que prometi: [LINK]\n\nQuer que eu já prepare a proposta com essas premissas ou você prefere validar com o time antes?',
        note: 'Resume a conversa + oferece caminho claro. Email pq é mais formal/arquivável.',
      },
      {
        step_order: 2,
        canal: 'whatsapp',
        delay_hours: 48,
        tipo_mensagem: 'texto',
        mensagem_template:
          '{{decisor_nome}}, te mandei o resumo por e-mail.\n\nSe tiver alguma dúvida rolando internamente, me chama — resolvo em 2min e mantém o time andando.',
        note: 'WhatsApp como canal de suporte à decisão. Tira fricção.',
      },
      {
        step_order: 3,
        canal: 'whatsapp',
        delay_hours: 96,
        tipo_mensagem: 'texto',
        mensagem_template:
          'Oi {{decisor_nome}}, só um toque amigo:\n\nPra não te atropelar com a proposta, prefere que eu envie quando você me der um sinal verde ou mando já pra vocês analisarem no ritmo de vocês?\n\nQualquer resposta serve.',
        note: 'Dá controle ao lead. "Qualquer resposta serve" aumenta taxa de resposta em 2x.',
      },
    ],
  },
  {
    id: 'proposta-enviada-seguimento',
    name: 'Proposta enviada — follow-up 4 semanas',
    description:
      'Cadência profissional pós-envio de proposta. 4 semanas, 6 toques, escalando urgência sem pressionar.',
    category: 'follow_up',
    icon: 'FileText',
    color: '#F97316',
    useCase: 'Após enviar proposta comercial formal.',
    expectedResult: '40–60% decidem dentro do ciclo de 4 semanas.',
    tags: ['proposta', 'fechamento', 'b2b'],
    steps: [
      {
        step_order: 1,
        canal: 'whatsapp',
        delay_hours: 72,
        tipo_mensagem: 'texto',
        mensagem_template:
          '{{decisor_nome}}, proposta chegou aí 🙂\n\nTô à disposição pra qualquer dúvida. Se quiser, separo 15min essa semana pra revisar junto — geralmente acelera a decisão.\n\nO que prefere?',
      },
      {
        step_order: 2,
        canal: 'email',
        delay_hours: 168,
        tipo_mensagem: 'texto',
        mensagem_template:
          'Assunto: Proposta {{empresa_nome}} — alguma dúvida?\n\nOi {{decisor_nome}},\n\nSemana passada enviamos a proposta. Sei que o tempo aperta, então aqui vai um resumo de 3 linhas:\n\n• Investimento: [VALOR]\n• Resultado esperado: [META]\n• Prazo: [TEMPO]\n\nFica mais fácil analisar assim? Posso ajustar algo?',
      },
      {
        step_order: 3,
        canal: 'whatsapp',
        delay_hours: 168,
        tipo_mensagem: 'texto',
        mensagem_template:
          '{{decisor_nome}}, como está o andamento da análise?\n\nSe tiver algum ajuste que faça a proposta fazer mais sentido, me fala — consigo flexibilizar em [VARIÁVEL: prazo / escopo / forma de pagamento].',
      },
      {
        step_order: 4,
        canal: 'whatsapp',
        delay_hours: 168,
        tipo_mensagem: 'texto',
        mensagem_template:
          '{{decisor_nome}}, tô fechando o forecast do mês.\n\nConsigo segurar as condições atuais da proposta até [DATA ESPECÍFICA]. Depois disso, pode ter ajuste.\n\nVale tentar avançar essa semana?',
        note: 'Escassez real (não inventada). Data específica aumenta conversão em 3x.',
      },
      {
        step_order: 5,
        canal: 'whatsapp',
        delay_hours: 168,
        tipo_mensagem: 'texto',
        mensagem_template:
          'Oi {{decisor_nome}}, prometo que essa é a penúltima 😄\n\nSó pra alinhar expectativas: a proposta segue em pé até [DATA] e depois disso vou ter que repriorizar a agenda pra outros clientes.\n\nÉ no/não/talvez?',
      },
      {
        step_order: 6,
        canal: 'whatsapp',
        delay_hours: 168,
        tipo_mensagem: 'texto',
        mensagem_template:
          '{{decisor_nome}}, vou parar de te cobrar por aqui.\n\nCaso queira retomar no futuro, é só me chamar. Torço muito pra {{empresa_nome}} 🤝',
      },
    ],
  },
  {
    id: 'nurture-conteudo-b2b',
    name: 'Nutrição — conteúdo de autoridade',
    description:
      'Cadência longa (3 meses) mandando insight, case e dado do mercado. Para leads que ainda não compram mas podem comprar em 6 meses.',
    category: 'nurture',
    icon: 'BookOpen',
    color: '#64748B',
    useCase: 'Leads qualificados mas fora do momento de compra.',
    expectedResult: 'Constrói relacionamento. 20–30% voltam ao pipeline em 6 meses.',
    tags: ['nurture', 'longo prazo', 'conteudo'],
    steps: [
      {
        step_order: 1,
        canal: 'email',
        delay_hours: 0,
        tipo_mensagem: 'texto',
        mensagem_template:
          'Assunto: [INSIGHT ESPECÍFICO sobre {{segmento}}]\n\nOi {{decisor_nome}},\n\nSei que não é o momento de conversar sobre [SOLUÇÃO], mas achei esse dado e lembrei da nossa conversa:\n\n[DADO RELEVANTE + INTERPRETAÇÃO DE 3 LINHAS]\n\nFonte: [LINK]. Sem resposta necessária — só achei legal.',
        note: 'Sem CTA. O valor é o conteúdo. Constrói autoridade.',
      },
      {
        step_order: 2,
        canal: 'email',
        delay_hours: 720, // 30 dias
        tipo_mensagem: 'texto',
        mensagem_template:
          'Assunto: Como a [CLIENTE DO MESMO SEGMENTO] resolveu [PROBLEMA]\n\nOi {{decisor_nome}},\n\nCase novo fresh do forno — [CLIENTE] conseguiu [RESULTADO CONCRETO] em [TEMPO].\n\nResumo em 3 min de leitura: [LINK]\n\nCaso queira entender o método, me fala.',
      },
      {
        step_order: 3,
        canal: 'email',
        delay_hours: 720,
        tipo_mensagem: 'texto',
        mensagem_template:
          'Assunto: Check-in trimestral\n\nOi {{decisor_nome}},\n\n3 meses se passaram — como está {{empresa_nome}}?\n\nSe o tema [ÁREA] virou prioridade agora, eu tenho 20min essa semana. Se não, próximo check é em 3 meses — tá tudo certo.',
        note: 'Check-in a cada 3 meses. Zero pressão.',
      },
    ],
  },
]

export function getTemplateById(id: string): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES.find((t) => t.id === id)
}

export function getTemplatesByCategory(category: CampaignTemplate['category']): CampaignTemplate[] {
  return CAMPAIGN_TEMPLATES.filter((t) => t.category === category)
}
