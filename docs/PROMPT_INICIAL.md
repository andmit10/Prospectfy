# Prompt inicial para Claude Code

> Cole este prompt na primeira sessão do Claude Code após clonar o repositório.

---

## Prompt:

```
Leia o CLAUDE.md e os docs em docs/ para entender o projeto. Depois execute /project:init-project para criar a base do projeto.

Este é o Orbya SaaS — uma plataforma de prospecção B2B para PMEs brasileiras. Estamos na Fase 1 (MVP) e o foco é: importação de leads + campanha de WhatsApp com agente de IA via Directfy.

Após o init, comece pela primeira task não completada em docs/tasks/todo.md.

Regras importantes:
- Interface toda em português (pt-BR)
- Código e comentários em inglês
- Use shadcn/ui para TUDO — não invente UI custom
- tRPC + Zod para todas as APIs
- Supabase RLS em todas as tabelas
- Commits convencionais: feat:, fix:, chore:

Vá fazendo task por task, commite cada uma, e marque como concluída no todo.md.
```

---

## Como usar

### 1. Criar o repositório
```bash
mkdir orbya-saas && cd orbya-saas
git init
```

### 2. Copiar os arquivos de setup
Copie para o repositório:
- `CLAUDE.md` (raiz)
- `.claude/commands/init-project.md`
- `.claude/commands/new-feature.md`
- `docs/prd.md`
- `docs/database-schema.md`
- `docs/tasks/todo.md`

### 3. Commit inicial
```bash
git add -A
git commit -m "chore: project setup with CLAUDE.md, PRD and task list"
```

### 4. Abrir Claude Code
```bash
claude
```

### 5. Colar o prompt acima

### 6. Acompanhar
Claude Code vai:
1. Ler CLAUDE.md + docs
2. Criar o projeto Next.js com todas dependências
3. Montar a estrutura de pastas
4. Criar os arquivos base (supabase client, tRPC, layout)
5. Começar a implementar tasks do todo.md

### 7. Entre sessões
Quando voltar para uma nova sessão, use:
```
Leia docs/tasks/todo.md e continue na próxima task não completada. Use /project:new-feature.
```

---

## Tips para acelerar

- **Sessões focadas**: 1 sessão = 1-2 tasks. Não tente fazer tudo de uma vez.
- **Compact cedo**: quando o contexto ficar grande, use `/compact focus on current task and modified files`
- **Testes primeiro**: peça para Claude escrever o teste antes da implementação
- **Review antes de commit**: sempre olhe o diff antes de deixar Claude commitar
- **Lessons learned**: quando Claude errar, peça para adicionar regra no CLAUDE.md em "Lessons Learned"
