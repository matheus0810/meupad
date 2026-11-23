# Meu Pad

Bloco de notas pessoal no estilo dontpad: cada endereço (`/compras`, `/trabalho/ideias`) é um pad, salvo automaticamente.

## Publicar na Vercel

1. Suba esta pasta para um repositório no GitHub.
2. Na Vercel: **Add New → Project**, importe o repositório (ela detecta o Next.js sozinha).
3. No projeto, abra **Storage → Create Database → Upstash (Redis)**, escolha o plano gratuito e conecte ao projeto. As variáveis do Redis são criadas automaticamente.
4. Faça um **Redeploy** para o site pegar as variáveis.

## Senha (opcional)

Sem configuração, qualquer pessoa com o link consegue abrir. Para pedir senha, crie a variável `PAD_PASSWORD` em **Settings → Environment Variables** e faça um Redeploy.

## Rodar no computador

```bash
npm install
npm run dev
```

Precisa de um `.env.local` com `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`; veja `.env.example`.
